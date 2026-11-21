// main.js — SOLMAR HEAT: boot, game state, the main loop and every system
// wired together. Riko "Vex" Marlowe walks and drives a procedural three.js
// city with traffic, pedestrians, police, combat and a six-mission story.
// Modes: menu orbit → playing → paused / busted / wasted overlays, plus the
// deterministic ?shot=N screenshot mode (see shots.js).

import * as THREE from 'three';
import { buildCity, makeRng, collideCircle, PLACES, dynamicMats, STREET_POS, ROAD_WIDTH } from './city.js';
import { createInput } from './input.js';
import { SoundEngine } from './audio.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { makeVehicle, updateVehicleDrive, updateVehicleFree, collideVehicles, spawnParkedCars } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPedestrians, createPersonMesh, animatePerson } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { readShotNumber, applyShot } from './shots.js';

// ---------------------------------------------------------------- setup
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const shotNumber = readShotNumber();
renderer.setPixelRatio(shotNumber ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf3cf9e, 190, 900);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3200);
camera.position.set(-260, 60, -260);

const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a6f4d, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe3b3, 1.15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -120;
sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120;
sun.shadow.camera.bottom = -120;
sun.shadow.camera.far = 700;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);
const ambient = new THREE.AmbientLight(0xffe8c9, 0.22);
scene.add(ambient);

const seedParam = Number.parseInt(new URLSearchParams(window.location.search).get('seed') ?? '7', 10);
const rng = makeRng(Number.isFinite(seedParam) ? seedParam : 7);
const { colliders } = buildCity(scene, 1987);

// ---------------------------------------------------------------- entities
const playerMesh = createPersonMesh({ shirt: 0x0e7c86, pants: 0x22242c, skin: 0xc68863, cap: 0xffb52e });
playerMesh.position.set(PLACES.spawn.x, 0.22, PLACES.spawn.z);
scene.add(playerMesh);

// Extra pedestrians placed by the screenshot setups (shots.js): citizens on
// fixed patrol segments, so the dossier frames are alive in the same way on
// every capture. (The ambient crowd below is seeded, but wanders city-wide.)
const shotPeds = [];

const parkedCars = spawnParkedCars(scene, rng, 26);
const traffic = createTraffic(scene, rng, 15);
const pedestrians = createPedestrians(scene, rng, 42);
const police = createPolice(scene);
const combat = createCombat(scene);
const hud = createHud();
const sound = new SoundEngine();
const input = createInput(renderer.domElement);

const allVehicles = [...parkedCars, ...traffic.cars];

