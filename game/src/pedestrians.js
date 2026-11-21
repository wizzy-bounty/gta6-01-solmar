// pedestrians.js — the people of Solmar City, and the shared person builder.
// createPersonMesh makes a tidy low-poly walker (legs, torso, arms, head) used
// for the player, pedestrians, mission contacts and armed enemies alike.
// Pedestrians stroll the sidewalk rings around each block; they panic and run
// when a crime or a fast car happens close to them.

import * as THREE from 'three';
import { BLOCK_CENTERS, BLOCK_PITCH, ROAD_WIDTH, districtOf } from './city.js';

const SKIN = [0xf2c49b, 0xc68863, 0x8a5a3b, 0x6e4530, 0xffdbac];
const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xecf0f1, 0x1abc9c, 0xe67e22, 0xfd79a8, 0x00cec9, 0xff6b81, 0x48dbfb, 0xfeca57, 0x1dd1a1];
const PANTS = [0x2c3e50, 0x34495e, 0x5d4037, 0x212121, 0x546e7a, 0x795548];
const HAIR = [0x191008, 0x2e1a0e, 0x54331c, 0x8a5a2b, 0xc9a86a, 0xe3d29b, 0x9aa0a6, 0xb34a2e];

function part(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * Build a person. Returns a group whose userData holds the swinging limbs.
 * palette: { skin, shirt, pants, cap?, hair? } — omit for a random citizen.
 */
export function createPersonMesh(palette = {}) {
  const skin = palette.skin ?? SKIN[Math.floor(Math.random() * SKIN.length)];
  const shirt = palette.shirt ?? SHIRTS[Math.floor(Math.random() * SHIRTS.length)];
  const pants = palette.pants ?? PANTS[Math.floor(Math.random() * PANTS.length)];
  const g = new THREE.Group();

  const legL = part(0.21, 0.78, 0.24, pants, -0.13, 0.39, 0);
  const legR = part(0.21, 0.78, 0.24, pants, 0.13, 0.39, 0);
  legL.geometry.translate(0, -0.32, 0);
  legL.position.y = 0.72;
  legR.geometry.translate(0, -0.32, 0);
  legR.position.y = 0.72;
  const torso = part(0.52, 0.62, 0.3, shirt, 0, 1.06, 0);
  const armL = part(0.15, 0.62, 0.17, shirt, -0.35, 1.06, 0);
  const armR = part(0.15, 0.62, 0.17, shirt, 0.35, 1.06, 0);
  armL.geometry.translate(0, -0.24, 0);
  armL.position.y = 1.3;
  armR.geometry.translate(0, -0.24, 0);
  armR.position.y = 1.3;
  const head = part(0.34, 0.36, 0.34, skin, 0, 1.56, 0);
  g.add(legL, legR, torso, armL, armR, head);
  if (palette.cap) {
    const cap = part(0.4, 0.12, 0.4, palette.cap, 0, 1.78, 0);
    const brim = part(0.4, 0.05, 0.26, palette.cap, 0, 1.74, 0.28);
    g.add(cap, brim);
  } else if (palette.hair !== null) {
    // Hair: a top slab and a back panel, so heads are not bare skin boxes.
    // A palette may pin the colour (hair: 0x…) or leave it to chance; a
    // palette with hair: null stays bald.
    if (palette.hair !== undefined || Math.random() < 0.82) {
      const hairColor = palette.hair ?? HAIR[Math.floor(Math.random() * HAIR.length)];
      const top = part(0.38, 0.13, 0.38, hairColor, 0, 1.8, 0);
      const back = part(0.38, 0.26, 0.1, hairColor, 0, 1.64, -0.15);
      g.add(top, back);
    }
  }
  g.userData.limbs = { legL, legR, armL, armR };
  g.userData.walkPhase = Math.random() * Math.PI * 2;
  return g;
}

/** Swing a person's limbs for a walk cycle; speed scales the stride. */
export function animatePerson(mesh, speed, dt) {
  const u = mesh.userData;
  u.walkPhase += dt * (3.2 + Math.abs(speed) * 1.35);
  const swing = Math.sin(u.walkPhase) * Math.min(0.75, 0.18 + Math.abs(speed) * 0.16);
  const { legL, legR, armL, armR } = u.limbs;
  legL.rotation.x = swing;
  legR.rotation.x = -swing;
  armL.rotation.x = -swing * 0.8;
  armR.rotation.x = swing * 0.8;
  mesh.position.y = Math.abs(Math.sin(u.walkPhase)) * 0.045 * Math.min(1, Math.abs(speed));
}

/** A point on a block's sidewalk ring, param t in 0..1 walking the perimeter. */
function sidewalkPoint(block, t) {
  const half = (BLOCK_PITCH - ROAD_WIDTH) / 2 - 2.2;
  const per = 8 * half;
  let d = (t % 1) * per;
  if (d < 2 * half) return { x: block.x - half + d, z: block.z - half };
  d -= 2 * half;
  if (d < 2 * half) return { x: block.x + half, z: block.z - half + d };
  d -= 2 * half;
  if (d < 2 * half) return { x: block.x + half - d, z: block.z + half };
  d -= 2 * half;
  return { x: block.x - half, z: block.z + half - d };
}

export function createPedestrians(scene, rng, count = 42) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const block = BLOCK_CENTERS[Math.floor(rng() * BLOCK_CENTERS.length)];
    const mesh = createPersonMesh();
    scene.add(mesh);
    peds.push({
      mesh,
      block,
      t: rng(),
      dir: rng() < 0.5 ? 1 : -1,
      speed: 1.1 + rng() * 0.9,
      panic: 0,
      fleeX: 0,
      fleeZ: 0,
      district: districtOf(block.x, block.z),
    });
  }
  return {
    list: peds,
    /** Scare everyone near a point (gunfire, a crash, a stolen car). */
    scare(x, z, radius = 16) {
      for (const p of peds) {
        const dx = p.mesh.position.x - x;
        const dz = p.mesh.position.z - z;
        if (dx * dx + dz * dz < radius * radius) {
          p.panic = 2.5 + Math.random() * 2;
          const len = Math.hypot(dx, dz) || 1;
          p.fleeX = dx / len;
          p.fleeZ = dz / len;
        }
      }
    },
    update(dt) {
      for (const p of peds) {
        if (p.panic > 0) {
          p.panic -= dt;
          const sp = 4.6;
          p.mesh.position.x += p.fleeX * sp * dt;
          p.mesh.position.z += p.fleeZ * sp * dt;
          p.mesh.rotation.y = Math.atan2(p.fleeX, p.fleeZ);
          animatePerson(p.mesh, sp, dt);
          continue;
        }
        const per = 8 * ((BLOCK_PITCH - ROAD_WIDTH) / 2 - 2.2);
        p.t += (p.dir * p.speed * dt) / per;
        const pos = sidewalkPoint(p.block, p.t);
        const ahead = sidewalkPoint(p.block, p.t + 0.004 * p.dir);
        p.mesh.position.x = pos.x;
        p.mesh.position.z = pos.z;
        p.mesh.position.y = 0.22;
        p.mesh.rotation.y = Math.atan2(ahead.x - pos.x, ahead.z - pos.z);
        animatePerson(p.mesh, p.speed, dt);
      }
    },
  };
}
