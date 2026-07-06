import dgram from "node:dgram";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_CONFIG = {
  chromaRoot: "http://localhost:54235/razer/chromasdk",
  udpPort: 47321,
  frameMs: 90,
  staleMs: 15000,
  forceRefreshMs: 1000,
  brightness: 1,
  pulseBoost: 1.45,
  logEvents: false,
  logHeartbeats: false,
  accentDevices: true,
  artifactFormIds: [],
  damageThresholds: {
    chip: 1,
    heavy: 25,
    critical: 150,
  },
};

function mergeConfig(base, override) {
  const merged = { ...base, ...override };
  merged.damageThresholds = { ...base.damageThresholds, ...override?.damageThresholds };
  merged.artifactFormIds = override?.artifactFormIds ?? base.artifactFormIds;
  return merged;
}

function loadConfig() {
  const configPath = path.resolve(SCRIPT_DIR, "..", "starfield-chroma.config.json");
  try {
    if (!fs.existsSync(configPath)) return DEFAULT_CONFIG;
    return mergeConfig(DEFAULT_CONFIG, JSON.parse(fs.readFileSync(configPath, "utf8")));
  } catch (error) {
    console.error(`[config] ${error.message}`);
    return DEFAULT_CONFIG;
  }
}

const CONFIG = loadConfig();
const CHROMA_ROOT = CONFIG.chromaRoot;
const UDP_PORT = CONFIG.udpPort;
const FRAME_MS = CONFIG.frameMs;
const STALE_MS = CONFIG.staleMs;

function parseFormId(id) {
  if (typeof id === "number") return id;
  const text = String(id ?? "").trim();
  if (!text) return Number.NaN;
  if (/^0x/i.test(text)) return Number.parseInt(text.slice(2), 16);
  if (/^[0-9a-f]{6,8}$/i.test(text) && /[a-f]/i.test(text)) return Number.parseInt(text, 16);
  return Number.parseInt(text, 10);
}

const ARTIFACT_FORM_IDS = new Set(
  (CONFIG.artifactFormIds ?? []).map(parseFormId).filter(Number.isFinite),
);

const SCANNER_ANOMALY_FORM_IDS = new Set([
  723662,
  723664,
  2949582,
  2747117,
  2749433,
]);

function bgr(r, g, b) {
  return (b << 16) | (g << 8) | r;
}

function mix(a, b, t) {
  const ar = a & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = (a >> 16) & 0xff;
  const br = b & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = (b >> 16) & 0xff;
  return bgr(
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t),
  );
}

function scale(color, amount) {
  const adjusted = Math.max(0, Math.min(1, amount * CONFIG.brightness));
  return bgr(
    Math.round((color & 0xff) * adjusted),
    Math.round(((color >> 8) & 0xff) * adjusted),
    Math.round(((color >> 16) & 0xff) * adjusted),
  );
}

function pulseScale(color, amount) {
  return scale(color, amount * CONFIG.pulseBoost);
}

const Colors = {
  off: bgr(0, 0, 0),
  void: bgr(3, 6, 16),
  starlight: bgr(180, 220, 255),
  constellation: bgr(255, 196, 86),
  oxygen: bgr(57, 220, 255),
  scanner: bgr(89, 255, 154),
  engine: bgr(255, 112, 35),
  grav: bgr(160, 85, 255),
  menu: bgr(225, 236, 255),
  save: bgr(255, 232, 140),
  rare: bgr(80, 150, 255),
  quest: bgr(255, 216, 90),
  crime: bgr(255, 36, 0),
  co2: bgr(255, 54, 22),
  damage: bgr(255, 32, 28),
  warning: bgr(255, 86, 0),
};

const KeyZones = {
  movement: [[2, 3], [3, 2], [3, 3], [3, 4]],
  sprint: [[4, 1], [4, 2]],
  jump: [[4, 4], [4, 5], [4, 6]],
  interact: [[2, 4], [2, 5], [3, 6], [3, 7]],
  scanner: [[3, 5]],
  utility: [[2, 2], [4, 2], [4, 3], [4, 4], [4, 5], [3, 6]],
  quickslots: Array.from({ length: 10 }, (_, index) => [1, index + 1]),
  systems: [[1, 11], [1, 12], [1, 13], [1, 14], [2, 10], [2, 11], [2, 12], [3, 10], [3, 11], [3, 12]],
  ship: [[2, 17], [2, 18], [2, 19], [3, 17], [3, 18], [3, 19], [4, 17], [4, 18], [4, 19]],
  menus: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8], [0, 9], [0, 10], [0, 11], [2, 1]],
};

function emptyFrame(fill = Colors.void) {
  return Array.from({ length: 6 }, () => Array.from({ length: 22 }, () => fill));
}

function set(frame, row, col, color) {
  if (frame[row] && typeof frame[row][col] === "number") frame[row][col] = color;
}

function paint(frame, zone, color, intensity = 1) {
  for (const [row, col] of zone) {
    const current = frame[row]?.[col] ?? Colors.off;
    set(frame, row, col, mix(current, color, intensity));
  }
}

class LightingState {
  constructor() {
    this.mode = "explore";
    this.tick = 0;
    this.lastGameEvent = 0;
    this.pulses = [];
    this.scannerActiveUntil = 0;
    this.scannerOpen = false;
    this.lastScannerAnomalySeen = 0;
    this.lastScannerAnomalyPulse = 0;
    this.scannerAnomalyUntil = 0;
    this.scannerAnomalyLevel = 0;
    this.gravJumpArmedUntil = 0;
    this.gravChargeUntil = 0;
    this.gravChargeLevel = 0;
  }

  push(type, ttl = 24) {
    this.pulses.push({ type, age: 0, ttl });
  }

  activateScannerAnomaly(amount = 0.22) {
    const now = Date.now();
    this.lastScannerAnomalySeen = now;
    this.scannerAnomalyUntil = now + 30000;
    this.scannerAnomalyLevel = Math.min(1, Math.max(this.scannerAnomalyLevel, 0.52) + amount);
  }

  activateGravCharge(amount = 0.18) {
    const now = Date.now();
    this.gravChargeUntil = now + 26000;
    this.gravChargeLevel = Math.min(1, Math.max(this.gravChargeLevel, 0.28) + amount);
  }