// Mission marker beacon: a gold pillar of light at the objective.
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(1.25, 1.25, 34, 18, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffb52e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
);
beacon.visible = false;
scene.add(beacon);
const beaconRing = new THREE.Mesh(
  new THREE.RingGeometry(2.4, 3.1, 28),
  new THREE.MeshBasicMaterial({ color: 0xffb52e, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
);
beaconRing.rotation.x = -Math.PI / 2;
beaconRing.visible = false;
scene.add(beaconRing);

// ---------------------------------------------------------------- state
const state = {
  mode: shotNumber ? 'playing' : 'menu',
  money: 120,
  health: 100,
  lastHurtAt: -99,
  heat: 0,
  unseenTimer: 0,
  timeHours: 17.35,
  timeFrozen: !!shotNumber,
  heading: 0.6,
  walkVel: { x: 0, z: 0 },
  driving: null,
  lastCar: null,
  camYaw: 0.6,
  camPitch: 0.32,
  camMode: null,
  camDist: 6.4,
  elapsed: 0,
  punchTimer: 0,
  scareTimer: 0,
  autoDrive: null,
  storyFinished: false,
  shake: 0,
};

const wantedLevel = () => (state.heat <= 0.02 ? 0 : Math.min(5, Math.ceil(state.heat - 1e-4)));
function playerPosVec() { return state.driving ? state.driving.group.position : playerMesh.position; }
function playerSpeedAbs() {
  return state.driving ? Math.abs(state.driving.speed) : Math.hypot(state.walkVel.x, state.walkVel.z);
}
function witnessedBy() {
  const p = playerPosVec();
  for (const u of police.units) if (u.v.group.position.distanceTo(p) < 78) return true;
  for (const ped of pedestrians.list) if (ped.mesh.position.distanceTo(p) < 24) return true;
  return false;
}
function commitCrime(kind) {
  const p = playerPosVec();
  if (kind === 'steal') {
    state.heat = Math.min(5, state.heat + (witnessedBy() ? 1 : 0.35));
    pedestrians.scare(p.x, p.z, 15);
  } else if (kind === 'shoot') {
    state.heat = Math.min(5, state.heat + (witnessedBy() ? 0.8 : 0.3));
  } else if (kind === 'punch') {
    if (witnessedBy()) state.heat = Math.min(5, state.heat + 0.3);
  } else if (kind === 'hitped') {
    state.heat = Math.min(5, state.heat + 1);
  } else if (kind === 'crash-police') {
    state.heat = Math.min(5, state.heat + 0.5);
  }
  if (state.heat > 0) state.unseenTimer = 0;
}

function groundY(x, z) {
  if (x > 310 && x < 364 && z > -68 && z < -52) return 3.15;          // yacht deck
  if (x > 284 && x < 442 && z > 113 && z < 127) return 1.28;          // bridge deck
  if (x > 250 && x < 318 && z > -66 && z < -54) return 0.62;          // pier
  if (Math.abs(x - 452) < 74 && Math.abs(z - 120) < 74) return 0.06;  // hideout island
  const lx = ((x + 252) % 56 + 56) % 56;
  const lz = ((z + 252) % 56 + 56) % 56;
  if (lx > 6.5 && lx < 49.5 && lz > 6.5 && lz < 49.5) return 0.22;    // block sidewalks
  return 0.03;
}
function footAllowed(x, z) {
  if (Math.abs(x) <= 310 && Math.abs(z) <= 310) return true;
  if (x > 250 && x < 366 && z > -68 && z < -52) return true;          // pier + yacht
  if (x > 284 && x < 530 && z > 112 && z < 128) return true;          // bridge
  if (Math.abs(x - 452) < 75 && Math.abs(z - 120) < 75) return true;  // island
  return false;
}
function carAllowed(x, z) {
  if (Math.abs(x) <= 307 && Math.abs(z) <= 307) return true;
  if (x > 252 && x < 311 && z > -66 && z < -54) return true;          // pier (not the yacht)
  if (x > 284 && x < 442 && z > 113 && z < 127) return true;          // bridge
  if (Math.abs(x - 452) < 73 && Math.abs(z - 120) < 73) return true;  // island
  return false;
}

// ---------------------------------------------------------------- facade
let missions; // created right after the facade (it calls back into G)
const G = {
  camera,
  colliders,
  sound,
  get wanted() { return wantedLevel(); },
  get money() { return state.money; },
  get health() { return state.health; },
  get timeHours() { return state.timeHours; },
  playerPos() { return playerPosVec(); },
  playerVelocity() {
    if (state.driving) {
      const v = state.driving;
      return { x: Math.sin(v.heading) * v.speed, z: Math.cos(v.heading) * v.speed };
    }
    return state.walkVel;
  },
  playerSpeed() { return playerSpeedAbs(); },
  playerFacing() {
    if (state.driving) {
      const v = state.driving;
      return { x: Math.sin(v.heading), z: Math.cos(v.heading) };
    }
    return { x: Math.sin(state.heading), z: Math.cos(state.heading) };
  },
  playerHeading() { return state.driving ? state.driving.heading : state.heading; },
  currentVehicle() { return state.driving; },
  drivingVehicle() { return state.driving; },
  policeUnits() { return police.units.map((u) => u.v); },
  objective() { return missions.objective(); },
  commitCrime,
  setWantedAtLeast(n) { state.heat = Math.max(state.heat, n); },
  addMoney(n) { state.money += n; },
  damagePlayer(n) {
    if (state.mode !== 'playing') return;
    state.health -= n;
    state.lastHurtAt = state.elapsed;
    hud.setVignette(0.9);
    if (state.health <= 0) wasted();
  },
  showDialog(lines, cb) { hud.showDialog(lines, cb); },
  toast(big, sub) { hud.toast(big, sub); },
  saveGame() {
    const p = playerPosVec();
    writeSave({
      missionIndex: missions.index,
      money: state.money,
      position: [p.x, 0, p.z],
      finishedStory: state.storyFinished,
    });
  },
  markStoryFinished() { state.storyFinished = true; },
  spawnMissionCar(pos) {
    const sx = STREET_POS.reduce((a, b) => (Math.abs(b - pos.x) < Math.abs(a - pos.x) ? b : a));
    const sz = STREET_POS.reduce((a, b) => (Math.abs(b - pos.z) < Math.abs(a - pos.z) ? b : a));
    let x, z, heading;
    if (Math.abs(sx - pos.x) <= Math.abs(sz - pos.z)) {
      x = sx + (pos.x > sx ? 1 : -1) * (ROAD_WIDTH / 2 + 1.7);
      z = pos.z;
      heading = pos.x > sx ? 0 : Math.PI;
    } else {
      x = pos.x;
      z = sz + (pos.z > sz ? 1 : -1) * (ROAD_WIDTH / 2 + 1.7);
      heading = pos.z > sz ? Math.PI / 2 : -Math.PI / 2;
    }
    const v = makeVehicle('sport', 0xff2fb3, x, z, heading);
    scene.add(v.group);
    allVehicles.push(v);
    return v;
  },
  spawnGuards(pos, count) {
    let made = 0;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.5;
      combat.spawnEnemy(pos.x + Math.sin(a) * 7, pos.z + Math.cos(a) * 7, { aggro: false });
      made++;
    }
    return made;
  },
  onShoot() {
    sound.shoot();
    commitCrime('shoot');
    const p = playerPosVec();
    pedestrians.scare(p.x, p.z, 22);
  },
  onPunch(hit) {
    sound.punch();
    if (hit) commitCrime('punch');
  },
  onEnemyDown() {
    state.money += 30;
    missions.notifyEnemyDown();
    const p = playerPosVec();
    pedestrians.scare(p.x, p.z, 18);
  },
  onPoliceCrash() { commitCrime('crash-police'); },
  onBusted() { busted(); },
  // --- screenshot setup hooks (shots.js) ---
  setTimeOfDay(h) { state.timeHours = h; state.timeFrozen = true; },
  setWanted(n) { state.heat = n; },
  setMission(i, s) { missions.debugSetStage(i, s); },
  placePlayer(x, z, heading) {
    playerMesh.position.set(x, groundY(x, z), z);
    state.heading = heading;
    state.camYaw = heading;
    playerMesh.rotation.y = heading;
  },
  placeCar(kind, color, x, z, heading) {
    const v = makeVehicle(kind, color, x, z, heading);
    scene.add(v.group);
    allVehicles.push(v);
    return v;
  },
  placePlayerInCar(kind, color, x, z, heading, speed) {
    const v = G.placeCar(kind, color, x, z, heading);
    v.speed = speed;
    enterVehicle(v, { silent: true });
    return v;
  },
  placePolice(x, z, heading) { return police.placeUnit(x, z, heading); },
  placePedestrian(x1, z1, x2, z2, palette) {
    const mesh = createPersonMesh(palette);
    mesh.position.set(x1, groundY(x1, z1), z1);
    mesh.rotation.y = Math.atan2(x2 - x1, z2 - z1);
    scene.add(mesh);
    const p = { mesh, ax: x1, az: z1, bx: x2, bz: z2, t: 0, dir: 1, speed: 1.25 };
    shotPeds.push(p);
    return p;
  },
  setAutoDrive(speed) { state.autoDrive = { speed, heading: state.driving ? state.driving.heading : 0 }; },
  setCamMode(m) { state.camMode = m; },
};
missions = createMissions(G);

// ---------------------------------------------------------------- flow
function enterVehicle(v, { silent = false } = {}) {
  state.driving = v;
  state.lastCar = v;
  v.driver = 'player';
  playerMesh.visible = false;
  if (!silent) {
    missions.notifyEnterVehicle(v);
    if (v !== state.justExited) commitCrime('steal');
    sound.ui();
  }
  state.justExited = null;
}
function exitVehicle() {
  const v = state.driving;
  if (!v) return;
  const p = v.group.position;
  const rx = Math.cos(v.heading);
  const rz = -Math.sin(v.heading);
  let ex = p.x + rx * 2.4;
  let ez = p.z + rz * 2.4;
  [ex, ez] = collideCircle(colliders, ex, ez, 0.55);
  playerMesh.position.set(ex, groundY(ex, ez), ez);
  playerMesh.visible = true;
  state.heading = v.heading;
  state.camYaw = v.heading;
  v.driver = null;
  v.speed = 0;
  state.justExited = v;
  state.driving = null;
  sound.ui();
}

function busted() {
  if (state.mode !== 'playing') return;
  state.mode = 'busted';
  sound.busted();
  hud.setBusted(true);
  const fine = Math.min(state.money, 150 + wantedLevel() * 100);
  state.money -= fine;
  setTimeout(() => {
    hud.setBusted(false);
    if (state.driving) exitVehicle();
    state.heat = 0;
    police.clearAll();
    playerMesh.position.set(PLACES.hospital.x, 0.22, PLACES.hospital.z + 14);
    playerMesh.visible = true;
    state.health = Math.max(state.health, 55);
    hud.toast('RELEASED', `Bail and fines: $${fine.toLocaleString('en-US')} — the SCPD impounded your ride's dignity`);
    state.mode = 'playing';
    G.saveGame();
  }, 2300);
}
function wasted() {
  if (state.mode !== 'playing') return;
  state.mode = 'wasted';
  const bill = Math.min(state.money, 200);
  state.money -= bill;
  hud.toast('WASTED', `Solmar General patched you up — $${bill.toLocaleString('en-US')}`);
  setTimeout(() => {
    if (state.driving) exitVehicle();
    state.heat = 0;
    police.clearAll();
    playerMesh.position.set(PLACES.hospital.x, 0.22, PLACES.hospital.z + 14);
    playerMesh.visible = true;
    state.health = 100;
    state.mode = 'playing';
    G.saveGame();
  }, 1600);
}

function startGame(save) {
  document.getElementById('start-screen').style.display = 'none';
  hud.show();
  state.mode = 'playing';
  sound.ensure();
  if (save) {
    state.money = save.money;
    state.storyFinished = !!save.finishedStory;
    if (Array.isArray(save.position)) {
      playerMesh.position.set(save.position[0], groundY(save.position[0], save.position[2]), save.position[2]);
    }
    if (save.finishedStory) missions.finishSilently();
    else missions.start(Math.min(save.missionIndex || 0, 5));
  } else {
    missions.start(0);
  }
}

// Start screen wiring.
const existingSave = loadSave();
if (existingSave && !shotNumber) {
  const btn = document.getElementById('btn-continue');
  btn.style.display = '';
  document.getElementById('continue-info').textContent =
    `Mission ${Math.min((existingSave.missionIndex || 0) + 1, 6)} of 6 • $${(existingSave.money || 0).toLocaleString('en-US')}`;
  btn.addEventListener('click', () => startGame(existingSave));
}
document.getElementById('btn-start').addEventListener('click', () => { clearSave(); startGame(null); });
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-restart').addEventListener('click', () => { clearSave(); window.location.reload(); });
renderer.domElement.addEventListener('click', () => {
  if (state.mode === 'playing' && !hud.dialogActive()) input.lock();
});

function togglePause() {
  const menu = document.getElementById('pause-menu');
  if (state.mode === 'playing') {
    state.mode = 'paused';
    document.getElementById('pause-stats').textContent =
      `$${Math.round(state.money).toLocaleString('en-US')} • Mission ${Math.min(missions.index + 1, 6)} of 6 • Wanted level ${wantedLevel()}`;
    menu.classList.add('on');
    input.unlock();
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    menu.classList.remove('on');
  }
}

// ---------------------------------------------------------------- per-frame systems
function updatePlayerOnFoot(dt) {
  const look = input.takeLook();
  if (input.isLocked()) {
    state.camYaw -= look.dx * 0.0026;
    state.camPitch = THREE.MathUtils.clamp(state.camPitch + look.dy * 0.0022, -0.15, 1.05);
  }
  let ix = 0;
  let iz = 0;
  if (input.down('KeyW')) iz += 1;
  if (input.down('KeyS')) iz -= 1;
  if (input.down('KeyA')) ix -= 1;
  if (input.down('KeyD')) ix += 1;
  const moving = ix !== 0 || iz !== 0;
  const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = sprint ? 7.4 : 4.3;
  const fx = Math.sin(state.camYaw);
  const fz = Math.cos(state.camYaw);
  const rx = Math.cos(state.camYaw);
  const rz = -Math.sin(state.camYaw);
  let mx = fx * iz + rx * ix;
  let mz = fz * iz + rz * ix;
  const len = Math.hypot(mx, mz) || 1;
  if (moving) {
    mx = (mx / len) * speed;
    mz = (mz / len) * speed;
    const targetHeading = Math.atan2(mx, mz);
    let dh = targetHeading - state.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    state.heading += dh * Math.min(1, dt * 14);
  } else {
    mx = 0; mz = 0;
  }
  state.walkVel = { x: mx, z: mz };
  const p = playerMesh.position;
  let nx = p.x + mx * dt;
  let nz = p.z + mz * dt;
  if (!footAllowed(nx, nz)) {
    if (footAllowed(nx, p.z)) nz = p.z;
    else if (footAllowed(p.x, nz)) nx = p.x;
    else { nx = p.x; nz = p.z; }
  }
  [nx, nz] = collideCircle(colliders, nx, nz, 0.55);
  p.x = nx;
  p.z = nz;
  p.y = groundY(nx, nz);
  playerMesh.rotation.y = state.heading;
  if (moving) animatePerson(playerMesh, speed, dt);
  else {
    const limbs = playerMesh.userData.limbs;
    for (const key of ['legL', 'legR', 'armL', 'armR']) {
      if (key !== 'armR' || state.punchTimer <= 0) limbs[key].rotation.x *= Math.pow(0.001, dt);
    }
  }
  if (state.punchTimer > 0) {
    state.punchTimer -= dt;
    const t = 1 - Math.max(0, state.punchTimer) / 0.26;
    playerMesh.userData.limbs.armR.rotation.x = -Math.sin(t * Math.PI) * 1.8;
  }

  // Interaction: nearest stealable car.
  let nearest = null;
  let nearestD = 3.6;
  for (const v of allVehicles) {
    if (v.driver === 'police') continue;
    const d = v.group.position.distanceTo(p);
    if (d < nearestD) { nearestD = d; nearest = v; }
  }
  if (nearest && Math.abs(nearest.speed) < 3.2) {
    const verb = nearest === state.justExited ? 'ENTER' : 'STEAL';
    hud.setPrompt(`<b>E</b>${verb} — ${nearest.name}`);
    if (input.pressed('KeyE')) enterVehicle(nearest);
  } else {
    hud.setPrompt(null);
  }

  if (input.pressed('KeyF')) {
    state.punchTimer = 0.26;
    combat.playerPunch(G);
  }
  if (input.mousePressed(0) && input.isLocked()) {
    combat.playerShoot(G);
  }
}

function updatePlayerDriving(dt) {
  const v = state.driving;
  const look = input.takeLook();
  if (input.isLocked() && Math.abs(look.dx) > 0) state.camYaw = v.heading;
  const ctl = {
    throttle: (input.down('KeyW') ? 1 : 0) + (input.down('KeyS') ? -1 : 0),
    steer: (input.down('KeyA') ? -1 : 0) + (input.down('KeyD') ? 1 : 0),
    handbrake: input.down('Space'),
  };
  if (state.autoDrive) {
    const target = state.autoDrive.speed;
    ctl.throttle = v.speed < target ? 0.85 : -0.25;
    let dh = state.autoDrive.heading - v.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    ctl.steer = THREE.MathUtils.clamp(dh * 1.7 + (v.group.position.x + 224) * -0.012, -1, 1);
    ctl.handbrake = false;
  }
  const prevX = v.group.position.x;
  const prevZ = v.group.position.z;
  const impact = updateVehicleDrive(v, ctl, dt, colliders);
  if (!carAllowed(v.group.position.x, v.group.position.z)) {
    v.group.position.x = prevX;
    v.group.position.z = prevZ;
    v.speed = -v.speed * 0.25;
  }
  if (impact > 8) {
    sound.crash(Math.min(1, impact / 30));
    state.shake = Math.min(0.5, impact / 60);
    const f = { x: Math.sin(v.heading), z: Math.cos(v.heading) };
    combat.spawnSparks(v.group.position.x + f.x * 2.2, 0.8, v.group.position.z + f.z * 2.2, 10, 0xffd28a);
    if (impact > 16) G.damagePlayer((impact - 12) * 0.5);
  }
  if (input.pressed('KeyE') && Math.abs(v.speed) < 13) exitVehicle();
  hud.setPrompt(null);
}

function updateCamera(dt) {
  let targetPos;
  let lookPos;
  if (state.mode === 'menu') {
    const t = state.elapsed * 0.05;
    targetPos = new THREE.Vector3(PLACES.tower.x + Math.sin(t) * 95, 34 + Math.sin(state.elapsed * 0.13) * 6, PLACES.tower.z + Math.cos(t) * 95);
    lookPos = new THREE.Vector3(PLACES.tower.x, 26, PLACES.tower.z);
    camera.position.lerp(targetPos, 1 - Math.pow(0.01, dt));
    camera.lookAt(lookPos);
    camera.fov = THREE.MathUtils.lerp(camera.fov, 58, dt * 2);
    camera.updateProjectionMatrix();
    return;
  }
  if (state.driving) {
    const v = state.driving;
    const p = v.group.position;
    const back = { x: Math.sin(v.heading), z: Math.cos(v.heading) };
    const speedK = THREE.MathUtils.clamp(Math.abs(v.speed) / v.spec.topSpeed, 0, 1);
    if (state.camMode === 'front') {
      // Movie-poster framing: camera ahead of the car, looking back at it —
      // the car, its pursuers and the city behind them all in one frame.
      const right = { x: Math.cos(v.heading), z: -Math.sin(v.heading) };
      targetPos = new THREE.Vector3(
        p.x + back.x * 11.5 + right.x * 3.6,
        p.y + 2.9,
        p.z + back.z * 11.5 + right.z * 3.6,
      );
      lookPos = new THREE.Vector3(p.x - back.x * 4, p.y + 1.3, p.z - back.z * 4);
      camera.position.lerp(targetPos, 1 - Math.pow(0.000001, dt));
      camera.lookAt(lookPos);
      return;
    }
    const dist = 9.6 + speedK * 2.4;
    targetPos = new THREE.Vector3(p.x - back.x * dist, p.y + 3.4 + speedK * 0.5, p.z - back.z * dist);
    lookPos = new THREE.Vector3(p.x + back.x * 9, p.y + 1.5, p.z + back.z * 9);
    camera.position.lerp(targetPos, 1 - Math.pow(0.0005, dt));
    const targetFov = 62 + speedK * 11;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 3);
      camera.updateProjectionMatrix();
    }
  } else {
    const p = playerMesh.position;
    const cy = state.camYaw;
    const cp = state.camPitch;
    const horiz = Math.cos(cp) * state.camDist;
    targetPos = new THREE.Vector3(
      p.x - Math.sin(cy) * horiz,
      p.y + 1.6 + Math.sin(cp) * state.camDist,
      p.z - Math.cos(cy) * horiz,
    );
    lookPos = new THREE.Vector3(p.x + Math.sin(cy) * 2, p.y + 1.55, p.z + Math.cos(cy) * 2);
    camera.position.lerp(targetPos, 1 - Math.pow(0.000001, dt));
    if (Math.abs(camera.fov - 62) > 0.1) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, 62, dt * 3);
      camera.updateProjectionMatrix();
    }
  }
  if (state.shake > 0) {
    state.shake = Math.max(0, state.shake - dt * 1.4);
    targetPos.x += (Math.random() - 0.5) * state.shake;
    targetPos.y += (Math.random() - 0.5) * state.shake;
    camera.position.copy(targetPos);
  }
  camera.lookAt(lookPos);
}

