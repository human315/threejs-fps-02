// Dustline Protocol — bots: one bot is a body, a weapon and a small brain.
// Brains run on routes and holds from map.js, see and hear through the map,
// and fight in bursts with an aim delay, so a stopped, aiming player wins duels.
import * as THREE from 'three';
import { BOT, WEAPONS, PALETTE, MAP } from './config.js';
import { ROUTES, DEF_HOLDS } from './map.js';

const ALLY_NAMES = ['Sable', 'Mira', 'Kite', 'Rook'];
const ENEMY_NAMES = ['Ash', 'Bramble', 'Cinder', 'Flint', 'Wren'];
const ENEMY_WEAPONS = ['rifle', 'rifle', 'smg', 'rifle', 'sniper'];
const ALLY_WEAPONS = ['rifle', 'smg', 'rifle', 'smg'];

let nextId = 1;

function buildMesh(bot, scene) {
  const teamColor = bot.team === 'atk' ? PALETTE.ally : PALETTE.enemy;
  const group = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.78, 0.36),
    new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.8 }),
  );
  torso.position.y = 1.02;
  torso.castShadow = true;
  torso.userData = { bot, part: 'body' };
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshStandardMaterial({ color: 0xd9b48f, roughness: 0.7 }),
  );
  head.position.y = 1.58;
  head.castShadow = true;
  head.userData = { bot, part: 'head' };
  const helmet = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.14, 0.38),
    new THREE.MeshStandardMaterial({ color: 0x3a4552, roughness: 0.6 }),
  );
  helmet.position.y = 1.76;
  helmet.userData = { bot, part: 'head' };
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.12, 0.85),
    new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5, metalness: 0.4 }),
  );
  gun.position.set(0.22, 1.25, -0.35);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.62, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2e3947, roughness: 0.9 }),
  );
  legs.position.y = 0.31;
  legs.userData = { bot, part: 'body' };
  group.add(torso, head, helmet, gun, legs);
  group.position.set(bot.pos.x, 0, bot.pos.z);
  scene.add(group);
  bot.group = group;
  bot.hitMeshes = [torso, head, helmet, legs];
  return group;
}

export function createBot(team, index, scene, opts = {}) {
  const isAlly = team === 'atk' && index < 4;
  const bot = {
    id: nextId++,
    team,
    name: team === 'atk' ? ALLY_NAMES[index] : ENEMY_NAMES[index],
    isPlayerAlly: team === 'atk',
    pos: new THREE.Vector3(opts.x ?? 0, 0, opts.z ?? 0),
    yaw: opts.yaw ?? 0,
    hp: BOT.hp,
    alive: true,
    weaponId: team === 'atk' ? ALLY_WEAPONS[index] : ENEMY_WEAPONS[index],
    mag: WEAPONS[team === 'atk' ? ALLY_WEAPONS[index] : ENEMY_WEAPONS[index]].mag,
    reserve: 90,
    state: 'route', // route | hold | combat | plant | defuse | investigate
    route: null,
    nodeIdx: 0,
    hold: null,
    holdT: 0,
    target: null, // { kind: 'player'|'bot', ref, x, z }
    aimT: 0,
    burstLeft: 0,
    fireT: 0,
    reloadT: 0,
    scanDir: 1,
    scanT: 0,
    heard: null, // { x, z, t }
    plantT: 0,
    defuseT: 0,
    carrier: false,
    moveSpeed: BOT.speed,
    stepT: 0,
  };
  buildMesh(bot, scene);
  return bot;
}

// Assign a fresh route/hold when a round starts.
export function assignBot(bot, site, role) {
  bot.state = 'route';
  bot.nodeIdx = 0;
  bot.target = null;
  bot.aimT = 0;
  bot.burstLeft = 0;
  bot.heard = null;
  bot.plantT = 0;
  bot.defuseT = 0;
  if (bot.team === 'def') {
    bot.hold = DEF_HOLDS[role % DEF_HOLDS.length];
    bot.route = null;
    // Defenders walk to their hold, then hold it.
    bot.route = [{ x: bot.pos.x, z: bot.pos.z }, { x: bot.hold.x, z: bot.hold.z }];
    bot.state = 'route';
  } else {
    const pool = site === 'A' ? [ROUTES.aWest, ROUTES.aMid] : [ROUTES.bEast, ROUTES.bMid];
    bot.route = pool[role % pool.length];
    bot.hold = null;
  }
}

