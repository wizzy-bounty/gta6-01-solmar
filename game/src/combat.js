// combat.js — fists, guns and enemies for SOLMAR HEAT.
// The player punches with F and shoots with the mouse (hitscan from the camera
// centre, with tracers, muzzle flash and hit sparks). Mission enemies carry
// pistols: they close to range, fire in bursts and drop when their health is
// gone. Crimes committed in the open feed the wanted system via G.commitCrime.

import * as THREE from 'three';
import { createPersonMesh, animatePerson } from './pedestrians.js';

const ENEMY_HP = 100;

export function createCombat(scene) {
  const enemies = [];
  const tracers = [];
  const sparkPool = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 140;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkCount = 240;
  const sparkPos = new Float32Array(sparkCount * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: 0xffc46b, size: 0.55, transparent: true, opacity: 0.95 });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  for (let i = 0; i < sparkCount; i++) sparkPool.push({ life: 0, vx: 0, vy: 0, vz: 0, x: 0, y: -99, z: 0 });

  function spawnSparks(x, y, z, n = 8, color = 0xffc46b) {
    sparkMat.color.setHex(color);
    let made = 0;
    for (const s of sparkPool) {
      if (s.life > 0) continue;
      s.life = 0.32 + Math.random() * 0.25;
      s.x = x; s.y = y; s.z = z;
      s.vx = (Math.random() - 0.5) * 7;
      s.vy = Math.random() * 5.5;
      s.vz = (Math.random() - 0.5) * 7;
      if (++made >= n) break;
    }
  }

  function spawnTracer(from, to, color = 0xffe9a8) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    scene.add(line);
    tracers.push({ line, life: 0.055 });
  }

  function spawnEnemy(x, z, opts = {}) {
    const mesh = createPersonMesh({ shirt: 0x23232e, pants: 0x15151c, skin: 0xc68863, cap: 0x111116 });
    mesh.position.set(x, 0.22, z);
    scene.add(mesh);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.44),
      new THREE.MeshLambertMaterial({ color: 0x0c0c10 }));
    gun.position.set(0.35, 1.18, 0.3);
    mesh.add(gun);
    const hpBar = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.13),
      new THREE.MeshBasicMaterial({ color: 0x53ff6e, side: THREE.DoubleSide, depthTest: false }));
    hpBar.position.y = 2.05;
    hpBar.renderOrder = 5;
    mesh.add(hpBar);
    const enemy = {
      mesh, gun, hpBar,
      hp: ENEMY_HP,
      aggro: !!opts.aggro,
      burst: 0,
      burstWait: 1 + Math.random() * 1.6,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeTimer: 2 + Math.random() * 2,
      dead: false,
      deathTimer: 0,
      guardPoint: { x, z },
      name: opts.name || 'Enforcer',
    };
    mesh.userData.enemy = enemy;
    enemies.push(enemy);
    return enemy;
  }

  function damageEnemy(enemy, dmg, G, hitPoint) {
    if (enemy.dead) return;
    enemy.hp -= dmg;
    enemy.aggro = true;
    enemy.hpBar.scale.x = Math.max(0.02, enemy.hp / ENEMY_HP);
    enemy.hpBar.material.color.setHex(enemy.hp > 45 ? 0x53ff6e : 0xff5347);
    if (hitPoint) spawnSparks(hitPoint.x, hitPoint.y, hitPoint.z, 6, 0xff9d5c);
    if (enemy.hp <= 0) {
      enemy.dead = true;
      enemy.deathTimer = 3.2;
      enemy.mesh.rotation.x = -Math.PI / 2;
      enemy.mesh.position.y = 0.35;
      enemy.hpBar.visible = false;
      G.onEnemyDown?.(enemy);
    }
  }

  /** Player punch: short range, in the facing direction. */
  function playerPunch(G) {
    const p = G.playerPos();
    const f = G.playerFacing();
    let hit = false;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.mesh.position.x - p.x;
      const dz = e.mesh.position.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.3 && (dx * f.x + dz * f.z) > 0.2) {
        damageEnemy(e, 34, G, e.mesh.position.clone().setY(1.1));
        hit = true;
      }
    }
    // Punching near a pedestrian scares the block.
    G.onPunch?.(hit);
    return hit;
  }

  /** Player shot: hitscan from the camera through the crosshair. */
  function playerShoot(G) {
    const camera = G.camera;
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const origin = raycaster.ray.origin.clone();
    const hits = raycaster.intersectObjects(scene.children, true);
    let end = origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(120));
    let hitEnemy = null;
    let hitPoint = null;
    for (const h of hits) {
      let node = h.object;
      let enemy = null;
      while (node) {
        if (node.userData && node.userData.enemy) { enemy = node.userData.enemy; break; }
        node = node.parent;
      }
      // Skip the player's own meshes and HUD-ish helpers.
      if (h.object === sparkPoints) continue;
      end = h.point.clone();
      hitPoint = h.point;
      if (enemy && !enemy.dead) hitEnemy = enemy;
      break;
    }
    const muzzle = origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(1.1));
    muzzle.y -= 0.12;
    spawnTracer(muzzle, end, 0xffe9a8);
    spawnSparks(end.x, end.y, end.z, 5, 0xffc46b);
    if (hitEnemy) damageEnemy(hitEnemy, 27, G, hitPoint);
    G.onShoot?.(hitEnemy);
  }

  function enemyShoot(e, G) {
    const from = e.mesh.position.clone().setY(1.25);
    const target = G.playerPos().clone().setY(1.1);
    const dist = from.distanceTo(target);
    const spread = 0.6 + dist * 0.03;
    const to = target.clone();
    to.x += (Math.random() - 0.5) * spread;
    to.y += (Math.random() - 0.5) * spread * 0.5;
    to.z += (Math.random() - 0.5) * spread;
    spawnTracer(from, to, 0xff7a5c);
    const hitChance = THREE.MathUtils.clamp(0.52 - dist * 0.006, 0.14, 0.5);
    if (Math.random() < hitChance) G.damagePlayer(3.5 + Math.random() * 3.5);
  }

  function update(dt, G) {
    // Tracers fade.
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.055) * 0.9;
      if (t.life <= 0) {
        scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        tracers.splice(i, 1);
      }
    }
    // Sparks fly and fall.
    let anySpark = false;
    sparkPool.forEach((s, i) => {
      if (s.life > 0) {
        anySpark = true;
        s.life -= dt;
        s.vy -= 16 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        if (s.y < 0.05) { s.y = 0.05; s.vy = 0; }
      }
      sparkPos[i * 3] = s.x;
      sparkPos[i * 3 + 1] = s.life > 0 ? s.y : -99;
      sparkPos[i * 3 + 2] = s.z;
    });
    if (anySpark) sparkGeo.attributes.position.needsUpdate = true;

    const p = G.playerPos();
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) {
        e.deathTimer -= dt;
        if (e.deathTimer <= 0) {
          scene.remove(e.mesh);
          enemies.splice(i, 1);
        }
        continue;
      }
      e.hpBar.lookAt(G.camera.position);
      const dx = p.x - e.mesh.position.x;
      const dz = p.z - e.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      if (!e.aggro && dist < 34) e.aggro = true;
      if (!e.aggro) continue;

      e.mesh.rotation.y = Math.atan2(dx, dz);
      let moveSpeed = 0;
      if (dist > 17) moveSpeed = 3.4;
      else if (dist < 8) moveSpeed = -1.6;
      else {
        e.strafeTimer -= dt;
        if (e.strafeTimer <= 0) { e.strafeDir *= -1; e.strafeTimer = 1.6 + Math.random() * 2; }
        const sx = (-dz / (dist || 1)) * e.strafeDir;
        const sz = (dx / (dist || 1)) * e.strafeDir;
        e.mesh.position.x += sx * 1.1 * dt;
        e.mesh.position.z += sz * 1.1 * dt;
      }
      if (moveSpeed !== 0) {
        e.mesh.position.x += (dx / (dist || 1)) * moveSpeed * dt;
        e.mesh.position.z += (dz / (dist || 1)) * moveSpeed * dt;
      }
      animatePerson(e.mesh, Math.abs(moveSpeed) + 0.6, dt);

      // Fire in bursts with pauses.
      if (dist < 46) {
        if (e.burst > 0) {
          e.burst -= dt;
          if (e.burst <= 0) {
            enemyShoot(e, G);
            e.burst = 0.16;
            e.shotsLeft = (e.shotsLeft ?? 4) - 1;
            if (e.shotsLeft <= 0) { e.burst = 0; e.burstWait = 0.9 + Math.random() * 1.3; e.shotsLeft = 4; }
          }
        } else {
          e.burstWait -= dt;
          if (e.burstWait <= 0) e.burst = 0.01;
        }
      }
    }
  }

  function clearEnemies() {
    for (const e of enemies) scene.remove(e.mesh);
    enemies.length = 0;
  }

  return { enemies, spawnEnemy, playerPunch, playerShoot, update, clearEnemies, spawnSparks };
}
