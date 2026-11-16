// state.js — HELIOSTAT shared state: one plain store, created by createState().
// No rendering here, no imports: every other module reads and mutates this object.

export const HELIOS_NAMES = ['Sol', 'Ray', 'Dawn', 'Flare'];
export const UMBRA_NAMES = ['Shade', 'Dusk', 'Umber', 'Night', 'Gloam'];

export const PHASES = { BUY: 'buy', LIVE: 'live', PLANTED: 'planted', ROUND_END: 'roundEnd', MATCH_END: 'matchEnd' };

export function v3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function makeBot(id, team, name, role, pos) {
  return {
    id, team, name, role,
    pos: v3(pos.x, 0, pos.z), yaw: 0, hp: 100, alive: true,
    mode: 'route', wp: 0, path: [], target: null,
    reactT: 0, burstLeft: 0, fireT: 0, burstGap: 0,
    weapon: team === 'umbra' ? 'rifle' : 'smg',
    speed: 3.4, holdT: 0, lastSeen: null, plantT: 0, defuseT: 0,
    strafeDir: 1, strafeT: 0, flashT: 0,
  };
}

export function createState() {
  const state = {
    time: 0,
    phase: PHASES.BUY,
    round: 1,
    roundTime: 15,
    score: { helios: 0, umbra: 0 },
    money: 800,
    losses: 0,
    bomb: { state: 'carried', site: null, plantT: 0, defuseT: 0, fuse: 0, carrier: 'player', pos: null },
    player: {
      pos: v3(0, 0, 18), vel: v3(0, 0, 0), yaw: 0, pitch: 0, eye: 1.6,
      hp: 100, armor: 0, alive: true, crouching: false, onGround: true,
      height: 1.72, weapon: 'rifle', ads: false, speed: 5.2,
    },
    bots: [],
    feed: [],
    radio: [],
    shots: [],
    smokes: [],
    frags: [],
    noise: [],
    flashes: [],
    solar: { cell: 0, glare: 0, sunlit: false, sunshotReady: false, charged: false },
    stats: { kills: 0, deaths: 0, plants: 0, defuses: 0, shotsFired: 0, shotsHit: 0 },
    loadout: {
      rifle: { mag: 30, reserve: 90, owned: true },
      smg: { mag: 0, reserve: 0, owned: false },
      sniper: { mag: 0, reserve: 0, owned: false },
      pistol: { mag: 12, reserve: 36, owned: true },
      frag: 0, smoke: 0,
    },
    reloadT: 0, reloading: false, bloom: 0, lastShotT: -9, adsT: 0,
    buyOpen: false, banner: '', bannerT: 0, bannerKind: '',
    plan: 'PLAN: SPLIT A — YOU: ENTRY',
    damageFlash: 0, hitmarkT: 0, hitmarkKill: false,
    winner: null, matchOver: false, intermissionT: 0,
    muzzleT: 0, muzzleSun: false,
  };
  return state;
}

export function aliveBots(state, team) {
  return state.bots.filter((b) => b.team === team && b.alive);
}

// A bot by name (kill feed and radio lookups use names, not ids).
export function botByName(state, name) {
  return state.bots.find((b) => b.name === name) || null;
}

export function aliveCount(state, team) {
  return aliveBots(state, team).length;
}

export function addFeed(state, text) {
  state.feed.unshift({ text, t: state.time });
  if (state.feed.length > 5) state.feed.length = 5;
}

export function addRadio(state, text) {
  state.radio.unshift({ text, t: state.time });
  if (state.radio.length > 4) state.radio.length = 4;
}

export function setBanner(state, text, kind) {
  state.banner = text;
  state.bannerKind = kind || '';
  state.bannerT = 3.2;
}

export function resetRound(state) {
  state.phase = PHASES.BUY;
  state.roundTime = 15;
  state.bomb = { state: 'carried', site: null, plantT: 0, defuseT: 0, fuse: 0, carrier: 'player', pos: null };
  state.player.pos = v3(0, 0, 18);
  state.player.vel = v3(0, 0, 0);
  state.player.yaw = 0; // face north, up the Service Road toward mid
  state.player.pitch = 0;
  state.player.hp = 100;
  state.player.alive = true;
  state.player.weapon = state.loadout.rifle.owned ? 'rifle' : 'pistol';
  state.shots = [];
  state.smokes = [];
  state.frags = [];
  state.noise = [];
  state.reloadT = 0;
  state.reloading = false;
  state.bloom = 0;
  state.damageFlash = 0;
  const plans = [
    'PLAN: SPLIT A — YOU: ENTRY',
    'PLAN: RUSH B — YOU: PLANT',
    'PLAN: MID CONTROL — YOU: ENTRY',
    'PLAN: SPLIT A — YOU: PLANT',
  ];
  state.plan = plans[(state.round - 1) % plans.length];
}
