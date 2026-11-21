// shots.js — deterministic screenshot setups for SOLMAR HEAT.
// `?shot=N` arranges the scene (player, cars, police, wanted level, mission,
// time of day) so the four dossier screenshots can be re-taken with the same
// composition every time. The game still runs live around the setup: traffic
// flows, pedestrians walk, police lights flash.

export function readShotNumber() {
  const raw = new URLSearchParams(window.location.search).get('shot');
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n >= 1 && n <= 4 ? n : 0;
}

export function applyShot(G, n) {
  if (n === 1) {
    // COVER — a three-star chase down the Marina waterfront boulevard.
    // Parked cars line both curbs behind the chase, so the front camera's
    // frame is full of street life: kerbside metal, cones, billboards.
    G.setTimeOfDay(17.35);
    G.setMission(2, 1); // "Drop the package at Old Town Square"
    const car = G.placePlayerInCar('sport', 0xd92323, -224, -96, 0, 21);
    G.placePolice(-226.5, -110, 0);
    G.placePolice(-221.5, -121, 0);
    G.placeCar('sedan', 0x8a8f96, -232.1, -118, 0);
    G.placeCar('hatch', 0x3fa7d6, -232.1, -158, 0);
    G.placeCar('taxi', 0xf7b731, -215.9, -140, Math.PI);
    G.placeCar('sedan', 0x2e4a3f, -215.9, -176, Math.PI);
    G.setWanted(3);
    G.setAutoDrive(21);
    G.setCamMode('front');
    return car;
  }
  if (n === 2) {
    // Stealing a Vantara GT under the Neon Strip lights, dusk. A witness
    // strolls the west sidewalk and two cars park along the street, so the
    // theft plays in a lived-in street, not an empty one.
    G.setTimeOfDay(19.6);
    G.setMission(1, 0); // "Steal the magenta Vantara GT"
    G.placeCar('sport', 0xff2fb3, -168, 188, 0);
    G.placeCar('sedan', 0x546e7a, -159.9, 170, Math.PI);
    G.placeCar('hatch', 0xe0b341, -176.1, 206, 0);
    G.placePedestrian(-175.3, 182, -175.3, 198, { skin: 0x8a5a3b, shirt: 0xe67e22, pants: 0x212121, hair: 0x191008 });
    G.placePlayer(-166.2, 189.6, -2.25);
    G.setWanted(0);
    return null;
  }
  if (n === 3) {
    // The Solmar Job: aboard the casino yacht at golden hour — the casino
    // entrance, tiered decks and mast in front of Riko, Pier 9 with a parked
    // sedan and the Solmar skyline behind him, Mara on the phone.
    G.setTimeOfDay(17.9);
    G.setMission(5, 1); // "Grab the take from the casino deck"
    G.placeCar('sedan', 0x3f7fbf, 275, -60, Math.PI / 2);
    G.placePlayer(352, -55.5, -1.71);
    G.showDialog([
      ['Mara Voss (phone)', 'Vault cage is full tonight, Vex. Walk in like a guest — walk out a legend.'],
    ]);
    G.setWanted(0);
    return null;
  }
  // Shot 4 — a morning stroll up the Marina boulevard: Riko walks the
  // avenue north toward the Marina Tower, the sea promenade on his left,
  // citizens strolling, cars parked along both curbs.
  G.setTimeOfDay(10.4);
  G.setMission(0, 0); // "Meet Mara at the Velvet Palm club"
  G.placePedestrian(-233, -146, -233, -142.5, { skin: 0xc68863, shirt: 0xe74c3c, pants: 0x2c3e50, hair: 0x2e1a0e });
  G.placePedestrian(-231.5, -138, -231.5, -134.5, { skin: 0xf2c49b, shirt: 0x2ecc71, pants: 0x212121, hair: 0xc9a86a });
  G.placePedestrian(-215, -160.5, -190, -160.5, { skin: 0x8a5a3b, shirt: 0xf39c12, pants: 0x34495e, cap: 0x14273d });
  G.placePedestrian(-186, -176.7, -206, -176.7, { skin: 0x6e4530, shirt: 0x3498db, pants: 0x5d4037, hair: 0x191008 });
  G.placeCar('hatch', 0xd94f30, -232.1, -108, 0);
  G.placeCar('taxi', 0xf7b731, -215.9, -104, Math.PI);
  G.placeCar('sedan', 0x7a4fb0, -188, -172.2, -Math.PI / 2);
  G.placePlayer(-228, -124, 3.02);
  G.setWanted(0);
  return null;
}
