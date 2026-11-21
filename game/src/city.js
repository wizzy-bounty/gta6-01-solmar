// city.js — Solmar City: a procedural sun-soaked coastal city for SOLMAR HEAT.
// A 9x9 street grid cut into four districts (Marina, Old Town, Neon Strip,
// Docks), with landmarks the missions use: the Marina Tower, the Velvet Palm
// club, an Old Town garage, dock cranes, a yacht casino on the water, and a
// bridge to the hideout island. Everything is generated from a seeded RNG so
// the city — and the screenshots — are identical on every load.

import * as THREE from 'three';

/** Deterministic RNG (mulberry32) so the city never changes between runs. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STREET_POS = [-224, -168, -112, -56, 0, 56, 112, 168, 224];
export const ROAD_WIDTH = 13;
export const BLOCK_PITCH = 56;
export const CITY_HALF = 252;      // edge of the built grid
export const LAND_HALF = 312;      // edge of the island the city sits on
export const WATER_Y = -0.55;

/** Named places the story and HUD refer to. */
export const PLACES = {
  spawn:      { x: -186, z: -148, label: 'Marina Promenade' },
  tower:      { x: -196, z: -196, label: 'Marina Tower' },
  club:       { x: -148, z: 172,  label: 'Velvet Palm Club' },
  garage:     { x: 172,  z: -148, label: 'Old Town Garage' },
  docks:      { x: 186,  z: 196,  label: 'Solmar Docks' },
  oldtown:    { x: 64,   z: -196, label: 'Old Town Square' },
  marinaCars: { x: -196, z: -84,  label: 'Marina Row' },
  yachtPier:  { x: 288,  z: -60,  label: 'Pier 9' },
  yachtDeck:  { x: 336,  z: -60,  label: 'Yacht Casino “Solmar Star”' },
  bridge:     { x: 292,  z: 120,  label: 'Harbor Bridge' },
  hideout:    { x: 446,  z: 120,  label: 'Riko’s Hideout' },
  hospital:   { x: -64,  z: -238, label: 'Solmar General' },
};

const DISTRICT_STYLE = {
  marina:  { base: '#dfe9f2', trim: '#3f7fbf', roof: '#5b7d99', minH: 20, maxH: 54, lit: '#ffe9a8' },
  oldtown: { base: '#c98d4e', trim: '#8a5a2b', roof: '#7a4632', minH: 10, maxH: 27, lit: '#ffd9a0' },
  neon:    { base: '#4b3a6e', trim: '#c44fd6', roof: '#2c2145', minH: 15, maxH: 42, lit: '#9be7ff' },
  docks:   { base: '#8d8578', trim: '#5d564a', roof: '#6e6257', minH: 8,  maxH: 15, lit: '#ffe2b0' },
};

export function districtOf(x, z) {
  if (x < 0 && z < 0) return 'marina';
  if (x >= 0 && z < 0) return 'oldtown';
  if (x < 0 && z >= 0) return 'neon';
  return 'docks';
}

/** Block centres (the squares between streets) for buildings and sidewalks. */
export const BLOCK_CENTERS = [];
for (let i = 0; i < STREET_POS.length - 1; i++) {
  for (let j = 0; j < STREET_POS.length - 1; j++) {
    BLOCK_CENTERS.push({
      x: (STREET_POS[i] + STREET_POS[i + 1]) / 2,
      z: (STREET_POS[j] + STREET_POS[j + 1]) / 2,
    });
  }
}

export function isOnRoad(x, z) {
  const near = (v) => STREET_POS.some((s) => Math.abs(v - s) <= ROAD_WIDTH / 2 + 0.5);
  return near(x) || near(z);
}

/** Materials whose look changes between day and night; main.js drives them. */
export const dynamicMats = {
  lampHead: null,
  neonSigns: [],
  yachtLights: null,
  sky: null,
};

const matCache = new Map();
function lambert(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}
function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A building facade texture drawn on a canvas: base colour, window grid, trim. */
function facadeTexture(style, rng, cols, rows) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = style.base;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(0, 0, 128, 10);
  g.fillStyle = style.trim;
  g.fillRect(0, 246, 128, 10);
  const cw = 128 / cols;
  const ch = 256 / rows;
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const lit = rng() < 0.34;
      g.fillStyle = lit ? style.lit : 'rgba(18,26,44,0.85)';
      g.fillRect(x * cw + cw * 0.22, y * ch + ch * 0.24, cw * 0.56, ch * 0.5);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A readable sign texture (club, casino, garage) drawn on a canvas. */
