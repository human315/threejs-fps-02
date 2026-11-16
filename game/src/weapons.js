// Dustline Protocol — weapons: firing, spread, recoil, reload and grenades.
// Pure ballistics: given a shooter, a direction and the world, it resolves one shot.
// The game owns ammo counts and the HUD; this module owns the numbers of a trigger pull.
import * as THREE from 'three';
import { WEAPONS, GRENADES } from './config.js';

const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();

export function createWeapons() {
  return {
    def(id) { return WEAPONS[id]; },
    list() { return Object.values(WEAPONS); },

    // One hitscan shot. `shooter` is { pos, yaw, pitch, moving, crouched, airborne }.
    // `targets` are meshes with userData { bot, part } and `solids` are wall meshes.
    // Returns { hit, bot, part, damage, headshot, point, distance }.
    fire(shooter, weapon, targets, solids) {
      const moving = shooter.moving ? 1 : 0;
      const spreadBase = weapon.spread * (shooter.crouched ? 0.6 : 1)
        * (1 + (weapon.moveSpread - 1) * moving)
        * (shooter.airborne ? 2.2 : 1);
      // Spread grows with consecutive shots (bloom), capped by the weapon's recoil.
      const bloom = Math.min(0.03, shooter.bloom * 0.004);
      const spread = spreadBase + bloom;
      _origin.set(shooter.pos.x, shooter.pos.y, shooter.pos.z);
      _dir.set(-Math.sin(shooter.yaw) * Math.cos(shooter.pitch), Math.sin(shooter.pitch), -Math.cos(shooter.yaw) * Math.cos(shooter.pitch));
      // Random cone offset around the aim direction.
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      const right = new THREE.Vector3(Math.cos(shooter.yaw), 0, -Math.sin(shooter.yaw));
      const up = new THREE.Vector3().crossVectors(_dir, right).negate();
      _dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      _ray.set(_origin, _dir);
      _ray.far = weapon.range;
      const hits = _ray.intersectObjects([...targets, ...solids], false);
      if (hits.length === 0) return { hit: false, point: _origin.clone().addScaledVector(_dir, weapon.range) };
      const h = hits[0];
      if (h.object.userData && h.object.userData.bot) {
        const part = h.object.userData.part || 'body';
        const falloff = Math.max(0.55, 1 - h.distance / (weapon.range * 2.2));
        const damage = weapon.damage * (part === 'head' ? weapon.headMult : 1) * falloff;
        return { hit: true, bot: h.object.userData.bot, part, damage, headshot: part === 'head', point: h.point.clone(), distance: h.distance };
      }
      return { hit: false, wall: true, point: h.point.clone(), distance: h.distance };
    },

    // Grenade throw: returns a live grenade sim object the game steps each tick.
    throwGrenade(kind, from, yaw, pitch) {
      const speed = 13;
      const dir = new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch) + 0.35,
        -Math.cos(yaw) * Math.cos(pitch),
      ).normalize();
      return {
        kind, pos: from.clone(), vel: dir.multiplyScalar(speed),
        fuse: kind === 'he' ? 1.7 : 1.2, bounced: 0, alive: true,
      };
    },

    // Step one grenade: gravity, wall bounce, fuse. Returns 'explode' | 'smoke' | null.
    stepGrenade(g, dt, map) {
      if (!g.alive) return null;
      g.vel.y -= 12 * dt;
      g.pos.addScaledVector(g.vel, dt);
      const hit = map.collide(g.pos.x, g.pos.z, 0.18);
      if (hit.moved) {
        // Simple bounce: kill the horizontal velocity component that hit the wall.
        const px = g.pos.x;
        const pz = g.pos.z;
        g.pos.x = hit.x;
        g.pos.z = hit.z;
        if (Math.abs(px - hit.x) > 0.001) g.vel.x *= -0.35;
        if (Math.abs(pz - hit.z) > 0.001) g.vel.z *= -0.35;
        g.vel.y *= 0.4;
        g.bounced++;
      }
      if (g.pos.y < 0.18) { g.pos.y = 0.18; g.vel.y = Math.abs(g.vel.y) * 0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
      g.fuse -= dt;
      if (g.fuse <= 0) {
        g.alive = false;
        return g.kind === 'he' ? 'explode' : 'smoke';
      }
      return null;
    },

    // HE blast: damage falls off with distance, halved through a tall wall.
    blastDamage(g, targetPos, map) {
      const d = Math.hypot(targetPos.x - g.pos.x, targetPos.z - g.pos.z)
        + Math.abs((targetPos.y ?? 1) - g.pos.y) * 0.4;
      if (d > GRENADES.he.radius) return 0;
      let dmg = GRENADES.he.maxDamage * (1 - d / (GRENADES.he.radius * 1.25));
      if (map.sightBlocked(g.pos.x, g.pos.z, targetPos.x, targetPos.z, null)) dmg *= 0.5;
      return dmg;
    },
  };
}
