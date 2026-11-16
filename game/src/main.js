// main.js — HELIOSTAT entry point. Wires state, map, solar, bots, combat,
// player, render, HUD, audio and input; runs the fixed 1/60s simulation and
// the render loop. Also hosts the deterministic ?shot= staging hook used
// for the entry's screenshots (part of the game code, not a cheat).

import { createState, addRadio, addFeed, setBanner, aliveCount } from './state.js';
import { buildMapData, locationAt, SITES } from './map.js';
import { updateSolar } from './solar.js';
import { startRound, tickRounds, tickPlant, buyItem, ROUND } from './rounds.js';
import { spawnBots, updateBots, radioChatter } from './bots.js';
import { playerShoot, playerSunshot, botShoot, startReload, tickReload, throwGrenade, tickFrags } from './combat.js';
import { updatePlayer, applyLook } from './player.js';
import { buildRenderer, renderFrame } from './render.js';
import { buildHUD, updateHUD } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { WEAPONS } from './weapons.js';

const state = createState();
const map = buildMapData();
const audio = createAudio();
const container = document.getElementById('game');
const renderer = buildRenderer(map, container);
const input = createInput(renderer.renderer.domElement);
buildHUD(map);

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const autoMode = params.get('auto') === '1';

startRound(state, map);
spawnBots(state, map);
state.player.weapon = 'rifle';
addRadio(state, 'Sol: Contact Array');
addRadio(state, 'Ray: Push Tower');
addFeed(state, 'Sol VK-47 Shade');
addFeed(state, 'Ray SUNSHOT Dusk');