  clearSustainedEffects() {
    this.pulses = [];
    this.mode = "explore";
    this.scannerActiveUntil = 0;
    this.scannerOpen = false;
    this.lastScannerAnomalySeen = 0;
    this.lastScannerAnomalyPulse = 0;
    this.scannerAnomalyUntil = 0;
    this.scannerAnomalyLevel = 0;
    this.gravJumpArmedUntil = 0;
    this.gravChargeUntil = 0;
    this.gravChargeLevel = 0;
  }

  handleMenuEvent(event) {
    const menu = String(event.menu ?? "");
    const opening = event.type !== "ui.menu.close" && event.opening !== false;
    const now = Date.now();

    if (!opening) {
      if (menu === "MonocleMenu") {
        this.scannerOpen = false;
        this.scannerActiveUntil = now + 2500;
      }
      if (menu === "GalaxyStarMapMenu") {
        this.gravJumpArmedUntil = now + 18000;
        this.activateGravCharge(0.1);
      }
      if (["DataMenu", "PauseMenu", "InventoryMenu", "SkillsMenu", "BSMissionMenu", "GalaxyStarMapMenu", "SpaceshipEditorMenu", "PowersMenu", "FavoritesMenu"].includes(menu)) {
        this.mode = "explore";
      }
      return;
    }

    switch (menu) {
      case "HUDMenu":
      case "HUDMessagesMenu":
      case "CursorMenu":
      case "FaderMenu":
        return;
      case "LoadingMenu":
        if (now < this.gravJumpArmedUntil) {
          this.mode = "ship";
          this.gravChargeLevel = 0;
          this.push("gravWarp", 96);
          return;
        }
        this.mode = "boot";
        this.push("load", 28);
        return;
      case "MainMenu":
        this.mode = "boot";
        this.push("load", 28);
        return;
      case "PlayBinkMenu":
        this.mode = "boot";
        this.push("powerUse", 110);
        this.push("artifact", 96);
        return;
      case "PauseMenu":
      case "DataMenu":
        this.mode = "menu";
        this.push("menu", 42);
        return;
      case "BSMissionMenu":
        this.mode = "menu";
        this.push("questUpdate", 48);
        return;
      case "GalaxyStarMapMenu":
        this.mode = "ship";
        this.gravJumpArmedUntil = now + 22000;
        this.activateGravCharge(0.34);
        this.push("gravCharge", 74);
        return;
      case "TakeoffMenu":
        this.mode = "ship";
        this.push("takeoff", 72);
        return;
      case "SkillsMenu":
        this.mode = "menu";
        this.push("levelUp", 82);
        return;
      case "PowersMenu":
        this.mode = "menu";
        this.push("powerUse", 96);
        return;
      case "FavoritesMenu":
        this.mode = "menu";
        this.push("quickslot", 42);
        return;
      case "InventoryMenu":
        this.mode = "menu";
        this.push("rareLoot", 42);
        return;
      case "SpaceshipEditorMenu":
        this.mode = "ship";
        this.push("shipCombat", 34);
        return;
      case "PhotoModeMenu":
      case "MonocleMenu":
        this.mode = "menu";
        if (menu === "MonocleMenu") {
          this.scannerOpen = true;
          this.scannerActiveUntil = Date.now() + 120000;
        }
        this.push("scanner", 34);
        return;
      default:
        this.mode = "menu";
        if (menu.includes("Mission")) this.push("questUpdate", 38);
        else if (menu.includes("Map")) this.push("grav", 42);
        else if (menu.includes("Inventory")) this.push("rareLoot", 36);
        else this.push("menu", 32);
    }
  }

  pushDamageValue(damage) {
    if (!Number.isFinite(damage) || damage <= 0) return;
    if (damage >= CONFIG.damageThresholds.critical) {
      this.push("critical", 34);
    } else if (damage >= CONFIG.damageThresholds.heavy) {
      this.push("trueDamage", 24);
    } else if (damage >= CONFIG.damageThresholds.chip) {
      this.push("damage", 16);
    } else {
      this.push("chipDamage", 8);
    }
  }

  pushDamageEvent(event) {
    const damage = event.damage ?? event.f32_10;
    const formOrId = Number(event.formOrId ?? event.formID ?? event.formId);
    if (formOrId === 4 || formOrId === 260) {
      this.push("oxygenDanger", 86);
    }
    this.pushDamageValue(damage);
  }