export function signTexture(text, fg, bg, sub = '') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.font = '900 52px Arial, sans-serif';
  g.fillText(text, 256, sub ? 62 : 82);
  if (sub) {
    g.font = '700 26px Arial, sans-serif';
    g.fillText(sub, 256, 102);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2f3237';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 260; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  g.fillStyle = '#e8e4da';
  g.fillRect(2, 0, 3, 128);
  g.fillRect(123, 0, 3, 128);
  g.fillStyle = '#ffd94d';
  g.fillRect(62, 8, 4, 44);
  g.fillRect(62, 76, 4, 44);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildGround(scene) {
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 2600),
    new THREE.MeshPhongMaterial({ color: 0x11607f, shininess: 90, specular: 0x99d4e8 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  scene.add(water);

  const land = box(LAND_HALF * 2, 1.2, LAND_HALF * 2, lambert(0xb9a888));
  land.position.y = -0.62;
  land.castShadow = false;
  scene.add(land);

  // City slab the blocks sit on, sand promenades around the edge.
  const slab = box(CITY_HALF * 2 + 26, 0.5, CITY_HALF * 2 + 26, lambert(0x8f959e));
  slab.position.y = -0.24;
  slab.castShadow = false;
  scene.add(slab);
}

function buildRoads(scene) {
  const tex = asphaltTexture();
  const len = CITY_HALF * 2 + 30;
  for (const s of STREET_POS) {
    for (const along of ['x', 'z']) {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(1, len / 26);
      const mat = new THREE.MeshLambertMaterial({ map: t });
      const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, len), mat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = along === 'x' ? Math.PI / 2 : 0;
      road.position.set(along === 'x' ? 0 : s, 0.02, along === 'x' ? s : 0);
      road.receiveShadow = true;
      scene.add(road);
    }
  }
  // Pier and bridge decks share the plain asphalt look.
  const deckMat = lambert(0x3a3e45);
  const pier = box(64, 1, 10, deckMat);
  pier.position.set(284, 0.1, PLACES.yachtPier.z);
  scene.add(pier);
  const bridge = box(150, 1.2, 11, deckMat);
  bridge.position.set(362, 0.65, PLACES.bridge.z);
  scene.add(bridge);
  for (const bx of [318, 362, 406]) {
    const pillar = box(4, 4, 9, lambert(0x6d7278));
    pillar.position.set(bx, -1.4, PLACES.bridge.z);
    scene.add(pillar);
  }
  // Hideout island.
  const island = box(150, 1.2, 150, lambert(0xa79a7d));
  island.position.set(452, -0.55, PLACES.bridge.z);
  island.castShadow = false;
  scene.add(island);
}

function buildBlocks(scene, rng, colliders) {
  const facadeMats = {};
  for (const [name, style] of Object.entries(DISTRICT_STYLE)) {
    facadeMats[name] = [0, 1, 2].map(() => {
      const tex = facadeTexture(style, rng, 6, 12);
      return new THREE.MeshLambertMaterial({ map: tex });
    });
    facadeMats[name].roof = lambert(style.roof);
  }
  const slabMat = lambert(0xa7adb5);

  for (const block of BLOCK_CENTERS) {
    const district = districtOf(block.x, block.z);
    const style = DISTRICT_STYLE[district];
    // Sidewalk slab for the whole block.
    const slab = box(BLOCK_PITCH - ROAD_WIDTH, 0.22, BLOCK_PITCH - ROAD_WIDTH, slabMat);
    slab.position.set(block.x, 0.11, block.z);
    slab.castShadow = false;
    scene.add(slab);

    const roll = rng();
    if (district === 'docks' && roll < 0.45) { buildDockYard(scene, rng, block); continue; }
    if (roll < 0.10) continue; // an open plaza / car park block

    const spots = [
      { dx: -10.5, dz: -10.5 }, { dx: 10.5, dz: -10.5 },
      { dx: -10.5, dz: 10.5 }, { dx: 10.5, dz: 10.5 },
    ];
    const count = district === 'docks' ? 1 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const s = spots[i];
      const w = district === 'docks' ? 26 + rng() * 8 : 13 + rng() * 6;
      const d = district === 'docks' ? 20 + rng() * 8 : 13 + rng() * 6;
      const h = style.minH + rng() * (style.maxH - style.minH);
      const mats = facadeMats[district];
      const side = mats[Math.floor(rng() * 3)];
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        [side, side, mats.roof, mats.roof, side, side],
      );
      b.position.set(block.x + s.dx, h / 2 + 0.2, block.z + s.dz);
      b.castShadow = true;
      b.receiveShadow = true;
      scene.add(b);
      colliders.push({ minX: b.position.x - w / 2, maxX: b.position.x + w / 2, minZ: b.position.z - d / 2, maxZ: b.position.z + d / 2 });
      // Neon trim on some Neon Strip towers.
      if (district === 'neon' && rng() < 0.55) {
        const trimMat = new THREE.MeshBasicMaterial({ color: [0xff4fd8, 0x37e0ff, 0xffa62b][Math.floor(rng() * 3)] });
        dynamicMats.neonSigns.push(trimMat);
        const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.5, d + 0.35), trimMat);
        trim.position.set(b.position.x, h * (0.55 + rng() * 0.35), b.position.z);
        scene.add(trim);
      }
    }
  }
}

