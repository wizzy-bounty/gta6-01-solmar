// input.js — keyboard and mouse state for SOLMAR HEAT.
// Tracks held keys, one-frame "pressed" edges, mouse buttons and pointer-lock
// look deltas. Everything else in the game reads input through this object.

export function createInput(canvas) {
  const held = new Set();
  const pressedEdges = new Set();
  const mouseHeld = new Set();
  const mouseEdges = new Set();
  let lookDX = 0;
  let lookDY = 0;
  let locked = false;

  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    held.add(ev.code);
    pressedEdges.add(ev.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.code)) ev.preventDefault();
  });
  window.addEventListener('keyup', (ev) => held.delete(ev.code));
  window.addEventListener('blur', () => { held.clear(); mouseHeld.clear(); });

  canvas.addEventListener('mousedown', (ev) => {
    if (!mouseHeld.has(ev.button)) mouseEdges.add(ev.button);
    mouseHeld.add(ev.button);
  });
  window.addEventListener('mouseup', (ev) => mouseHeld.delete(ev.button));

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (ev) => {
    if (!locked) return;
    lookDX += ev.movementX || 0;
    lookDY += ev.movementY || 0;
  });

  return {
    /** True while the key is physically down. */
    down(code) { return held.has(code); },
    /** True only on the first frame after the key went down. */
    pressed(code) { return pressedEdges.has(code); },
    mouseDown(button = 0) { return mouseHeld.has(button); },
    mousePressed(button = 0) { return mouseEdges.has(button); },
    isLocked() { return locked; },
    lock() { canvas.requestPointerLock?.(); },
    unlock() { if (locked) document.exitPointerLock?.(); },
    /** Consume the accumulated pointer-lock look delta for this frame. */
    takeLook() {
      const d = { dx: lookDX, dy: lookDY };
      lookDX = 0; lookDY = 0;
      return d;
    },
    /** Call at the end of every frame so edge presses live exactly one frame. */
    endFrame() { pressedEdges.clear(); mouseEdges.clear(); },
  };
}