  applyEvent(event) {
    this.lastGameEvent = Date.now();
    switch (event.type) {
      case "sfse.loaded":
        this.mode = "boot";
        this.push("boot", 44);
        break;
      case "sfse.postLoad":
      case "sfse.postDataLoad":
      case "sfse.postPostDataLoad":
      case "game.postLoad":
        this.mode = "explore";
        this.push("load", 34);
        break;
      case "game.preSave":
        this.push("save", 30);
        break;
      case "game.preLoad":
        this.push("load", 30);
        break;
      case "game.postSave":
        this.mode = "explore";
        this.push("saved", 22);
        break;
      case "ui.menu":
      case "ui.menu.open":
      case "ui.menu.close":
        this.handleMenuEvent(event);
        break;
      case "player.damage":
        this.push("damage", 24);
        break;
      case "player.trueDamage":
        this.push("trueDamage", 34);
        break;
      case "game.hit":
        this.push("trueDamage", 26);
        break;
      case "game.actorDamage":
        break;
      case "game.actorDamage.value":
      case "game.actorDamage.raw":
        this.pushDamageEvent(event);
        break;
      case "game.criticalHit":
        this.push("critical", 26);
        break;
      case "player.levelUp":
      case "level.increase":
      case "level.widgetShown":
      case "level.animFinished":
        this.push("levelUp", 70);
        break;
      case "player.experienceMeter":
        this.push("questUpdate", 24);
        break;
      case "player.artifact":
      case "artifact.pickup":
        this.push("artifact", 90);
        break;
      case "digipick.start":
      case "lockpicking.start":
      case "lockpicking.focus":
        this.push("digipick", 58);
        break;
      case "quest.completed":
      case "mission.completed":
        this.push("questComplete", 64);
        break;
      case "quest.updated":
      case "mission.updated":
      case "objective.updated":
      case "hud.notification":
      case "mission.active":
      case "mission.widgetUpdate":
        this.push("questUpdate", 34);
        break;
      case "player.crime":
      case "player.wanted":
      case "contraband.detected":
        this.push("crime", 52);
        break;
      case "oxygen.low":
      case "oxygen.danger":
      case "co2.danger":
        this.push("oxygenDanger", 74);
        break;
      case "hud.mode":
        this.push("scanner", 18);
        break;
      case "scanner.preview":
        this.scannerOpen = false;
        this.scannerActiveUntil = Date.now() + 3500;
        this.push("scanner", 34);
        break;
      case "scanner.anomaly.preview":
        this.scannerOpen = false;
        this.scannerActiveUntil = Date.now() + 7000;
        this.scannerAnomalyUntil = Date.now() + 7000;
        this.scannerAnomalyLevel = Math.max(this.scannerAnomalyLevel, 0.65);
        this.push("scanner", 42);
        break;
      case "scanner.guideEffect":
      case "scanner.anomaly":
        this.scannerActiveUntil = Date.now() + 120000;
        this.activateScannerAnomaly(0.5);
        break;
      case "effects.clear":
        this.clearSustainedEffects();
        break;
      case "grav.preview":
        this.mode = "ship";
        this.gravJumpArmedUntil = Date.now() + 8000;
        this.gravChargeUntil = Date.now() + 6500;
        this.gravChargeLevel = 0.88;
        this.push("gravCharge", 48);
        this.push("gravWarp", 54);
        break;
      case "probe.loaded":
      case "probe.ready":
        this.push("boot", 38);
        break;
      case "power.preview":
      case "temple.power":
      case "power.used":
      case "starborn.power":
      case "player.power":
        this.push("powerUse", 58);
        break;
      case "ship.combat":
      case "ship.underAttack":
        this.mode = "shipCombat";
        this.push("shipCombat", 58);
        break;
      case "loot.rare":
      case "item.rare":
      case "legendary.pickup":
        this.push("rareLoot", 48);
        break;
      case "scan.complete":
      case "object.scanned":
        this.push("scanComplete", 42);
        break;
      case "survey.complete":
      case "planet.surveyComplete":
        this.push("surveyComplete", 74);
        break;
      case "player.aim.start":
      case "player.aim.end":
        this.push("aim", 20);
        break;
      case "player.jump.press":
      case "player.jump.release":
      case "player.zerogSprint.press":
      case "player.zerogSprint.release":
        this.push("boost", 34);
        break;
      case "inventory.containerChanged":
      case "inventory.itemAdded": {
        const itemFormId = parseFormId(event.itemFormID ?? event.itemFormId);
        if (ARTIFACT_FORM_IDS.has(itemFormId)) this.push("artifact", 90);
        if (SCANNER_ANOMALY_FORM_IDS.has(itemFormId) && Date.now() < this.scannerActiveUntil) {
          const now = Date.now();
          this.activateScannerAnomaly(0.075);
          if (now - this.lastScannerAnomalyPulse > 2600) {
            this.lastScannerAnomalyPulse = now;
            if (CONFIG.logEvents) console.log(`[infer] scanner.anomaly itemFormID=${itemFormId}`);
            this.activateScannerAnomaly(0.22);
          }
        }
        break;
      }
      case "game.actorValueChanged":
        this.push("vitals", 16);
        break;
      case "player.radiationDamage":
        this.push("radiation", 48);
        break;
      case "player.lifeStateChanged":
        this.push("lifeState", 30);
        break;
      case "player.bleedout.enter":
        this.mode = "critical";
        this.push("bleedout", 80);
        break;
      case "player.bleedout.exit":
        this.mode = "explore";
        this.push("saved", 35);
        break;
      case "player.combat":
        this.mode = "combat";
        this.push("combat", 30);
        break;
      case "weapon.fired":
      case "player.weaponFired":
        this.push("weaponFired", 16);
        break;
      case "weapon.ammoChanged":
        this.push("ammo", 16);
        break;
      case "weapon.reload":
        this.push("reload", 24);
        break;
      case "input.attack":
        this.push("attack", 14);
        break;
      case "input.aim":
        this.push("aim", 16);
        break;
      case "input.jump":
        this.push("boost", 18);
        break;
      case "input.sprint":
        this.push("sprint", 20);
        break;
      case "input.scanner":
        this.scannerOpen = true;
        this.scannerActiveUntil = Date.now() + 120000;
        this.push("scanner", 32);
        break;
      case "input.utility":
        this.push("utility", 18);
        break;
      case "input.interact":
      case "input.reload":
        this.push("action", 16);
        break;
      case "input.quickslot":
        this.push("quickslot", 14);
        break;
      case "input.map":
        if (this.mode === "ship") {
          this.gravJumpArmedUntil = Date.now() + 12000;
          this.activateGravCharge(0.12);
          this.push("gravCharge", 34);
        } else {
          this.mode = "menu";
          this.push("menu", 40);
        }
        break;
      case "input.menu":
      case "input.inventory":
        this.mode = "menu";
        this.push("menu", 40);
        break;
      case "player.ship":
        this.mode = "ship";
        this.push("grav", 34);
        break;
      case "player.explore":
      case "sfse.heartbeat":
        if (this.mode === "boot") this.mode = "explore";
        if (this.mode === "shipCombat") this.mode = "ship";
        break;
      default:
        break;
    }
  }

  nextFrame() {
    this.tick += 1;
    const stale = Date.now() - this.lastGameEvent > STALE_MS;
    const frame = emptyFrame(Colors.off);
    this.paintGameplayZones(frame, stale);
    this.paintPulses(frame);
    this.paintGravChargeState(frame);
    this.paintScannerAnomalyState(frame);
    return frame;
  }