function buildDockYard(scene, rng, block) {
  const colors = [0xc94f36, 0x2e7fb8, 0x3f9e4d, 0xd9a441, 0x7a4fb0, 0x8892a0];
  const stacks = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < stacks; i++) {
    const x = block.x - 14 + rng() * 28;
    const z = block.z - 12 + rng() * 24;
    const levels = 1 + Math.floor(rng() * 3);
    for (let l = 0; l < levels; l++) {
      const cont = box(11, 2.7, 4.6, lambert(colors[Math.floor(rng() * colors.length)]));
      cont.position.set(x, 1.55 + l * 2.75, z);
      cont.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
      scene.add(cont);
    }
  }
}

function buildLandmarks(scene, colliders) {
  const addCollider = (x, z, w, d) => colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

  // Marina Tower — a tapered landmark with a red beacon.
  const towerMat = lambert(0xe8eef4);
  const towerTrim = lambert(0x3f7fbf);
  let tw = 20;
  let ty = 0;
  for (const h of [30, 24, 18, 12]) {
    const seg = box(tw, h, tw, towerMat);
    seg.position.set(PLACES.tower.x, ty + h / 2, PLACES.tower.z);
    scene.add(seg);
    const band = box(tw + 0.6, 1.2, tw + 0.6, towerTrim);
    band.position.set(PLACES.tower.x, ty + h - 0.6, PLACES.tower.z);
    scene.add(band);
    ty += h;
    tw -= 3.4;
  }
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), beaconMat);
  beacon.position.set(PLACES.tower.x, ty + 2.4, PLACES.tower.z);
  scene.add(beacon);
  dynamicMats.yachtLights = beaconMat;
  addCollider(PLACES.tower.x, PLACES.tower.z, 21, 21);

  // Velvet Palm club — dark box, pink sign, glowing doorway.
  const club = box(30, 13, 20, lambert(0x2c2145));
  club.position.set(PLACES.club.x, 6.7, PLACES.club.z);
  scene.add(club);
  addCollider(PLACES.club.x, PLACES.club.z, 30, 20);
  const clubSign = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 6.5),
    new THREE.MeshBasicMaterial({ map: signTexture('VELVET PALM', '#ff7ae0', '#1c1030', 'CLUB • SOLMAR STRIP') }),
  );
  clubSign.position.set(PLACES.club.x, 10.6, PLACES.club.z - 10.15);
  clubSign.rotation.y = Math.PI;
  scene.add(clubSign);
  dynamicMats.neonSigns.push(clubSign.material);

  // Old Town garage — the delivery point, with a wide door and sign.
  const garage = box(28, 9, 20, lambert(0xb9b0a0));
  garage.position.set(PLACES.garage.x, 4.7, PLACES.garage.z);
  scene.add(garage);
  addCollider(PLACES.garage.x, PLACES.garage.z, 28, 20);
  const door = box(12, 5.6, 0.4, lambert(0x4c5560));
  door.position.set(PLACES.garage.x, 2.9, PLACES.garage.z + 10.1);
  scene.add(door);
  const garageSign = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 5),
    new THREE.MeshBasicMaterial({ map: signTexture('SOLMAR AUTO', '#ffd76a', '#26303c', 'REPAIRS • STORAGE') }),
  );
  garageSign.position.set(PLACES.garage.x, 7.6, PLACES.garage.z + 10.15);
  scene.add(garageSign);

  // Dock cranes.
  for (const cx of [150, 205, 245]) {
    const legMat = lambert(0xc7742c);
    const leg = box(2.2, 26, 2.2, legMat);
    leg.position.set(cx, 13, 236);
    scene.add(leg);
    const jib = box(30, 2, 2, legMat);
    jib.position.set(cx - 6, 25.4, 236);
    scene.add(jib);
    const cable = box(0.3, 12, 0.3, lambert(0x333333));
    cable.position.set(cx - 18, 19, 236);
    scene.add(cable);
    addCollider(cx, 236, 3.4, 3.4);
  }

  buildYacht(scene);
  buildHideout(scene, addCollider);
}

