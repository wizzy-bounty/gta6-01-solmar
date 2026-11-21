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
    G.setTimeOfDay(17.35);
    G.setMission(2, 1); // "Drop the package at Old Town Square"
    const car = G.placePlayerInCar('sport', 0xd92323, -224, -96, 0, 21);
    G.placePolice(-226.5, -110, 0);
    G.placePolice(-221.5, -121, 0);
    G.setWanted(3);
    G.setAutoDrive(21);
    G.setCamMode('front');
    return car;
  }
  if (n === 2) {
    // Stealing a Vantara GT under the Neon Strip lights, dusk.
    G.setTimeOfDay(19.6);
    G.setMission(1, 0); // "Steal the magenta Vantara GT"
    G.placeCar('sport', 0xff2fb3, -168, 188, 0);
    G.placePlayer(-166.2, 189.6, -2.25);
    G.setWanted(0);
    return null;
  }
  if (n === 3) {
    // The Solmar Job: on the pier, the casino yacht ahead, Mara on the phone.
    G.setTimeOfDay(18.7);
    G.setMission(5, 1); // "Grab the take from the casino deck"
    G.placePlayer(298, -60, Math.PI / 2);
    G.showDialog([
      ['Mara Voss (phone)', 'Vault cage is full tonight, Vex. Walk in like a guest — walk out a legend.'],
    ]);
    G.setWanted(0);
    return null;
  }
  // Shot 4 — a morning stroll on the Marina promenade, tower ahead, sea behind.
  G.setTimeOfDay(10.4);
  G.setMission(0, 0); // "Meet Mara at the Velvet Palm club"
  G.placePlayer(-214, -148, 2.77);
  G.setWanted(0);
  return null;
}