  paintGameplayZones(frame, stale) {
    const steady = stale ? 0.32 : 0.8;
    const steadySoft = stale ? 0.28 : 0.8;
    const engine = stale ? 0.3 : 0.8;

    paint(frame, KeyZones.quickslots, scale(Colors.oxygen, steadySoft), 0.9);
    paint(frame, KeyZones.movement, scale(Colors.scanner, steady), 0.95);
    paint(frame, KeyZones.sprint, scale(Colors.engine, engine), 0.9);
    paint(frame, KeyZones.jump, scale(Colors.engine, engine), 0.9);
    paint(frame, KeyZones.interact, scale(Colors.constellation, stale ? 0.36 : 0.8), 0.92);
    paint(frame, KeyZones.scanner, scale(Colors.scanner, stale ? 0.34 : 0.8), 0.92);
    paint(frame, KeyZones.utility, scale(Colors.constellation, stale ? 0.28 : 0.8), 0.72);
    paint(frame, KeyZones.systems, scale(Colors.menu, stale ? 0.28 : 0.8), 0.76);

    const combatLift = this.mode === "combat" ? 0.18 : 0;
    if (combatLift > 0) paint(frame, KeyZones.interact, scale(Colors.warning, combatLift), 0.45);

    const shipColor = this.mode === "shipCombat" ? Colors.warning : this.mode === "ship" ? Colors.grav : scale(Colors.grav, 0.48);
    paint(frame, KeyZones.ship, shipColor, 0.85);

    if (this.mode === "menu") {
      paint(frame, KeyZones.menus, Colors.menu, 0.85);
      paint(frame, KeyZones.systems, Colors.menu, 0.55);
    }

    if (this.mode === "critical") {
      paint(frame, KeyZones.movement, scale(Colors.damage, 0.45), 0.65);
      paint(frame, KeyZones.interact, scale(Colors.warning, 0.35), 0.55);
    }
  }

  paintPulses(frame) {
    const active = [];
    for (const pulse of this.pulses) {
      const progress = pulse.age / pulse.ttl;
      const strength = Math.max(0, 1 - progress);
      if (pulse.type === "damage") this.damagePulse(frame, progress, strength);
      if (pulse.type === "trueDamage") this.damagePulse(frame, progress, strength);
      if (pulse.type === "chipDamage") this.chipDamagePulse(frame, progress, strength);
      if (pulse.type === "critical") this.criticalPulse(frame, progress, strength);
      if (pulse.type === "levelUp") this.levelUpPulse(frame, progress, strength);
      if (pulse.type === "artifact") this.artifactPulse(frame, progress, strength);
      if (pulse.type === "digipick") this.digipickPulse(frame, progress, strength);
      if (pulse.type === "questComplete") this.questCompletePulse(frame, progress, strength);
      if (pulse.type === "questUpdate") this.questUpdatePulse(frame, progress, strength);
      if (pulse.type === "crime") this.crimePulse(frame, progress, strength);
      if (pulse.type === "oxygenDanger") this.oxygenDangerPulse(frame, progress, strength);
      if (pulse.type === "powerUse") this.powerUsePulse(frame, progress, strength);
      if (pulse.type === "shipCombat") this.shipCombatPulse(frame, progress, strength);
      if (pulse.type === "rareLoot") this.rareLootPulse(frame, progress, strength);
      if (pulse.type === "scanComplete") this.scanCompletePulse(frame, progress, strength);
      if (pulse.type === "surveyComplete") this.surveyCompletePulse(frame, progress, strength);
      if (pulse.type === "save" || pulse.type === "saved") this.savePulse(frame, progress, strength);
      if (pulse.type === "load" || pulse.type === "boot") this.loadPulse(frame, progress, strength);
      if (pulse.type === "menu") paint(frame, KeyZones.menus, pulseScale(Colors.menu, strength), 0.82);
      if (pulse.type === "grav") this.hyperspacePulse(frame, progress, strength);
      if (pulse.type === "gravCharge") this.gravChargePulse(frame, progress, strength);
      if (pulse.type === "gravWarp") this.hyperspacePulse(frame, progress, strength * 1.12);
      if (pulse.type === "takeoff") this.takeoffPulse(frame, progress, strength);
      if (pulse.type === "vitals") paint(frame, KeyZones.movement, pulseScale(Colors.damage, strength * 0.7), 0.78);
      if (pulse.type === "radiation") this.radiationPulse(frame, progress, strength);
      if (pulse.type === "lifeState") this.damagePulse(frame, progress, strength * 0.8);
      if (pulse.type === "bleedout") this.bleedoutPulse(frame, progress, strength);
      if (pulse.type === "combat") this.combatPulse(frame, progress, strength);
      if (pulse.type === "weaponFired") paint(frame, KeyZones.interact, pulseScale(Colors.engine, strength * 0.85), 0.75);
      if (pulse.type === "ammo") paint(frame, KeyZones.quickslots, pulseScale(Colors.oxygen, strength * 0.9), 0.9);
      if (pulse.type === "reload") paint(frame, KeyZones.interact, pulseScale(Colors.engine, strength), 0.98);
      if (pulse.type === "scanner") this.scannerPulse(frame, progress, strength);
      if (pulse.type === "utility") paint(frame, KeyZones.utility, pulseScale(Colors.constellation, strength), 0.92);
      if (pulse.type === "action") paint(frame, KeyZones.interact, pulseScale(Colors.constellation, strength), 0.98);
      if (pulse.type === "quickslot") paint(frame, KeyZones.quickslots, pulseScale(Colors.oxygen, strength), 0.98);
      if (pulse.type === "boost") paint(frame, KeyZones.jump, pulseScale(Colors.engine, strength), 0.98);
      if (pulse.type === "sprint") paint(frame, KeyZones.sprint, pulseScale(Colors.engine, strength), 0.98);
      if (pulse.type === "attack") paint(frame, KeyZones.interact, pulseScale(Colors.warning, strength * 0.8), 0.7);
      if (pulse.type === "aim") paint(frame, KeyZones.scanner, pulseScale(Colors.oxygen, strength), 0.98);
      pulse.age += 1;
      if (pulse.age < pulse.ttl) active.push(pulse);
    }
    this.pulses = active;
  }

