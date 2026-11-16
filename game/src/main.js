// Dustline Protocol — boot and the one loop: a fixed 60 Hz simulation
// feeding rendering at the display's rate. The sim lives in game.js;
// this file only owns the camera, the viewmodel gun and the frame loop.
//
// Screenshot modes (?shot=start|play|buy|end&seed=N): set up a deterministic
// frame for a capture, render it twice, freeze, then set window.__shotReady.
import * as THREE from 'three';
import { GAME_NAME } from './config.js';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createGame } from './game.js';
import { WEAPONS, PLAYER } from './config.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Seeded randomness for the capture modes so a screenshot is reproducible.
if (shot) Math.random = mulberry32(seed);

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const map = createMap(scene);
const audio = createAudio();
const input = createInput(renderer.domElement);
const hud = createHud({
  onBuy: (kind, id) => game.buy(kind, id),
  onStartRound: () => { if (game.state.phase === 'buy') game.startRound(); },
  onStartMatch: () => game.startMatch(),
  onRestart: () => game.startMatch(),
});
const game = createGame({ scene, map, audio, input, hud });

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') audio.setMuted(!audio.isMuted());
  game.onKey(e.code);
  // Clicking the canvas while playing re-locks the pointer after Esc.
  if (e.code === 'Enter' && game.state.phase === 'title') game.startMatch();
});
renderer.domElement.addEventListener('click', () => {
  if (game.state.phase === 'play' && !game.state.paused && !input.isLocked()) input.requestLock();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Viewmodel: a low-poly rifle built from boxes, riding the camera.
const gunMat = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.45, metalness: 0.5 });
const gunAccent = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.7 });
const viewGun = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.52), gunMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), gunMat);
  barrel.position.set(0, 0.03, -0.4);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), gunAccent);
  grip.position.set(0, -0.12, 0.14);
  grip.rotation.x = 0.35;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), gunAccent);
  sight.position.set(0, 0.1, -0.05);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.1), gunMat);
  mag.position.set(0, -0.13, -0.05);
  viewGun.add(body, barrel, grip, sight, mag);
  viewGun.position.set(0.24, -0.22, -0.55);
  viewGun.scale.setScalar(0.85);
  camera.add(viewGun);
}

let last = performance.now();
let acc = 0;
let shotFrames = 0;
let shotFrozen = false;

function syncCamera(dt) {
  const S = game.state;
  const p = S.player;
  const eyeH = p.alive ? (p.crouched ? PLAYER.eyeCrouch : PLAYER.eyeStand) : 0.55;
  camera.position.set(p.pos.x, p.pos.y + eyeH, p.pos.z);
  camera.rotation.y = p.yaw;
  // Recoil kicks the view up briefly; it decays in the sim.
  camera.rotation.x = p.pitch + p.recoil * 0.55;
  camera.rotation.z = 0;
  // Sniper zoom while aiming.
  const wantFov = input.aiming() && p.weaponId === 'sniper' && p.alive ? WEAPONS.sniper.zoomFov : 75;
  if (Math.abs(camera.fov - wantFov) > 0.1) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }
  // Viewmodel bob and recoil.
  const speed = Math.hypot(p.vel.x, p.vel.z);
  const t = performance.now() / 1000;
  const bob = p.moving && p.alive ? Math.sin(t * 9) * 0.008 * Math.min(1, speed / 5) : 0;
  viewGun.position.set(0.24, -0.22 + bob, -0.55 + p.recoil * 0.9 + (p.reloadT > 0 ? 0.12 : 0));
  viewGun.rotation.x = p.recoil * 1.2 + (p.reloadT > 0 ? -0.45 : 0);
  viewGun.visible = p.alive && S.phase !== 'title';
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (shotFrozen) {
    renderer.render(scene, camera);
    return;
  }
  acc += dt;
  let steps = 0;
  while (acc >= FIXED_STEP && steps < 12) {
    game.update(FIXED_STEP);
    acc -= FIXED_STEP;
    steps++;
  }
  if (steps === 12) acc = 0;
  game.syncMeshes();
  syncCamera(dt);
  renderer.render(scene, camera);
  if (shot) {
    shotFrames++;
    if (shotFrames >= 3) {
      shotFrozen = true;
      window.__shotReady = true;
    }
  }
}

// --- Screenshot setups -------------------------------------------------------
function setupShot(mode) {
  if (mode === 'start') {
    // Title screen over the yard, camera at the south spawn looking north.
    game.state.player.pos.set(0, 0, 16.5);
    game.state.player.yaw = 0;
    hud.showTitle(true);
  } else if (mode === 'play') {
    game.startMatch();
    game.startRound();
    // Staged for the capture: the player on the mid lane with two defenders
    // in the open ahead, not hidden behind the mid crates.
    game.debug.teleport(-2, 6, 0.38);
    const e1 = game.debug.spawnEnemyNear(-6, -4);
    if (e1) e1.yaw = Math.PI;
    const e2 = game.debug.spawnEnemyNear(4, -8);
    if (e2) e2.yaw = Math.PI;
    // Rifle in hand, full magazine, for the capture.
    game.state.player.mag = 30;
    game.state.player.weaponId = 'rifle';
    game.state.player.owned.rifle = true;
    game.state.player.reserve = 90;
  } else if (mode === 'buy') {
    game.startMatch();
  } else if (mode === 'end') {
    game.startMatch();
    game.debug.forceMatchEnd();
    hud.showTitle(false);
  }
  hud.update(game.state);
}

if (shot) {
  setupShot(shot);
  // Let the sim run a few fixed steps so bots settle into their holds.
  for (let i = 0; i < 30; i++) game.update(FIXED_STEP);
  if (shot === 'play') {
    // Re-aim after settling: the shot's tracer needs a live target in frame.
    game.debug.teleport(-2, 6, 0.38);
    const e1 = game.debug.spawnEnemyNear(-6, -4);
    if (e1) e1.yaw = Math.PI;
  }
  game.syncMeshes();
  syncCamera(0.016);
}

// --- Test hooks: the automated playtest drives the game through these. --------
window.__game = {
  name: GAME_NAME,
  get state() { return game.state; },
  start: () => game.startMatch(),
  startRound: () => game.startRound(),
  buy: (kind, id) => game.buy(kind, id),
  press: (code) => game.onKey(code),
  debug: game.debug,
  snapshot() {
    const S = game.state;
    const p = S.player;
    return {
      phase: S.phase,
      round: S.round,
      score: { ...S.score },
      money: S.money,
      timer: Math.round(S.timer * 10) / 10,
      playerHp: Math.round(p.hp),
      playerAlive: p.alive,
      weapon: p.weaponId,
      mag: p.mag,
      reserve: p.reserve,
      grenades: { ...p.grenades },
      armor: p.armor,
      bomb: { state: S.bomb.state, site: S.bomb.site, timer: Math.round(S.bomb.timer * 10) / 10 },
      botsAlive: { atk: S.bots.filter((b) => b.alive && b.team === 'atk').length, def: S.bots.filter((b) => b.alive && b.team === 'def').length },
      botsTotal: S.bots.length,
      pos: { x: Math.round(p.pos.x * 100) / 100, z: Math.round(p.pos.z * 100) / 100, yaw: Math.round(p.yaw * 100) / 100 },
      errors: window.__errors.slice(),
    };
  },
};

document.title = `${GAME_NAME} — 战术 FPS`;
requestAnimationFrame(frame);
