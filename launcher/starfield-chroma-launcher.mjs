import childProcess from "node:child_process";
import dgram from "node:dgram";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const CONFIG_PATH = path.join(ROOT_DIR, "starfield-chroma.config.json");
const COMPANION_SCRIPT = path.join(ROOT_DIR, "companion", "starfield-chroma-companion.mjs");
const PORT = Number(process.env.STARFIELD_CHROMA_LAUNCHER_PORT ?? 47322);
const STARFIELD_MONITOR_MS = 3000;
const DESKTOP_PARENT_PID = Number(
  process.argv.find((argument) => argument.startsWith("--desktop-parent="))?.split("=")[1] ?? 0,
);

const DEFAULT_CONFIG = {
  chromaRoot: "http://localhost:54235/razer/chromasdk",
  udpPort: 47321,
  frameMs: 90,
  staleMs: 15000,
  brightness: 1,
  pulseBoost: 1.45,
  effectPreset: "immersive",
  logEvents: false,
  logHeartbeats: false,
  accentDevices: true,
  deviceIntensity: {
    mouse: 1.2,
    mousepad: 1.12,
    headset: 1.18,
    chromalink: 1.12,
  },
  starfieldDir: "",
  damageThresholds: {
    chip: 1,
    heavy: 25,
    critical: 150,
  },
};

let starfieldMonitor = null;
let starfieldObservedRunning = false;
let desktopParentShutdownStarted = false;
let statusRefreshPromise = null;
let statusCache = {
  rootDir: ROOT_DIR,
  config: loadConfig(),
  companionRunning: false,
  starfieldRunning: false,
  sfseLoaderFound: false,
  starfieldDir: "",
  node: process.execPath,
};

const TEST_EVENTS = {
  companionStart: "companion.start",
  companionStop: "companion.stop",
  chromaCheck: "chroma.check",
  damage: "player.damage",
  heavyDamage: "player.trueDamage",
  oxygen: "oxygen.danger",
  scanner: "scanner.preview",
  scannerAnomaly: "scanner.anomaly.preview",
  takeoff: "takeoff.preview",
  grav: "grav.preview",
  level: "player.levelUp",
  power: "power.preview",
  clear: "effects.clear",
};

const TEST_SEQUENCES = {
  chromaReadiness: ["companionStart", "chromaCheck", "heavyDamage", "scannerAnomaly", "grav", "power", "companionStop"],
  deviceFocus: ["heavyDamage", "oxygen", "scannerAnomaly", "takeoff", "grav", "power"],
  combatFocus: ["damage", "heavyDamage", "damage", "heavyDamage"],
  explorationFocus: ["scanner", "scannerAnomaly", "power", "clear"],
};

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return { ...fallback, ...JSON.parse(fs.readFileSync(filePath, "utf8")) };
  } catch {
    return fallback;
  }
}

function loadConfig() {
  const config = readJson(CONFIG_PATH, DEFAULT_CONFIG);
  config.damageThresholds = {
    ...DEFAULT_CONFIG.damageThresholds,
    ...(config.damageThresholds ?? {}),
  };
  config.deviceIntensity = {
    ...DEFAULT_CONFIG.deviceIntensity,
    ...(config.deviceIntensity ?? {}),
  };
  return config;
}

