import childProcess from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LAUNCHER = path.join(SCRIPT_DIR, "launcher", "starfield-chroma-launcher.mjs");
const PORT = Number(process.env.STARFIELD_CHROMA_LAUNCHER_PORT ?? 47322);
const URL = `http://127.0.0.1:${PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canReachPanel() {
  return new Promise((resolve) => {
    const request = http.get(`${URL}/api/status`, { timeout: 650 }, (response) => {
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

function postJson(route) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      `${URL}${route}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "2",
        },
        timeout: 5000,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          let payload = {};
          try {
            payload = body ? JSON.parse(body) : {};
          } catch {
            payload = { raw: body };
          }
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(payload);
          } else {
            reject(new Error(payload.error ?? `Request failed with HTTP ${response.statusCode}`));
          }
        });
      },
    );
    request.on("timeout", () => {
      request.destroy(new Error("Timed out while contacting the Starfield Chroma launcher."));
    });
    request.on("error", reject);
    request.end("{}");
  });
}

async function ensureLauncher() {
  if (await canReachPanel()) return;

  childProcess.spawn(process.execPath, [LAUNCHER, "--no-open"], {
    cwd: SCRIPT_DIR,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(300);
    if (await canReachPanel()) return;
  }

  throw new Error("Could not start the Starfield Chroma launcher service.");
}

async function main() {
  await ensureLauncher();
  const result = await postJson("/api/start-all");
  console.log("Starfield Chroma Companion started.");
  console.log(`Launching SFSE from: ${result.starfieldDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