  edgeFlash(frame, color, strength) {
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 22; col += 1) {
        if (row === 0 || row === 5 || col === 0 || col === 21) {
          frame[row][col] = mix(frame[row][col], scale(color, strength), 0.88);
        }
      }
    }
  }

  damagePulse(frame, progress, strength) {
    const hit = strength * (0.55 + Math.max(0, Math.sin(progress * Math.PI * 3)) * 0.45);
    const impact = strength * Math.max(0, 1 - progress * 2.4);
    this.impactFlash(frame, Colors.damage, impact * 0.9);
    this.edgeFlash(frame, Colors.damage, hit * 0.82);
    paint(frame, KeyZones.movement, pulseScale(Colors.damage, hit), 0.96);
    paint(frame, KeyZones.interact, pulseScale(Colors.damage, hit * 0.9), 0.92);
    paint(frame, KeyZones.quickslots, pulseScale(Colors.warning, hit * 0.75), 0.78);
  }

  chipDamagePulse(frame, progress, strength) {
    const hit = strength * (0.25 + Math.max(0, Math.sin(progress * Math.PI * 2)) * 0.25);
    this.edgeFlash(frame, Colors.warning, hit * 0.55);
    paint(frame, KeyZones.movement, pulseScale(Colors.warning, hit), 0.68);
    paint(frame, KeyZones.interact, pulseScale(Colors.damage, hit * 0.55), 0.55);
  }

  criticalPulse(frame, progress, strength) {
    this.damagePulse(frame, progress, strength * 0.65);
    this.impactFlash(frame, Colors.warning, strength * Math.max(0, 1 - progress * 1.4));
    this.centerPulse(frame, Colors.warning, progress, strength * 0.8);
    paint(frame, KeyZones.quickslots, pulseScale(Colors.damage, strength * 0.75), 0.75);
  }

  levelUpPulse(frame, progress, strength) {
    const bloom = Math.sin(progress * Math.PI);
    const sweep = progress * 28 - 3;
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 22; col += 1) {
        const distance = Math.hypot(row - 2.5, (col - 10.5) * 0.36);
        const ring = Math.max(0, 1 - Math.abs(distance - (1.2 + progress * 5.6)) / 1.4);
        const wave = Math.max(0, 1 - Math.abs(col - sweep) / 4.2);
        const sparkle = ((row * 11 + col * 3 + this.tick) % 13 === 0) ? 0.55 : 0;
        const crown = row === 0 ? 0.22 * bloom : 0;
        const color = mix(Colors.save, Colors.starlight, Math.min(1, bloom * 0.72 + wave * 0.42));
        const amount = Math.max(ring * 1.05, wave * 0.62, sparkle * bloom, crown) * strength;
        if (amount > 0.03) frame[row][col] = mix(frame[row][col], pulseScale(color, amount), 0.96);
      }
    }
    this.centerPulse(frame, Colors.starlight, progress, strength * bloom);
    paint(frame, KeyZones.systems, pulseScale(Colors.save, strength * 1.05), 0.98);
    paint(frame, KeyZones.quickslots, pulseScale(Colors.starlight, strength * 0.86), 0.82);
    paint(frame, KeyZones.menus, pulseScale(Colors.save, strength * 0.62), 0.68);
  }

  artifactPulse(frame, progress, strength) {
    const bloom = Math.sin(progress * Math.PI);
    const pulse = 0.55 + Math.sin(this.tick * 0.42) * 0.25;
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 22; col += 1) {
        const x = (col - 10.5) * 0.34;
        const y = row - 2.5;
        const distance = Math.hypot(x, y);
        const spiral = Math.sin(distance * 3.2 - progress * Math.PI * 8 + Math.atan2(y, x) * 2);
        const ring = Math.max(0, 1 - Math.abs(distance - (0.7 + progress * 5.4)) / 1.15);
        const star = ((row * 13 + col * 7 + Math.floor(this.tick / 2)) % 23 === 0) ? 0.45 : 0;
        const cosmic = mix(Colors.grav, Colors.oxygen, Math.max(0, spiral) * 0.55 + bloom * 0.25);
        const amount = Math.max(ring, Math.max(0, spiral) * 0.55, star * bloom) * strength * pulse;
        if (amount > 0.03) frame[row][col] = mix(frame[row][col], pulseScale(cosmic, amount), 0.96);
      }
    }
    this.centerPulse(frame, Colors.starlight, progress, strength * bloom);
    paint(frame, KeyZones.systems, pulseScale(Colors.grav, strength), 0.96);
    paint(frame, KeyZones.scanner, pulseScale(Colors.oxygen, strength), 0.96);
    paint(frame, KeyZones.ship, pulseScale(Colors.grav, strength * 0.8), 0.86);
  }

  digipickPulse(frame, progress, strength) {
    const focus = strength * (0.55 + Math.sin(progress * Math.PI * 6) * 0.18);
    paint(frame, KeyZones.scanner, pulseScale(Colors.starlight, focus), 0.98);
    paint(frame, KeyZones.utility, pulseScale(Colors.oxygen, focus * 0.88), 0.84);
    paint(frame, KeyZones.systems, pulseScale(Colors.menu, focus * 0.35), 0.45);
    this.centerPulse(frame, Colors.oxygen, progress, strength * 0.24);
  }

  questCompletePulse(frame, progress, strength) {
    const bloom = Math.sin(progress * Math.PI);
    this.sweepPulse(frame, Colors.quest, progress, strength * 0.75);
    this.centerPulse(frame, Colors.starlight, progress, strength * bloom * 0.85);
    paint(frame, KeyZones.systems, pulseScale(Colors.quest, strength), 0.98);
    paint(frame, KeyZones.menus, pulseScale(Colors.starlight, strength * 0.55), 0.65);
  }

  questUpdatePulse(frame, progress, strength) {
    const breath = strength * (0.6 + Math.sin(progress * Math.PI) * 0.3);
    paint(frame, KeyZones.systems, pulseScale(Colors.quest, breath), 0.92);
    paint(frame, KeyZones.menus, pulseScale(Colors.menu, breath * 0.55), 0.58);
  }

  crimePulse(frame, progress, strength) {
    const alarm = strength * (0.55 + Math.max(0, Math.sin(progress * Math.PI * 8)) * 0.45);
    this.edgeFlash(frame, Colors.crime, alarm);
    paint(frame, KeyZones.systems, pulseScale(Colors.crime, alarm * 0.85), 0.9);
    paint(frame, KeyZones.interact, pulseScale(Colors.warning, alarm * 0.7), 0.78);
  }

  oxygenDangerPulse(frame, progress, strength) {
    const breath = strength * (0.55 + Math.sin(progress * Math.PI * 5) * 0.3);
    const color = mix(Colors.oxygen, Colors.co2, Math.min(1, progress * 1.2));
    this.edgeFlash(frame, color, breath * 0.8);
    paint(frame, KeyZones.movement, pulseScale(color, breath), 0.86);
    paint(frame, KeyZones.systems, pulseScale(color, breath * 0.75), 0.8);
    paint(frame, KeyZones.quickslots, pulseScale(Colors.oxygen, breath * 0.42), 0.52);
  }

  powerUsePulse(frame, progress, strength) {
    const bloom = Math.sin(progress * Math.PI);
    const reverse = 1 - progress;
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 22; col += 1) {
        const x = (col - 10.5) * 0.34;
        const y = row - 2.5;
        const distance = Math.hypot(x, y);
        const spiral = Math.max(0, Math.sin(distance * 3.6 - progress * Math.PI * 9 + Math.atan2(y, x) * 3));
        const star = ((row * 19 + col * 5 + Math.floor(this.tick / 2)) % 27 === 0) ? 0.42 : 0;
        const color = mix(Colors.grav, Colors.starlight, Math.min(1, spiral * 0.7 + bloom * 0.35));
        const amount = Math.max(spiral * 0.46, star * bloom) * strength;
        if (amount > 0.03) frame[row][col] = mix(frame[row][col], pulseScale(color, amount), 0.9);
      }
    }
    this.centerPulse(frame, Colors.grav, progress, strength * 0.9);
    this.centerPulse(frame, Colors.starlight, reverse, strength * bloom * 0.34);
    this.sweepPulse(frame, Colors.starlight, progress, strength * 0.52);
    paint(frame, KeyZones.utility, pulseScale(Colors.grav, strength * 1.08), 0.96);
    paint(frame, KeyZones.scanner, pulseScale(Colors.starlight, bloom * strength), 0.94);
    paint(frame, KeyZones.systems, pulseScale(Colors.grav, strength * 0.58), 0.66);
  }

  shipCombatPulse(frame, progress, strength) {
    const alarm = strength * (0.65 + Math.max(0, Math.sin(progress * Math.PI * 6)) * 0.35);
    this.edgeFlash(frame, Colors.warning, alarm * 0.75);
    paint(frame, KeyZones.ship, pulseScale(Colors.warning, alarm), 0.98);
    paint(frame, KeyZones.systems, pulseScale(Colors.engine, alarm * 0.72), 0.8);
    paint(frame, KeyZones.interact, pulseScale(Colors.warning, alarm * 0.48), 0.55);
  }

  rareLootPulse(frame, progress, strength) {
    const sparkleBase = Math.sin(progress * Math.PI);
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 22; col += 1) {
        const sparkle = ((row * 5 + col * 9 + this.tick) % 29 === 0) ? strength * sparkleBase : 0;
        if (sparkle > 0.03) frame[row][col] = mix(frame[row][col], pulseScale(Colors.rare, sparkle), 0.85);
      }
    }
    paint(frame, KeyZones.quickslots, pulseScale(Colors.rare, strength), 0.92);
    paint(frame, KeyZones.systems, pulseScale(Colors.starlight, strength * 0.38), 0.5);
  }

  scanCompletePulse(frame, progress, strength) {
    this.sweepPulse(frame, Colors.scanner, progress, strength);
    if (progress > 0.55) this.centerPulse(frame, Colors.starlight, progress, strength * 0.45);
    paint(frame, KeyZones.scanner, pulseScale(Colors.scanner, strength), 0.98);
    paint(frame, KeyZones.utility, pulseScale(Colors.scanner, strength * 0.8), 0.72);
  }

  surveyCompletePulse(frame, progress, strength) {
    const bloom = Math.sin(progress * Math.PI);
    this.sweepPulse(frame, Colors.scanner, progress, strength * 0.8);
    this.centerPulse(frame, Colors.starlight, progress, strength * bloom * 0.8);
    paint(frame, KeyZones.systems, pulseScale(Colors.quest, strength * 0.85), 0.9);
    paint(frame, KeyZones.scanner, pulseScale(Colors.scanner, strength), 0.98);
  }

  savePulse(frame, progress, strength) {
    const breath = strength * (0.55 + Math.sin(progress * Math.PI) * 0.45);
    paint(frame, KeyZones.systems, pulseScale(Colors.save, breath), 0.96);
    paint(frame, KeyZones.menus, pulseScale(Colors.save, breath * 0.35), 0.45);
  }

  loadPulse(frame, progress, strength) {
    this.sweepPulse(frame, Colors.oxygen, progress, strength * 0.65);
    paint(frame, KeyZones.systems, pulseScale(Colors.oxygen, strength * 0.85), 0.9);
    paint(frame, KeyZones.scanner, pulseScale(Colors.constellation, strength * 0.7), 0.9);
  }

  radiationPulse(frame, progress, strength) {
    const sick = bgr(170, 255, 40);
    const shimmer = strength * (0.65 + Math.sin(this.tick * 0.75) * 0.2);
    this.edgeFlash(frame, sick, shimmer * 0.85);
    paint(frame, KeyZones.systems, pulseScale(sick, shimmer), 0.9);
    paint(frame, KeyZones.scanner, pulseScale(sick, shimmer * 0.8), 0.8);
    paint(frame, KeyZones.movement, pulseScale(sick, shimmer * 0.42), 0.52);
  }

  bleedoutPulse(frame, progress, strength) {
    const calm = strength * (0.45 + Math.sin(this.tick * 0.08) * 0.08);
    this.impactFlash(frame, Colors.damage, calm * 0.35);
    paint(frame, KeyZones.movement, scale(Colors.damage, calm), 0.75);
    paint(frame, KeyZones.interact, scale(Colors.menu, calm * 0.65), 0.55);
  }

  combatPulse(frame, progress, strength) {
    this.edgeFlash(frame, Colors.warning, strength * 0.75);
    paint(frame, KeyZones.interact, pulseScale(Colors.warning, strength * 0.85), 0.8);
    paint(frame, KeyZones.movement, pulseScale(Colors.warning, strength * 0.45), 0.55);
  }

  scannerPulse(frame, progress, strength) {
    this.sweepPulse(frame, Colors.scanner, progress, strength * 0.8);
    paint(frame, KeyZones.scanner, pulseScale(Colors.scanner, strength), 0.98);
    paint(frame, KeyZones.utility, pulseScale(Colors.scanner, strength * 0.85), 0.78);
  }

  paintScannerAnomalyState(frame) {
    const now = Date.now();
    const anomalyRecentlySeen = now - this.lastScannerAnomalySeen < 120000;
    if (this.scannerOpen && anomalyRecentlySeen) {
      this.scannerAnomalyUntil = now + 3500;
      this.scannerAnomalyLevel = Math.max(this.scannerAnomalyLevel, 0.42);
    }

    if (now > this.scannerAnomalyUntil || now > this.scannerActiveUntil) {
      this.scannerAnomalyLevel = Math.max(0, this.scannerAnomalyLevel - 0.006);
      if (this.scannerAnomalyLevel <= 0.02) return;
    } else {
      this.scannerAnomalyLevel = Math.max(0.5, this.scannerAnomalyLevel - 0.0015);
    }

    const level = Math.min(1, this.scannerAnomalyLevel);
    const breath = 0.55 + Math.sin(this.tick * (0.08 + level * 0.12)) * 0.18;
    const shimmer = 0.35 + Math.max(0, Math.sin(this.tick * (0.18 + level * 0.38))) * 0.65;
    const sweepProgress = (this.tick % Math.max(12, Math.round(34 - level * 18))) / Math.max(12, Math.round(34 - level * 18));

    if (level > 0.18) {
      for (let row = 0; row < 6; row += 1) {
        for (let col = 0; col < 22; col += 1) {
          const ripple = 0.45 + Math.sin(this.tick * (0.16 + level * 0.28) + col * 0.42 + row * 0.7) * 0.22;
          const spark = ((row * 17 + col * 11 + Math.floor(this.tick / Math.max(1, Math.round(5 - level * 3)))) % 31 === 0) ? 0.22 * level : 0;
          const color = mix(Colors.grav, Colors.starlight, Math.min(1, level * 0.55 + spark));
          const amount = (0.16 + level * 0.34) * ripple + spark;
          if (amount > 0.03) frame[row][col] = mix(frame[row][col], pulseScale(color, amount), 0.78);
        }
      }
    }

    paint(frame, KeyZones.scanner, pulseScale(Colors.starlight, (0.7 + level * 0.95) * shimmer), 0.98);
    paint(frame, KeyZones.utility, pulseScale(Colors.grav, (0.48 + level * 0.72) * breath), 0.96);
    paint(frame, KeyZones.systems, pulseScale(Colors.oxygen, (0.25 + level * 0.58) * shimmer), 0.7 + level * 0.28);
    this.sweepPulse(frame, Colors.grav, sweepProgress, 0.3 + level * 0.78);
    if (level > 0.35) this.centerPulse(frame, Colors.starlight, sweepProgress, (level - 0.22) * 0.48);
    if (level > 0.62) this.edgeFlash(frame, Colors.grav, (level - 0.48) * 0.55);
  }

  impactFlash(frame, color, strength) {
    if (strength <= 0.02) return;
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 22; col += 1) {
        const distance = Math.hypot(row - 2.5, (col - 10.5) * 0.34);
        const amount = Math.max(0, 1 - distance / 5.2) * strength;
        if (amount > 0.02) frame[row][col] = mix(frame[row][col], pulseScale(color, amount), 0.88);
      }
    }
    this.edgeFlash(frame, color, strength * 0.75);
  }

  paintGravChargeState(frame) {
    const now = Date.now();
    if (now > this.gravChargeUntil) {
      this.gravChargeLevel = Math.max(0, this.gravChargeLevel - 0.012);
      if (this.gravChargeLevel <= 0.02) return;
    } else {
      this.gravChargeLevel = Math.min(1, this.gravChargeLevel + 0.0035);
    }

    const level = Math.min(1, this.gravChargeLevel);
    const hum = 0.58 + Math.sin(this.tick * (0.1 + level * 0.16)) * 0.18;
    const sweep = (this.tick % Math.max(14, Math.round(42 - level * 20))) / Math.max(14, Math.round(42 - level * 20));
    paint(frame, KeyZones.ship, pulseScale(Colors.grav, 0.36 + level * 0.72), 0.94);
    paint(frame, KeyZones.systems, pulseScale(Colors.oxygen, (0.18 + level * 0.42) * hum), 0.72);
    paint(frame, KeyZones.menus, pulseScale(Colors.starlight, level * 0.34), 0.42);
    this.sweepPulse(frame, Colors.grav, sweep, 0.12 + level * 0.38);
    if (level > 0.55) this.centerPulse(frame, Colors.starlight, sweep, (level - 0.45) * 0.26);
  }

  gravChargePulse(frame, progress, strength) {
    const charge = Math.min(1, progress * 1.3);
    const pulse = strength * (0.45 + Math.max(0, Math.sin(this.tick * 0.42)) * 0.38);
    paint(frame, KeyZones.ship, pulseScale(Colors.grav, 0.35 + charge * 0.72), 0.94);
    paint(frame, KeyZones.systems, pulseScale(Colors.oxygen, pulse), 0.82);
    paint(frame, KeyZones.menus, pulseScale(Colors.starlight, charge * strength * 0.48), 0.55);
    this.centerPulse(frame, Colors.grav, charge, strength * charge * 0.42);
  }

  takeoffPulse(frame, progress, strength) {
    const flame = strength * (0.55 + Math.max(0, Math.sin(progress * Math.PI * 7)) * 0.45);
    const wave = progress * 24 - 2;
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 22; col += 1) {
        const band = Math.max(0, 1 - Math.abs(col - wave - row * 0.45) / 4);
        const heat = mix(Colors.engine, Colors.warning, Math.min(1, band * 0.75 + flame * 0.25));
        const amount = band * flame;
        if (amount > 0.03) frame[row][col] = mix(frame[row][col], pulseScale(heat, amount), 0.9);
      }
    }
    paint(frame, KeyZones.ship, pulseScale(Colors.engine, flame), 0.98);
    paint(frame, KeyZones.jump, pulseScale(Colors.engine, flame * 0.82), 0.88);
    paint(frame, KeyZones.systems, pulseScale(Colors.warning, flame * 0.45), 0.62);
  }

  hyperspacePulse(frame, progress, strength) {
    const wave = progress * 27 - 3;
    const core = Math.sin(progress * Math.PI);
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 22; col += 1) {
        const rowOffset = (row - 2.5) * 0.75;
        const band = Math.max(0, 1 - Math.abs(col + rowOffset - wave) / 3.1);
        const trail = Math.max(0, 1 - Math.abs(col + rowOffset - (wave - 5)) / 8);
        const star = ((row * 7 + col * 5 + Math.floor(this.tick / 2)) % 17 === 0) ? 0.28 : 0;
        const warpColor = mix(Colors.grav, Colors.oxygen, Math.min(1, band * 0.85 + core * 0.25));
        const amount = Math.max(band, trail * 0.5, star * core) * strength;
        if (amount > 0.03) frame[row][col] = mix(frame[row][col], pulseScale(warpColor, amount), 0.96);
      }
    }
    this.centerPulse(frame, Colors.starlight, progress, strength * core * 0.75);
    paint(frame, KeyZones.ship, pulseScale(Colors.grav, strength), 0.98);
  }

  centerPulse(frame, color, progress, strength) {
    const radius = 1 + progress * 13;
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 22; col += 1) {
        const distance = Math.hypot(row - 3, (col - 10) * 0.45);
        const band = Math.max(0, 1 - Math.abs(distance - radius) * 0.85) * strength;
        if (band > 0.02) frame[row][col] = mix(frame[row][col], scale(color, band), 0.92);
      }
    }
  }

  sweepPulse(frame, color, progress, strength) {
    const center = progress * 26 - 2;
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 22; col += 1) {
        const band = Math.max(0, 1 - Math.abs(col - center) / 3) * strength;
        if (band > 0.04) frame[row][col] = mix(frame[row][col], scale(color, band), 0.9);
      }
    }
  }
}

