// Dustline Protocol — the map: "Sandworks Yard", an original desert industrial yard.
// Three lanes (west / mid / east) join two bomb sites. Geometry, colliders, routes and
// line-of-sight all live here; the game logic only asks this module questions.
import * as THREE from 'three';
import { PALETTE, MAP } from './config.js';

// A wall is an axis-aligned box: { x0, z0, x1, z1, h, tall }.
// tall walls block sight; low crates block movement but can be shot over.
export const WALLS = [
  // Perimeter (h 4, tall).
  { x0: -30, z0: -20, x1: 30, z1: -19.2, h: 4, tall: true },
  { x0: -30, z0: 19.2, x1: 30, z1: 20, h: 4, tall: true },
  { x0: -30, z0: -20, x1: -29.2, z1: 20, h: 4, tall: true },
  { x0: 29.2, z0: -20, x1: 30, z1: 20, h: 4, tall: true },
  // Mid divider walls: they split the yard into west / mid / east lanes with gaps.
  { x0: -11, z0: -20, x1: -10, z1: -6, h: 3.4, tall: true }, // west|mid north
  { x0: -11, z0: 2, x1: -10, z1: 12, h: 3.4, tall: true }, // west|mid south (gap z -6..2 is mid connector)
  { x0: 10, z0: -20, x1: 11, z1: -6, h: 3.4, tall: true }, // mid|east north
  { x0: 10, z0: 2, x1: 11, z1: 12, h: 3.4, tall: true }, // mid|east south
  // Cross wall north: separates the two sites, with a mid gap (the "window" lane).
  { x0: -29.2, z0: -8, x1: -15, z1: -7, h: 3.2, tall: true },
  { x0: -5, z0: -8, x1: 5, z1: -7, h: 3.2, tall: true },
  { x0: 15, z0: -8, x1: 29.2, z1: -7, h: 3.2, tall: true },
  // Site A cover: stacked crates and a low wall inside the site.
  { x0: -27, z0: -17, x1: -24, z1: -15.5, h: 1.3, tall: false },
  { x0: -20, z0: -17.5, x1: -18.5, z1: -16, h: 1.3, tall: false },
  { x0: -25.5, z0: -11, x1: -22.5, z1: -10, h: 2.4, tall: true },
  // Site B cover.
  { x0: 24, z0: -17, x1: 27, z1: -15.5, h: 1.3, tall: false },
  { x0: 18.5, z0: -17.5, x1: 20, z1: -16, h: 1.3, tall: false },
  { x0: 22.5, z0: -11, x1: 25.5, z1: -10, h: 2.4, tall: true },
  // Mid yard crates and silos: long sightline down the middle, broken by cover.
  { x0: -2.5, z0: -2, x1: 2.5, z1: 0.5, h: 1.4, tall: false },
  { x0: -3, z0: 8, x1: -0.5, z1: 10.5, h: 1.2, tall: false },
  { x0: 4, z0: 6, x1: 6.5, z1: 8.5, h: 1.2, tall: false },
  { x0: -7, z0: -3.5, x1: -4.5, z1: -1, h: 2.6, tall: true },
  { x0: 5, z0: -4, x1: 7.5, z1: -1.5, h: 2.6, tall: true },
  // West lane cover, east lane cover.
  { x0: -18, z0: 4, x1: -15.5, z1: 6.5, h: 1.3, tall: false },
  { x0: -20, z0: -3, x1: -17.5, z1: -0.5, h: 2.4, tall: true },
  { x0: 15.5, z0: 4, x1: 18, z1: 6.5, h: 1.3, tall: false },
  { x0: 17.5, z0: -3, x1: 20, z1: -0.5, h: 2.4, tall: true },
  // South spawn cover.
  { x0: -6, z0: 14, x1: -3, z1: 16, h: 1.3, tall: false },
  { x0: 3, z0: 14, x1: 6, z1: 16, h: 1.3, tall: false },
];

