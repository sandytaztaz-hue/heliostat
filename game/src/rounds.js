// rounds.js — HELIOSTAT economy and round flow. CS-style: buy 15s, live 100s,
// planted fuse 40s, first to 7, max 13 rounds. Money: kill +300, win +3250,
// loss +1900 (+500 per consecutive loss, cap +2900), plant +300.

import { WEAPONS, GRENADES, ARMOR_PRICE } from './weapons.js';
import { addFeed, addRadio, setBanner, resetRound, aliveCount } from './state.js';

export const ROUND = {
  BUY_T: 15, LIVE_T: 100, FUSE_T: 40, INTERMISSION_T: 4,
  WIN_SCORE: 7, MAX_ROUNDS: 13,
  WIN_MONEY: 3250, LOSS_BASE: 1900, LOSS_STEP: 500, LOSS_CAP: 2900,
  KILL_MONEY: 300, PLANT_MONEY: 300,
};

export function lossBonus(state) {
  return Math.min(ROUND.LOSS_CAP, ROUND.LOSS_BASE + ROUND.LOSS_STEP * state.losses);
}

export function buyItem(state, key) {
  const loadout = state.loadout;
  if (key === 'armor') {
    if (state.player.armor >= 100) return 'ARMOUR FULL';
    if (state.money < ARMOR_PRICE) return 'NOT ENOUGH CASH';
    state.money -= ARMOR_PRICE;
    state.player.armor = 100;
    return 'ARMOUR BOUGHT';
  }
  if (key === 'frag' || key === 'smoke') {
    const g = GRENADES[key];
    if (state.money < g.price) return 'NOT ENOUGH CASH';
    if (loadout[key] >= 2) return 'MAX 2 CARRIED';
    state.money -= g.price;
    loadout[key] += 1;
    return g.name + ' BOUGHT';
  }
  const w = WEAPONS[key];
  if (!w) return 'UNKNOWN ITEM';
  if (loadout[key].owned) return w.name + ' OWNED';
  if (state.money < w.price) return 'NOT ENOUGH CASH';
  state.money -= w.price;
  loadout[key] = { mag: w.mag, reserve: w.reserve, owned: true };
  state.player.weapon = key;
  return w.name + ' BOUGHT';
}

export function startRound(state, map) {
  resetRound(state);
  // Bots are (re)spawned by main.js via spawnBots() from bots.js, which owns
  // the spawn table; startRound only resets the round's shared state.
  state.buyOpen = true;
  addRadio(state, 'Sol: Buy up — we go ' + (state.round % 2 ? 'A split' : 'B rush'));
  addRadio(state, 'Ray: Sun is low west. Watch the glare.');
  setBanner(state, 'ROUND ' + state.round + ' — BUY PHASE', 'buy');
}

export function endRound(state, winner, reason) {
  if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
  state.phase = 'roundEnd';
  state.intermissionT = ROUND.INTERMISSION_T;
  state.winner = winner;
  if (winner === 'helios') {
    state.score.helios += 1;
    state.money += ROUND.WIN_MONEY;
    state.losses = 0;
    setBanner(state, 'HELIOS WIN — ' + reason, 'win');
    addFeed(state, 'HELIOS take round ' + state.round);
  } else {
    state.score.umbra += 1;
    state.money += lossBonus(state);
    state.losses += 1;
    setBanner(state, 'UMBRA WIN — ' + reason, 'lose');
    addFeed(state, 'UMBRA take round ' + state.round);
  }
  if (state.score.helios >= ROUND.WIN_SCORE || state.score.umbra >= ROUND.WIN_SCORE
    || state.round >= ROUND.MAX_ROUNDS) {
    state.phase = 'matchEnd';
    state.matchOver = true;
    const champ = state.score.helios > state.score.umbra ? 'HELIOS' : 'UMBRA';
    setBanner(state, champ + ' WIN THE MATCH ' + state.score.helios + '—' + state.score.umbra, 'win');
  }
}

export function tickRounds(state, dt) {
  if (state.phase === 'buy') {
    state.roundTime -= dt;
    if (state.roundTime <= 0) {
      state.phase = 'live';
      state.roundTime = ROUND.LIVE_T;
      state.buyOpen = false;
      setBanner(state, 'GO — PLANT THE CHARGE', 'live');
      addRadio(state, 'Sol: Move move move!');
    }
    return;
  }
  if (state.phase === 'live') {
    state.roundTime -= dt;
    const hAlive = state.player.alive ? 1 : 0;
    if (aliveCount(state, 'umbra') === 0) { endRound(state, 'helios', 'ELIMINATION'); return; }
    if (aliveCount(state, 'helios') === 0 && !state.player.alive) { endRound(state, 'umbra', 'ELIMINATION'); return; }
    if (state.bomb.state === 'planted') {
      state.phase = 'planted';
      state.roundTime = ROUND.FUSE_T;
      state.bomb.fuse = ROUND.FUSE_T;
    } else if (state.roundTime <= 0) {
      endRound(state, 'umbra', 'TIME EXPIRED');
    }
    return;
  }
  if (state.phase === 'planted') {
    state.roundTime -= dt;
    state.bomb.fuse = state.roundTime;
    if (state.bomb.state === 'defused') { endRound(state, 'umbra', 'CHARGE DEFUSED'); return; }
    if (aliveCount(state, 'umbra') === 0 && aliveCount(state, 'helios') === 0 && !state.player.alive) {
      endRound(state, 'helios', 'CHARGE DETONATED'); return;
    }
    if (state.roundTime <= 0) {
      state.bomb.state = 'exploded';
      endRound(state, 'helios', 'CHARGE DETONATED');
    }
    return;
  }
  if (state.phase === 'roundEnd') {
    state.intermissionT -= dt;
    if (state.intermissionT <= 0 && !state.matchOver) {
      state.round += 1;
      startRound(state);
    }
    return;
  }
}

// Plant progress: hold E (or bot channel) inside a site zone for 3 s.
export function tickPlant(state, dt, inSite, planting) {
  const b = state.bomb;
  if (state.phase !== 'live' || b.state !== 'carried' || b.carrier !== 'player') return;
  if (inSite && planting && state.player.alive) {
    b.plantT += dt;
    if (b.plantT >= 3) {
      b.state = 'planted';
      b.site = inSite;
      b.fuse = ROUND.FUSE_T;
      state.stats.plants += 1;
      state.money += ROUND.PLANT_MONEY;
      setBanner(state, 'CHARGE PLANTED — ' + b.site, 'plant');
      addRadio(state, 'Sol: Charge planted ' + b.site + '! Hold it!');
      addFeed(state, 'You planted the charge at ' + b.site);
    }
  } else {
    b.plantT = Math.max(0, b.plantT - dt * 2);
  }
}