function saveConfig(nextConfig) {
  const current = loadConfig();
  const merged = {
    ...current,
    ...nextConfig,
    damageThresholds: {
      ...current.damageThresholds,
      ...(nextConfig.damageThresholds ?? {}),
    },
    deviceIntensity: {
      ...current.deviceIntensity,
      ...(nextConfig.deviceIntensity ?? {}),
    },
  };
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(merged, null, 2)}${os.EOL}`, "utf8");
  return merged;
}

function candidateStarfieldDirs(config = loadConfig()) {
  return [
    config.starfieldDir,
    process.env.STARFIELD_DIR,
    "I:\\SteamLibrary\\steamapps\\common\\Starfield",
    "D:\\SteamLibrary\\steamapps\\common\\Starfield",
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Starfield",
  ].filter(Boolean);
}

function findStarfieldDir(config = loadConfig()) {
  for (const dir of candidateStarfieldDirs(config)) {
    if (fs.existsSync(path.join(dir, "sfse_loader.exe"))) return dir;
  }
  return "";
}

function execPowerShell(script) {
  return new Promise((resolve) => {
    childProcess.execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: 8000 },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          code: error?.code ?? 0,
        });
      },
    );
  });
}

async function findNodeProcesses(pattern) {
  const escaped = pattern.replace(/'/g, "''");
  const script = `$ErrorActionPreference='SilentlyContinue'; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*${escaped}*' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`;
  const result = await execPowerShell(script);
  if (!result.stdout) return [];
  try {
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

async function isProcessRunning(name) {
  const escaped = name.replace(/'/g, "''");
  const result = await execPowerShell(
    `(Get-Process -Name '${escaped}' -ErrorAction SilentlyContinue | Select-Object -First 1).Id`,
  );
  return Boolean(result.stdout);
}

async function companionRunning() {
  const matches = await findNodeProcesses("starfield-chroma-companion.mjs");
  return matches.length > 0;
}

async function cleanupStaleChromaSdkHelpers() {
  const script = `
$ErrorActionPreference='SilentlyContinue'
$helpers = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'StarfieldChromaCompanion.exe' -and
  $_.ExecutablePath -like 'C:\\ProgramData\\Razer Chroma SDK\\Apps\\StarfieldChromaCompanion\\*'
}
foreach ($helper in $helpers) {
  Stop-Process -Id $helper.ProcessId -Force -ErrorAction SilentlyContinue
}
$helpers | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress
`;
  const result = await execPowerShell(script);
  if (!result.stdout) return { cleaned: 0 };
  try {
    const parsed = JSON.parse(result.stdout);
    return { cleaned: Array.isArray(parsed) ? parsed.length : 1 };
  } catch {
    return { cleaned: 0 };
  }
}

async function startCompanion() {
  if (await companionRunning()) {
    await sendUdpEvent("companionStart").catch(() => {});
    return { started: false, message: "Companion is already running. Sent a Chroma confirmation pulse." };
  }
  await cleanupStaleChromaSdkHelpers();
  const out = fs.openSync(path.join(ROOT_DIR, "companion.log"), "a");
  const err = fs.openSync(path.join(ROOT_DIR, "companion.err.log"), "a");
  const child = childProcess.spawn(process.execPath, [COMPANION_SCRIPT], {
    cwd: ROOT_DIR,
    detached: true,
    stdio: ["ignore", out, err],
    windowsHide: false,
  });
  child.unref();
  await wait(900);
  await sendUdpEvent("companionStart").catch(() => {});
  return { started: true, message: "Companion started. Watch for a green/cyan Chroma confirmation pulse." };
}

async function stopCompanion() {
  const matches = await findNodeProcesses("starfield-chroma-companion.mjs");
  if (!matches.length) return { stopped: false, message: "Companion was not running." };
  await sendUdpEvent("companionStop").catch(() => {});
  await wait(1100);
  const ids = matches.map((item) => Number(item.ProcessId)).filter(Number.isFinite);
  if (!ids.length) return { stopped: false, message: "No companion process id found." };
  const result = await execPowerShell(`Stop-Process -Id ${ids.join(",")} -Force`);
  await cleanupStaleChromaSdkHelpers();
  return { stopped: result.ok, message: result.ok ? "Companion stopped after an amber/red Chroma confirmation pulse." : result.stderr };
}

async function shutdownLauncher() {
  if (starfieldMonitor) {
    clearInterval(starfieldMonitor);
    starfieldMonitor = null;
  }
  const companion = await stopCompanion();
  setTimeout(() => process.exit(0), 250);
  return { shutdown: true, companion };
}

function armStarfieldAutoShutdown() {
  if (starfieldMonitor) return;
  starfieldMonitor = setInterval(async () => {
    try {
      const running = await isProcessRunning("Starfield");
      if (running) {
        starfieldObservedRunning = true;
        return;
      }
      if (starfieldObservedRunning) {
        await shutdownLauncher();
      }
    } catch {
      // Keep the launcher alive if a transient process query fails.
    }
  }, STARFIELD_MONITOR_MS);
  starfieldMonitor.unref?.();
}

function armDesktopParentMonitor() {
  if (!Number.isInteger(DESKTOP_PARENT_PID) || DESKTOP_PARENT_PID <= 0) return;
  const timer = setInterval(async () => {
    try {
      process.kill(DESKTOP_PARENT_PID, 0);
    } catch {
      if (desktopParentShutdownStarted) return;
      desktopParentShutdownStarted = true;
      clearInterval(timer);
      await shutdownLauncher();
    }
  }, 1000);
  timer.unref?.();
}

async function startStarfield() {
  const config = loadConfig();
  const starfieldDir = findStarfieldDir(config);
  if (!starfieldDir) {
    throw new Error("Set your Starfield folder first. It must contain sfse_loader.exe.");
  }
  const loader = path.join(starfieldDir, "sfse_loader.exe");
  childProcess.spawn(loader, [], {
    cwd: starfieldDir,
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  }).unref();
  armStarfieldAutoShutdown();
  return { started: true, starfieldDir };
}

function openBrowser(url) {
  childProcess.spawn("cmd.exe", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}

function openRazerChroma() {
  childProcess.spawn("cmd.exe", ["/c", "start", "", "shell:AppsFolder\\Razer.Chroma.4"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
  return {
    opened: true,
    message: "Razer Chroma opened. Go to CHROMA APPS and turn the global CHROMA APPS toggle on.",
  };
}

function sendUdpEvent(type) {
  const config = loadConfig();
  const eventType = TEST_EVENTS[type] ?? type;
  const payload = Buffer.from(JSON.stringify({ type: eventType, source: "launcher-test" }));
  const socket = dgram.createSocket("udp4");
  return new Promise((resolve, reject) => {
    socket.send(payload, config.udpPort, "127.0.0.1", (error) => {
      socket.close();
      if (error) reject(error);
      else resolve({ sent: true, event: eventType });
    });
  });
}

async function sendUdpSequence(type) {
  const sequence = TEST_SEQUENCES[type];
  if (!sequence) throw new Error(`Unknown test sequence: ${type}`);
  const sent = [];
  for (const eventType of sequence) {
    const result = await sendUdpEvent(eventType);
    sent.push(result.event);
    await wait(2200);
  }
  return { sent: true, sequence: type, events: sent };
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      const code = error.cause?.code;
      if (!["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(code) || attempt === attempts) break;
      await wait(200 * attempt);
    }
  }
  throw lastError;
}

async function putChromaWithRetry(url, body, attempts = 12) {
  return fetchWithRetry(url, {
    method: "PUT",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }, attempts);
}

async function testChromaSdk() {
  const config = loadConfig();
  const body = JSON.stringify({
    title: "Starfield Chroma Companion",
    description: "Launcher Chroma SDK check",
    author: { name: "Starfield Chroma Companion", contact: "GitHub" },
    device_supported: ["keyboard"],
    category: "game",
  });

  const response = await fetchWithRetry(config.chromaRoot, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const json = await response.json();
  if (!json.uri) throw new Error(`Chroma SDK did not return a session uri: ${JSON.stringify(json)}`);

  const frame = Array.from({ length: 6 }, () => Array.from({ length: 22 }, () => 0xffd700));
  await putChromaWithRetry(`${json.uri}/heartbeat`);
  const end = Date.now() + 2500;
  while (Date.now() < end) {
    await putChromaWithRetry(`${json.uri}/keyboard`, { effect: "CHROMA_CUSTOM", param: frame }, 6);
    await wait(250);
  }
  await fetchWithRetry(json.uri, { method: "DELETE" }, 2).catch(() => {});
  return {
    ok: true,
    note: "If the keyboard stays on Spectrum Cycling, open Razer Chroma > CHROMA APPS and turn the global CHROMA APPS toggle on, then enable Starfield Chroma Companion.",
  };
}

async function status() {
  const config = loadConfig();
  const starfieldDir = findStarfieldDir(config);
  const [starfieldRunning, isCompanionRunning] = await Promise.all([
    isProcessRunning("Starfield"),
    companionRunning(),
  ]);
  if (starfieldRunning) {
    starfieldObservedRunning = true;
    armStarfieldAutoShutdown();
  }
  return {
    rootDir: ROOT_DIR,
    config,
    companionRunning: isCompanionRunning,
    starfieldRunning,
    sfseLoaderFound: Boolean(starfieldDir),
    starfieldDir,
    node: process.execPath,
  };
}

function refreshStatusCache() {
  if (statusRefreshPromise) return statusRefreshPromise;
  statusRefreshPromise = status()
    .then((nextStatus) => {
      statusCache = nextStatus;
      return nextStatus;
    })
    .catch(() => statusCache)
    .finally(() => {
      statusRefreshPromise = null;
    });
  return statusRefreshPromise;
}

function getCachedStatus() {
  void refreshStatusCache();
  return statusCache;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) request.destroy();
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function respondJson(response, code, payload) {
  response.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function route(request, response) {
  try {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(renderHtml());
      return;
    }
    if (request.method === "GET" && request.url === "/api/status") {
      respondJson(response, 200, getCachedStatus());
      return;
    }
    if (request.method === "POST" && request.url === "/api/config") {
      respondJson(response, 200, { config: saveConfig(await readRequestBody(request)) });
      return;
    }
    if (request.method === "POST" && request.url === "/api/start-companion") {
      respondJson(response, 200, await startCompanion());
      return;
    }
    if (request.method === "POST" && request.url === "/api/stop-companion") {
      respondJson(response, 200, await stopCompanion());
      return;
    }
    if (request.method === "POST" && request.url === "/api/shutdown") {
      respondJson(response, 200, await shutdownLauncher());
      return;
    }
    if (request.method === "POST" && request.url === "/api/start-starfield") {
      respondJson(response, 200, await startStarfield());
      return;
    }
    if (request.method === "POST" && request.url === "/api/open-razer-chroma") {
      respondJson(response, 200, openRazerChroma());
      return;
    }
    if (request.method === "POST" && request.url === "/api/start-all") {
      await startCompanion();
      respondJson(response, 200, await startStarfield());
      return;
    }
    if (request.method === "POST" && request.url === "/api/test-chroma") {
      respondJson(response, 200, await testChromaSdk());
      return;
    }
    if (request.method === "POST" && request.url === "/api/test-chroma-effects") {
      respondJson(response, 200, await sendUdpSequence("chromaReadiness"));
      return;
    }
    if (request.method === "POST" && request.url === "/api/test-event") {
      const body = await readRequestBody(request);
      respondJson(response, 200, await sendUdpEvent(body.type ?? "damage"));
      return;
    }
    if (request.method === "POST" && request.url === "/api/test-sequence") {
      const body = await readRequestBody(request);
      respondJson(response, 200, await sendUdpSequence(body.type ?? "deviceFocus"));
      return;
    }
    respondJson(response, 404, { error: "Not found" });
  } catch (error) {
    respondJson(response, 500, { error: error.message });
  }
}

function renderHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Starfield Chroma Companion</title>
<style>
:root{color-scheme:dark;--bg:#090b12;--panel:#151824;--line:#2c3244;--text:#f2f6ff;--muted:#9da7bc;--cyan:#18d7e8;--gold:#f2b43d;--red:#ff5a6b;--green:#4be38b}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#20204b 0,#090b12 42%);font-family:Segoe UI,Arial,sans-serif;color:var(--text)}
main{max-width:1120px;margin:0 auto;padding:28px}h1{font-size:30px;margin:0 0 6px}h2{font-size:18px;margin:0 0 14px}.muted{color:var(--muted)}
.top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:22px}.grid{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}.panel{background:rgba(21,24,36,.92);border:1px solid var(--line);border-radius:8px;padding:18px}
.notice{border-color:#5b4a19;background:rgba(58,44,15,.56)}.notice h2{color:var(--gold)}.checklist{margin:10px 0 0;padding-left:20px;color:var(--muted)}.checklist li{margin:6px 0}.checklist strong{color:var(--text)}
.status{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.pill{border:1px solid var(--line);border-radius:8px;padding:12px;background:#10131e}.pill strong{display:block;margin-bottom:4px}.ok{color:var(--green)}.bad{color:var(--red)}.warnText{color:var(--gold)}
button{border:0;border-radius:7px;padding:11px 14px;background:var(--cyan);color:#001014;font-weight:700;cursor:pointer}button.secondary{background:#2b3144;color:var(--text);border:1px solid var(--line)}button.warn{background:var(--gold);color:#1f1300}button.danger{background:var(--red);color:white}
.buttons{display:flex;flex-wrap:wrap;gap:10px}.help{color:var(--muted);font-size:12px;line-height:1.45;margin:5px 0 10px}.button-help{flex-basis:100%;margin-top:2px}.effect-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.effect{border:1px solid var(--line);border-radius:8px;background:#10131e;padding:12px}.effect button{width:100%;margin-bottom:8px}.effect strong{display:block;margin-bottom:3px}.effect span{display:block;color:var(--muted);font-size:12px;line-height:1.35}label{display:block;margin:12px 0 6px;color:var(--muted);font-size:13px}input[type=text],input[type=number],select{width:100%;background:#0d1019;border:1px solid var(--line);border-radius:6px;color:var(--text);padding:10px}input[type=checkbox]{transform:scale(1.15);margin-right:8px}.row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.log{white-space:pre-wrap;background:#070a10;border:1px solid var(--line);border-radius:6px;min-height:72px;padding:12px;color:var(--muted)}
@media(max-width:850px){.grid,.top{display:block}.panel{margin-bottom:14px}.status{grid-template-columns:1fr 1fr}.row,.effect-list{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
  <section class="top">
    <div>
      <h1>Starfield Chroma Companion</h1>
      <div class="muted">Control panel for companion status, SFSE launch, Chroma checks, and effect tuning.</div>
    </div>
    <div class="buttons">
      <button onclick="post('/api/start-all')">Start Companion + SFSE</button>
      <button class="secondary" onclick="refresh()">Refresh</button>
    </div>
  </section>

  <section class="panel">
    <h2>Status</h2>
    <div class="status">
      <div class="pill"><strong>Companion</strong><span id="companion">...</span></div>
      <div class="pill"><strong>Starfield</strong><span id="starfield">...</span></div>
      <div class="pill"><strong>SFSE Loader</strong><span id="sfse">...</span></div>
      <div class="pill"><strong>Chroma Takeover</strong><span id="takeover">...</span></div>
      <div class="pill"><strong>Node</strong><span id="node" class="muted">...</span></div>
    </div>
  </section>

  <section class="panel notice">
    <h2>Required Razer Chroma Apps Setting</h2>
    <p class="muted"><strong>Important:</strong> enable Chroma Apps in Razer Chroma. If this is off, the SDK can connect successfully but your devices may stay on Spectrum Cycling and the game effects will not take over.</p>
    <div class="buttons">
      <button class="warn" onclick="post('/api/open-razer-chroma')">Open Razer Chroma</button>
      <button class="secondary" onclick="post('/api/test-chroma')">SDK Registration Check</button>
      <button onclick="post('/api/test-chroma-effects')">Test Chroma Effects</button>
    </div>
    <ol class="checklist">
      <li>Open <strong>Razer Chroma</strong>.</li>
      <li>Go to <strong>CHROMA APPS</strong>.</li>
      <li>Turn the global <strong>CHROMA APPS</strong> toggle on.</li>
      <li>Enable <strong>Starfield Chroma Companion</strong> in the app list.</li>
      <li>Run a test effect. The dashboard should show <strong>App in use: Starfield Chroma Companion (Chroma Apps)</strong>.</li>
    </ol>
  </section>

  <div class="grid">
    <section class="panel">
      <h2>Launcher</h2>
      <p class="help">Use these controls when debugging. The main desktop app normally handles this with one START STARFIELD button.</p>
      <div class="buttons">
        <button onclick="post('/api/start-companion')">Start Companion</button>
      <button class="secondary" onclick="post('/api/start-starfield')">Start SFSE</button>
      <button class="danger" onclick="post('/api/stop-companion')">Stop Companion</button>
      <button class="warn" onclick="post('/api/test-chroma')">SDK Check</button>
      <button onclick="post('/api/test-chroma-effects')">Test Effects</button>
      <div class="help button-help">Start Companion runs the RGB engine. Start SFSE launches Starfield through sfse_loader.exe. SDK Check only verifies the local Razer SDK. Test Effects uses the real companion pipeline and should visibly pulse keyboard, mouse, mousepad, headset, and Chroma Link devices.</div>
      </div>
      <label>Starfield folder</label>
      <input id="starfieldDir" type="text" placeholder="C:\\Path\\To\\SteamLibrary\\steamapps\\common\\Starfield">
      <div class="muted" style="margin-top:8px">Folder must contain sfse_loader.exe.</div>
    </section>

    <section class="panel">
      <h2>Test Effects</h2>
      <p class="help">These buttons send fake game events to preview lighting without needing to trigger them in Starfield.</p>
      <div class="effect-list">
        <div class="effect"><button class="secondary" onclick="eventTest('damage')">Damage</button><strong>Light hit</strong><span>Small combat feedback pulse.</span></div>
        <div class="effect"><button class="secondary" onclick="eventTest('heavyDamage')">Heavy Hit</button><strong>Strong hit</strong><span>Full-keyboard warning for serious damage.</span></div>
        <div class="effect"><button class="secondary" onclick="eventTest('oxygen')">O2/Gas</button><strong>Environment danger</strong><span>Oxygen, gas, or radiation style warning.</span></div>
        <div class="effect"><button class="secondary" onclick="eventTest('scanner')">Scanner</button><strong>Scanner sweep</strong><span>Short preview of scanner lighting.</span></div>
        <div class="effect"><button class="secondary" onclick="eventTest('scannerAnomaly')">Anomaly</button><strong>Artifact nearby</strong><span>Scanner anomaly pulse preview.</span></div>
        <div class="effect"><button class="secondary" onclick="eventTest('takeoff')">Takeoff</button><strong>Planet launch</strong><span>Engine ignition and launch sweep for leaving a planet.</span></div>
        <div class="effect"><button class="secondary" onclick="eventTest('grav')">Grav</button><strong>Grav jump</strong><span>Charge and jump preview.</span></div>
        <div class="effect"><button class="secondary" onclick="eventTest('level')">Level Up</button><strong>Progress reward</strong><span>Celebration effect for level-up moments.</span></div>
        <div class="effect"><button class="secondary" onclick="eventTest('power')">Power</button><strong>Starborn power</strong><span>Power-use/temple style burst.</span></div>
        <div class="effect"><button class="danger" onclick="eventTest('clear')">Clear</button><strong>Reset effects</strong><span>Stops sustained preview effects and returns to the base state.</span></div>
      </div>
    </section>
  </div>

  <section class="panel">
    <h2>Device Focus Tests</h2>
    <p class="help">Use these when checking whether mouse, mousepad, headset, and Chroma Link devices are reacting clearly enough. Keep Chroma Apps enabled in Razer Chroma while testing.</p>
    <div class="effect-list">
      <div class="effect"><button class="warn" onclick="sequenceTest('deviceFocus')">All Devices</button><strong>Full device pass</strong><span>Runs damage, environment, anomaly, grav, and power moments with stronger extra-device accents.</span></div>
      <div class="effect"><button onclick="post('/api/test-chroma-effects')">Chroma Readiness</button><strong>Start/stop plus devices</strong><span>Runs companion start, device check, action pulses, and companion stop confirmation.</span></div>
      <div class="effect"><button class="secondary" onclick="sequenceTest('combatFocus')">Combat Devices</button><strong>Mouse and headset impact</strong><span>Repeats hit pulses so you can judge mouse/headset visibility during action.</span></div>
      <div class="effect"><button class="secondary" onclick="sequenceTest('explorationFocus')">Explore Devices</button><strong>Scanner and power flow</strong><span>Previews calmer exploration, scanner anomaly, and power effects.</span></div>
      <div class="effect"><button class="danger" onclick="eventTest('clear')">Clear</button><strong>Stop preview</strong><span>Returns lighting to the base state after testing.</span></div>
    </div>
  </section>

  <section class="panel">
    <h2>Configuration</h2>
    <label>Effect preset</label>
    <select id="effectPreset">
      <option value="immersive">Immersive - balanced default</option>
      <option value="subtle">Subtle - calmer and less bright</option>
      <option value="combatHeavy">Combat Heavy - stronger action/device accents</option>
      <option value="readable">Readable - clearer base key lighting</option>
    </select>
    <p class="help">Presets change the overall feel while keeping the same Starfield key logic. Immersive is the current default.</p>
    <div class="row">
      <div><label>Brightness</label><input id="brightness" type="number" min="0.1" max="1" step="0.05"><p class="help">Overall RGB strength. Lower it if the keyboard is too bright.</p></div>
      <div><label>Pulse boost</label><input id="pulseBoost" type="number" min="1" max="2" step="0.05"><p class="help">How much stronger reaction pulses become compared to base lighting.</p></div>
      <div><label>Frame ms</label><input id="frameMs" type="number" min="40" max="250" step="5"><p class="help">Animation update speed. Lower is smoother, higher is lighter.</p></div>
    </div>
    <div class="row">
      <div><label>Chip damage</label><input id="damageChip" type="number" min="0" step="1"><p class="help">Minimum damage for a small hit pulse.</p></div>
      <div><label>Heavy damage</label><input id="damageHeavy" type="number" min="0" step="1"><p class="help">Threshold for the stronger full-keyboard hit warning.</p></div>
      <div><label>Critical damage</label><input id="damageCritical" type="number" min="0" step="1"><p class="help">Threshold for the most urgent damage warning.</p></div>
    </div>
    <label><input id="accentDevices" type="checkbox">Accent devices enabled</label>
    <p class="help">Sends mood and action colors to extra Chroma devices such as mouse, mousepad, headset, and Chroma Link.</p>
    <div class="row">
      <div><label>Mouse intensity</label><input id="mouseIntensity" type="number" min="0.25" max="2" step="0.05"><p class="help">Boosts or softens mouse action accents.</p></div>
      <div><label>Mousepad intensity</label><input id="mousepadIntensity" type="number" min="0.25" max="2" step="0.05"><p class="help">Controls mousepad mood and warning brightness.</p></div>
      <div><label>Headset intensity</label><input id="headsetIntensity" type="number" min="0.25" max="2" step="0.05"><p class="help">Controls broad headset cues for damage, oxygen, combat, and rewards.</p></div>
    </div>
    <div class="row">
      <div><label>Chroma Link intensity</label><input id="chromalinkIntensity" type="number" min="0.25" max="2" step="0.05"><p class="help">Controls ambient strips or linked Chroma devices.</p></div>
    </div>
    <label><input id="logEvents" type="checkbox">Log events for debugging</label>
    <p class="help">Writes extra event details to logs. Useful while testing, normally off.</p>
    <div class="buttons" style="margin-top:12px"><button onclick="saveConfig()">Save Config</button></div>
    <p class="muted">Restart the companion after changing render settings so the new config is loaded.</p>
  </section>

  <section class="panel">
    <h2>Output</h2>
    <div id="log" class="log">Ready.</div>
  </section>
</main>
<script>
let currentConfig = {};
function setText(id, text, ok) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = ok === undefined ? 'muted' : ok ? 'ok' : 'bad';
}
function writeLog(value) {
  document.getElementById('log').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
async function api(url, options) {
  const res = await fetch(url, options);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || res.statusText);
  return json;
}
async function refresh() {
  try {
    const data = await api('/api/status');
    currentConfig = data.config;
    setText('companion', data.companionRunning ? 'Running' : 'Stopped', data.companionRunning);
    setText('starfield', data.starfieldRunning ? 'Running' : 'Stopped', data.starfieldRunning);
    setText('sfse', data.sfseLoaderFound ? 'Found' : 'Missing', data.sfseLoaderFound);
    const takeover = document.getElementById('takeover');
    takeover.textContent = data.companionRunning ? 'Active if Chroma Apps is enabled' : 'Not active';
    takeover.className = data.companionRunning ? 'warnText' : 'bad';
    setText('node', data.node);
    document.getElementById('starfieldDir').value = data.config.starfieldDir || data.starfieldDir || '';
    document.getElementById('effectPreset').value = data.config.effectPreset || 'immersive';
    document.getElementById('brightness').value = data.config.brightness;
    document.getElementById('pulseBoost').value = data.config.pulseBoost;
    document.getElementById('frameMs').value = data.config.frameMs;
    document.getElementById('damageChip').value = data.config.damageThresholds.chip;
    document.getElementById('damageHeavy').value = data.config.damageThresholds.heavy;
    document.getElementById('damageCritical').value = data.config.damageThresholds.critical;
    document.getElementById('accentDevices').checked = Boolean(data.config.accentDevices);
    document.getElementById('mouseIntensity').value = data.config.deviceIntensity?.mouse ?? 1.2;
    document.getElementById('mousepadIntensity').value = data.config.deviceIntensity?.mousepad ?? 1.12;
    document.getElementById('headsetIntensity').value = data.config.deviceIntensity?.headset ?? 1.18;
    document.getElementById('chromalinkIntensity').value = data.config.deviceIntensity?.chromalink ?? 1.12;
    document.getElementById('logEvents').checked = Boolean(data.config.logEvents);
  } catch (error) {
    writeLog(error.message);
  }
}
async function post(url, body = {}) {
  try {
    const data = await api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    writeLog(data);
    await refresh();
  } catch (error) {
    writeLog(error.message);
  }
}
function eventTest(type) {
  post('/api/test-event', { type });
}
function sequenceTest(type) {
  post('/api/test-sequence', { type });
}
function numberValue(id) {
  return Number(document.getElementById(id).value);
}
async function saveConfig() {
  await post('/api/config', {
    starfieldDir: document.getElementById('starfieldDir').value.trim(),
    effectPreset: document.getElementById('effectPreset').value,
    brightness: numberValue('brightness'),
    pulseBoost: numberValue('pulseBoost'),
    frameMs: numberValue('frameMs'),
    accentDevices: document.getElementById('accentDevices').checked,
    logEvents: document.getElementById('logEvents').checked,
    deviceIntensity: {
      mouse: numberValue('mouseIntensity'),
      mousepad: numberValue('mousepadIntensity'),
      headset: numberValue('headsetIntensity'),
      chromalink: numberValue('chromalinkIntensity')
    },
    damageThresholds: {
      chip: numberValue('damageChip'),
      heavy: numberValue('damageHeavy'),
      critical: numberValue('damageCritical')
    }
  });
}
refresh();
setInterval(refresh, 4000);
</script>
</body>
</html>`;
}

if (process.argv.includes("--status-once")) {
  status().then((value) => {
    console.log(JSON.stringify(value, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  const server = http.createServer((request, response) => {
    route(request, response);
  });
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.log(`Starfield Chroma Control Panel already running on http://127.0.0.1:${PORT}/`);
      process.exit(0);
    }
    console.error(error);
    process.exit(1);
  });
  server.listen(PORT, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${PORT}/`;
    console.log(`Starfield Chroma Control Panel: ${url}`);
    armDesktopParentMonitor();
    void refreshStatusCache();
    const statusRefreshTimer = setInterval(() => {
      void refreshStatusCache();
    }, STARFIELD_MONITOR_MS);
    statusRefreshTimer.unref?.();
    if (!process.argv.includes("--no-open")) openBrowser(url);
  });
}