// Attack routes: waypoint chains from the south spawn to each site.
// Defenders hold at the nodes listed in DEF_HOLDS.
export const ROUTES = {
  aWest: [{ x: -4, z: 14 }, { x: -14, z: 12 }, { x: -19, z: 8 }, { x: -20, z: 0 }, { x: -19, z: -5 }, { x: -23, z: -12 }],
  aMid: [{ x: 0, z: 13 }, { x: -2, z: 6 }, { x: -4, z: -2 }, { x: -9, z: -4.5 }, { x: -15, z: -6 }, { x: -21, z: -12 }],
  bEast: [{ x: 4, z: 14 }, { x: 14, z: 12 }, { x: 19, z: 8 }, { x: 20, z: 0 }, { x: 19, z: -5 }, { x: 23, z: -12 }],
  bMid: [{ x: 0, z: 13 }, { x: 2, z: 6 }, { x: 4, z: -2 }, { x: 9, z: -4.5 }, { x: 15, z: -6 }, { x: 21, z: -12 }],
  mid: [{ x: 0, z: 13 }, { x: 0, z: 6 }, { x: 0, z: -1 }, { x: 0, z: -5 }, { x: 0, z: -11 }],
};
export const DEF_HOLDS = [
  { x: -21, z: -12, look: { x: -19, z: -5 } },
  { x: -25, z: -9, look: { x: -14, z: -4 } },
  { x: 21, z: -12, look: { x: 19, z: -5 } },
  { x: 25, z: -9, look: { x: 14, z: -4 } },
  { x: 0, z: -11, look: { x: 0, z: 0 } },
];
export const ATK_HOLDS = [
  { x: -14, z: 10, look: { x: -18, z: 2 } },
  { x: 14, z: 10, look: { x: 18, z: 2 } },
  { x: -2, z: 4, look: { x: 0, z: -6 } },
  { x: 2, z: 4, look: { x: 0, z: -6 } },
];

function circleHitsBox(px, pz, r, w) {
  const cx = Math.max(w.x0, Math.min(px, w.x1));
  const cz = Math.max(w.z0, Math.min(pz, w.z1));
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz < r * r;
}

// 2D segment vs AABB test (slab method). Used for sight and hearing occlusion.
function segmentHitsBox(ax, az, bx, bz, w) {
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  for (const [o, d, lo, hi] of [[ax, dx, w.x0, w.x1], [az, dz, w.z0, w.z1]]) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      let a = (lo - o) / d;
      let b = (hi - o) / d;
      if (a > b) { const t = a; a = b; b = t; }
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return false;
    }
  }
  return true;
}