const skyDay = new THREE.Color(0xffffff);
const skyDusk = new THREE.Color(0xffb37a);
const skyNight = new THREE.Color(0x1a2440);
const fogDay = new THREE.Color(0xf3cf9e);
const fogNight = new THREE.Color(0x141c30);
const sunWarm = new THREE.Color(0xff9a3c);
const sunNoon = new THREE.Color(0xfff2d8);

function updateDayNight() {
  const h = state.timeHours;
  const t = ((h - 6) / 12) * Math.PI; // 06:00 sunrise → 18:00 sunset
  const elev = Math.sin(t);
  const p = playerPosVec();
  sun.position.set(p.x + Math.cos(t) * 260, Math.max(14, elev * 300), p.z + 130);
  sun.target.position.set(p.x, 0, p.z);
  const dayK = THREE.MathUtils.clamp(elev * 1.7 + 0.25, 0.04, 1);
  sun.intensity = 1.2 * dayK;
  sun.color.copy(sunWarm).lerp(sunNoon, THREE.MathUtils.clamp(elev * 1.6, 0, 1));
  hemi.intensity = 0.34 + dayK * 0.5;
  ambient.intensity = 0.16 + dayK * 0.1;
  const sky = dynamicMats.sky;
  if (sky) {
    if (elev > 0.35) sky.color.copy(skyDay);
    else if (elev > -0.08) sky.color.copy(skyDusk).lerp(skyDay, (elev + 0.08) / 0.43);
    else sky.color.copy(skyNight).lerp(skyDusk, Math.max(0, (elev + 0.45) / 0.37));
  }
  scene.fog.color.copy(fogNight).lerp(fogDay, dayK);
  scene.fog.far = 480 + dayK * 460;
  if (dynamicMats.lampHead) dynamicMats.lampHead.color.setHex(elev > 0.12 ? 0x8a8f96 : 0xffd9a0);
  if (dynamicMats.yachtLights) {
    const pulse = elev <= 0.12 ? (Math.sin(state.elapsed * 2.4) > 0 ? 0xff3b30 : 0x661512) : 0xff3b30;
    dynamicMats.yachtLights.color.setHex(pulse);
  }
}

