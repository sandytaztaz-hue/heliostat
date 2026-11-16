// weapons.js — HELIOSTAT arsenal. Design numbers from the design doc; the
// implementation (spread model, falloff, armour, reload) is written fresh here.

export const WEAPONS = {
  pistol: {
    key: 'pistol', name: 'P9 Sidearm', price: 0, mag: 12, reserve: 36,
    dmg: 26, headMult: 3, gap: 0.15, auto: false,
    spreadStill: 0.004, spreadMove: 0.020, kick: 0.010, speed: 5.2, reload: 1.4,
    tracer: 0xffe9a8, sound: 'pistol',
  },
  smg: {
    key: 'smg', name: 'Kestrel-9', price: 1500, mag: 32, reserve: 96,
    dmg: 24, headMult: 3, gap: 0.07, auto: true,
    spreadStill: 0.008, spreadMove: 0.030, kick: 0.007, speed: 5.4, reload: 1.9,
    tracer: 0xffe9a8, sound: 'smg',
  },
  rifle: {
    key: 'rifle', name: 'VK-47', price: 2700, mag: 30, reserve: 90,
    dmg: 34, headMult: 3, gap: 0.10, auto: true,
    spreadStill: 0.003, spreadMove: 0.026, kick: 0.012, speed: 5.2, reload: 2.1,
    tracer: 0xffe9a8, sound: 'rifle',
  },
  sniper: {
    key: 'sniper', name: 'Lance .50', price: 4750, mag: 5, reserve: 15,
    dmg: 88, headMult: 2.5, gap: 1.10, auto: false, bolt: true,
    spreadStill: 0.001, spreadMove: 0.040, kick: 0.030, speed: 4.9, reload: 2.6,
    zoomFov: 30, tracer: 0xffe9a8, sound: 'sniper',
  },
};

export const GRENADES = {
  frag: { key: 'frag', name: 'FRAG-2', price: 300, fuse: 1.6, radius: 6, dmgMax: 120, dmgMin: 20 },
  smoke: { key: 'smoke', name: 'SMK-1', price: 300, ttl: 14, radius: 3.2 },
};

export const ARMOR_PRICE = 650;

export const SUNSHOT = { dmg: 95, headMult: 2, tracer: 0xffc21a, name: 'SUNSHOT' };

// Effective spread (radians) for a shot: still base + movement + bloom, then
// ADS / crouch / glare modifiers. Stopping to aim genuinely pays.
export function spreadFor(state, weapon, movingSpeed) {
  const w = WEAPONS[weapon];
  let s = w.spreadStill + (movingSpeed / w.speed) * w.spreadMove;
  s += state.bloom;
  if (state.player.ads) s *= 0.45;
  if (state.player.crouching) s *= 0.6;
  s *= 1 + 0.35 * state.solar.glare;
  return s;
}

// Damage at range: full to 30 m, x0.8 past 30, x0.65 past 50.
export function falloff(dmg, dist) {
  if (dist > 50) return dmg * 0.65;
  if (dist > 30) return dmg * 0.8;
  return dmg;
}

// Armour absorbs half the damage, draining armour first.
export function applyArmor(target, dmg) {
  if (!target.armor || target.armor <= 0) return dmg;
  const absorbed = Math.min(target.armor, dmg * 0.5);
  target.armor -= absorbed;
  return dmg - absorbed;
}

export function weaponOf(state) {
  return WEAPONS[state.player.weapon];
}

// All buyable guns, in buy-menu order.
export function shopList() {
  return ['rifle', 'smg', 'sniper', 'pistol'].map((k) => WEAPONS[k]);
}

export function ammoOf(state, key) {
  return state.loadout[key] || { mag: 0, reserve: 0, owned: false };
}

export function canAfford(state, price) {
  return state.money >= price;
}
