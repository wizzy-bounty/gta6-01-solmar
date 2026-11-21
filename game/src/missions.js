// missions.js — "The Solmar Job": a six-mission story chain for SOLMAR HEAT.
// Riko "Vex" Marlowe, fresh out of prison, is pulled back into Solmar City's
// underworld by fixer Mara Voss: meet her, steal a car, run a package, collect
// a debt, beat the bridge cameras, and finally rob the yacht casino and escape
// to the hideout. Each mission is data: intro dialogue, stages, payout.

import { PLACES } from './city.js';

export const MISSIONS = [
  {
    id: 'fresh-out',
    title: 'Fresh Out',
    payout: 250,
    intro: [
      ['Mara Voss (phone)', 'Riko? It’s Mara. Heard they finally let you out of that cage.'],
      ['Riko “Vex” Marlowe', 'Two years, Mara. I told myself I was done driving for people like you.'],
      ['Mara Voss (phone)', 'And yet you answered. Come to the Velvet Palm on the Strip. One drink. One job. Then decide.'],
    ],
    stages: [
      { type: 'goto', at: 'club', radius: 9, objective: 'Meet Mara at the Velvet Palm club', sub: 'Neon Strip, south-west Solmar' },
      {
        type: 'dialog',
        lines: [
          ['Mara Voss', 'There he is. The best wheelman Solmar ever locked up.'],
          ['Riko “Vex” Marlowe', 'Was. Past tense. Talk fast, Mara.'],
          ['Mara Voss', 'A crew is forming, Vex. Small jobs first. Big one at the end — the Solmar Star casino yacht.'],
          ['Riko “Vex” Marlowe', '...One job. Then we talk about the yacht.'],
        ],
      },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    payout: 600,
    intro: [
      ['Mara Voss (phone)', 'A collector on Marina Row leaves his Vantara GT unlocked. Bad habit.'],
      ['Mara Voss (phone)', 'Take it. Bring it to Solmar Auto in Old Town. And Vex — if the SCPD sees you, that’s your problem.'],
    ],
    stages: [
      { type: 'steal', at: 'marinaCars', objective: 'Steal the magenta Vantara GT on Marina Row', sub: 'Get in the marked car' },
      { type: 'deliver', at: 'garage', radius: 10, objective: 'Deliver the GT to Solmar Auto', sub: 'Old Town Garage — don’t wreck it' },
    ],
  },
  {
    id: 'dockside-run',
    title: 'Dockside Run',
    payout: 900,
    intro: [
      ['Mara Voss (phone)', 'A package came off a freighter at the Docks. No manifest, no questions.'],
      ['Mara Voss (phone)', 'Pick it up, drop it at Old Town Square. The dock cops watch that yard — expect heat.'],
    ],
    stages: [
      { type: 'pickup', at: 'docks', radius: 7, objective: 'Pick up the package at the Docks', sub: 'Between the container stacks' },
      { type: 'deliver-any', at: 'oldtown', radius: 10, objective: 'Drop the package at Old Town Square', sub: 'Lose any tail on the way' },
    ],
  },
  {
    id: 'neon-debt',
    title: 'Neon Debt',
    payout: 1200,
    intro: [
      ['Mara Voss (phone)', 'A lounge owner near the Velvet Palm owes us. His “security” disagrees.'],
      ['Mara Voss (phone)', 'Three enforcers in the alley behind the club. Convince them. Fists or iron — your style.'],
    ],
    stages: [
      { type: 'fight', at: 'club', offset: { x: 26, z: 14 }, radius: 26, count: 3, objective: 'Deal with the three enforcers behind the Velvet Palm', sub: 'F to punch • CLICK to shoot' },
    ],
  },
  {
    id: 'bridge-toll',
    title: 'Bridge Toll',
    payout: 1600,
    intro: [
      ['Mara Voss (phone)', 'The yacht job needs an escape route. The Harbor Bridge cameras are the problem.'],
      ['Mara Voss (phone)', 'Run the bridge to the hideout, fast, and time it. The cameras WILL flag you — three stars, easy.'],
    ],
    stages: [
      { type: 'timed-goto', at: 'hideout', radius: 11, time: 80, wanted: 3, objective: 'Race across Harbor Bridge to the hideout', sub: 'Beat the clock — the cameras are watching' },
    ],
  },
  {
    id: 'the-solmar-job',
    title: 'The Solmar Job',
    payout: 5000,
    intro: [
      ['Mara Voss (phone)', 'Tonight. The Solmar Star is hosting a high-rollers game — the vault cage is full.'],
      ['Mara Voss (phone)', 'Walk the pier like a guest, grab the take from the casino deck, then run the bridge home.'],
      ['Riko “Vex” Marlowe', 'And if every cop in Solmar shows up?'],
      ['Mara Voss (phone)', 'Then drive like the man I remember. Good luck, Vex.'],
    ],
    stages: [
      { type: 'goto', at: 'yachtPier', radius: 9, objective: 'Get to Pier 9', sub: 'East shore, by the water' },
      { type: 'grab', at: 'yachtDeck', radius: 7, holdTime: 3, objective: 'Grab the take from the casino deck', sub: 'Stay in the circle while you fill the bag' },
      { type: 'escape', at: 'hideout', radius: 11, wanted: 4, objective: 'Escape to the hideout', sub: 'Across the bridge — don’t get busted' },
    ],
  },
];

const OUTRO = [
  ['Mara Voss (phone)', 'You beautiful maniac. The Star’s manager is still counting an empty cage.'],
  ['Riko “Vex” Marlowe', 'Tell the crew… tell them Vex is back in Solmar.'],
  ['Mara Voss (phone)', 'Already did. Rest up — this city never stays quiet for long.'],
];

export function createMissions(G) {
  let index = 0;
  let stageIdx = 0;
  let phase = 'intro-wait'; // intro-wait → intro → active → between → done
  let betweenTimer = 0;
  let holdProgress = 0;
  let timeLeft = 0;
  let targetCar = null;
  let fightLeft = 0;
  let finished = false;

  const mission = () => MISSIONS[index];
  const stage = () => (mission() ? mission().stages[stageIdx] : null);

  function stagePos(s) {
    const base = PLACES[s.at];
    if (!base) return { x: 0, z: 0 };
    if (s.offset) return { x: base.x + s.offset.x, z: base.z + s.offset.z };
    return { x: base.x, z: base.z };
  }

  function beginMission(i, { withIntro = true } = {}) {
    index = i;
    stageIdx = 0;
    holdProgress = 0;
    if (i >= MISSIONS.length) {
      finished = true;
      phase = 'done';
      return;
    }
    if (withIntro) {
      phase = 'intro';
      G.showDialog(mission().intro, () => {
        phase = 'active';
        setupStage();
      });
    } else {
      phase = 'active';
      setupStage();
    }
    G.toast(mission().title, `Mission ${i + 1} of ${MISSIONS.length} — “The Solmar Job”`);
  }

  function setupStage() {
    const s = stage();
    if (!s) return completeMission();
    holdProgress = 0;
    if (s.type === 'steal') {
      targetCar = G.spawnMissionCar(stagePos(s));
    }
    if (s.type === 'fight') {
      const p = stagePos(s);
      fightLeft = G.spawnGuards(p, s.count);
    }
    if (s.type === 'timed-goto') {
      timeLeft = s.time;
      if (s.wanted) G.setWantedAtLeast(s.wanted);
    }
    if (s.type === 'pickup') { /* package waits at the marker */ }
    if (s.type === 'escape' && s.wanted) G.setWantedAtLeast(s.wanted);
  }

  function completeMission() {
    const m = mission();
    G.addMoney(m.payout);
    G.sound.cash();
    G.toast('MISSION COMPLETE', `${m.title} — $${m.payout.toLocaleString('en-US')} earned`);
    G.saveGame();
    if (index + 1 >= MISSIONS.length) {
      phase = 'outro';
      G.showDialog(OUTRO, () => {
        finished = true;
        phase = 'done';
        G.markStoryFinished();
        G.saveGame();
        G.toast('THE SOLMAR JOB — COMPLETE', 'Free roam: Solmar City is yours. Steal, race, outrun.');
      });
      return;
    }
    phase = 'between';
    betweenTimer = 2.6;
  }

  function advanceStage() {
    stageIdx++;
    if (stageIdx >= mission().stages.length) completeMission();
    else setupStage();
  }

  function distTo(s) {
    const p = stagePos(s);
    const pp = G.playerPos();
    return Math.hypot(pp.x - p.x, pp.z - p.z);
  }

  return {
    get index() { return index; },
    get finished() { return finished; },
    get phase() { return phase; },

    start(fromIndex = 0) {
      if (fromIndex >= MISSIONS.length) {
        finished = true;
        phase = 'done';
        return;
      }
      beginMission(fromIndex);
    },

    /** Jump straight into a mission stage with no dialogue (screenshot setups). */
    debugSetStage(missionIdx, stageIndex) {
      index = Math.min(missionIdx, MISSIONS.length - 1);
      stageIdx = Math.min(stageIndex, MISSIONS[index].stages.length - 1);
      finished = false;
      phase = 'active';
      setupStage();
    },

    /** Mark the whole story complete without fanfare (loading a finished save). */
    finishSilently() {
      finished = true;
      phase = 'done';
      index = MISSIONS.length - 1;
    },

    /** Called by main when the player gets into a vehicle. */
    notifyEnterVehicle(v) {
      const s = stage();
      if (phase === 'active' && s && s.type === 'steal' && v === targetCar) {
        G.commitCrime('steal');
        advanceStage();
      }
    },

    /** Called by combat when a mission guard drops. */
    notifyEnemyDown() {
      const s = stage();
      if (phase === 'active' && s && s.type === 'fight') {
        fightLeft--;
        if (fightLeft <= 0) advanceStage();
      }
    },

    objective() {
      if (finished || phase === 'done') {
        return { title: 'Free Roam', text: 'Solmar City is yours', sub: 'Steal cars, outrun the SCPD, make money', marker: null };
      }
      if (phase === 'intro' || phase === 'intro-wait') {
        return { title: mission().title, text: 'Listen to Mara…', sub: '', marker: null };
      }
      if (phase === 'between') {
        return { title: 'The Solmar Job', text: 'Next job incoming…', sub: '', marker: null };
      }
      if (phase === 'outro') {
        return { title: mission().title, text: 'It’s over, Vex.', sub: '', marker: null };
      }
      const s = stage();
      if (!s) return { title: '', text: '', sub: '', marker: null };
      let sub = s.sub || '';
      if (s.type === 'timed-goto') sub = `${Math.max(0, timeLeft).toFixed(0)}s left — ${sub}`;
      if (s.type === 'grab') sub = holdProgress > 0 ? `Filling the bag… ${Math.round((holdProgress / s.holdTime) * 100)}%` : sub;
      if (s.type === 'fight') sub = `${fightLeft} enforcer${fightLeft === 1 ? '' : 's'} left — ${sub}`;
      const dist = Math.round(distTo(s));
      return {
        title: mission().title,
        text: s.objective,
        sub: `${sub}${sub ? ' • ' : ''}${dist} m`,
        marker: s.type === 'steal' && targetCar ? targetCar.group.position : stagePos(s),
      };
    },

    update(dt) {
      if (phase === 'between') {
        betweenTimer -= dt;
        if (betweenTimer <= 0) beginMission(index + 1);
        return;
      }
      if (phase !== 'active') return;
      const s = stage();
      if (!s) return;
      const d = distTo(s);
      switch (s.type) {
        case 'goto':
        case 'deliver-any':
          if (d < s.radius) advanceStage();
          break;
        case 'deliver':
          if (d < s.radius && G.currentVehicle() === targetCar) advanceStage();
          else if (d < s.radius && G.currentVehicle() !== targetCar) {
            // At the garage without the car: objective sub hints via HUD distance text.
          }
          break;
        case 'pickup':
          if (d < s.radius) {
            G.sound.pickup();
            G.toast('PACKAGE SECURED', 'Now move — the dock cops saw you');
            G.setWantedAtLeast(2);
            advanceStage();
          }
          break;
        case 'timed-goto':
          timeLeft -= dt;
          if (d < s.radius) advanceStage();
          else if (timeLeft <= 0) {
            G.toast('TOO SLOW', 'The cameras lost interest. Run it again.');
            timeLeft = s.time;
            G.setWantedAtLeast(s.wanted);
          }
          break;
        case 'grab':
          if (d < s.radius) {
            holdProgress += dt;
            if (holdProgress >= s.holdTime) {
              G.setWantedAtLeast(4);
              G.toast('TAKE SECURED', 'Every cop in Solmar is coming. RUN.');
              advanceStage();
            }
          } else {
            holdProgress = Math.max(0, holdProgress - dt * 1.5);
          }
          break;
        case 'escape':
          if (d < s.radius) advanceStage();
          break;
        case 'dialog':
          phase = 'dialog-stage';
          G.showDialog(s.lines, () => {
            phase = 'active';
            advanceStage();
          });
          break;
        default:
          break;
      }
    },
  };
}
