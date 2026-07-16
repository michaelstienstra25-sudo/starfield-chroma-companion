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
  merged.deviceIntensity = { ...base.deviceIntensity, ...override?.deviceIntensity };
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
const LOCK_DIR = path.resolve(SCRIPT_DIR, "..", ".runtime", "companion.lock");
const LOCK_INFO = path.join(LOCK_DIR, "owner.json");

const EFFECT_PRESETS = {
  immersive: {
    idleBase: 1,
    idleFocus: 1,
    pulse: 1,
    movement: 1,
    combat: 1,
    scanner: 1,
    reward: 1,
    device: 1,
  },
  subtle: {
    idleBase: 0.7,
    idleFocus: 0.78,
    pulse: 0.74,
    movement: 0.72,
    combat: 0.76,
    scanner: 0.82,
    reward: 0.86,
    device: 0.82,
  },
  combatHeavy: {
    idleBase: 0.9,
    idleFocus: 0.95,
    pulse: 1.14,
    movement: 0.98,
    combat: 1.28,
    scanner: 0.96,
    reward: 1.05,
    device: 1.22,
  },
  readable: {
    idleBase: 1.12,
    idleFocus: 1.08,
    pulse: 0.96,
    movement: 1.06,
    combat: 1.02,
    scanner: 1.04,
    reward: 0.98,
    device: 1,
  },
};

const PRESET = EFFECT_PRESETS[CONFIG.effectPreset] ?? EFFECT_PRESETS.immersive;

function presetScale(kind, amount) {
  return amount * (PRESET[kind] ?? 1);
}

function amplify(color, multiplier = 1) {
  return bgr(
    Math.min(255, Math.round((color & 0xff) * multiplier)),
    Math.min(255, Math.round(((color >> 8) & 0xff) * multiplier)),
    Math.min(255, Math.round(((color >> 16) & 0xff) * multiplier)),
  );
}

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
  return scale(color, presetScale("pulse", amount) * CONFIG.pulseBoost);
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

const MouseRows = 9;
const MouseCols = 7;

function emptyFrame(fill = Colors.void) {
  return Array.from({ length: 6 }, () => Array.from({ length: 22 }, () => fill));
}