function buildYacht(scene) {
  const { x, z } = PLACES.yachtDeck;
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const hullMat = lambert(0xf2f4f6);
  const hull = box(46, 5, 13, hullMat);
  hull.position.set(x, 0.6, z);
  hull.castShadow = false;
  scene.add(hull);
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 5, 3, 1), hullMat);
  bow.position.set(x + 26, 0.6, z);
  bow.rotation.y = Math.PI / 2;
  scene.add(bow);
  // Dark waterline band — the hull sits IN the water, not on it.
  const waterline = box(46.2, 1.4, 13.2, lambert(0x27313c));
  waterline.position.set(x, -1.3, z);
  waterline.castShadow = false;
  scene.add(waterline);
  // Gold trim stripe along the hull.
  const stripe = box(46.4, 1.1, 13.4, lambert(0xc9a227));
  stripe.position.set(x, 2.2, z);
  scene.add(stripe);
  // Warm portholes in a row along both hull sides.
  for (let i = 0; i < 9; i++) {
    for (const s of [1, -1]) {
      const port = box(1.1, 0.8, 0.14, glowMat);
      port.position.set(x - 18 + i * 4.5, 0.9, z + s * 6.55);
      port.castShadow = false;
      scene.add(port);
    }
  }
  // Gold bulwark rail around the open main deck.
  const railMat = lambert(0xd8b84a);
  for (const s of [1, -1]) {
    const rail = box(45, 0.16, 0.16, railMat);
    rail.position.set(x, 3.9, z + s * 6.3);
    rail.castShadow = false;
    scene.add(rail);
  }
  const sternRail = box(0.16, 0.16, 12.4, railMat);
  sternRail.position.set(x - 22.9, 3.9, z);
  sternRail.castShadow = false;
  scene.add(sternRail);
  // The yacht's name across the stern, facing the pier and the city.
  const sternSign = new THREE.Mesh(
    new THREE.PlaneGeometry(15, 3.4),
    new THREE.MeshBasicMaterial({ map: signTexture('SOLMAR STAR', '#ffd76a', '#14273d', 'CASINO • YACHT CLUB') }),
  );
  sternSign.position.set(x - 23.15, 1.6, z);
  sternSign.rotation.y = -Math.PI / 2;
  scene.add(sternSign);

  // Tiered superstructure: white decks with dark glass bands and warm,
  // lit windows on the sides — and a casino entrance on the bow face.
  const deck1 = box(34, 3.4, 10.5, lambert(0xffffff));
  deck1.position.set(x - 2, 4.8, z);
  scene.add(deck1);
  const deck2 = box(22, 3, 8.4, lambert(0xe8ecf0));
  deck2.position.set(x - 4, 8, z);
  scene.add(deck2);
  const glassMat = lambert(0x20344a);
  for (const s of [1, -1]) {
    const band1 = box(30, 1.1, 0.14, glassMat);
    band1.position.set(x - 2, 5.3, z + s * 5.32);
    band1.castShadow = false;
    scene.add(band1);
    const band2 = box(19, 1, 0.14, glassMat);
    band2.position.set(x - 4, 8.4, z + s * 4.27);
    band2.castShadow = false;
    scene.add(band2);
  }
  const winRow = (count, start, step, y, fixed, alongZ) => {
    for (let i = 0; i < count; i++) {
      const win = box(1.3, 0.7, 0.1, glowMat);
      if (alongZ) win.position.set(fixed, y, start + i * step);
      else win.position.set(start + i * step, y, fixed);
      win.castShadow = false;
      scene.add(win);
    }
  };
  winRow(9, x - 15, 3.4, 5.3, z + 5.42, false);
  winRow(9, x - 15, 3.4, 5.3, z - 5.42, false);
  winRow(6, x - 13, 3.4, 8.4, z + 4.34, false);
  winRow(6, x - 13, 3.4, 8.4, z - 4.34, false);
  // Casino entrance on deck 1's bow-facing side: doors, sconces, sign.
  const door = box(0.3, 2.4, 2.4, lambert(0x14273d));
  door.position.set(x + 15.1, 4.25, z);
  scene.add(door);
  for (const s of [1, -1]) {
    const sconce = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glowMat);
    sconce.position.set(x + 15.2, 5.1, z + s * 2.1);
    scene.add(sconce);
  }
  const casinoSign = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 1.2),
    new THREE.MeshBasicMaterial({ map: signTexture('CASINO', '#ffd76a', '#14273d') }),
  );
  casinoSign.position.set(x + 15.22, 5.95, z);
  casinoSign.rotation.y = Math.PI / 2;
  scene.add(casinoSign);
  // Lit windows flanking the casino entrance on the same bow face.
  for (const wz of [z - 4.4, z - 2.9, z + 2.9, z + 4.4]) {
    const win = box(1.1, 0.7, 0.1, glowMat);
    win.position.set(x + 15.12, 5.3, wz);
    win.rotation.y = Math.PI / 2;
    win.castShadow = false;
    scene.add(win);
  }
  // Radar arch over the top deck.
  const archMat = lambert(0xdde3e8);
  for (const s of [1, -1]) {
    const post = box(0.35, 2.6, 0.35, archMat);
    post.position.set(x - 4, 10.8, z + s * 3.2);
    scene.add(post);
  }
  const archBar = box(0.4, 0.4, 6.8, archMat);
  archBar.position.set(x - 4, 12.1, z);
  scene.add(archBar);
  const radar = box(2.6, 0.35, 0.7, lambert(0xf4f6f8));
  radar.position.set(x - 4, 12.55, z);
  scene.add(radar);

  const mast = box(0.5, 10, 0.5, lambert(0x99a3ad));
  mast.position.set(x + 6, 13, z);
  scene.add(mast);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 6),
    new THREE.MeshBasicMaterial({ map: signTexture('SOLMAR STAR', '#ffd76a', '#14273d', 'CASINO • YACHT CLUB') }),
  );
  sign.position.set(x - 2, 5.2, z + 5.4);
  scene.add(sign);
  const sign2 = sign.clone();
  sign2.position.z = z - 5.4;
  sign2.rotation.y = Math.PI;
  scene.add(sign2);
  // String lights sagging from the masthead to the bow and the stern.
  const stringLights = (x0, y0, x1, y1) => {
    const n = 11;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), glowMat);
      bulb.position.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * 1.1, z);
      scene.add(bulb);
    }
  };
  stringLights(x + 6, 17.4, x + 23, 4.2);
  stringLights(x + 6, 17.4, x - 21, 4.2);
  // Warm deck lights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffca7a });
  for (let i = 0; i < 7; i++) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), lightMat);
    bulb.position.set(x - 18 + i * 6.4, 3.6, z + 6.9);
    scene.add(bulb);
    const bulb2 = bulb.clone();
    bulb2.position.z = z - 6.9;
    scene.add(bulb2);
  }
}

