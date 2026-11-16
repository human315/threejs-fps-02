// Dustline Protocol — central tuning: palette, weapons, economy, rounds.
// One place owns every number the other modules read; nothing here touches the DOM or three.js.
export const GAME_NAME = 'Dustline Protocol';
export const GAME_TAGLINE = '沙线协议 · 五对五战术回合制射击';

// Desert-warm sand against cold steel blue. Six swatches, used by map.js and hud.js alike.
export const PALETTE = {
  sand: 0xc8a06a,
  sandLight: 0xe0c090,
  sandDark: 0x8a6a42,
  steel: 0x5a6b7d,
  steelDark: 0x2e3947,
  slate: 0x3a4552,
  concrete: 0x9a938a,
  accent: 0xf0a830, // amber: HUD highlights, site markers
  ally: 0x35c8a8, // teal: teammates
  enemy: 0xe0523d, // rust red: opponents
  bomb: 0xffc93c,
};

export const ROUND = {
  winScore: 5, // first to 5 rounds takes the match
  maxRounds: 9,
  roundTime: 100, // seconds of live play per round
  buyTime: 20, // seconds in the buy phase
  bombTimer: 35, // seconds from plant to detonation
  plantTime: 3.5, // seconds holding E at a site to plant
  defuseTime: 5.0, // seconds holding E at a planted bomb to defuse
  freezeTime: 1.2, // seconds of freeze at round start before bots move
};

export const ECONOMY = {
  startMoney: 800,
  roundWin: 3000,
  roundLoss: 1900,
  kill: 300,
  plant: 300,
  maxMoney: 16000,
};

// Every weapon: damage is per body hit; headshots multiply (see weapons.js).
// spread is in radians at rest; moveSpread multiplies it while moving.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', kind: 'pistol', price: 0,
    damage: 26, headMult: 2.5, mag: 12, reserve: 48, fireMs: 300, auto: false,
    reloadMs: 1400, spread: 0.012, moveSpread: 2.2, recoil: 0.011, range: 60,
    tracer: 0xffe9a8, sound: 'pistol',
  },
  smg: {
    id: 'smg', name: 'VX-9 Repeater', kind: 'smg', price: 1500,
    damage: 22, headMult: 2.5, mag: 30, reserve: 120, fireMs: 92, auto: true,
    reloadMs: 1700, spread: 0.02, moveSpread: 2.0, recoil: 0.008, range: 55,
    tracer: 0xffe9a8, sound: 'smg',
  },
  rifle: {
    id: 'rifle', name: 'KR-77 Longshot', kind: 'rifle', price: 2700,
    damage: 33, headMult: 2.5, mag: 30, reserve: 90, fireMs: 125, auto: true,
    reloadMs: 2100, spread: 0.009, moveSpread: 2.4, recoil: 0.013, range: 90,
    tracer: 0xffd27a, sound: 'rifle',
  },
  sniper: {
    id: 'sniper', name: 'Longbow-50', kind: 'sniper', price: 4750,
    damage: 96, headMult: 2.5, mag: 5, reserve: 15, fireMs: 1100, auto: false,
    reloadMs: 3000, spread: 0.0015, moveSpread: 4.0, recoil: 0.05, range: 120,
    tracer: 0xfff2c0, sound: 'sniper', zoomFov: 28,
  },
};

export const GRENADES = {
  he: { id: 'he', name: 'HE Charge', price: 300, radius: 7, maxDamage: 110 },
  smoke: { id: 'smoke', name: 'Smoke Canister', price: 300, duration: 12, radius: 4 },
};

export const PLAYER = {
  hp: 100,
  radius: 0.45,
  eyeStand: 1.62,
  eyeCrouch: 1.12,
  walkSpeed: 5.2,
  crouchSpeed: 2.6,
  accel: 42,
  friction: 11,
  jumpSpeed: 6.4,
  gravity: 17,
};

export const BOT = {
  hp: 100,
  radius: 0.45,
  speed: 3.6,
  sightRange: 46,
  sightHalfAngle: 0.62, // ~35 degrees off-axis still counts as seen
  hearRange: 26, // gunfire heard inside this radius turns a bot toward it
  aimDelayMs: 320, // time between spotting and first shot
  burstMin: 2,
  burstMax: 5,
};

// Map bounds and the two bomb sites. The map module owns the wall list;
// these anchors are shared by bots, the bomb logic and the minimap.
export const MAP = {
  halfX: 30,
  halfZ: 20,
  siteA: { x: -23, z: -14, r: 4.5 },
  siteB: { x: 23, z: -14, r: 4.5 },
  spawnAtk: { x: 0, z: 16.5 }, // attackers (player team) start south
  spawnDef: { x: 0, z: -16.5 }, // defenders start north
};
