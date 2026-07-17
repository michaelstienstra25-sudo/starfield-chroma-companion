import childProcess from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LAUNCHER = path.join(SCRIPT_DIR, "launcher", "starfield-chroma-launcher.mjs");
const PORT = Number(process.env.STARFIELD_CHROMA_LAUNCHER_PORT ?? 47322);
const URL = `http://127.0.0.1:${PORT}/`;

function spawnDetached(command, args) {
  return new Promise((resolve) => {
    const child = childProcess.spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
    child.once("error", () => resolve(false));
  });
}

async function openBrowser(url) {
  // MO2 can suppress `cmd /c start` child-shell actions. Explorer asks the
  // Windows shell to open the URL directly and works in more MO2 setups.
  if (await spawnDetached("explorer.exe", [url])) return true;
  return spawnDetached("cmd.exe", ["/d", "/s", "/c", "start", "", url]);
}

function canReachPanel() {
  return new Promise((resolve) => {
    const request = http.get(URL, { timeout: 650 }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

async function main() {
  if (!(await canReachPanel())) {
    childProcess.spawn(process.execPath, [LAUNCHER, "--no-open"], {
      cwd: SCRIPT_DIR,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (await canReachPanel()) break;
    }
  }

  const browserRequested = await openBrowser(URL);
  console.log(`Starfield Chroma control panel: ${URL}`);
  if (!browserRequested) {
    console.warn(`Open or bookmark ${URL} in your regular browser.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