function dist2(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

function faceToward(bot, tx, tz, dt) {
  const want = Math.atan2(-(tx - bot.pos.x), -(tz - bot.pos.z));
  let d = want - bot.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const turn = Math.max(-3.2 * dt, Math.min(3.2 * dt, d));
  bot.yaw += turn;
  return Math.abs(d) < 0.25;
}

// Step one bot for dt seconds. `w` is the world interface the game provides:
// w.los(ax,az,bx,bz) | w.player() | w.enemiesOf(bot) | w.shoot(bot, targetPos, opts)
// w.damagePlayer(dmg, fromBot) | w.damageBot(bot, dmg, fromName) | w.onPlanted(site)
// w.onDefused() | w.bomb | w.phase | w.playSound(name) | w.smokeClouds
export function updateBot(bot, dt, w) {
  if (!bot.alive) return;
  const weapon = WEAPONS[bot.weaponId];

  if (bot.reloadT > 0) {
    bot.reloadT -= dt;
    if (bot.reloadT <= 0) {
      const need = weapon.mag - bot.mag;
      const take = Math.min(need, bot.reserve);
      bot.mag += take;
      bot.reserve -= take;
    }
  }

  // --- Sensing: who can this bot see right now?
  let seen = null;
  let seenD = Infinity;
  const candidates = w.enemiesOf(bot);
  for (const c of candidates) {
    if (!c.alive) continue;
    const d = dist2(bot.pos.x, bot.pos.z, c.x, c.z);
    if (d > BOT.sightRange) continue;
    if (w.los(bot.pos.x, bot.pos.z, c.x, c.z)) continue;
    const ang = Math.atan2(-(c.x - bot.pos.x), -(c.z - bot.pos.z));
    let diff = ang - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > BOT.sightHalfAngle && d > 6) continue; // peripheral vision only up close
    if (d < seenD) { seen = c; seenD = d; }
  }
  if (seen) {
    bot.target = seen;
    bot.aimT += dt;
    bot.state = 'combat';
  } else if (bot.state === 'combat') {
    bot.aimT = 0;
    bot.target = null;
    bot.state = bot.route ? 'route' : 'hold';
  }

  // --- Hearing: a recent gunshot nearby pulls the bot toward the noise.
  if (bot.heard && w.now - bot.heard.t < 4 && !seen) {
    const d = dist2(bot.pos.x, bot.pos.z, bot.heard.x, bot.heard.z);
    if (d > 2) {
      moveToward(bot, bot.heard.x, bot.heard.z, dt, w);
      faceToward(bot, bot.heard.x, bot.heard.z, dt);
      return;
    }
    bot.heard = null;
  }

  // --- Combat: burst fire with an aim delay, then a short pause.
  if (bot.state === 'combat' && bot.target) {
    const t = bot.target;
    const facing = faceToward(bot, t.x, t.z, dt);
    if (bot.aimT * 1000 > BOT.aimDelayMs && facing) {
      if (bot.burstLeft <= 0) {
        bot.burstLeft = BOT.burstMin + Math.floor(Math.random() * (BOT.burstMax - BOT.burstMin + 1));
        bot.fireT = 0;
      }
      bot.fireT -= dt;
      if (bot.fireT <= 0 && bot.burstLeft > 0) {
        if (bot.mag <= 0) {
          if (bot.reloadT <= 0 && bot.reserve > 0) bot.reloadT = weapon.reloadMs / 1000;
          bot.burstLeft = 0;
        } else {
          bot.mag--;
          bot.burstLeft--;
          bot.fireT = weapon.fireMs / 1000;
          const d = dist2(bot.pos.x, bot.pos.z, t.x, t.z);
          // Hit chance: close and still targets are easier; snipers punish range.
          let chance = 0.42 - d * 0.006 - (t.moving ? 0.12 : 0) + (bot.weaponId === 'sniper' ? 0.12 : 0);
          chance = Math.max(0.05, Math.min(0.6, chance));
          const hit = Math.random() < chance;
          const aimPoint = { x: t.x, y: (t.y ?? 1.2) + (Math.random() - 0.5) * 0.6, z: t.z };
          w.shoot(bot, aimPoint, { hit, weapon, damage: weapon.damage * (hit && Math.random() < 0.12 ? weapon.headMult : 1) });
          if (hit) {
            if (t.kind === 'player') w.damagePlayer(weapon.damage * (Math.random() < 0.12 ? weapon.headMult : 1) * 0.9, bot);
            else w.damageBot(t.ref, weapon.damage * 0.9, bot.name);
          }
          if (bot.burstLeft === 0) bot.fireT = 0.55 + Math.random() * 0.5; // pause between bursts
        }
      }
    }
    // Sidestep slowly while fighting so duels are not static.
    bot.stepT -= dt;
    if (bot.stepT <= 0) {
      bot.stepT = 1.2 + Math.random();
      bot.strafe = (Math.random() - 0.5) * 1.6;
    }
    if (bot.strafe) {
      const nx = bot.pos.x + Math.cos(bot.yaw) * bot.strafe * dt;
      const nz = bot.pos.z - Math.sin(bot.yaw) * bot.strafe * dt;
      const fixed = w.map.collide(nx, nz, BOT.radius);
      bot.pos.x = fixed.x;
      bot.pos.z = fixed.z;
    }
    return;
  }

  // --- Bomb duty: the carrier plants; defenders defuse.
  if (w.bomb.state === 'planted' && bot.team === 'def') {
    const d = dist2(bot.pos.x, bot.pos.z, w.bomb.x, w.bomb.z);
    if (d < 2.2) {
      bot.state = 'defuse';
      bot.defuseT += dt;
      faceToward(bot, w.bomb.x, w.bomb.z, dt);
      if (bot.defuseT > 0) w.playSound('defuseBeep');
      if (bot.defuseT >= 5) { bot.defuseT = 0; w.onDefused(bot); }
      return;
    }
    moveToward(bot, w.bomb.x, w.bomb.z, dt, w);
    faceToward(bot, w.bomb.x, w.bomb.z, dt);
    return;
  }
  if (bot.carrier && w.bomb.state === 'carried' && bot.team === 'atk') {
    const site = w.bomb.site === 'A' ? MAP.siteA : MAP.siteB;
    const d = dist2(bot.pos.x, bot.pos.z, site.x, site.z);
    if (d < site.r) {
      bot.state = 'plant';
      bot.plantT += dt;
      if (Math.floor(bot.plantT * 2) !== Math.floor((bot.plantT - dt) * 2)) w.playSound('plantBeep');
      if (bot.plantT >= 3.5) { bot.plantT = 0; w.onPlanted(w.bomb.site, bot); }
      return;
    }
  }

  // --- Movement: follow the route, then hold and scan.
  if (bot.state === 'route' && bot.route) {
    const node = bot.route[Math.min(bot.nodeIdx, bot.route.length - 1)];
    const d = dist2(bot.pos.x, bot.pos.z, node.x, node.z);
    if (d < 1.2) {
      bot.nodeIdx++;
      if (bot.nodeIdx >= bot.route.length) {
        if (bot.team === 'def' && bot.hold) {
          bot.state = 'hold';
          bot.holdT = 0;
        } else {
          bot.state = 'hold';
          bot.holdT = 0;
          bot.hold = { x: node.x, z: node.z, look: { x: node.x, z: node.z - 5 } };
        }
      }
    } else {
      moveToward(bot, node.x, node.z, dt, w);
      faceToward(bot, node.x, node.z, dt);
    }
    return;
  }
  if (bot.state === 'hold') {
    bot.holdT += dt;
    // Slow scanning sweep so a hold still looks alive.
    bot.scanT += dt * bot.scanDir;
    if (bot.scanT > 0.9 || bot.scanT < -0.9) bot.scanDir *= -1;
    const look = bot.hold && bot.hold.look ? bot.hold.look : { x: bot.pos.x, z: bot.pos.z - 5 };
    const base = Math.atan2(-(look.x - bot.pos.x), -(look.z - bot.pos.z));
    bot.yaw = base + bot.scanT * 0.5;
  }
}

function moveToward(bot, tx, tz, dt, w) {
  const dx = tx - bot.pos.x;
  const dz = tz - bot.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return;
  const step = Math.min(d, bot.moveSpeed * dt);
  const nx = bot.pos.x + (dx / d) * step;
  const nz = bot.pos.z + (dz / d) * step;
  const fixed = w.map.collide(nx, nz, BOT.radius);
  bot.pos.x = fixed.x;
  bot.pos.z = fixed.z;
}

// Sync the three.js group to the sim state (called once per rendered frame).
export function syncBotMesh(bot) {
  if (!bot.group) return;
  bot.group.position.set(bot.pos.x, 0, bot.pos.z);
  bot.group.rotation.y = bot.yaw;
  if (!bot.alive) {
    bot.group.rotation.z = Math.PI / 2;
    bot.group.position.y = 0.25;
  }
}

export function removeBotMesh(bot, scene) {
  if (bot.group) scene.remove(bot.group);
}
