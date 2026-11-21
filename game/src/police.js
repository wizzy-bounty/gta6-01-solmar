// police.js — the Solmar City Police Department.
// Units spawn at the city edge in numbers set by the wanted level, chase the
// player with predictive steering, flash their light bars and try to box the
// player in. If they pin a player on foot (or a stopped car) long enough, the
// player is busted. When the player breaks line of sight, the heat cools.

import * as THREE from 'three';
import { makeVehicle, updateVehicleDrive, forwardOf } from './vehicles.js';

const MAX_UNITS = 5;

export function createPolice(scene) {
  const units = [];
  let flashClock = 0;
  let bustMeter = 0;

  function spawnUnit(playerPos) {
    // Spawn on a street 90–130 m away, biased toward the player's heading.
    const angle = Math.random() * Math.PI * 2;
    const dist = 95 + Math.random() * 35;
    const x = THREE.MathUtils.clamp(playerPos.x + Math.sin(angle) * dist, -245, 245);
    const z = THREE.MathUtils.clamp(playerPos.z + Math.cos(angle) * dist, -245, 245);
    const v = makeVehicle('police', 0xf2f4f6, x, z, angle + Math.PI);
    v.driver = 'police';
    scene.add(v.group);
    units.push({ v, stuckTimer: 0 });
    return v;
  }

  function removeUnit(sceneRef, unit) {
    sceneRef.remove(unit.v.group);
    units.splice(units.indexOf(unit), 1);
  }

  return {
    units,
    get bustProgress() { return bustMeter; },

    /** Place a unit at an exact spot (screenshot setups, ambushes). */
    placeUnit(x, z, heading = 0) {
      const v = makeVehicle('police', 0xf2f4f6, x, z, heading);
      v.driver = 'police';
      scene.add(v.group);
      units.push({ v, stuckTimer: 0 });
      return v;
    },

    /** Remove every unit at once (busted / wasted resets). */
    clearAll() {
      while (units.length) removeUnit(scene, units[0]);
      bustMeter = 0;
    },

    /** Number of units the wanted level calls for. */
    desiredUnits(wanted) {
      if (wanted <= 0) return 0;
      return Math.min(MAX_UNITS, wanted); // 1 star = 1 car … 5 stars = 5 cars
    },

    update(dt, G) {
      const wanted = G.wanted;
      const playerPos = G.playerPos();
      const desired = this.desiredUnits(wanted);

      if (units.length < desired) spawnUnit(playerPos);
      if (units.length > desired) {
        // Extra units give up first when the heat drops.
        const far = units.reduce((a, b) =>
          (a.v.group.position.distanceTo(playerPos) > b.v.group.position.distanceTo(playerPos) ? a : b));
        removeUnit(scene, far);
      }

      flashClock += dt * 7;
      const phase = Math.sin(flashClock) > 0;
      let nearest = Infinity;
      let anyCloseAndSlow = false;

      for (const unit of units) {
        const v = unit.v;
        const pos = v.group.position;
        const dx = playerPos.x - pos.x;
        const dz = playerPos.z - pos.z;
        const dist = Math.hypot(dx, dz);
        nearest = Math.min(nearest, dist);

        // Aim at where the player will be in half a second.
        const pv = G.playerVelocity();
        const aimX = playerPos.x + pv.x * 0.5;
        const aimZ = playerPos.z + pv.z * 0.5;
        const wantHeading = Math.atan2(aimX - pos.x, aimZ - pos.z);
        let dh = wantHeading - v.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        const steer = THREE.MathUtils.clamp(dh * 1.6, -1, 1);

        const f = forwardOf(v.heading);
        const toPlayer = dx * f.x + dz * f.z;
        let throttle = 1;
        if (dist < 7 && toPlayer < 0) throttle = -0.7;      // overshot: reverse back
        else if (dist < 12) throttle = 0.55;                  // stay on the bumper
        if (Math.abs(v.speed) < 0.6) unit.stuckTimer += dt; else unit.stuckTimer = 0;
        if (unit.stuckTimer > 1.6) {                          // wedged on scenery: back out
          throttle = -1;
          unit.stuckTimer = -1.2;
        }
        const impact = updateVehicleDrive(v, { throttle, steer, handbrake: false }, dt, G.colliders);
        if (impact > 9) G.onPoliceCrash?.(impact);

        // Flashing light bar.
        const lb = v.group.userData.lightbar;
        if (lb) {
          lb.redMat.color.setHex(phase ? 0xff2222 : 0x551111);
          lb.blueMat.color.setHex(phase ? 0x113377 : 0x3377ff);
        }

        if (dist < 9 && G.playerSpeed() < 1.2) anyCloseAndSlow = true;
        // Despawn a unit left far behind; a fresh one spawns nearer.
        if (dist > 240) removeUnit(scene, unit);
      }

      // Bust logic: pinned by police while barely moving fills the meter.
      if (anyCloseAndSlow && wanted > 0) bustMeter += dt / 2.6;
      else bustMeter = Math.max(0, bustMeter - dt * 0.7);
      if (bustMeter >= 1) {
        bustMeter = 0;
        G.onBusted?.();
      }

      return { nearestSiren: nearest === Infinity ? 0 : THREE.MathUtils.clamp(1 - nearest / 130, 0, 1) };
    },
  };
}