export function createMap(scene) {
  const wallMat = new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.9 });
  const wallDarkMat = new THREE.MeshStandardMaterial({ color: PALETTE.steelDark, roughness: 0.95 });
  const crateMat = new THREE.MeshStandardMaterial({ color: PALETTE.sandDark, roughness: 0.85 });
  const crateLightMat = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.85 });
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xb59a72, roughness: 1 });
  const siteAMat = new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.6, emissive: 0x332200 });
  const siteBMat = new THREE.MeshStandardMaterial({ color: 0x35c8a8, roughness: 0.6, emissive: 0x002222 });

  // Ground: sand with painted lane strips so the three lanes read at a glance.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const stripGeo = new THREE.PlaneGeometry(8, 40);
  const stripMat = new THREE.MeshStandardMaterial({ color: 0xa8895f, roughness: 1 });
  for (const x of [-19.5, 0, 19.5]) {
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.01, 0);
    strip.receiveShadow = true;
    scene.add(strip);
  }

  const wallMeshes = [];
  const solidMeshes = []; // every mesh a bullet can hit
  WALLS.forEach((w, i) => {
    const tall = w.tall;
    const mat = tall ? (i % 2 === 0 ? wallMat : wallDarkMat) : (i % 2 === 0 ? crateMat : crateLightMat);
    const geo = new THREE.BoxGeometry(w.x1 - w.x0, w.h, w.z1 - w.z0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((w.x0 + w.x1) / 2, w.h / 2, (w.z0 + w.z1) / 2);
    mesh.castShadow = tall;
    mesh.receiveShadow = true;
    mesh.userData.wall = true;
    scene.add(mesh);
    wallMeshes.push(mesh);
    solidMeshes.push(mesh);
  });

  // Silos: two cylinders at mid-north, vertical landmarks for orientation.
  const siloMat = new THREE.MeshStandardMaterial({ color: 0x7d8b9c, roughness: 0.55, metalness: 0.35 });
  for (const x of [-13.5, 13.5]) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 7, 18), siloMat);
    silo.position.set(x, 3.5, -16);
    silo.castShadow = true;
    scene.add(silo);
    solidMeshes.push(silo);
  }
  // Barrels: small cylinders scattered as low cover (visual only, no collision).
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 });
  for (const [x, z] of [[-8, 14], [8, 14], [-24, 2], [24, 2], [-12, -12], [12, -12]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 12), barrelMat);
    b.position.set(x, 0.55, z);
    b.castShadow = true;
    scene.add(b);
    solidMeshes.push(b);
  }

  // Bomb sites: painted floor rings + a low marker post with a light.
  function siteMarker(site, mat, label) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(site.r - 0.35, site.r, 40), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    scene.add(ring);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.6, 0.35), mat);
    post.position.set(site.x, 1.3, site.z);
    scene.add(post);
    const lamp = new THREE.PointLight(mat.color, 12, 12, 1.8);
    lamp.position.set(site.x, 2.8, site.z);
    scene.add(lamp);
    const tag = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.9, 0.08),
      new THREE.MeshBasicMaterial({ color: mat.color }),
    );
    tag.position.set(site.x, 3.1, site.z);
    scene.add(tag);
    void label;
  }
  siteMarker(MAP.siteA, siteAMat, 'A');
  siteMarker(MAP.siteB, siteBMat, 'B');

  // Sky: warm haze fog + sun. The scene reads as a desert yard at golden hour.
  scene.fog = new THREE.Fog(0xd8b98a, 45, 110);
  scene.background = new THREE.Color(0xd8b98a);
  const hemi = new THREE.HemisphereLight(0xffe6bf, 0x5a4a35, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.1);
  sun.position.set(25, 34, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 90;
  scene.add(sun);

  return {
    walls: WALLS,
    wallMeshes,
    solidMeshes,
    // Push a circle out of every wall it overlaps. Returns true if it was moved.
    collide(px, pz, r) {
      let moved = false;
      for (const w of WALLS) {
        if (!circleHitsBox(px, pz, r, w)) continue;
        const cx = Math.max(w.x0, Math.min(px, w.x1));
        const cz = Math.max(w.z0, Math.min(pz, w.z1));
        let dx = px - cx;
        let dz = pz - cz;
        let d = Math.hypot(dx, dz);
        if (d < 1e-6) {
          // Centre inside the box: push out along the smallest penetration axis.
          const pushes = [
            [px - (w.x0 - r), -1, 0], [w.x1 + r - px, 1, 0],
            [pz - (w.z0 - r), 0, -1], [w.z1 + r - pz, 0, 1],
          ];
          pushes.sort((a, b) => a[0] - b[0]);
          const p = pushes[0];
          px += p[1] * p[0];
          pz += p[2] * p[0];
          moved = true;
          continue;
        }
        const push = r - d;
        dx /= d; dz /= d;
        px += dx * push;
        pz += dz * push;
        moved = true;
      }
      // World bounds.
      const bx = Math.max(-MAP.halfX + r, Math.min(MAP.halfX - r, px));
      const bz = Math.max(-MAP.halfZ + r, Math.min(MAP.halfZ - r, pz));
      if (bx !== px || bz !== pz) moved = true;
      return { x: bx, z: bz, moved };
    },
    // True when a tall wall stands between two points (eye-level sight).
    sightBlocked(ax, az, bx, bz, smokeClouds) {
      for (const w of WALLS) {
        if (!w.tall) continue;
        if (segmentHitsBox(ax, az, bx, bz, w)) return true;
      }
      if (smokeClouds) {
        for (const s of smokeClouds) {
          // A smoke puff blocks sight when the segment passes within its radius.
          const dx = bx - ax;
          const dz = bz - az;
          const len2 = dx * dx + dz * dz;
          let t = len2 > 0 ? ((s.x - ax) * dx + (s.z - az) * dz) / len2 : 0;
          t = Math.max(0, Math.min(1, t));
          const cx = ax + dx * t;
          const cz = az + dz * t;
          if (Math.hypot(s.x - cx, s.z - cz) < s.r) return true;
        }
      }
      return false;
    },
  };
}