async function requestJson(method, url, body) {
  const payload = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      family: parsed.hostname === "localhost" ? 4 : undefined,
      headers: payload ? {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      } : undefined,
      timeout: 5000,
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          reject(new Error(`Invalid JSON from ${url}: ${data}`));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error(`Timeout calling ${url}`)));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function requestJsonWithRetry(method, url, body, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await requestJson(method, url, body);
    } catch (error) {
      lastError = error;
      if (!["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(error.code) || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }
  throw lastError;
}

class ChromaClient {
  constructor() {
    this.uri = null;
    this.heartbeatTimer = null;
    this.lastKeyboardFrame = "";
    this.lastKeyboardSentAt = 0;
    this.lastStatic = new Map();
  }

  async init() {
    if (this.uri) return;
    const response = await requestJson("POST", CHROMA_ROOT, {
      title: "Starfield Chroma Companion",
      description: "Reactive Razer Chroma lighting for Starfield",
      author: { name: "Starfield Chroma Companion", contact: "GitHub" },
      device_supported: ["keyboard", "mouse", "mousepad", "headset", "chromalink"],
      category: "game",
    });

    if (!response.uri) throw new Error(`Chroma init failed: ${JSON.stringify(response)}`);
    this.uri = response.uri;
    console.log(`[chroma] session ${response.sessionid} ${this.uri}`);
    await requestJsonWithRetry("PUT", `${this.uri}/heartbeat`);
    this.heartbeatTimer = setInterval(() => this.heartbeat().catch(() => {}), 1000);
  }

  async heartbeat() {
    if (this.uri) await requestJsonWithRetry("PUT", `${this.uri}/heartbeat`);
  }

  async uninit() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.uri) {
      await requestJsonWithRetry("DELETE", this.uri).catch(() => {});
      this.uri = null;
    }
  }

  async keyboard(frame) {
    await this.init();
    const frameJson = JSON.stringify(frame);
    const now = Date.now();
    if (frameJson === this.lastKeyboardFrame && now - this.lastKeyboardSentAt < CONFIG.forceRefreshMs) return;
    this.lastKeyboardFrame = frameJson;
    this.lastKeyboardSentAt = now;
    await requestJsonWithRetry("PUT", `${this.uri}/keyboard`, {
      effect: "CHROMA_CUSTOM",
      param: frame,
    });
  }

  async staticDevice(device, color) {
    await this.init();
    if (this.lastStatic.get(device) === color) return;
    this.lastStatic.set(device, color);
    await requestJsonWithRetry("PUT", `${this.uri}/${device}`, {
      effect: "CHROMA_STATIC",
      param: { color },
    }).catch(() => {});
  }

  async accentDevices(state) {
    if (!CONFIG.accentDevices) return;
    const base = state.mode === "critical" ? Colors.damage : state.mode === "combat" ? Colors.warning : state.mode === "menu" ? Colors.menu : state.mode === "ship" ? Colors.grav : Colors.constellation;
    await Promise.all([
      this.staticDevice("mouse", base),
      this.staticDevice("mousepad", scale(base, 0.8)),
      this.staticDevice("headset", scale(Colors.oxygen, 0.7)),
      this.staticDevice("chromalink", scale(Colors.engine, 0.75)),
    ]);
  }
}

