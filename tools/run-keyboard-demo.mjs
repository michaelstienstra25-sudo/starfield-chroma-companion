import dgram from "node:dgram";

const PORT = Number(process.env.STARFIELD_CHROMA_UDP_PORT ?? 47321);
const HOST = "127.0.0.1";
const socket = dgram.createSocket("udp4");

const delayScale = process.argv.includes("--quick") ? 0.55 : 1;

const sequence = [
  ["Base / idle", { type: "effects.clear" }, 2400],
  ["Movement keys", { type: "input.sprint" }, 1800],
  ["Jump / boost", { type: "input.jump" }, 1800],
  ["Interact", { type: "input.interact" }, 1600],
  ["Quickslot", { type: "input.quickslot" }, 1800],
  ["Reload", { type: "weapon.reload" }, 1800],
  ["Weapon fire", { type: "weapon.fired" }, 1800],
  ["Combat", { type: "player.combat", inCombat: true }, 2200],
  ["Light damage", { type: "player.damage", damage: 12 }, 2200],
  ["Heavy damage", { type: "player.trueDamage", damage: 180 }, 2800],
  ["Bleedout / critical", { type: "player.bleedout.enter" }, 2800],
  ["O2 warning", { type: "oxygen.danger" }, 2400],
  ["Gas / CO2 warning", { type: "co2.danger" }, 2400],
  ["Radiation", { type: "player.radiationDamage" }, 2400],
  ["Scanner", { type: "scanner.preview" }, 2600],
  ["Scanner anomaly", { type: "scanner.anomaly.preview" }, 4400],
  ["Scan complete", { type: "scan.complete" }, 2200],
  ["Survey complete", { type: "survey.complete" }, 2400],
  ["Menu", { type: "ui.menu.open", menu: "DataMenu" }, 2200],
  ["Starmap", { type: "ui.menu.open", menu: "GalaxyStarMapMenu" }, 2600],
  ["Powers menu", { type: "ui.menu.open", menu: "PowersMenu" }, 2600],
  ["Ship mode", { type: "player.ship" }, 2200],
  ["Ship combat", { type: "ship.combat" }, 2600],
  ["Takeoff", { type: "ui.menu.open", menu: "TakeoffMenu" }, 2800],
  ["Grav charge", { type: "grav.preview" }, 5200],
  ["Power / temple", { type: "power.preview" }, 3600],
  ["Artifact pickup", { type: "artifact.pickup" }, 3600],
  ["Level up", { type: "player.levelUp" }, 3600],
  ["Quest complete", { type: "quest.completed" }, 2600],
  ["Rare loot", { type: "loot.rare" }, 2400],
  ["Save", { type: "game.postSave" }, 2200],
  ["Load", { type: "game.preLoad" }, 2200],
  ["Return to base", { type: "effects.clear" }, 2200],
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.round(ms * delayScale)));
}

function send(event) {
  const payload = Buffer.from(JSON.stringify({ ...event, source: "keyboard-demo" }));
  return new Promise((resolve, reject) => {
    socket.send(payload, PORT, HOST, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

console.log("Starfield Chroma keyboard demo");
console.log("Point the camera at the keyboard now. Demo starts in 5 seconds.");
for (let seconds = 5; seconds >= 1; seconds -= 1) {
  console.log(`${seconds}...`);
  await wait(1000);
}

for (const [label, event, duration] of sequence) {
  console.log(label);
  await send(event);
  await wait(duration);
}

socket.close();
console.log("Demo complete.");