// --- deterministic staging for screenshots (?shot=1..4) -----------------
function stageShot(n) {
  state.phase = 'live';
  state.roundTime = 87;
  state.buyOpen = false;
  state.player.alive = true;
  state.player.hp = 100;
  state.player.armor = 50;
  state.money = 5400;
  state.score = { helios: 3, umbra: 2 };
  state.round = 4;
  state.plan = n === 3 ? 'PLAN: RUSH B — YOU: PLANT' : 'PLAN: SPLIT A — YOU: ENTRY';
  state.loadout.rifle = { mag: 24, reserve: 90, owned: true };
  state.loadout.smg = { mag: 32, reserve: 96, owned: true };
  state.loadout.sniper = { mag: 5, reserve: 15, owned: true };
  state.loadout.pistol = { mag: 12, reserve: 36, owned: true };
  state.loadout.frag = 1;
  state.loadout.smoke = 1;
  addFeed(state, 'Sol VK-47 Shade');
  addFeed(state, 'Flare Kestrel-9 Umber');
  addRadio(state, 'Sol: Contact Array');
  addRadio(state, 'Dawn: Smokes out mid');
  // No stale buy-phase banner in a staged shot.
  state.banner = '';
  state.bannerT = 0;
  const P = state.player;
  const bots = state.bots;
  const umbra = bots.filter((b) => b.team === 'umbra');
  const helios = bots.filter((b) => b.team === 'helios');
  if (n === 1) {
    // COVER: mid looking WEST into the low sun — glare, sun disc, bot in the
    // Array, a SUNSHOT golden tracer mid-flight, smoke, full HUD.
    // The sunshot fires from the MUZZLE (world pos of the gun tip), never
    // from the eye: a tracer whose `from` sits exactly on the camera never
    // rasterizes — its near cap straddles the near plane and the whole beam
    // vanishes. Fired from the muzzle, the beam reads as a golden wedge from
    // the flash to the defender bot in the Array.
    P.pos.x = 2; P.pos.z = 12; P.yaw = 1.15; P.pitch = 0.02;
    state.solar.cell = 100; state.solar.sunshotReady = true;
    // The defender the sunshot is aimed at stands at (-13,-13): the old
    // (-12,-4) spot was hidden behind the (-6,4) crate on the sightline.
    // (-13,-13) has a clear ray past both crates and reads against the
    // light wall at the Array's east edge.
    umbra[0].pos.x = -13; umbra[0].pos.z = -13; umbra[0].yaw = -2.42;
    umbra[1].pos.x = -20; umbra[1].pos.z = -10; umbra[1].yaw = -2.36;
    // Sol steps left so he does not hide the defender the sunshot is aimed at.
    helios[0].pos.x = -6; helios[0].pos.z = 10; helios[0].yaw = Math.PI / 2;
    state.smokes.push({ pos: { x: -10, y: 1, z: 0 }, t: state.time, ttl: 14 });
    state.shots.push({
      from: { x: 1.11, y: 1.4, z: 11.29 }, to: { x: -13, y: 1.4, z: -13 },
      t: state.time, sunshot: true,
    });
    state.muzzleT = 0.12; state.muzzleSun = true;
  } else if (n === 2) {
    // Site A panel field: bot planting, smoke, muzzle flash, CELL full.
    P.pos.x = -8; P.pos.z = -10; P.yaw = 1.43; P.pitch = 0.0;
    state.solar.cell = 100; state.solar.sunshotReady = true;
    umbra[0].pos.x = -20; umbra[0].pos.z = -10; umbra[0].yaw = -Math.PI / 2;
    umbra[0].mode = 'plant';
    umbra[1].pos.x = -26; umbra[1].pos.z = -8; umbra[1].yaw = -1.77;
    helios[0].pos.x = -10; helios[0].pos.z = -13; helios[0].yaw = 1.43;
    state.smokes.push({ pos: { x: -19, y: 1, z: -11 }, t: state.time, ttl: 14 });
    state.shots.push({
      from: { x: -8, y: 1.6, z: -10 }, to: { x: -20, y: 1.3, z: -10 },
      t: state.time, sunshot: false,
    });
    state.muzzleT = 0.06;
  } else if (n === 3) {
    // Site B tower base looking EAST — sun at your back, tower looming,
    // a bot on the tower stairs, a bot defusing.
    P.pos.x = 4; P.pos.z = -6; P.yaw = -1.16; P.pitch = 0.01;
    state.solar.cell = 42;
    state.bomb.state = 'planted';
    state.bomb.site = 'B';
    state.bomb.pos = { x: 20, y: 0, z: -13 };
    state.bomb.fuse = 28;
    state.phase = 'planted';
    state.roundTime = 28;
    umbra[0].pos.x = 20; umbra[0].pos.z = -13; umbra[0].yaw = Math.PI / 2; umbra[0].mode = 'defuse';
    umbra[1].pos.x = 18.6; umbra[1].pos.z = -16; umbra[1].yaw = 2.57;
    helios[0].pos.x = 14; helios[0].pos.z = -8; helios[0].yaw = -Math.PI / 2;
    state.shots.push({
      from: { x: 4, y: 1.6, z: -6 }, to: { x: 20, y: 1.3, z: -13 },
      t: state.time, sunshot: false,
    });
    state.muzzleT = 0.06;
  } else {
    // Substation firefight: frag explosion, bot visible, control behind.
    P.pos.x = 2; P.pos.z = -2; P.yaw = -0.55; P.pitch = 0.0;
    state.solar.cell = 67;
    umbra[0].pos.x = 8; umbra[0].pos.z = -12; umbra[0].yaw = 2.16;
    umbra[1].pos.x = 12; umbra[1].pos.z = -15; umbra[1].yaw = 2.18;
    helios[0].pos.x = 5; helios[0].pos.z = -5; helios[0].yaw = -0.55;
    state.flashes.push({ pos: { x: 9, y: 1, z: -13 }, t: state.time, kind: 'frag' });
    state.shots.push({
      from: { x: 2, y: 1.6, z: -2 }, to: { x: 8, y: 1.3, z: -12 },
      t: state.time, sunshot: false,
    });
    state.muzzleT = 0.06;
  }
  updateSolar(state, 0, map.colliders);
  renderFrame(renderer, state, map);
  updateHUD(state, 0);
}