// ---------------------------------------------------------------- boot
if (shotNumber) {
  document.getElementById('start-screen').style.display = 'none';
  hud.show();
  applyShot(G, shotNumber);
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const playing = state.mode === 'playing';

  if (input.pressed('KeyP') && (playing || state.mode === 'paused')) togglePause();

  if (playing) {
    state.elapsed += dt;
    if (!state.timeFrozen) state.timeHours = (state.timeHours + dt * 0.055) % 24;

    // Dialogue takes the talk/shoot inputs while it is up.
    if (hud.dialogActive()) {
      if (input.pressed('Space') || input.mousePressed(0)) {
        hud.advanceDialog();
        sound.ui();
      }
    } else if (state.driving) {
      updatePlayerDriving(dt);
    } else {
      updatePlayerOnFoot(dt);
    }

    // World systems.
    const groundVehicleY = (v) => {
      const p = v.group.position;
      if (p.x > 250 && p.x < 445 && p.z > 110 && p.z < 130) p.y = 1.28;       // bridge deck
      else if (p.x > 250 && p.x < 312 && p.z > -66 && p.z < -54) p.y = 0.62;  // pier
      else p.y = 0;
    };
    for (const v of allVehicles) {
      if (v !== state.driving && v.driver !== 'traffic' && v.driver !== 'police') updateVehicleFree(v, dt, colliders);
      groundVehicleY(v);
    }
    for (const u of police.units) groundVehicleY(u.v);
    const pPos = playerPosVec();
    traffic.update(dt, pPos, colliders);
    pedestrians.update(dt);
    // Screenshot-setup pedestrians patrol their fixed segments.
    for (const p of shotPeds) {
      const len = Math.hypot(p.bx - p.ax, p.bz - p.az) || 1;
      p.t += (p.dir * p.speed * dt) / len;
      if (p.t > 1) { p.t = 1; p.dir = -1; }
      if (p.t < 0) { p.t = 0; p.dir = 1; }
      const px = p.ax + (p.bx - p.ax) * p.t;
      const pz = p.az + (p.bz - p.az) * p.t;
      p.mesh.position.x = px;
      p.mesh.position.z = pz;
      p.mesh.rotation.y = Math.atan2((p.bx - p.ax) * p.dir, (p.bz - p.az) * p.dir);
      animatePerson(p.mesh, p.speed, dt);
      p.mesh.position.y += groundY(px, pz);
    }
    // Car-vs-car bumps (player car included).
    const movers = [...allVehicles];
    for (const u of police.units) movers.push(u.v);
    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const hit = collideVehicles(movers[i], movers[j]);
        if (hit > 7) {
          sound.crash(0.5);
          if (movers[i] === state.driving || movers[j] === state.driving) {
            state.shake = Math.min(0.4, hit / 55);
            const other = movers[i] === state.driving ? movers[j] : movers[i];
            if (other.driver === 'police') commitCrime('crash-police');
          }
        }
      }
    }
    // Fast cars scare pedestrians; running one down is a crime.
    state.scareTimer -= dt;
    if (state.driving && Math.abs(state.driving.speed) > 9 && state.scareTimer <= 0) {
      pedestrians.scare(pPos.x, pPos.z, 11);
      state.scareTimer = 0.45;
    }
    if (state.driving && Math.abs(state.driving.speed) > 6) {
      for (const ped of pedestrians.list) {
        if (ped.mesh.position.distanceTo(pPos) < 1.7 && !ped.knocked) {
          ped.knocked = true;
          ped.panic = 3;
          ped.mesh.rotation.x = -Math.PI / 2;
          setTimeout(() => { ped.mesh.rotation.x = 0; ped.knocked = false; }, 2400);
          commitCrime('hitped');
          hud.toast('HEAT RISING', 'You ran someone down — the SCPD is coming');
        }
      }
    }

    const policeInfo = police.update(dt, G);
    combat.update(dt, G);
    missions.update(dt);

    // Wanted decay while out of sight.
    const wanted = wantedLevel();
    if (wanted > 0) {
      const nearPolice = police.units.some((u) => u.v.group.position.distanceTo(pPos) < 62);
      if (nearPolice) state.unseenTimer = 0;
      else {
        state.unseenTimer += dt;
        if (state.unseenTimer > 5) state.heat = Math.max(0, state.heat - dt * 0.11);
      }
    }
    // Health regen after a quiet spell.
    if (state.health > 0 && state.health < 100 && state.elapsed - state.lastHurtAt > 6) {
      state.health = Math.min(100, state.health + dt * 2.4);
    }
    hud.update(G);

    // Objective beacon.
    const obj = missions.objective();
    if (obj && obj.marker) {
      beacon.visible = true;
      beaconRing.visible = true;
      beacon.position.set(obj.marker.x, 16, obj.marker.z);
      beaconRing.position.set(obj.marker.x, groundY(obj.marker.x, obj.marker.z) + 0.35, obj.marker.z);
      beacon.material.opacity = 0.17 + Math.sin(state.elapsed * 3.2) * 0.05;
    } else {
      beacon.visible = false;
      beaconRing.visible = false;
    }

    // Audio beds.
    sound.ensure();
    if (state.driving) sound.setEngine(Math.abs(state.driving.speed) / state.driving.spec.topSpeed, true);
    else sound.setEngine(0, false);
    sound.setSiren(wanted > 0 ? policeInfo.nearestSiren : 0);
    sound.updateMusic(dt, true);
  } else if (state.mode === 'menu') {
    state.elapsed += dt;
    pedestrians.update(dt);
    traffic.update(dt, playerMesh.position, colliders);
    if (!state.timeFrozen) state.timeHours = (state.timeHours + dt * 0.02) % 24;
  }

  updateDayNight();
  updateCamera(dt);
  renderer.render(scene, camera);
  input.endFrame();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

frame();
