// input.js — keyboard + mouse + pointer lock. One object, polled by the sim:
// forward/back/left/right, sprint, jump, crouch, ads, fire held, plus edge
// events (pressed keys) the sim consumes each tick.

export function createInput(canvas) {
  const input = {
    forward: false, back: false, left: false, right: false,
    sprint: false, jump: false, crouch: false, ads: false,
    fire: false, fireEdge: false, reloadEdge: false,
    plantHeld: false, sunshotEdge: false, grenadeEdge: null,
    buyToggleEdge: false, switchEdge: null, buyKeyEdge: null,
    lookDX: 0, lookDY: 0, locked: false, started: false,
  };
  const keys = {};

  function onKey(e, down) {
    keys[e.code] = down;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') input.forward = down;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') input.back = down;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') input.left = down;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') input.right = down;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = down;
    if (e.code === 'Space') { input.jump = down; if (down) e.preventDefault(); }
    if (e.code === 'ControlLeft' || e.code === 'KeyC') input.crouch = down;
    if (e.code === 'KeyE') input.plantHeld = down;
    if (down && !e.repeat) {
      if (e.code === 'KeyR') input.reloadEdge = true;
      if (e.code === 'KeyF') input.sunshotEdge = true;
      if (e.code === 'KeyB') input.buyToggleEdge = true;
      if (e.code === 'KeyG') input.grenadeEdge = 'frag';
      if (e.code === 'KeyQ') input.grenadeEdge = 'smoke';
      if (e.code === 'Digit1') input.switchEdge = 'rifle';
      if (e.code === 'Digit2') input.switchEdge = 'smg';
      if (e.code === 'Digit3') input.switchEdge = 'sniper';
      if (e.code === 'Digit4') input.switchEdge = 'pistol';
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'].includes(e.code)) {
        input.buyKeyEdge = e.code;
      }
    }
  }

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => {
    input.forward = input.back = input.left = input.right = false;
    input.fire = false; input.ads = false;
  });

  canvas.addEventListener('click', () => {
    if (!input.locked) {
      canvas.requestPointerLock();
      input.started = true;
    }
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (input.locked) {
      input.lookDX += e.movementX || 0;
      input.lookDY += e.movementY || 0;
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!input.locked) return;
    if (e.button === 0) { input.fire = true; input.fireEdge = true; }
    if (e.button === 2) input.ads = true;
    if (e.button === 1) { input.sunshotEdge = true; e.preventDefault(); }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.fire = false;
    if (e.button === 2) input.ads = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Consume per-tick edges after the sim reads them.
  input.consumeEdges = () => {
    input.fireEdge = false;
    input.reloadEdge = false;
    input.sunshotEdge = false;
    input.grenadeEdge = null;
    input.buyToggleEdge = false;
    input.switchEdge = null;
    input.buyKeyEdge = null;
    input.lookDX = 0;
    input.lookDY = 0;
  };

  // Release pointer lock (used when the round ends so the cursor returns).
  input.releaseLock = () => {
    if (document.pointerLockElement) document.exitPointerLock();
  };

  input.isDown = (code) => !!keys[code];
  return input;
}
