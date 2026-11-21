// vehicles.js — car models and arcade driving physics for SOLMAR HEAT.
// Cars are tidy low-poly builds (body, cabin, wheels, lights) made from boxes
// and cylinders. Physics is an arcade model: throttle/steer in, speed and
// heading out, with circle-vs-building collision so cars bounce off the city.

import * as THREE from 'three';
import { collideCircle, STREET_POS, ROAD_WIDTH } from './city.js';

export const CAR_KINDS = {
  sedan:  { name: 'Solmar Sedan',  w: 1.9, l: 4.4, bodyH: 0.62, cabinH: 0.55, topSpeed: 34, accel: 15, colors: [0xb8bec8, 0x3f6fb5, 0x8a2f35, 0x2e4a3f, 0xd8d3c8, 0x444a55] },
  hatch:  { name: 'Pico Hatch',    w: 1.8, l: 3.7, bodyH: 0.66, cabinH: 0.6,  topSpeed: 29, accel: 14, colors: [0xd96c2c, 0x3fa7d6, 0x7fb069, 0xe0b341, 0xc0c6ce] },
  sport:  { name: 'Vantara GT',    w: 1.95, l: 4.5, bodyH: 0.5,  cabinH: 0.42, topSpeed: 47, accel: 24, colors: [0xd92323, 0xffc21c, 0x7b2ff7, 0x12c2e0, 0xf5f6fa] },
  taxi:   { name: 'Solmar Cab',    w: 1.9, l: 4.4, bodyH: 0.62, cabinH: 0.55, topSpeed: 32, accel: 15, colors: [0xf7b731] },
  truck:  { name: 'Hauler Pickup', w: 2.1, l: 5.2, bodyH: 0.8,  cabinH: 0.62, topSpeed: 30, accel: 12, colors: [0x77808c, 0x5d6d7e, 0x9c6644] },
  police: { name: 'SCPD Interceptor', w: 1.95, l: 4.6, bodyH: 0.6, cabinH: 0.55, topSpeed: 44, accel: 22, colors: [0xf2f4f6] },
};

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
wheelGeo.rotateZ(Math.PI / 2); // axle along X, so rotation.x rolls the wheel
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x15161a });
const glassMat = new THREE.MeshPhongMaterial({ color: 0x18242f, shininess: 90 });
const chromeMat = new THREE.MeshPhongMaterial({ color: 0xb9c2cc, shininess: 70 });

function paint(color) {
  return new THREE.MeshPhongMaterial({ color, shininess: 55 });
}

/** Build a car's meshes. userData carries wheels and (for police) the light bar. */
export function createCarMesh(kind, color) {
  const spec = CAR_KINDS[kind];
  const g = new THREE.Group();
  const paintMat = paint(color);

  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.bodyH, spec.l), paintMat);
  body.position.y = 0.36 + spec.bodyH / 2;
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.82, spec.cabinH, spec.l * 0.48), glassMat);
  cabin.position.set(0, 0.36 + spec.bodyH + spec.cabinH / 2 - 0.04, -spec.l * 0.04);
  cabin.castShadow = true;
  g.add(cabin);

  if (kind === 'sport') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.92, 0.08, 0.5), paintMat);
    spoiler.position.set(0, 1.06, -spec.l / 2 + 0.3);
    g.add(spoiler);
  }
  if (kind === 'truck') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.94, 0.34, spec.l * 0.4), chromeMat);
    bed.position.set(0, 0.36 + spec.bodyH + 0.1, -spec.l * 0.28);
    g.add(bed);
  }
  if (kind === 'taxi') {
    const signMat = new THREE.MeshBasicMaterial({ color: 0xffe259 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.34), signMat);
    sign.position.set(0, 0.36 + spec.bodyH + spec.cabinH + 0.08, -spec.l * 0.04);
    g.add(sign);
  }

  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2d2d });
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), headMat);
    head.position.set(sx * spec.w * 0.32, 0.62, spec.l / 2 + 0.01);
    g.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tailMat);
    tail.position.set(sx * spec.w * 0.32, 0.66, -spec.l / 2 - 0.01);
    g.add(tail);
  }

  const wheels = [];
  const wheelPos = [
    [-spec.w / 2 + 0.12, -spec.l / 2 + 0.85], [spec.w / 2 - 0.12, -spec.l / 2 + 0.85],
    [-spec.w / 2 + 0.12, spec.l / 2 - 0.85], [spec.w / 2 - 0.12, spec.l / 2 - 0.85],
  ];
  for (const [wx, wz] of wheelPos) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.36, wz);
    g.add(wheel);
    wheels.push(wheel);
  }
  g.userData.wheels = wheels;
  g.userData.frontWheels = [wheels[2], wheels[3]];

  if (kind === 'police') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.03, 0.3, spec.l * 0.5),
      new THREE.MeshLambertMaterial({ color: 0x1c2f57 }));
    stripe.position.set(0, 0.62, 0);
    g.add(stripe);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.1, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x22262c }));
    barBase.position.set(0, 0.36 + spec.bodyH + spec.cabinH + 0.03, -spec.l * 0.04);
    g.add(barBase);
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2255ff });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.17, 0.36), redMat);
    red.position.set(-0.29, barBase.position.y + 0.13, barBase.position.z);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.17, 0.36), blueMat);
    blue.position.set(0.29, barBase.position.y + 0.13, barBase.position.z);
    g.add(blue);
    g.userData.lightbar = { redMat, blueMat };
  }
  return g;
}