function buildHideout(scene, addCollider) {
  const { x, z } = PLACES.hideout;
  const house = box(14, 6, 11, lambert(0xd8cfc0));
  house.position.set(x, 3.4, z - 16);
  scene.add(house);
  const roof = box(15.4, 1, 12.4, lambert(0x9c4a34));
  roof.position.set(x, 6.9, z - 16);
  scene.add(roof);
  addCollider(x, z - 16, 14, 11);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 2.8),
    new THREE.MeshBasicMaterial({ map: signTexture('SAFE HOUSE', '#7dff8a', '#1d2b1d') }),
  );
  sign.position.set(x, 4.6, z - 10.4);
  scene.add(sign);
}

function buildProps(scene, rng, colliders) {
  // Palm trees along the Marina waterfront and scattered in the west districts.
  const trunkMat = lambert(0x8a6a48);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f9e4f, side: THREE.DoubleSide });
  const palmAt = (x, z) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 7.4, 6), trunkMat);
    trunk.position.y = 3.7;
    trunk.rotation.z = (rng() - 0.5) * 0.16;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.1), frondMat);
      frond.position.y = 7.4;
      frond.rotation.y = (i / 6) * Math.PI * 2;
      frond.rotation.z = -0.55;
      frond.translateX(2);
      g.add(frond);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  };
  for (let z = -250; z <= 60; z += 24) palmAt(-292 + rng() * 6, z);
  for (let i = 0; i < 26; i++) {
    const bx = BLOCK_CENTERS[Math.floor(rng() * BLOCK_CENTERS.length)];
    if (districtOf(bx.x, bx.z) === 'docks') continue;
    palmAt(bx.x + (rng() - 0.5) * 30, bx.z + (rng() - 0.5) * 30);
  }

  // Street lamps at intersections.
  const poleMat = lambert(0x3c4148);
  dynamicMats.lampHead = new THREE.MeshBasicMaterial({ color: 0x8a8f96 });
  for (const sx of STREET_POS) {
    for (const sz of STREET_POS) {
      if ((Math.round(sx / 56) + Math.round(sz / 56)) % 2 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.4, 6), poleMat);
      pole.position.set(sx + 8.4, 3.2, sz + 8.4);
      scene.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), dynamicMats.lampHead);
      head.position.set(sx + 8.4, 6.6, sz + 8.4);
      scene.add(head);
    }
  }

  // Pier 9 dressing: lamp posts along both edges of the deck (the deck top
  // sits at y 0.6) and palms flanking the pier root on the beach.
  for (const px of [262, 284, 306]) {
    for (const s of [1, -1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.2, 6), poleMat);
      pole.position.set(px, 3.2, PLACES.yachtPier.z + s * 4.2);
      scene.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6), dynamicMats.lampHead);
      head.position.set(px, 5.9, PLACES.yachtPier.z + s * 4.2);
      scene.add(head);
    }
  }
  palmAt(256, -50);
  palmAt(262, -70.5);
  palmAt(300, -50.5);
}

