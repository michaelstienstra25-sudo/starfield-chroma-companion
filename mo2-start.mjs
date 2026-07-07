import childProcess from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LAUNCHER = path.join(SCRIPT_DIR, "launcher", "starfield-chroma-launcher.mjs");
const PORT = Number(process.env.STARFIELD_CHROMA_LAUNCHER_PORT ?? 47322);
const URL = `http://127.0.0.1:${PORT}/`;

function openBrowser(url) {
  childProcess.spawn("cmd.exe", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
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

  openBrowser(URL);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