if (shotMode) {
  stageShot(parseInt(shotMode, 10) || 1);
  // Keep the staged frame alive: re-render every frame without advancing
  // the sim, so the screenshot catches the exact staged moment.
  let frozen = true;
  window.__heliostatShot = () => { frozen = false; };
  (function shotLoop() {
    if (!frozen) return;
    state.time += 1 / 60;
    state.muzzleT = Math.max(0.06, state.muzzleT);
    // Keep staged flashes (frag bursts) alive for the screenshot.
    for (const f of state.flashes) f.t = state.time;
    renderFrame(renderer, state, map);
    updateHUD(state, 0);
    requestAnimationFrame(shotLoop);
  })();
} else {
  // --- live game ---------------------------------------------------------
  let last = performance.now();
  let acc = 0;
  let stepCount = 0;
  let radioT = 8;

  function simStep(dt) {
    state.time += dt;
    stepCount += 1;
    if (state.bannerT > 0) state.bannerT -= dt;
    if (state.hitmarkT > 0) state.hitmarkT -= dt;
    if (state.damageFlash > 0) state.damageFlash = Math.max(0, state.damageFlash - dt * 1.6);
    if (state.muzzleT > 0) state.muzzleT -= dt;
    if (state.bloom > 0) state.bloom = Math.max(0, state.bloom - 0.02 * dt);
    for (const b of state.bots) if (b.flashT > 0) b.flashT -= dt;

    applyLook(state, input.lookDX, input.lookDY);
    state.player.ads = input.ads && state.player.alive;
    state.player.crouching = input.crouch && state.player.alive;

    if (input.buyToggleEdge && state.phase === 'buy') state.buyOpen = !state.buyOpen;
    if (input.buyKeyEdge && state.buyOpen && state.phase === 'buy') {
      const mapKey = { Digit1: 'rifle', Digit2: 'smg', Digit3: 'sniper', Digit4: 'pistol', Digit5: 'frag', Digit6: 'smoke', Digit7: 'armor' }[input.buyKeyEdge];
      if (mapKey) {
        const msg = buyItem(state, mapKey);
        addFeed(state, msg);
        audio.click();
      }
    }
    if (input.switchEdge) {
      const k = input.switchEdge;
      if (state.loadout[k] && state.loadout[k].owned) {
        state.player.weapon = k;
        state.reloading = false;
        audio.click();
      }
    }
    if (input.reloadEdge) startReload(state);
    if (input.sunshotEdge) playerSunshot(state, map, audio);
    if (input.grenadeEdge) throwGrenade(state, input.grenadeEdge);
    if (input.fire && state.player.weapon) {
      const w = WEAPONS[state.player.weapon];
      if (w.auto || input.fireEdge) playerShoot(state, map, audio);
    }

    updatePlayer(state, map, input, dt);
    updateSolar(state, dt, map.colliders);
    if (state.solar.charged) { state.solar.charged = false; audio.chargeChime(); setBanner(state, 'SUNSHOT READY', 'sun'); }

    // Planting: hold E inside a site while carrying.
    const loc = locationAt(map, state.player.pos.x, state.player.pos.z);
    const inSite = loc === 'ARRAY' ? 'A' : loc === 'TOWER' ? 'B' : null;
    tickPlant(state, dt, inSite, input.plantHeld);
    if (inSite && input.plantHeld && state.bomb.state === 'carried' && state.bomb.plantT > 0) {
      if (stepCount % 30 === 0) audio.plantBeep();
    }

    updateBots(state, map, dt, { botShoot });
    tickReload(state, dt, audio);
    tickFrags(state, map, dt, audio);
    tickRounds(state, dt);

    // A planted bomb needs a position for the render + defuse channel.
    if (state.bomb.state === 'planted' && !state.bomb.pos) {
      const site = SITES[state.bomb.site];
      state.bomb.pos = { x: site.x, y: 0, z: site.z };
    }

    // Respawn bots whenever a fresh round begins (startRound clears them).
    if (state.phase === 'buy' && state._spawnedRound !== state.round) {
      spawnBots(state, map);
      state._spawnedRound = state.round;
    }

    radioT -= dt;
    if (radioT <= 0) { radioT = 11 + Math.random() * 8; radioChatter(state); }

    input.consumeEdges();
  }

  // bots.js receives the real combat.botShoot via the { botShoot } object
  // passed to updateBots in simStep above.
  function frame(now) {
    const dtMs = Math.min(100, now - last);
    last = now;
    acc += dtMs / 1000;
    const step = 1 / 60;
    let n = 0;
    while (acc >= step && n < 5) {
      simStep(step);
      acc -= step;
      n += 1;
    }
    if (n === 5) acc = 0;
    renderFrame(renderer, state, map);
    updateHUD(state, dtMs / 1000);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// Expose a tiny debug handle for play-testing (not used by the game).
window.__heliostat = { state, map };