/** Build the whole city into the scene. Returns colliders + the sky dome material hook. */
export function buildCity(scene, seed = 1987) {
  const rng = makeRng(seed);
  const colliders = [];
  buildGround(scene);
  buildRoads(scene);
  buildBlocks(scene, rng, colliders);
  buildLandmarks(scene, colliders);
  buildProps(scene, rng, colliders);

  // Gradient sky dome (canvas texture; main.js tints it for the time of day).
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2f6fd0');
  grad.addColorStop(0.45, '#7db8e8');
  grad.addColorStop(0.72, '#cfe8f7');
  grad.addColorStop(0.88, '#ffe3b3');
  grad.addColorStop(1, '#ffb37a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  const skyTex = new THREE.CanvasTexture(c);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  dynamicMats.sky = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 14), dynamicMats.sky);
  scene.add(sky);

  return { colliders };
}

/** Resolve a circle (x,z,r) against building AABBs; returns corrected [x, z]. */
export function collideCircle(colliders, x, z, r) {
  for (const c of colliders) {
    if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) {
      const pushLeft = (x + r) - c.minX;
      const pushRight = c.maxX - (x - r);
      const pushNear = (z + r) - c.minZ;
      const pushFar = c.maxZ - (z - r);
      const min = Math.min(pushLeft, pushRight, pushNear, pushFar);
      if (min === pushLeft) x = c.minX - r;
      else if (min === pushRight) x = c.maxX + r;
      else if (min === pushNear) z = c.minZ - r;
      else z = c.maxZ + r;
    }
  }
  return [x, z];
}
