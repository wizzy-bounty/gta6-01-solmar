// hud.js — every 2D layer of SOLMAR HEAT: wanted stars, money, health, the
// objective card, the dialogue box, prompts, toasts, and the round minimap
// (a 2D canvas drawing the street grid, the mission marker, police blips and
// the player's arrow from live game state).

import { STREET_POS, CITY_HALF, LAND_HALF } from './city.js';

function el(id) { return document.getElementById(id); }

export function createHud() {
  const hudEl = el('hud');
  const starsEl = el('stars');
  const moneyEl = el('money');
  const clockEl = el('clock');
  const healthFill = el('health-fill');
  const objTitle = el('objective-title');
  const objText = el('objective-text');
  const objSub = el('objective-sub');
  const promptEl = el('prompt');
  const dialogEl = el('dialog');
  const dialogName = el('dialog-name');
  const dialogText = el('dialog-text');
  const toastEl = el('toast');
  const toastBig = el('toast-big');
  const toastSub = el('toast-sub');
  const speedoEl = el('speedo');
  const speedNum = el('speed-num');
  const carName = el('car-name');
  const bustedEl = el('busted');
  const vignetteEl = el('vignette');
  const mapCtx = el('minimap').getContext('2d');

  let lastWanted = -1;
  let lastMoney = null;
  let toastTimer = null;
  let vignetteFlash = 0;
  let dialogQueue = [];
  let dialogDone = null;

  function renderStars(wanted) {
    let html = '';
    for (let i = 0; i < 5; i++) html += `<span class="${i < wanted ? 'lit' : ''}">★</span>`;
    starsEl.innerHTML = html;
  }
  renderStars(0);

  function showDialog(lines, onDone) {
    dialogQueue = [...lines];
    dialogDone = onDone || null;
    promptEl.classList.remove('on');
    nextDialogLine();
  }
  function nextDialogLine() {
    const line = dialogQueue.shift();
    if (!line) {
      dialogEl.classList.remove('on');
      const cb = dialogDone;
      dialogDone = null;
      cb?.();
      return;
    }
    dialogName.textContent = line[0];
    dialogText.textContent = line[1];
    dialogEl.classList.add('on');
  }

  function toast(big, sub = '') {
    toastBig.textContent = big;
    toastSub.textContent = sub;
    toastEl.classList.add('on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 3400);
  }

  function drawMinimap(G) {
    const S = 192;
    const C = S / 2;
    const range = 165;               // metres shown from centre to edge
    const k = C / range;
    const p = G.playerPos();
    const toMap = (x, z) => [C + (x - p.x) * k, C + (z - p.z) * k];

    mapCtx.clearRect(0, 0, S, S);
    mapCtx.save();
    mapCtx.beginPath();
    mapCtx.arc(C, C, C - 1, 0, Math.PI * 2);
    mapCtx.clip();

    // Water, then the island, then the city slab.
    mapCtx.fillStyle = '#12506e';
    mapCtx.fillRect(0, 0, S, S);
    mapCtx.fillStyle = '#3d4a42';
    let [lx, ly] = toMap(-LAND_HALF, -LAND_HALF);
    mapCtx.fillRect(lx, ly, LAND_HALF * 2 * k, LAND_HALF * 2 * k);
    mapCtx.fillStyle = '#596270';
    [lx, ly] = toMap(-CITY_HALF - 13, -CITY_HALF - 13);
    mapCtx.fillRect(lx, ly, (CITY_HALF + 13) * 2 * k, (CITY_HALF + 13) * 2 * k);
    // Hideout island.
    const [ix, iy] = toMap(452, 120);
    mapCtx.fillStyle = '#596270';
    mapCtx.fillRect(ix - 75 * k, iy - 75 * k, 150 * k, 150 * k);

    // Roads.
    mapCtx.strokeStyle = '#22262c';
    mapCtx.lineWidth = Math.max(1.4, 13 * k);
    for (const s of STREET_POS) {
      let [x1, y1] = toMap(s, -CITY_HALF - 15);
      let [x2, y2] = toMap(s, CITY_HALF + 15);
      mapCtx.beginPath(); mapCtx.moveTo(x1, y1); mapCtx.lineTo(x2, y2); mapCtx.stroke();
      [x1, y1] = toMap(-CITY_HALF - 15, s);
      [x2, y2] = toMap(CITY_HALF + 15, s);
      mapCtx.beginPath(); mapCtx.moveTo(x1, y1); mapCtx.lineTo(x2, y2); mapCtx.stroke();
    }
    // Bridge.
    mapCtx.strokeStyle = '#22262c';
    mapCtx.lineWidth = Math.max(1.2, 10 * k);
    const [b1x, b1y] = toMap(288, 120);
    const [b2x, b2y] = toMap(452, 120);
    mapCtx.beginPath(); mapCtx.moveTo(b1x, b1y); mapCtx.lineTo(b2x, b2y); mapCtx.stroke();

    // Mission marker: a pulsing gold dot.
    const obj = G.objective();
    if (obj && obj.marker) {
      const [mx, my] = toMap(obj.marker.x, obj.marker.z);
      const pulse = 5 + Math.sin(performance.now() / 240) * 1.6;
      mapCtx.fillStyle = '#ffb52e';
      mapCtx.beginPath(); mapCtx.arc(mx, my, pulse + 3, 0, Math.PI * 2); mapCtx.fill();
      mapCtx.fillStyle = '#221a05';
      mapCtx.beginPath(); mapCtx.arc(mx, my, 2.2, 0, Math.PI * 2); mapCtx.fill();
    }

    // Police blips flash red/blue.
    const flash = Math.sin(performance.now() / 130) > 0;
    for (const u of G.policeUnits()) {
      const [ux, uy] = toMap(u.group.position.x, u.group.position.z);
      mapCtx.fillStyle = flash ? '#ff4040' : '#3a7bff';
      mapCtx.beginPath(); mapCtx.arc(ux, uy, 3.4, 0, Math.PI * 2); mapCtx.fill();
    }

    // Player arrow, rotated to facing.
    const heading = G.playerHeading();
    mapCtx.save();
    mapCtx.translate(C, C);
    mapCtx.rotate(Math.PI - heading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.strokeStyle = '#10131a';
    mapCtx.lineWidth = 1.4;
    mapCtx.beginPath();
    mapCtx.moveTo(0, -8);
    mapCtx.lineTo(5.4, 6.5);
    mapCtx.lineTo(0, 3.4);
    mapCtx.lineTo(-5.4, 6.5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.stroke();
    mapCtx.restore();

    // North tick.
    mapCtx.fillStyle = 'rgba(255,255,255,0.9)';
    mapCtx.font = '700 11px Arial';
    mapCtx.textAlign = 'center';
    mapCtx.fillText('N', C, 14);
    mapCtx.restore();
  }

  return {
    show() { hudEl.classList.add('on'); },
    hide() { hudEl.classList.remove('on'); },
    showDialog,
    advanceDialog: nextDialogLine,
    dialogActive() { return dialogEl.classList.contains('on'); },
    toast,
    setPrompt(html) {
      if (html) {
        promptEl.innerHTML = html;
        promptEl.classList.add('on');
      } else {
        promptEl.classList.remove('on');
      }
    },
    setBusted(on) { bustedEl.classList.toggle('on', !!on); },
    setVignette(opacity) { vignetteFlash = Math.max(vignetteFlash, opacity); },
    update(G) {
      if (G.wanted !== lastWanted) {
        lastWanted = G.wanted;
        renderStars(G.wanted);
      }
      const money = Math.round(G.money);
      if (money !== lastMoney) {
        lastMoney = money;
        moneyEl.textContent = `$${money.toLocaleString('en-US')}`;
      }
      const hh = Math.floor(G.timeHours) % 24;
      const mm = Math.floor((G.timeHours % 1) * 60);
      clockEl.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      healthFill.style.width = `${Math.max(0, Math.min(100, G.health))}%`;
      vignetteFlash = Math.max(0, vignetteFlash - 0.016);
      const lowPulse = G.health < 30 ? 0.45 + Math.sin(performance.now() / 180) * 0.15 : 0;
      vignetteEl.style.opacity = String(Math.max(vignetteFlash, lowPulse));
      const obj = G.objective();
      if (obj) {
        objTitle.textContent = obj.title || 'Objective';
        objText.textContent = obj.text || '';
        objSub.textContent = obj.sub || '';
      }
      const driving = G.drivingVehicle();
      if (driving) {
        speedoEl.classList.add('on');
        speedNum.textContent = String(Math.round(Math.abs(driving.speed) * 3.6));
        carName.textContent = driving.name;
      } else {
        speedoEl.classList.remove('on');
      }
      drawMinimap(G);
    },
  };
}