function emptyMouseFrame(fill = Colors.off) {
  return Array.from({ length: MouseRows }, () => Array.from({ length: MouseCols }, () => fill));
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

function mouseAccentFrame(primary, secondary, style, tick) {
  const frame = emptyMouseFrame(scale(primary, 0.18));
  const pulse = 0.55 + Math.max(0, Math.sin(tick * 0.68)) * 0.45;
  const slow = 0.52 + Math.sin(tick * 0.14) * 0.18;

  for (let row = 0; row < MouseRows; row += 1) {
    for (let col = 0; col < MouseCols; col += 1) {
      const x = col - 3;
      const y = row - 4;
      const distance = Math.hypot(x * 0.9, y * 0.62);
      let amount = 0.18;
      let color = primary;

      if (style === "damage") {
        amount = 0.56 + pulse * 0.52;
        color = row < 2 || col === 0 || col === MouseCols - 1 ? secondary : primary;
      } else if (style === "combat") {
        const trigger = row <= 2 || (row <= 4 && (col <= 1 || col >= 5));
        amount = trigger ? 0.72 + pulse * 0.42 : 0.24 + pulse * 0.22;
        color = trigger ? secondary : primary;
      } else if (style === "scanner") {
        const sweep = Math.max(0, 1 - Math.abs(distance - ((tick % 24) / 24) * 5.6) / 0.9);
        amount = 0.24 + sweep * 0.86 + slow * 0.16;
        color = mix(primary, secondary, Math.min(1, sweep + 0.22));
      } else if (style === "grav" || style === "reward") {
        const spiral = Math.max(0, Math.sin(distance * 3.1 - tick * 0.22 + Math.atan2(y, x) * 2.2));
        amount = 0.26 + spiral * 0.76 + slow * 0.18;
        color = mix(primary, secondary, Math.min(1, spiral * 0.78 + 0.2));
      } else if (style === "oxygen") {
        const edge = col === 0 || col === MouseCols - 1 || row === 0 || row === MouseRows - 1;
        amount = edge ? 0.55 + pulse * 0.45 : 0.24 + slow * 0.22;
        color = edge ? secondary : primary;
      } else {
        amount = 0.22 + slow * 0.2;
        color = row <= 1 ? secondary : primary;
      }

      frame[row][col] = pulseScale(color, amount);
    }
  }

  return frame;
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
    this.lastLoadingMenuAt = 0;
    this.lastFaderMenuAt = 0;
    this.recentTravelMenuUntil = 0;
    this.takeoffCooldownUntil = 0;
    this.movementPulseUntil = 0;
    this.templeCinematicUntil = 0;
    this.lastCombatAt = 0;
    this.lastDamageAt = 0;
    this.lastWeaponAt = 0;
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
    this.lastLoadingMenuAt = 0;
    this.lastFaderMenuAt = 0;
    this.recentTravelMenuUntil = 0;
    this.takeoffCooldownUntil = 0;
    this.movementPulseUntil = 0;
    this.templeCinematicUntil = 0;
    this.lastCombatAt = 0;
    this.lastDamageAt = 0;
    this.lastWeaponAt = 0;
  }

  activateMovement(ms = 1800) {
    this.movementPulseUntil = Date.now() + ms;
  }

  activateTakeoff(reason = "takeoff") {
    const now = Date.now();
    if (now < this.takeoffCooldownUntil) return;
    this.mode = "ship";
    this.takeoffCooldownUntil = now + 16000;
    this.push("takeoff", 96);
    if (CONFIG.logEvents) console.log(`[infer] takeoff reason=${reason}`);
  }

  handleMenuEvent(event) {
    const menu = String(event.menu ?? "");
    const lowerMenu = menu.toLowerCase();
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
      if (menu === "PlayBinkMenu") {
        this.templeCinematicUntil = now + 6500;
        this.mode = "explore";
        this.push("powerUse", 86);
        this.push("artifact", 82);
      }
      if (["DataMenu", "PauseMenu", "InventoryMenu", "SkillsMenu", "BSMissionMenu", "GalaxyStarMapMenu", "SpaceshipEditorMenu", "PowersMenu", "FavoritesMenu"].includes(menu)) {
        this.mode = "explore";
      }
      return;
    }

    if (lowerMenu.includes("takeoff") || lowerMenu.includes("launch")) {
      this.activateTakeoff(`menu:${menu}`);
      return;
    }

    switch (menu) {
      case "HUDMenu":
      case "HUDMessagesMenu":
      case "CursorMenu":
        return;
      case "FaderMenu":
        this.lastFaderMenuAt = now;
        return;
      case "LoadingMenu":
        this.lastLoadingMenuAt = now;
        if (now < this.gravJumpArmedUntil) {
          this.mode = "ship";
          this.gravChargeLevel = 0;
          this.push("gravWarp", 96);
          return;
        }
        if (now < this.recentTravelMenuUntil) {
          this.mode = "boot";
          this.push("load", 28);
          return;
        }
        if (this.mode === "explore" || this.mode === "boot") {
          this.activateTakeoff("loading-transition");
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
        this.mode = "explore";
        this.templeCinematicUntil = now + 26000;
        this.push("powerUse", 160);
        this.push("artifact", 150);
        return;
      case "PauseMenu":
      case "DataMenu":
        this.mode = "menu";
        this.recentTravelMenuUntil = now + 10000;
        this.push("menu", 42);
        return;
      case "BSMissionMenu":
        this.mode = "menu";
        this.push("questUpdate", 48);
        return;
      case "GalaxyStarMapMenu":
        this.mode = "ship";
        this.recentTravelMenuUntil = now + 20000;
        this.gravJumpArmedUntil = now + 22000;
        this.activateGravCharge(0.34);
        this.push("gravCharge", 74);
        return;
      case "TakeoffMenu":
        this.activateTakeoff("TakeoffMenu");
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
        this.recentTravelMenuUntil = now + 12000;
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
        this.lastDamageAt = Date.now();
        this.push("damage", 24);
        break;
      case "player.trueDamage":
        this.lastDamageAt = Date.now();
        this.push("trueDamage", 34);
        break;
      case "game.hit":
        this.lastDamageAt = Date.now();
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
      case "companion.start":
        this.push("controlStart", 42);
        break;
      case "companion.stop":
        this.push("controlStop", 42);
        break;
      case "chroma.check":
        this.push("chromaCheck", 88);
        break;
      case "takeoff.preview":
      case "ship.takeoff":
      case "ship.launch":
      case "ship.liftoff":
        this.activateTakeoff(event.type);
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
        this.lastCombatAt = Date.now();
        this.push("combat", 30);
        break;
      case "weapon.fired":
      case "player.weaponFired":
        this.lastWeaponAt = Date.now();
        this.lastCombatAt = Date.now();
        this.push("weaponFired", 16);
        break;
      case "weapon.ammoChanged":
        this.push("ammo", 16);
        break;
      case "weapon.reload":
        this.push("reload", 24);
        break;
      case "input.attack":
        this.lastWeaponAt = Date.now();
        this.lastCombatAt = Date.now();
        this.push("attack", 14);
        break;
      case "input.aim":
        this.push("aim", 16);
        break;
      case "input.jump":
        this.activateMovement(1800);
        this.push("boost", 18);
        break;
      case "input.sprint":
        this.activateMovement(2600);
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
        if (Date.now() - this.lastLoadingMenuAt < 16000) {
          this.activateTakeoff("player.ship-after-load");
        } else {
          this.mode = "ship";
          this.push("grav", 34);
        }
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
    this.paintTempleCinematicState(frame);
    this.paintPulses(frame);
    this.paintGravChargeState(frame);
    this.paintScannerAnomalyState(frame);
    return frame;
  }

  paintGameplayZones(frame, stale) {
    const now = Date.now();
    const heartbeat = 0.5 + Math.max(0, Math.sin((this.tick / 11) * Math.PI * 2)) ** 2 * 0.5;
    const moving = now < this.movementPulseUntil;
    const recentCombat = now - this.lastCombatAt < 9000;
    const base = presetScale("idleBase", stale ? 0.12 : 0.18);
    const focus = presetScale("idleFocus", stale ? 0.18 : 0.28);
    const movementBreath = moving
      ? presetScale("movement", 0.46 + Math.sin(this.tick * 0.82) * 0.12)
      : focus * heartbeat;
    const utilityGlow = presetScale("idleFocus", stale ? 0.12 : 0.18);

    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 22; col += 1) {
        const star = ((row * 19 + col * 13 + Math.floor(this.tick / 4)) % 71 === 0) ? 0.06 : 0;
        frame[row][col] = scale(mix(Colors.void, Colors.constellation, star), base + star);
      }
    }

    paint(frame, KeyZones.quickslots, scale(Colors.oxygen, utilityGlow), 0.48);
    paint(frame, KeyZones.movement, scale(Colors.scanner, movementBreath), 0.9);
    paint(frame, KeyZones.sprint, scale(Colors.engine, moving ? 0.42 : 0.18 * heartbeat), 0.72);
    paint(frame, KeyZones.jump, scale(Colors.engine, moving ? 0.38 : 0.15 * heartbeat), 0.65);
    paint(frame, KeyZones.interact, scale(Colors.constellation, recentCombat ? 0.42 : 0.24), 0.74);
    paint(frame, KeyZones.scanner, scale(Colors.scanner, stale ? 0.18 : 0.26), 0.78);
    paint(frame, KeyZones.utility, scale(Colors.constellation, utilityGlow), 0.52);
    paint(frame, KeyZones.systems, scale(Colors.menu, stale ? 0.1 : 0.16), 0.48);

    const combatLift = this.mode === "combat" ? presetScale("combat", 0.18) : 0;
    if (combatLift > 0) paint(frame, KeyZones.interact, scale(Colors.warning, combatLift), 0.45);

    const shipColor = this.mode === "shipCombat"
      ? scale(Colors.warning, presetScale("combat", 0.72))
      : this.mode === "ship"
        ? scale(Colors.grav, 0.58)
        : scale(Colors.grav, presetScale("idleFocus", 0.16));
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
      if (pulse.type === "controlStart") this.controlStartPulse(frame, progress, strength);
      if (pulse.type === "controlStop") this.controlStopPulse(frame, progress, strength);
      if (pulse.type === "chromaCheck") this.chromaCheckPulse(frame, progress, strength);
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

  controlStartPulse(frame, progress, strength) {
    const glow = strength * (0.55 + Math.max(0, Math.sin(progress * Math.PI * 4)) * 0.45);
    this.sweepPulse(frame, Colors.scanner, progress, glow * 0.85);
    this.centerPulse(frame, Colors.oxygen, progress, glow * 0.55);
    paint(frame, KeyZones.movement, pulseScale(Colors.scanner, glow), 0.95);
    paint(frame, KeyZones.utility, pulseScale(Colors.oxygen, glow * 0.85), 0.88);
    paint(frame, KeyZones.menus, pulseScale(Colors.constellation, glow * 0.5), 0.72);
  }

  controlStopPulse(frame, progress, strength) {
    const fade = strength * (0.48 + Math.max(0, Math.sin(progress * Math.PI * 3)) * 0.52);
    this.edgeFlash(frame, Colors.warning, fade * 0.78);
    this.sweepPulse(frame, Colors.damage, progress, fade * 0.42);
    paint(frame, KeyZones.movement, pulseScale(Colors.warning, fade * 0.65), 0.82);
    paint(frame, KeyZones.interact, pulseScale(Colors.damage, fade * 0.5), 0.72);
  }

  chromaCheckPulse(frame, progress, strength) {
    const beat = strength * (0.62 + Math.max(0, Math.sin(progress * Math.PI * 8)) * 0.38);
    this.radarPulse(frame, Colors.scanner, progress, beat * 0.9);
    this.sweepPulse(frame, Colors.grav, (progress * 1.35) % 1, beat * 0.55);
    paint(frame, KeyZones.movement, pulseScale(Colors.scanner, beat), 0.96);
    paint(frame, KeyZones.interact, pulseScale(Colors.constellation, beat * 0.9), 0.9);
    paint(frame, KeyZones.quickslots, pulseScale(Colors.oxygen, beat * 0.72), 0.78);
    paint(frame, KeyZones.ship, pulseScale(Colors.grav, beat * 0.75), 0.86);
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
    this.radarPulse(frame, Colors.scanner, progress, strength * 0.9);
    paint(frame, KeyZones.scanner, pulseScale(Colors.scanner, strength), 0.98);
    paint(frame, KeyZones.utility, pulseScale(Colors.scanner, strength * 0.85), 0.78);
  }

  paintTempleCinematicState(frame) {
    const now = Date.now();
    if (now > this.templeCinematicUntil) return;

    const remaining = Math.max(0, this.templeCinematicUntil - now);
    const fade = Math.min(1, remaining / 2400);
    const cycle = (this.tick % 96) / 96;
    const hum = 0.64 + Math.sin(this.tick * 0.13) * 0.18;

    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 22; col += 1) {
        const x = (col - 10.5) * 0.32;
        const y = row - 2.5;
        const distance = Math.hypot(x, y);
        const spiral = Math.max(0, Math.sin(distance * 3.1 - cycle * Math.PI * 8 + Math.atan2(y, x) * 2.4));
        const star = ((row * 17 + col * 7 + Math.floor(this.tick / 2)) % 29 === 0) ? 0.25 : 0;
        const color = mix(Colors.grav, Colors.starlight, Math.min(1, spiral * 0.68 + star));
        const amount = (0.14 + spiral * 0.34 + star) * fade * hum;
        if (amount > 0.03) frame[row][col] = mix(frame[row][col], pulseScale(color, amount), 0.82);
      }
    }

    paint(frame, KeyZones.scanner, pulseScale(Colors.starlight, 0.72 * fade * hum), 0.98);
    paint(frame, KeyZones.utility, pulseScale(Colors.grav, 0.66 * fade), 0.92);
    paint(frame, KeyZones.systems, pulseScale(Colors.oxygen, 0.42 * fade * hum), 0.72);
    this.centerPulse(frame, Colors.starlight, cycle, 0.24 * fade);
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
    this.radarPulse(frame, Colors.grav, sweepProgress, 0.34 + level * 0.82);
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

  radarPulse(frame, color, progress, strength) {
    const angle = progress * Math.PI * 2;
    const radius = 0.8 + progress * 3.8;
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 22; col += 1) {
        const x = (col - 10.5) * 0.34;
        const y = row - 2.5;
        const distance = Math.hypot(x, y);
        const pointAngle = Math.atan2(y, x);
        const angular = Math.abs(Math.atan2(Math.sin(pointAngle - angle), Math.cos(pointAngle - angle)));
        const sweep = Math.max(0, 1 - angular / 0.55);
        const ring = Math.max(0, 1 - Math.abs(distance - radius) / 0.75);
        const amount = Math.max(sweep * 0.58, ring * 0.76) * strength;
        if (amount > 0.025) frame[row][col] = mix(frame[row][col], pulseScale(color, amount), 0.9);
      }
    }
  }

  activePulseStrength(types) {
    const wanted = new Set(types);
    let strength = 0;
    for (const pulse of this.pulses) {
      if (!wanted.has(pulse.type)) continue;
      const progress = pulse.age / Math.max(1, pulse.ttl);
      strength = Math.max(strength, Math.max(0, 1 - progress));
    }
    return strength;
  }

  accentState() {
    const now = Date.now();
    const pulse = 0.62 + Math.sin(this.tick * 0.34) * 0.22;
    const fastPulse = 0.6 + Math.max(0, Math.sin(this.tick * 0.82)) * 0.4;
    const slowPulse = 0.58 + Math.sin(this.tick * 0.14) * 0.16;
    const damage = Math.max(
      this.activePulseStrength(["damage", "trueDamage", "chipDamage", "critical", "lifeState", "bleedout"]),
      now - this.lastDamageAt < 1800 ? 0.7 : 0,
      this.mode === "critical" ? 0.9 : 0,
    );
    const oxygen = this.activePulseStrength(["oxygenDanger", "radiation", "vitals"]);
    const combat = Math.max(
      this.activePulseStrength(["combat", "shipCombat", "weaponFired", "attack", "reload", "ammo"]),
      now - this.lastWeaponAt < 1200 ? 0.74 : 0,
      this.mode === "combat" || this.mode === "shipCombat" ? 0.58 : 0,
    );
    const scanner = Math.max(
      this.activePulseStrength(["scanner", "scanComplete", "surveyComplete", "digipick", "aim"]),
      this.scannerOpen || now < this.scannerActiveUntil ? 0.5 : 0,
      this.scannerAnomalyLevel,
    );
    const grav = Math.max(
      this.activePulseStrength(["grav", "gravCharge", "gravWarp", "takeoff"]),
      this.gravChargeLevel,
      this.mode === "ship" ? 0.45 : 0,
      this.mode === "shipCombat" ? 0.58 : 0,
    );
    const reward = this.activePulseStrength(["powerUse", "artifact", "levelUp", "rareLoot", "questComplete", "questUpdate", "save", "saved", "load", "boot", "controlStart", "controlStop", "chromaCheck"]);

    const controlStop = this.activePulseStrength(["controlStop"]);
    if (controlStop > 0.05) {
      return {
        mouse: pulseScale(Colors.warning, 0.54 + controlStop * 0.4),
        mouseAlt: pulseScale(Colors.damage, 0.45 + controlStop * 0.38),
        mouseStyle: "damage",
        mousepad: pulseScale(mix(Colors.warning, Colors.damage, 0.35), 0.42 + controlStop * 0.35),
        headset: pulseScale(Colors.warning, 0.52 + controlStop * 0.36),
        chromalink: pulseScale(Colors.damage, 0.35 + controlStop * 0.28),
      };
    }

    const chromaCheck = this.activePulseStrength(["controlStart", "chromaCheck"]);
    if (chromaCheck > 0.05) {
      return {
        mouse: pulseScale(Colors.scanner, 0.62 + chromaCheck * 0.5),
        mouseAlt: pulseScale(Colors.grav, 0.48 + chromaCheck * 0.45),
        mouseStyle: "scanner",
        mousepad: pulseScale(mix(Colors.scanner, Colors.grav, 0.45), 0.48 + chromaCheck * 0.5),
        headset: pulseScale(Colors.oxygen, 0.62 + chromaCheck * 0.48),
        chromalink: pulseScale(Colors.constellation, 0.42 + chromaCheck * 0.42),
      };
    }

    if (damage > 0.05) {
      const hit = Math.max(damage, fastPulse * 0.75);
      return {
        mouse: pulseScale(Colors.damage, 0.82 + hit * 0.5),
        mouseAlt: pulseScale(Colors.warning, 0.72 + hit * 0.42),
        mouseStyle: "damage",
        mousepad: pulseScale(mix(Colors.damage, Colors.warning, 0.35), 0.58 + hit * 0.5),
        headset: pulseScale(Colors.damage, 0.92 + hit * 0.58),
        chromalink: pulseScale(Colors.damage, 0.55 + hit * 0.42),
      };
    }
    if (oxygen > 0.05) {
      const alert = 0.58 + oxygen * fastPulse;
      return {
        mouse: pulseScale(mix(Colors.oxygen, Colors.co2, 0.45), 0.58 + oxygen * 0.42),
        mouseAlt: pulseScale(Colors.co2, 0.72 + oxygen * 0.5),
        mouseStyle: "oxygen",
        mousepad: pulseScale(mix(Colors.oxygen, Colors.co2, 0.72), 0.48 + oxygen * 0.48),
        headset: pulseScale(mix(Colors.oxygen, Colors.co2, 0.85), 0.76 + alert * 0.42),
        chromalink: pulseScale(Colors.co2, 0.36 + oxygen * 0.38),
      };
    }
    if (combat > 0.05) {
      const fire = 0.5 + combat * fastPulse;
      return {
        mouse: pulseScale(Colors.warning, 0.72 + fire * 0.52),
        mouseAlt: pulseScale(Colors.damage, 0.58 + fire * 0.5),
        mouseStyle: "combat",
        mousepad: pulseScale(mix(Colors.warning, Colors.damage, 0.45), 0.34 + combat * 0.46),
        headset: pulseScale(Colors.engine, 0.44 + combat * 0.42),
        chromalink: pulseScale(Colors.engine, 0.42 + combat * 0.42),
      };
    }
    if (scanner > 0.05) {
      const level = Math.max(0.28, scanner);
      return {
        mouse: pulseScale(Colors.scanner, 0.52 + level * 0.52),
        mouseAlt: pulseScale(Colors.grav, 0.46 + level * 0.52),
        mouseStyle: "scanner",
        mousepad: pulseScale(mix(Colors.scanner, Colors.grav, Math.min(1, level * 0.7)), 0.32 + level * 0.58),
        headset: pulseScale(Colors.oxygen, 0.42 + level * 0.5),
        chromalink: pulseScale(Colors.scanner, 0.34 + level * 0.42),
      };
    }
    if (grav > 0.05) {
      const drive = 0.44 + grav * slowPulse;
      return {
        mouse: pulseScale(Colors.grav, 0.54 + grav * 0.5),
        mouseAlt: pulseScale(Colors.oxygen, 0.42 + grav * 0.46),
        mouseStyle: "grav",
        mousepad: pulseScale(mix(Colors.grav, Colors.oxygen, 0.38), drive),
        headset: pulseScale(Colors.grav, 0.46 + grav * 0.46),
        chromalink: pulseScale(Colors.engine, 0.36 + grav * 0.42),
      };
    }
    if (reward > 0.05) {
      const glow = 0.45 + reward * pulse;
      return {
        mouse: pulseScale(mix(Colors.quest, Colors.starlight, 0.38), 0.18 + glow),
        mouseAlt: pulseScale(Colors.grav, 0.48 + reward * 0.5),
        mouseStyle: "reward",
        mousepad: pulseScale(mix(Colors.quest, Colors.grav, 0.28), 0.34 + reward * 0.46),
        headset: pulseScale(Colors.starlight, 0.46 + reward * 0.52),
        chromalink: pulseScale(Colors.quest, 0.3 + reward * 0.38),
      };
    }
    if (this.mode === "menu") {
      return {
        mouse: scale(Colors.menu, 0.42),
        mouseAlt: scale(Colors.constellation, 0.36),
        mouseStyle: "ambient",
        mousepad: scale(Colors.constellation, 0.34),
        headset: scale(Colors.menu, 0.32),
        chromalink: scale(Colors.oxygen, 0.3),
      };
    }
    return {
      mouse: scale(Colors.scanner, 0.18 + 0.18 * slowPulse),
      mouseAlt: scale(Colors.constellation, 0.2 + 0.18 * slowPulse),
      mouseStyle: "ambient",
      mousepad: scale(Colors.constellation, 0.16 + 0.16 * slowPulse),
      headset: scale(Colors.oxygen, 0.14 + 0.14 * slowPulse),
      chromalink: scale(Colors.grav, 0.13 + 0.13 * slowPulse),
    };
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

function isTransientChromaError(error) {
  return ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(error?.code);
}

class ChromaClient {
  constructor() {
    this.uri = null;
    this.heartbeatTimer = null;
    this.lastKeyboardFrame = "";
    this.lastKeyboardSentAt = 0;
    this.lastStatic = new Map();
    this.lastCustom = new Map();
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
    try {
      await requestJsonWithRetry("PUT", `${this.uri}/heartbeat`, undefined, 12);
    } catch (error) {
      this.resetSession();
      throw error;
    }
    this.heartbeatTimer = setInterval(() => this.heartbeat().catch(() => {}), 1000);
  }

  async heartbeat() {
    if (!this.uri) return;
    try {
      await requestJsonWithRetry("PUT", `${this.uri}/heartbeat`);
    } catch (error) {
      if (isTransientChromaError(error)) this.resetSession();
      throw error;
    }
  }

  resetSession() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.uri = null;
    this.lastKeyboardFrame = "";
    this.lastKeyboardSentAt = 0;
    this.lastStatic.clear();
    this.lastCustom.clear();
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
    try {
      await requestJsonWithRetry("PUT", `${this.uri}/keyboard`, {
        effect: "CHROMA_CUSTOM",
        param: frame,
      });
    } catch (error) {
      if (isTransientChromaError(error)) this.resetSession();
      throw error;
    }
  }

  async staticDevice(device, color) {
    await this.init();
    if (this.lastStatic.get(device) === color) return;
    this.lastStatic.set(device, color);
    try {
      await requestJsonWithRetry("PUT", `${this.uri}/${device}`, {
        effect: "CHROMA_STATIC",
        param: { color },
      });
    } catch (error) {
      if (isTransientChromaError(error)) this.resetSession();
    }
  }

  async customMouse(accent, tick) {
    await this.init();
    const frame = mouseAccentFrame(
      accent.mouse,
      accent.mouseAlt ?? accent.mouse,
      accent.mouseStyle ?? "ambient",
      tick,
    );
    const frameJson = JSON.stringify(frame);
    if (this.lastCustom.get("mouse") === frameJson) return;
    this.lastCustom.set("mouse", frameJson);
    try {
      await requestJsonWithRetry("PUT", `${this.uri}/mouse`, {
        effect: "CHROMA_CUSTOM2",
        param: frame,
      });
    } catch (error) {
      if (isTransientChromaError(error)) this.resetSession();
      await this.staticDevice("mouse", accent.mouse);
    }
  }

  async accentDevices(state) {
    if (!CONFIG.accentDevices) return;
    const accent = state.accentState();
    const devicePreset = PRESET.device ?? 1;
    const boostedAccent = {
      ...accent,
      mouse: amplify(accent.mouse, devicePreset * (CONFIG.deviceIntensity?.mouse ?? 1)),
      mouseAlt: amplify(accent.mouseAlt ?? accent.mouse, devicePreset * (CONFIG.deviceIntensity?.mouse ?? 1)),
      mousepad: amplify(accent.mousepad, devicePreset * (CONFIG.deviceIntensity?.mousepad ?? 1)),
      headset: amplify(accent.headset, devicePreset * (CONFIG.deviceIntensity?.headset ?? 1)),
      chromalink: amplify(accent.chromalink, devicePreset * (CONFIG.deviceIntensity?.chromalink ?? 1)),
    };
    await Promise.all([
      this.customMouse(boostedAccent, state.tick),
      this.staticDevice("mousepad", boostedAccent.mousepad),
      this.staticDevice("headset", boostedAccent.headset),
      this.staticDevice("chromalink", boostedAccent.chromalink),
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

function isProcessAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireCompanionLock() {
  fs.mkdirSync(path.dirname(LOCK_DIR), { recursive: true });
  try {
    fs.mkdirSync(LOCK_DIR);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let owner = {};
    try {
      owner = JSON.parse(fs.readFileSync(LOCK_INFO, "utf8"));
    } catch {
      owner = {};
    }
    if (isProcessAlive(Number(owner.pid))) {
      console.log(`[single-instance] companion already running as pid ${owner.pid}`);
      return false;
    }
    fs.rmSync(LOCK_DIR, { recursive: true, force: true });
    fs.mkdirSync(LOCK_DIR);
  }

  fs.writeFileSync(LOCK_INFO, JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }, null, 2), "utf8");
  return true;
}

function releaseCompanionLock() {
  try {
    const owner = JSON.parse(fs.readFileSync(LOCK_INFO, "utf8"));
    if (Number(owner.pid) === process.pid) {
      fs.rmSync(LOCK_DIR, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup only.
  }
}

async function startRenderer(chroma, state) {
  let busy = false;
  return setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await chroma.keyboard(state.nextFrame());
      if (state.tick % 6 === 0) await chroma.accentDevices(state);
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
  if (!acquireCompanionLock()) return;
  const chroma = new ChromaClient();
  const state = new LightingState();
  const socket = dgram.createSocket("udp4");
  const renderer = await startRenderer(chroma, state);
  state.push("controlStart", 42);
  let closed = false;

  async function close() {
    if (closed) return;
    closed = true;
    clearInterval(renderer);
    socket.close();
    await chroma.uninit();
    releaseCompanionLock();
  }

  process.on("SIGINT", async () => {
    await close();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await close();
    process.exit(0);
  });
  process.on("exit", releaseCompanionLock);

  socket.on("message", (message) => {
    const event = parseEvent(message);
    if (CONFIG.logEvents && (CONFIG.logHeartbeats || event.type !== "sfse.heartbeat")) {
      console.log(`[event] ${JSON.stringify(event)}`);
    }
    state.applyEvent(event);
  });

  socket.on("error", async (error) => {
    console.error(`[udp] ${error.message}`);
    await close();
    process.exit(1);
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
