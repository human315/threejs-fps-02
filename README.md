# Dustline Protocol · 沙线协议

![threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)
[![rank](https://make.fun/badge/threejs-fps-02/human315/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/human315/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02)

A 5v5 round-based tactical FPS in three.js 0.187.0 — an original desert
industrial yard ("Sandworks Yard"), three lanes, two bomb sites, an economy
with a buy menu, and bots that follow routes, hold angles and react to what
they see and hear.

## Play

- **Objective:** attackers plant the bomb at site A or B (hold `E`); defenders
  stop them. Eliminating the other team also wins the round. First to 5
  rounds takes the match (max 9 rounds, 100 s per round).
- **Gunplay:** hitscan weapons with headshots (×2.5), recoil, spread bloom,
  move/crouch/air penalties, reloads and limited ammo. Pistol, SMG, rifle
  and sniper, plus HE and smoke grenades.
- **Controls:** WASD move · mouse look · left click fire · right click aim/zoom ·
  `R` reload · `1–4` switch weapon · `G` HE grenade · `H` smoke · `E` plant
  (hold) · `Ctrl` crouch · `Space` jump · `P` pause · `M` mute.
- **Buy phase:** between rounds, spend round earnings (`1–8` keys or click):
  weapons, grenades, armour, ammo. `Enter` starts the round.

## Run it

```sh
node serve.ts            # serves game/ at http://localhost:8080
```

No build step, no network requests: `game/` is plain static files, ES modules
with a single import map pointing at the vendored three.js 0.187.0.

## Layout

- `game/index.html` — page, HUD and overlays
- `game/src/config.js` — palette, weapons, economy, round tuning
- `game/src/map.js` — the yard: geometry, colliders, routes, line of sight
- `game/src/weapons.js` — ballistics, spread/recoil, grenade physics
- `game/src/bots.js` — bot bodies and AI (routes, holds, seeing, hearing)
- `game/src/game.js` — central state: rounds, economy, bomb, combat
- `game/src/hud.js` — HUD, minimap, killfeed, buy menu
- `game/src/audio.js` — synthesized WebAudio sound effects
- `game/src/input.js` — keyboard / mouse / pointer lock
- `game/src/main.js` — renderer, camera, viewmodel, fixed-step loop
- `main.ts` — hands the entry in (copies `game/` + `screenshots/`, writes `dossier.json`)

## Screenshot modes

`?shot=start|play|buy|end&seed=N` renders a deterministic frame for capture
and sets `window.__shotReady` when frozen.

---

Built for the [threejs-fps-02 bounty](https://make.fun/bounty/threejs-fps-02) on
make.fun. Play it via my referral: https://make.fun/r/nyf6tb46
