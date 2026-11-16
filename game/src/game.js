// Dustline Protocol — the game: one central state, fixed-step simulation.
// Phases: title → buy → play → roundEnd → (buy …) → matchEnd.
// Everything that changes the match goes through here; rendering only reads.
import * as THREE from 'three';
import { ROUND, ECONOMY, WEAPONS, GRENADES, PLAYER, BOT, MAP } from './config.js';
import { createBot, assignBot, updateBot, syncBotMesh, removeBotMesh } from './bots.js';
import { createWeapons } from './weapons.js';

const FIXED = 1 / 60;

export function createGame(opts) {
  const { scene, map, audio, input, hud } = opts;
  const weapons = createWeapons();

  // --- Visual effects owned by the sim (tracers, flashes, blasts). No per-frame allocation:
  // a small pool of line objects is reused.
  const tracerPool = [];
  for (let i = 0; i < 24; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracerPool.push({ line, life: 0 });
  }
  let tracerIdx = 0;
  const flashLight = new THREE.PointLight(0xffc36b, 0, 14, 1.6);
  scene.add(flashLight);
  const blastLight = new THREE.PointLight(0xff7a2a, 0, 30, 1.4);
  scene.add(blastLight);
  const blastMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0 }),
  );
  scene.add(blastMesh);
  const smokeMeshes = [];
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xbfc4c9, transparent: true, opacity: 0.55, depthWrite: false });

  function spawnTracer(from, to, color) {
    const t = tracerPool[tracerIdx];
    tracerIdx = (tracerIdx + 1) % tracerPool.length;
    const p = t.line.geometry.attributes.position;
    p.setXYZ(0, from.x, from.y, from.z);
    p.setXYZ(1, to.x, to.y, to.z);
    p.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.life = 0.09;
  }
  function muzzleFlash(pos) {
    flashLight.position.copy(pos);
    flashLight.intensity = 26;
  }

  // --- State (the one place the match lives).
  const S = {
    phase: 'title', // title | buy | play | roundEnd | matchEnd
    paused: false,
    round: 1,
    score: { atk: 0, def: 0 },
    money: ECONOMY.startMoney,
    timer: ROUND.buyTime,
    buyT: ROUND.buyTime,
    freezeT: 0,
    bomb: { state: 'carried', site: 'A', x: 0, z: 0, timer: 0, carrier: 'player' },
    player: null,
    bots: [],
    grenades: [],
    smokes: [], // { x, z, r, t }
    killfeed: [],
    winner: null,
    matchWinner: null,
    now: 0,
    roundKills: 0,
    stats: { kills: 0, deaths: 0, plants: 0, defuses: 0, headshots: 0 },
  };

  function newPlayer() {
    return {
      pos: new THREE.Vector3(MAP.spawnAtk.x, 0, MAP.spawnAtk.z),
      vel: new THREE.Vector3(),
      yaw: 0, pitch: 0,
      hp: PLAYER.hp, armor: 0, alive: true,
      weaponId: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve,
      owned: { pistol: true },
      grenades: { he: 0, smoke: 0 },
      bloom: 0, recoil: 0, fireT: 0, reloadT: 0, reloadTotal: 0,
      plantT: 0, crouched: false, airborne: false, moving: false,
      lastDamageFrom: null, stepT: 0,
    };
  }
  S.player = newPlayer();

  function feed(text, cls) {
    S.killfeed.unshift({ text, cls: cls || '', t: S.now });
    if (S.killfeed.length > 6) S.killfeed.pop();
    hud.setKillfeed(S.killfeed);
  }

  // --- Match flow ------------------------------------------------------------
  function startMatch() {
    S.round = 1;
    S.score = { atk: 0, def: 0 };
    S.money = ECONOMY.startMoney;
    S.stats = { kills: 0, deaths: 0, plants: 0, defuses: 0, headshots: 0 };
    S.player = newPlayer();
    startBuyPhase();
    hud.showTitle(false);
    audio.unlock();
  }

  function startBuyPhase() {
    S.phase = 'buy';
    S.buyT = ROUND.buyTime;
    S.timer = ROUND.buyTime;
    S.bomb = { state: 'carried', site: 'A', x: 0, z: 0, timer: 0, carrier: 'player' };
    S.player.pos.set(MAP.spawnAtk.x, 0, MAP.spawnAtk.z);
    S.player.vel.set(0, 0, 0);
    S.player.yaw = 0;
    S.player.pitch = 0;
    S.player.hp = PLAYER.hp;
    S.player.alive = true;
    S.player.plantT = 0;
    // A fresh side is picked each round so both sites see play.
    S.bomb.site = Math.random() < 0.5 ? 'A' : 'B';
    hud.showBuy(true, S.money, S.player);
    hud.banner(`第 ${S.round} 回合 · 购买阶段`, `进攻 ${S.bomb.site} 点 · 按 Enter 开始回合`, 0);
    input.releaseLock();
  }

  function startRound() {
    hud.showBuy(false);
    hud.hideBanner();
    S.phase = 'play';
    S.timer = ROUND.roundTime;
    S.freezeT = ROUND.freezeTime;
    S.roundKills = 0;
    S.grenades = [];
    S.smokes = [];
    for (const m of smokeMeshes) { m.visible = false; }
    spawnBots();
    feed(`第 ${S.round} 回合开始 — 进攻 ${S.bomb.site} 点`, 'info');
    input.requestLock();
  }

  function spawnBots() {
    for (const b of S.bots) removeBotMesh(b, scene);
    S.bots = [];
    // Attackers: 4 allies spread across the south spawn, one carries the bomb's route.
    const atkSpots = [[-4, 17], [-1.5, 18], [1.5, 18], [4, 17]];
    atkSpots.forEach(([x, z], i) => {
      const b = createBot('atk', i, scene, { x, z, yaw: 0 });
      assignBot(b, S.bomb.site, i);
      S.bots.push(b);
    });
    // The second ally carries the bomb if the player falls; the player carries first.
    S.bots[1].carrier = true;
    // Defenders: 5 across the north, two per site plus one mid.
    const defSpots = [[-24, -17], [-18, -17], [0, -17], [18, -17], [24, -17]];
    defSpots.forEach(([x, z], i) => {
      const b = createBot('def', i, scene, { x, z, yaw: Math.PI });
      assignBot(b, S.bomb.site, i);
      S.bots.push(b);
    });
  }

  function endRound(winner, reason) {
    if (S.phase !== 'play') return;
    S.phase = 'roundEnd';
    S.winner = winner;
    if (winner === 'atk') {
      S.score.atk++;
      S.money = Math.min(ECONOMY.maxMoney, S.money + ECONOMY.roundWin + S.roundKills * ECONOMY.kill);
      audio.play('roundWin');
    } else {
      S.score.def++;
      S.money = Math.min(ECONOMY.maxMoney, S.money + ECONOMY.roundLoss + S.roundKills * ECONOMY.kill);
      audio.play('roundLose');
    }
    const won = winner === 'atk';
    hud.banner(won ? '回合胜利' : '回合失利', reason, 3.2);
    feed(`回合结束：${won ? '进攻方获胜' : '防守方获胜'} — ${reason}`, won ? 'win' : 'lose');
    S.timer = 3.2;
  }

  function nextAfterRound() {
    if (S.score.atk >= ROUND.winScore || S.score.def >= ROUND.winScore || S.round >= ROUND.maxRounds) {
      S.phase = 'matchEnd';
      S.matchWinner = S.score.atk > S.score.def ? 'atk' : 'def';
      hud.showMatchEnd(S.matchWinner === 'atk', S.score, S.stats);
      input.releaseLock();
      return;
    }
    S.round++;
    startBuyPhase();
  }

  // --- Economy ----------------------------------------------------------------
  function buy(kind, id) {
    if (S.phase !== 'buy') return false;
    const p = S.player;
    if (kind === 'weapon') {
      const w = WEAPONS[id];
      if (!w || p.owned[id]) return false;
      if (S.money < w.price) { audio.play('deny'); return false; }
      S.money -= w.price;
      p.owned[id] = true;
      p.weaponId = id;
      p.mag = w.mag;
      p.reserve = w.reserve;
      audio.play('buy');
      hud.showBuy(true, S.money, p);
      return true;
    }
    if (kind === 'grenade') {
      const g = GRENADES[id];
      if (!g || S.money < g.price) { audio.play('deny'); return false; }
      S.money -= g.price;
      p.grenades[id]++;
      audio.play('buy');
      hud.showBuy(true, S.money, p);
      return true;
    }
    if (kind === 'armor') {
      if (p.armor >= 100 || S.money < 650) { audio.play('deny'); return false; }
      S.money -= 650;
      p.armor = 100;
      audio.play('buy');
      hud.showBuy(true, S.money, p);
      return true;
    }
    if (kind === 'ammo') {
      const w = WEAPONS[p.weaponId];
      if (p.reserve >= w.reserve || S.money < 200) { audio.play('deny'); return false; }
      S.money -= 200;
      p.reserve = w.reserve;
      audio.play('buy');
      hud.showBuy(true, S.money, p);
      return true;
    }
    return false;
  }

  function switchWeapon(id) {
    const p = S.player;
    if (!p.owned[id] || p.weaponId === id || p.reloadT > 0) return;
    // Stash the current weapon's ammo, restore the target weapon's own stash.
    p['mag_' + p.weaponId] = p.mag;
    p['res_' + p.weaponId] = p.reserve;
    p.weaponId = id;
    const w = WEAPONS[id];
    p.mag = p['mag_' + id] ?? w.mag;
    p.reserve = p['res_' + id] ?? w.reserve;
    p.bloom = 0;
    audio.play('click');
  }

  // --- Combat ------------------------------------------------------------------
  function playerShoot() {
    const p = S.player;
    const w = WEAPONS[p.weaponId];
    if (p.reloadT > 0 || p.fireT > 0 || !p.alive) return;
    if (p.mag <= 0) { audio.play('dryfire'); p.fireT = 0.25; return; }
    p.mag--;
    p.fireT = w.fireMs / 1000;
    p.bloom = Math.min(1, p.bloom + (w.kind === 'sniper' ? 1 : 0.22));
    p.recoil += w.recoil;
    const eye = new THREE.Vector3(p.pos.x, p.pos.y + (p.crouched ? PLAYER.eyeCrouch : PLAYER.eyeStand), p.pos.z);
    const shooter = {
      pos: eye, yaw: p.yaw, pitch: p.pitch + p.recoil * 0.4,
      moving: p.moving, crouched: p.crouched, airborne: p.airborne, bloom: p.bloom,
    };
    const targets = [];
    for (const b of S.bots) if (b.alive && b.team === 'def') targets.push(...b.hitMeshes);
    const res = weapons.fire(shooter, w, targets, map.solidMeshes);
    const muzzle = eye.clone().add(new THREE.Vector3(-Math.sin(p.yaw) * 0.7, -0.12, -Math.cos(p.yaw) * 0.7));
    muzzleFlash(muzzle);
    spawnTracer(muzzle, res.point, w.tracer);
    audio.play(w.sound);
    // Bots nearby hear the shot and turn toward it.
    for (const b of S.bots) {
      if (!b.alive) continue;
      const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      if (d < 26) b.heard = { x: p.pos.x, z: p.pos.z, t: S.now };
    }
    if (res.hit && res.bot) {
      damageBot(res.bot, res.damage, '你', res.headshot);
      if (res.headshot) { audio.play('headshot'); S.stats.headshots++; }
      else audio.play('hit');
      hud.hitmarker(res.headshot);
    }
  }

  function damageBot(bot, dmg, fromName, headshot) {
    if (!bot.alive) return;
    bot.hp -= dmg;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.state = 'dead';
      if (bot.carrier && S.bomb.state === 'carried') {
        // The bomb drops where the carrier fell; the next living ally picks it up.
        S.bomb.x = bot.pos.x;
        S.bomb.z = bot.pos.z;
        S.bomb.state = 'dropped';
        feed('炸弹掉落在地上', 'info');
      }
      const killer = fromName === '你' ? '你' : fromName;
      feed(`${killer} 击杀 ${bot.name}${headshot ? '（爆头）' : ''}`, fromName === '你' ? 'win' : '');
      if (fromName === '你') {
        S.stats.kills++;
        S.roundKills++;
        audio.play('kill');
      }
      checkRoundEnd();
    }
  }

  function damagePlayer(dmg, fromBot) {
    const p = S.player;
    if (!p.alive || S.phase !== 'play') return;
    let rest = dmg;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, rest * 0.5);
      p.armor -= absorbed;
      rest -= absorbed;
    }
    p.hp -= rest;
    p.lastDamageFrom = fromBot ? fromBot.name : 'unknown';
    audio.play('hurt');
    hud.damageFlash();
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      S.stats.deaths++;
      feed(`${fromBot ? fromBot.name : '敌人'} 击杀了你`, 'lose');
      // The bomb passes to a living ally carrier.
      if (S.bomb.state === 'carried' && S.bomb.carrier === 'player') {
        const ally = S.bots.find((b) => b.alive && b.team === 'atk');
        if (ally) { S.bomb.carrier = 'bot'; ally.carrier = true; feed(`${ally.name} 接过炸弹`, 'info'); }
      }
      input.releaseLock();
      checkRoundEnd();
    }
  }

  function checkRoundEnd() {
    if (S.phase !== 'play') return;
    const atkAlive = S.bots.filter((b) => b.alive && b.team === 'atk').length + (S.player.alive ? 1 : 0);
    const defAlive = S.bots.filter((b) => b.alive && b.team === 'def').length;
    if (defAlive === 0) endRound('atk', '防守方全员阵亡');
    else if (atkAlive === 0) endRound('def', '进攻方全员阵亡');
  }

  // --- Bomb ----------------------------------------------------------------------
  function plantProgress(dt) {
    const p = S.player;
    if (S.bomb.state !== 'carried' || S.bomb.carrier !== 'player' || !p.alive) { p.plantT = 0; return; }
    const site = S.bomb.site === 'A' ? MAP.siteA : MAP.siteB;
    const d = Math.hypot(p.pos.x - site.x, p.pos.z - site.z);
    if (d < site.r && input.down('KeyE')) {
      p.plantT += dt;
      if (Math.floor(p.plantT * 2) !== Math.floor((p.plantT - dt) * 2)) audio.play('plantBeep');
      hud.plantProgress(p.plantT / ROUND.plantTime, '正在安放炸弹…');
      if (p.plantT >= ROUND.plantTime) {
        p.plantT = 0;
        onPlanted(S.bomb.site, null);
      }
    } else {
      p.plantT = 0;
      hud.plantProgress(0, '');
    }
  }

  function onPlanted(site, bot) {
    S.bomb.state = 'planted';
    S.bomb.site = site;
    const s = site === 'A' ? MAP.siteA : MAP.siteB;
    S.bomb.x = s.x;
    S.bomb.z = s.z;
    S.bomb.timer = ROUND.bombTimer;
    S.stats.plants++;
    S.money = Math.min(ECONOMY.maxMoney, S.money + ECONOMY.plant);
    feed(`炸弹已在 ${site} 点安放！${bot ? bot.name + ' 安放' : '你安放'}了炸弹`, 'win');
    hud.banner('炸弹已安放', `防守方必须拆除 · ${ROUND.bombTimer} 秒后爆炸`, 2.5);
    audio.play('explosion');
  }

  function onDefused(bot) {
    S.bomb.state = 'defused';
    S.stats.defuses++;
    feed(`${bot.name} 拆除了炸弹`, 'lose');
    endRound('def', '炸弹被拆除');
  }

  function explodeBomb() {
    S.bomb.state = 'exploded';
    blastLight.position.set(S.bomb.x, 1.5, S.bomb.z);
    blastLight.intensity = 120;
    blastMesh.position.set(S.bomb.x, 1.2, S.bomb.z);
    blastMesh.scale.setScalar(0.5);
    audio.play('explosion');
    const center = { x: S.bomb.x, y: 1, z: S.bomb.z };
    for (const b of S.bots) {
      if (!b.alive) continue;
      const dmg = weapons.blastDamage({ pos: new THREE.Vector3(S.bomb.x, 1, S.bomb.z) }, { x: b.pos.x, y: 1, z: b.pos.z }, map);
      if (dmg > 0) damageBot(b, dmg, '炸弹', false);
    }
    if (S.player.alive) {
      const d = Math.hypot(S.player.pos.x - S.bomb.x, S.player.pos.z - S.bomb.z);
      if (d < GRENADES.he.radius * 1.6) damagePlayer(GRENADES.he.maxDamage * (1 - d / 12), null);
    }
    void center;
    endRound('atk', '炸弹爆炸');
  }

  // --- Grenades ------------------------------------------------------------------
  function throwGrenade(kind) {
    const p = S.player;
    if (S.phase !== 'play' || !p.alive || p.grenades[kind] <= 0) return;
    p.grenades[kind]--;
    const eye = new THREE.Vector3(p.pos.x, p.pos.y + 1.5, p.pos.z);
    S.grenades.push(weapons.throwGrenade(kind, eye, p.yaw, p.pitch));
    audio.play('throwPin');
  }

  function stepGrenades(dt) {
    for (const g of S.grenades) {
      if (!g.alive) continue;
      const res = weapons.stepGrenade(g, dt, map);
      if (res === 'explode') {
        audio.play('explosion');
        blastLight.position.copy(g.pos);
        blastLight.intensity = 90;
        blastMesh.position.copy(g.pos);
        blastMesh.scale.setScalar(0.4);
        for (const b of S.bots) {
          if (!b.alive) continue;
          const dmg = weapons.blastDamage(g, { x: b.pos.x, y: 1, z: b.pos.z }, map);
          if (dmg > 0) damageBot(b, dmg, '你', false);
        }
        if (S.player.alive) {
          const dmg = weapons.blastDamage(g, { x: S.player.pos.x, y: 1.4, z: S.player.pos.z }, map);
          if (dmg > 0) damagePlayer(dmg * 0.55, null); // own grenade hurts less
        }
      } else if (res === 'smoke') {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(GRENADES.smoke.radius, 16, 12), smokeMat.clone());
        mesh.position.copy(g.pos);
        mesh.position.y = 1.4;
        scene.add(mesh);
        smokeMeshes.push(mesh);
        S.smokes.push({ x: g.pos.x, z: g.pos.z, r: GRENADES.smoke.radius, t: GRENADES.smoke.duration, mesh });
      }
    }
    S.grenades = S.grenades.filter((g) => g.alive);
    for (const s of S.smokes) {
      s.t -= dt;
      if (s.mesh) s.mesh.material.opacity = Math.max(0, Math.min(0.55, s.t * 0.08));
      if (s.t <= 0 && s.mesh) { scene.remove(s.mesh); s.mesh = null; }
    }
    S.smokes = S.smokes.filter((s) => s.t > 0);
  }

  // --- Player movement ------------------------------------------------------------
  function stepPlayer(dt) {
    const p = S.player;
    if (!p.alive) return;
    const m = input.takeMouse();
    const sens = 0.0023;
    p.yaw -= m.dx * sens;
    p.pitch -= m.dy * sens;
    p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));
    // Recoil recovery: the view settles back after each shot.
    p.recoil = Math.max(0, p.recoil - dt * 0.06);
    p.crouched = input.crouch();
    const axis = input.moveAxis();
    p.moving = axis.x !== 0 || axis.z !== 0;
    const speed = (p.crouched ? PLAYER.crouchSpeed : PLAYER.walkSpeed) * (input.aiming() ? 0.55 : 1);
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    const wishX = (-sin * -axis.z + cos * axis.x) * speed;
    const wishZ = (-cos * -axis.z - sin * axis.x) * speed;
    p.vel.x += (wishX - p.vel.x) * Math.min(1, PLAYER.accel * dt / speed * 4 + dt * 8);
    p.vel.z += (wishZ - p.vel.z) * Math.min(1, PLAYER.accel * dt / speed * 4 + dt * 8);
    if (!p.moving) {
      const f = Math.max(0, 1 - PLAYER.friction * dt);
      p.vel.x *= f;
      p.vel.z *= f;
    }
    // Jump / gravity.
    if (input.wasPressed('Space') && !p.airborne) {
      p.vel.y = PLAYER.jumpSpeed;
      p.airborne = true;
    }
    p.vel.y -= PLAYER.gravity * dt;
    p.pos.y += p.vel.y * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; p.vel.y = 0; p.airborne = false; }
    const next = map.collide(p.pos.x + p.vel.x * dt, p.pos.z + p.vel.z * dt, PLAYER.radius);
    p.pos.x = next.x;
    p.pos.z = next.z;
    // Footsteps.
    if (p.moving && !p.airborne) {
      p.stepT -= dt * Math.hypot(p.vel.x, p.vel.z);
      if (p.stepT <= 0) { p.stepT = 2.4; audio.play('step'); }
    }
    // Bloom decay.
    p.bloom = Math.max(0, p.bloom - dt * 1.4);
    // Fire / reload.
    const w = WEAPONS[p.weaponId];
    p.fireT -= dt;
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        const need = w.mag - p.mag;
        const take = Math.min(need, p.reserve);
        p.mag += take;
        p.reserve -= take;
      }
    } else if (w.auto ? input.firing() : input.clicked()) {
      playerShoot();
    }
    if (input.wasPressed('KeyR') && p.mag < w.mag && p.reserve > 0 && p.reloadT <= 0) {
      p.reloadT = w.reloadMs / 1000;
      p.reloadTotal = w.reloadMs / 1000;
      audio.play('reload');
    }
    // Weapon switching.
    if (input.wasPressed('Digit1')) switchWeapon('pistol');
    if (input.wasPressed('Digit2')) switchWeapon('smg');
    if (input.wasPressed('Digit3')) switchWeapon('rifle');
    if (input.wasPressed('Digit4')) switchWeapon('sniper');
    if (input.wasPressed('KeyG')) throwGrenade('he');
    if (input.wasPressed('KeyH')) throwGrenade('smoke');
    // Bomb pickup: walk over a dropped bomb to take it back.
    if (S.bomb.state === 'dropped') {
      const d = Math.hypot(p.pos.x - S.bomb.x, p.pos.z - S.bomb.z);
      if (d < 1.6) {
        S.bomb.state = 'carried';
        S.bomb.carrier = 'player';
        feed('你捡起了炸弹', 'info');
      }
    }
    plantProgress(dt);
  }

  // --- World interface handed to the bots ------------------------------------------
  const world = {
    map,
    now: 0,
    bomb: S.bomb,
    phase: 'play',
    los(ax, az, bx, bz) {
      return map.sightBlocked(ax, az, bx, bz, S.smokes);
    },
    player() {
      const p = S.player;
      return { kind: 'player', ref: null, x: p.pos.x, z: p.pos.z, y: 1.4, alive: p.alive, moving: p.moving };
    },
    enemiesOf(bot) {
      const out = [];
      if (bot.team === 'def' && S.player.alive) out.push(world.player());
      for (const b of S.bots) {
        if (b === bot || !b.alive) continue;
        if (b.team === bot.team) continue;
        out.push({ kind: 'bot', ref: b, x: b.pos.x, z: b.pos.z, y: 1.2, alive: true, moving: true });
      }
      return out;
    },
    shoot(bot, point, opts) {
      const from = new THREE.Vector3(bot.pos.x, 1.35, bot.pos.z);
      from.add(new THREE.Vector3(-Math.sin(bot.yaw) * 0.6, 0, -Math.cos(bot.yaw) * 0.6));
      spawnTracer(from, new THREE.Vector3(point.x, point.y, point.z), opts.weapon.tracer);
      const d = Math.hypot(bot.pos.x - S.player.pos.x, bot.pos.z - S.player.pos.z);
      if (d < 30) audio.play('distant', opts.weapon.sound);
      if (opts.hit) hud.hitmarker(false);
    },
    damagePlayer(dmg, fromBot) { damagePlayer(dmg, fromBot); },
    damageBot(bot, dmg, fromName) { damageBot(bot, dmg, fromName, false); },
    onPlanted(site, bot) { onPlanted(site, bot); },
    onDefused(bot) { onDefused(bot); },
    playSound(name) { audio.play(name); },
  };

  // --- Fixed-step update -------------------------------------------------------------
  function update(dt) {
    S.now += dt;
    world.now = S.now;
    world.phase = S.phase;
    // Decay effect lights.
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 260);
    blastLight.intensity = Math.max(0, blastLight.intensity - dt * 160);
    blastMesh.material.opacity = Math.max(0, blastMesh.material.opacity - dt * 1.4);
    for (const t of tracerPool) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.line.material.opacity = 0;
      }
    }

    if (S.phase === 'buy') {
      S.buyT -= dt;
      S.timer = Math.max(0, S.buyT);
      if (input.wasPressed('Enter') || input.wasPressed('KeyG') || S.buyT <= 0) startRound();
      hud.update(S);
      input.consume();
      return;
    }
    if (S.phase === 'roundEnd') {
      S.timer -= dt;
      if (S.timer <= 0) nextAfterRound();
      hud.update(S);
      input.consume();
      return;
    }
    if (S.phase !== 'play') { hud.update(S); input.consume(); return; }
    if (S.paused) { input.consume(); return; }

    S.timer -= dt;
    if (S.timer <= 0) {
      S.timer = 0;
      if (S.bomb.state !== 'planted') endRound('def', '时间耗尽，炸弹未安放');
    }
    if (S.bomb.state === 'planted') {
      S.bomb.timer -= dt;
      if (Math.floor(S.bomb.timer) !== Math.floor(S.bomb.timer + dt)) audio.play('bombBeep');
      if (S.bomb.timer <= 0) { explodeBomb(); hud.update(S); input.consume(); return; }
    }
    if (S.freezeT > 0) { S.freezeT -= dt; }
    else {
      stepPlayer(dt);
      for (const b of S.bots) updateBot(b, dt, world);
    }
    stepGrenades(dt);
    hud.update(S);
    input.consume();
  }

  function togglePause() {
    if (S.phase !== 'play') return;
    S.paused = !S.paused;
    hud.banner(S.paused ? '已暂停' : '继续战斗', S.paused ? '按 P 继续' : '', 1.2);
    if (!S.paused) input.requestLock();
  }

  // Keyboard shortcuts that live outside the fixed step.
  function onKey(code) {
    if (code === 'KeyP') togglePause();
    if (S.phase === 'title' && (code === 'Enter' || code === 'Space')) startMatch();
    if (S.phase === 'matchEnd' && code === 'KeyR') startMatch();
    if (S.phase === 'buy') {
      if (code === 'Digit1') buy('weapon', 'pistol');
      if (code === 'Digit2') buy('weapon', 'smg');
      if (code === 'Digit3') buy('weapon', 'rifle');
      if (code === 'Digit4') buy('weapon', 'sniper');
      if (code === 'Digit5') buy('grenade', 'he');
      if (code === 'Digit6') buy('grenade', 'smoke');
      if (code === 'Digit7') buy('armor');
      if (code === 'Digit8') buy('ammo');
    }
  }

  return {
    state: S,
    update,
    startMatch,
    startRound,
    startBuyPhase,
    buy,
    onKey,
    togglePause,
    // Test hooks (used by the automated playtest and the screenshot modes only).
    debug: {
      forceRoundEnd(w) { endRound(w, '测试强制结算'); },
      forceMatchEnd() {
        S.score = { atk: 5, def: 3 };
        S.phase = 'matchEnd';
        S.matchWinner = 'atk';
        hud.showMatchEnd(true, S.score, S.stats);
      },
      teleport(x, z, yaw) {
        S.player.pos.set(x, 0, z);
        if (yaw !== undefined) S.player.yaw = yaw;
      },
      giveMoney(n) { S.money += n; },
      takeBomb() {
        S.bomb.state = 'carried';
        S.bomb.carrier = 'player';
        for (const b of S.bots) b.carrier = false;
      },
      spawnEnemyNear(x, z) {
        const b = S.bots.find((e) => e.alive && e.team === 'def');
        if (b) { b.pos.set(x, 0, z); b.state = 'hold'; b.route = null; }
        return b;
      },
    },
    syncMeshes() { for (const b of S.bots) syncBotMesh(b); },
  };
}