function parseEvent(message) {
  try {
    return JSON.parse(message.toString("utf8"));
  } catch {
    return { type: "raw", value: message.toString("utf8") };
  }
}

async function startRenderer(chroma, state) {
  let busy = false;
  return setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await chroma.keyboard(state.nextFrame());
      if (state.tick % 18 === 0) await chroma.accentDevices(state);
    } catch (error) {
      console.error(`[chroma] ${error.message}`);
    } finally {
      busy = false;
    }
  }, FRAME_MS);
}

async function runDemo() {
  const chroma = new ChromaClient();
  const state = new LightingState();
  const renderer = await startRenderer(chroma, state);
  try {
    for (const event of [
      { type: "sfse.loaded" },
      { type: "sfse.postDataLoad" },
      { type: "game.preSave" },
      { type: "player.damage" },
      { type: "quest.completed" },
      { type: "lockpicking.start" },
      { type: "oxygen.danger" },
      { type: "power.used" },
      { type: "loot.rare" },
      { type: "survey.complete" },
      { type: "ui.menu" },
      { type: "player.ship" },
      { type: "player.explore" },
    ]) {
      state.applyEvent(event);
      await new Promise((resolve) => setTimeout(resolve, 1400));
    }
  } finally {
    clearInterval(renderer);
    await chroma.uninit();
  }
}

async function runServer() {
  const chroma = new ChromaClient();
  const state = new LightingState();
  const socket = dgram.createSocket("udp4");
  const renderer = await startRenderer(chroma, state);

  async function close() {
    clearInterval(renderer);
    socket.close();
    await chroma.uninit();
  }

  process.on("SIGINT", async () => {
    await close();
    process.exit(0);
  });

  socket.on("message", (message) => {
    const event = parseEvent(message);
    if (CONFIG.logEvents && (CONFIG.logHeartbeats || event.type !== "sfse.heartbeat")) {
      console.log(`[event] ${JSON.stringify(event)}`);
    }
    state.applyEvent(event);
  });

  socket.bind(UDP_PORT, "127.0.0.1", () => {
    console.log(`Starfield Chroma companion listening on 127.0.0.1:${UDP_PORT}`);
  });

  await new Promise(() => {});
}

if (process.argv.includes("--demo")) {
  runDemo().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  runServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