/** A vehicle: mesh + arcade state. heading 0 faces +Z; forward = (sin h, cos h). */
export function makeVehicle(kind, color, x, z, heading = 0) {
  const group = createCarMesh(kind, color);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  return {
    kind,
    name: CAR_KINDS[kind].name,
    spec: CAR_KINDS[kind],
    group,
    heading,
    speed: 0,
    steerVis: 0,
    wheelSpin: 0,
    driver: null,      // 'player' | 'traffic' | 'police' | null (parked)
    dead: false,
  };
}

export function forwardOf(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

/**
 * Advance a driven vehicle. ctl: { throttle: -1..1, steer: -1..1, handbrake }.
 * Returns the impact speed when the car hits a building hard, else 0.
 */
export function updateVehicleDrive(v, ctl, dt, colliders) {
  const spec = v.spec;
  const throttle = THREE.MathUtils.clamp(ctl.throttle || 0, -1, 1);
  const steer = THREE.MathUtils.clamp(ctl.steer || 0, -1, 1);

  if (throttle > 0) v.speed += spec.accel * throttle * dt;
  else if (throttle < 0) v.speed += spec.accel * 0.62 * throttle * dt;
  // Drag + rolling resistance.
  v.speed -= v.speed * 0.55 * dt;
  if (throttle === 0) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 3.2 * dt);
  if (ctl.handbrake) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 26 * dt);
  v.speed = THREE.MathUtils.clamp(v.speed, -11, spec.topSpeed);

  const steerAuthority = THREE.MathUtils.clamp(Math.abs(v.speed) / 7, 0, 1) * (ctl.handbrake ? 1.5 : 1);
  v.heading -= steer * 1.65 * steerAuthority * dt * (v.speed < 0 ? -1 : 1);
  v.steerVis = THREE.MathUtils.lerp(v.steerVis, steer * 0.42, 1 - Math.pow(0.0001, dt));

  const f = forwardOf(v.heading);
  let nx = v.group.position.x + f.x * v.speed * dt;
  let nz = v.group.position.z + f.z * v.speed * dt;
  const before = Math.abs(v.speed);
  [nx, nz] = collideCircle(colliders, nx, nz, 1.75);
  const moved = Math.hypot(nx - v.group.position.x, nz - v.group.position.z);
  let impact = 0;
  if (before > 6 && moved < Math.abs(v.speed) * dt * 0.35) {
    impact = before;
    v.speed = -v.speed * 0.22;
  }
  v.group.position.x = nx;
  v.group.position.z = nz;
  v.group.rotation.y = v.heading;

  // Wheel visuals.
  v.wheelSpin += (v.speed * dt) / 0.36;
  for (const w of v.group.userData.wheels) w.rotation.x = v.wheelSpin;
  for (const w of v.group.userData.frontWheels) w.rotation.y = -v.steerVis;
  return impact;
}

/** Coast a driverless vehicle to a stop (parked cars, abandoned wrecks). */
export function updateVehicleFree(v, dt, colliders) {
  if (Math.abs(v.speed) < 0.02) { v.speed = 0; return; }
  updateVehicleDrive(v, { throttle: 0, steer: 0, handbrake: false }, dt, colliders);
}

/** Simple circle separation between two vehicles; returns impact speed. */
export function collideVehicles(a, b) {
  const dx = b.group.position.x - a.group.position.x;
  const dz = b.group.position.z - a.group.position.z;
  const dist = Math.hypot(dx, dz);
  const minDist = 3.1;
  if (dist === 0 || dist >= minDist) return 0;
  const push = (minDist - dist) / 2;
  const ux = dx / dist;
  const uz = dz / dist;
  a.group.position.x -= ux * push;
  a.group.position.z -= uz * push;
  b.group.position.x += ux * push;
  b.group.position.z += uz * push;
  const rel = Math.abs(a.speed - b.speed);
  const avg = (a.speed + b.speed) / 2;
  a.speed = avg * 0.82;
  b.speed = avg * 0.82;
  return rel > 5 ? rel : 0;
}

/** Scatter parked cars along the curbs; some are the stealable set dressing. */
export function spawnParkedCars(scene, rng, count = 26) {
  const kinds = ['sedan', 'hatch', 'sport', 'taxi', 'truck'];
  const cars = [];
  for (let i = 0; i < count; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const spec = CAR_KINDS[kind];
    const color = spec.colors[Math.floor(rng() * spec.colors.length)];
    const vertical = rng() < 0.5;
    const street = STREET_POS[Math.floor(rng() * STREET_POS.length)];
    const along = -230 + rng() * 460;
    const side = rng() < 0.5 ? -1 : 1;
    let x, z, heading;
    if (vertical) {
      x = street + side * (ROAD_WIDTH / 2 + 1.6);
      z = along;
      heading = side > 0 ? Math.PI : 0;
    } else {
      x = along;
      z = street + side * (ROAD_WIDTH / 2 + 1.6);
      heading = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    const v = makeVehicle(kind, color, x, z, heading);
    scene.add(v.group);
    cars.push(v);
  }
  return cars;
}
