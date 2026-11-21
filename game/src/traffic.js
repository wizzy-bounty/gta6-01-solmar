// traffic.js — ambient AI traffic for SOLMAR HEAT.
// Cars cruise the street grid in the correct lane, slow for the car ahead and
// for the player, and pick a new direction at intersections. They are the
// moving set dressing that makes the city feel alive — and stealable.

import { STREET_POS, ROAD_WIDTH } from './city.js';
import { CAR_KINDS, makeVehicle, updateVehicleDrive } from './vehicles.js';

const LANE = ROAD_WIDTH / 4 + 0.4;

function nearestStreetIndex(v) {
  let best = 0;
  let bestD = Infinity;
  STREET_POS.forEach((s, i) => {
    const d = Math.abs(v - s);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

export function createTraffic(scene, rng, count = 15) {
  const kinds = ['sedan', 'hatch', 'sedan', 'taxi', 'truck', 'hatch'];
  const cars = [];
  for (let i = 0; i < count; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const spec = CAR_KINDS[kind];
    const color = spec.colors[Math.floor(rng() * spec.colors.length)];
    const vertical = rng() < 0.5;
    const streetIdx = Math.floor(rng() * STREET_POS.length);
    const street = STREET_POS[streetIdx];
    const dirSign = rng() < 0.5 ? 1 : -1;
    const along = -220 + rng() * 440;
    let x, z, heading;
    if (vertical) {
      x = street + (dirSign > 0 ? -LANE : LANE);
      z = along;
      heading = dirSign > 0 ? 0 : Math.PI;
    } else {
      x = along;
      z = street + (dirSign > 0 ? LANE : -LANE);
      heading = dirSign > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    const v = makeVehicle(kind, color, x, z, heading);
    v.driver = 'traffic';
    scene.add(v.group);
    cars.push({
      v,
      vertical,
      streetIdx,
      dirSign,
      cruise: 10 + rng() * 6,
      turnCooldown: 0,
    });
  }

  function update(dt, playerPos, colliders) {
    for (const car of cars) {
      const { v } = car;
      if (v.driver !== 'traffic') continue; // stolen by the player — hands off
      const pos = v.group.position;
      car.turnCooldown -= dt;

      // At an intersection, sometimes turn onto the crossing street.
      const crossIdx = car.vertical ? nearestStreetIndex(pos.z) : nearestStreetIndex(pos.x);
      const crossPos = car.vertical ? pos.z : pos.x;
      const distToCross = Math.abs(crossPos - STREET_POS[crossIdx]);
      if (car.turnCooldown <= 0 && distToCross < 2.2 && Math.random() < 0.012) {
        car.vertical = !car.vertical;
        car.streetIdx = crossIdx;
        if (car.vertical) {
          car.dirSign = Math.random() < 0.5 ? 1 : -1;
          v.heading = car.dirSign > 0 ? 0 : Math.PI;
          pos.x = STREET_POS[car.streetIdx] + (car.dirSign > 0 ? -LANE : LANE);
        } else {
          car.dirSign = Math.random() < 0.5 ? 1 : -1;
          v.heading = car.dirSign > 0 ? Math.PI / 2 : -Math.PI / 2;
          pos.z = STREET_POS[car.streetIdx] + (car.dirSign > 0 ? LANE : -LANE);
        }
        car.turnCooldown = 2.5;
      }

      // Keep to the lane of the street we follow.
      if (car.vertical) {
        const targetX = STREET_POS[car.streetIdx] + (car.dirSign > 0 ? -LANE : LANE);
        pos.x += (targetX - pos.x) * Math.min(1, dt * 2.4);
        v.heading = car.dirSign > 0 ? 0 : Math.PI;
      } else {
        const targetZ = STREET_POS[car.streetIdx] + (car.dirSign > 0 ? LANE : -LANE);
        pos.z += (targetZ - pos.z) * Math.min(1, dt * 2.4);
        v.heading = car.dirSign > 0 ? Math.PI / 2 : -Math.PI / 2;
      }

      // Slow down when something is right ahead (player included).
      const fx = Math.sin(v.heading);
      const fz = Math.cos(v.heading);
      let want = car.cruise;
      const aheadOf = (ox, oz) => {
        const dx = ox - pos.x;
        const dz = oz - pos.z;
        const along = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        return along > 0 && along < 11 && side < 2.4 ? along : Infinity;
      };
      let nearest = aheadOf(playerPos.x, playerPos.z);
      for (const other of cars) {
        if (other === car) continue;
        nearest = Math.min(nearest, aheadOf(other.v.group.position.x, other.v.group.position.z));
      }
      if (nearest < 6) want = 0;
      else if (nearest < 11) want = car.cruise * 0.4;

      const throttle = v.speed < want ? 0.55 : -0.4;
      updateVehicleDrive(v, { throttle, steer: 0, handbrake: false }, dt, colliders);

      // Wrap cars that leave the city back to the far side.
      if (Math.abs(pos.x) > 262 || Math.abs(pos.z) > 262) {
        if (car.vertical) pos.z = pos.z > 0 ? -258 : 258;
        else pos.x = pos.x > 0 ? -258 : 258;
        v.speed = car.cruise * 0.6;
      }
    }
  }

  return { cars: cars.map((c) => c.v), update };
}
