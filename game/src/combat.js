// combat.js — hitscan shooting, grenades, tracers and damage for HELIOSTAT.
// Hit tests are sphere tests against bot bodies (head r .16 at y+1.53,
// torso r .34 at y+1.0); no three.js dependency here.

import { WEAPONS, GRENADES, SUNSHOT, spreadFor, falloff, applyArmor } from './weapons.js';
import { addFeed } from './state.js';
import { segmentBlocked } from './solar.js';
import { damageBot } from './bots.js';

export function playerEye(state) {
  const p = state.player;
  return { x: p.pos.x, y: p.pos.y + p.eye, z: p.pos.z };
}

export function aimDir(state) {
  const p = state.player;
  const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  // Yaw 0 faces -z; yaw -PI/2 faces -x (west, into the sun).
  return { x: -sy * cp, y: sp, z: -cy * cp };
}

// Ray vs a bot's head/torso spheres. Returns {bot, dist, headshot} or null.
export function rayHitBot(origin, dir, bot, maxDist) {
  if (!bot.alive) return null;
  const tests = [
    { cx: bot.pos.x, cy: bot.pos.y + 1.53, cz: bot.pos.z, r: 0.16, head: true },
    { cx: bot.pos.x, cy: bot.pos.y + 1.0, cz: bot.pos.z, r: 0.34, head: false },
    { cx: bot.pos.x, cy: bot.pos.y + 0.5, cz: bot.pos.z, r: 0.3, head: false },
  ];
  let best = null;
  for (const s of tests) {
    const ox = s.cx - origin.x, oy = s.cy - origin.y, oz = s.cz - origin.z;
    const tca = ox * dir.x + oy * dir.y + oz * dir.z;
    if (tca < 0 || tca > maxDist) continue;
    const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
    if (d2 > s.r * s.r) continue;
    const thc = Math.sqrt(Math.max(0, s.r * s.r - d2));
    const t = tca - thc;
    if (!best || t < best.dist) best = { bot, dist: t, headshot: s.head };
  }
  return best;
}

function nearestWallDist(state, map, origin, dir) {
  // Any collider within 80 m along the ray blocks the shot.
  let best = 80;
  for (const c of map.colliders) {
    const dx = dir.x, dy = dir.y, dz = dir.z;
    let tmin = 0, tmax = Infinity;
    const o = [origin.x, origin.y, origin.z];
    const d = [dx, dy, dz];
    const mn = [c.minX, c.minY, c.minZ];
    const mx = [c.maxX, c.maxY, c.maxZ];
    let ok = true;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < mn[i] || o[i] > mx[i]) { ok = false; break; }
      } else {
        let t1 = (mn[i] - o[i]) / d[i];
        let t2 = (mx[i] - o[i]) / d[i];
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok && tmin > 0 && tmin < best) best = tmin;
  }
  return best;
}

export function playerShoot(state, map, audio) {
  const p = state.player;
  if (!p.alive || state.phase !== 'live' && state.phase !== 'planted') return;
  if (state.reloading) return;
  const now = state.time;
  const w = WEAPONS[p.weapon];
  if (now - state.lastShotT < w.gap) return;
  const load = state.loadout[p.weapon];
  if (!load || load.mag <= 0) {
    if (audio) audio.click();
    startReload(state);
    return;
  }
  load.mag -= 1;
  state.lastShotT = now;
  state.stats.shotsFired += 1;
  state.bloom = Math.min(0.02, state.bloom + 0.0015);

  const speed = Math.hypot(p.vel.x, p.vel.z);
  const spread = spreadFor(state, p.weapon, speed);
  const base = aimDir(state);
  const dir = {
    x: base.x + (Math.random() - 0.5) * 2 * spread,
    y: base.y + (Math.random() - 0.5) * 2 * spread,
    z: base.z + (Math.random() - 0.5) * 2 * spread,
  };
  const dl = Math.hypot(dir.x, dir.y, dir.z);
  dir.x /= dl; dir.y /= dl; dir.z /= dl;

  const eye = playerEye(state);
  const wall = nearestWallDist(state, map, eye, dir);
  let hit = null;
  for (const b of state.bots) {
    if (b.team !== 'umbra') continue;
    const h = rayHitBot(eye, dir, b, Math.min(wall, 80));
    if (h && (!hit || h.dist < hit.dist)) hit = h;
  }
  const end = hit
    ? { x: eye.x + dir.x * hit.dist, y: eye.y + dir.y * hit.dist, z: eye.z + dir.z * hit.dist }
    : { x: eye.x + dir.x * wall, y: eye.y + dir.y * wall, z: eye.z + dir.z * wall };
  state.shots.push({ from: { ...eye }, to: end, t: now, sunshot: false });
  state.noise.push({ pos: { ...p.pos }, t: now, radius: 28 });
  state.muzzleT = 0.06;
  // Recoil kicks the aim AFTER this shot is resolved, so the kick climbs
  // the next shot, never the one just fired.
  p.pitch += w.kick * (0.7 + Math.random() * 0.6);
  p.yaw += (Math.random() - 0.5) * w.kick * 0.5;
  if (audio) audio.shot(w.sound);
  if (hit) {
    state.stats.shotsHit += 1;
    let dmg = falloff(w.dmg, hit.dist);
    if (hit.headshot) dmg *= w.headMult;
    dmg = applyArmor(hit.bot, dmg);
    state.hitmarkT = 0.25;
    state.hitmarkKill = hit.bot.hp - dmg <= 0;
    damageBot(state, hit.bot, dmg, 'You', w.name, hit.headshot);
    if (audio) audio.hit(state.hitmarkKill);
  }
}

export function playerSunshot(state, map, audio) {
  const p = state.player;
  if (!state.solar.sunshotReady || !p.alive) return false;
  if (state.phase !== 'live' && state.phase !== 'planted') return false;
  state.solar.cell = 0;
  state.solar.sunshotReady = false;
  state.stats.shotsFired += 1;
  const eye = playerEye(state);
  const dir = aimDir(state);
  const wall = nearestWallDist(state, map, eye, dir);
  let hit = null;
  for (const b of state.bots) {
    if (b.team !== 'umbra') continue;
    const h = rayHitBot(eye, dir, b, Math.min(wall, 90));
    if (h && (!hit || h.dist < hit.dist)) hit = h;
  }
  const end = hit
    ? { x: eye.x + dir.x * hit.dist, y: eye.y + dir.y * hit.dist, z: eye.z + dir.z * hit.dist }
    : { x: eye.x + dir.x * wall, y: eye.y + dir.y * wall, z: eye.z + dir.z * wall };
  state.shots.push({ from: { ...eye }, to: end, t: state.time, sunshot: true });
  state.noise.push({ pos: { ...p.pos }, t: state.time, radius: 34 });
  state.muzzleT = 0.12;
  state.muzzleSun = true;
  if (audio) audio.sunshot();
  if (hit) {
    state.stats.shotsHit += 1;
    let dmg = SUNSHOT.dmg;
    if (hit.headshot) dmg *= SUNSHOT.headMult;
    dmg = applyArmor(hit.bot, dmg);
    state.hitmarkT = 0.3;
    state.hitmarkKill = hit.bot.hp - dmg <= 0;
    damageBot(state, hit.bot, dmg, 'You', SUNSHOT.name, hit.headshot);
    if (audio) audio.hit(state.hitmarkKill);
  }
  return true;
}

export function botShoot(state, map, bot, foe, dist) {
  const from = { x: bot.pos.x, y: bot.pos.y + 1.5, z: bot.pos.z };
  const to = foe.isPlayer
    ? { x: state.player.pos.x, y: state.player.pos.y + 1.2, z: state.player.pos.z }
    : { x: foe.pos.x, y: foe.pos.y + 1.2, z: foe.pos.z };
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const spread = 0.02 + dist * 0.0004;
  const dir = {
    x: dx / len + (Math.random() - 0.5) * 2 * spread,
    y: dy / len + (Math.random() - 0.5) * 2 * spread,
    z: dz / len + (Math.random() - 0.5) * 2 * spread,
  };
  const hitChance = Math.max(0.12, 0.42 - dist * 0.005);
  const end = { x: from.x + dir.x * Math.min(len, 60), y: from.y + dir.y * Math.min(len, 60), z: from.z + dir.z * Math.min(len, 60) };
  state.shots.push({ from, to: end, t: state.time, sunshot: false, bot: true });
  state.noise.push({ pos: { x: bot.pos.x, z: bot.pos.z }, t: state.time, radius: 24 });
  bot.flashT = 0.08;
  if (Math.random() < hitChance) {
    const w = WEAPONS[bot.weapon] || WEAPONS.rifle;
    let dmg = falloff(w.dmg, dist) * 0.85;
    if (foe.isPlayer) {
      dmg = applyArmor(state.player, dmg);
      state.player.hp -= dmg;
      state.damageFlash = Math.min(1, state.damageFlash + 0.45);
      if (state.player.hp <= 0) {
        state.player.hp = 0;
        state.player.alive = false;
        state.stats.deaths += 1;
        addFeed(state, bot.name + ' ' + w.name + ' You');
        if (state.bomb.carrier === 'player') state.bomb.carrier = 'bot:2';
      }
    } else if (foe.bot) {
      damageBot(state, foe.bot, dmg, bot.name, w.name, false);
    }
  }
}

export function startReload(state) {
  const load = state.loadout[state.player.weapon];
  const w = WEAPONS[state.player.weapon];
  if (!load || !load.owned || load.reserve <= 0 || load.mag >= w.mag || state.reloading) return;
  state.reloading = true;
  state.reloadT = w.reload;
}

export function tickReload(state, dt, audio) {
  if (!state.reloading) return;
  state.reloadT -= dt;
  if (state.reloadT <= 0) {
    state.reloading = false;
    const load = state.loadout[state.player.weapon];
    const w = WEAPONS[state.player.weapon];
    const need = w.mag - load.mag;
    const take = Math.min(need, load.reserve);
    load.mag += take;
    load.reserve -= take;
    if (audio) audio.reloadDone();
  }
}

export function throwGrenade(state, kind) {
  const p = state.player;
  if (!p.alive || state.loadout[kind] <= 0) return false;
  // Grenades only fly during live play, not in the buy phase.
  if (state.phase !== 'live' && state.phase !== 'planted') return false;
  state.loadout[kind] -= 1;
  const dir = aimDir(state);
  const eye = playerEye(state);
  const vel = { x: dir.x * 14, y: dir.y * 14 + 4, z: dir.z * 14 };
  state.frags.push({ pos: { ...eye }, vel, t: state.time, fuse: GRENADES[kind].fuse, kind });
  return true;
}

export function tickFrags(state, map, dt, audio) {
  for (let i = state.frags.length - 1; i >= 0; i--) {
    const f = state.frags[i];
    f.fuse -= dt;
    f.vel.y -= 9.8 * dt;
    f.pos.x += f.vel.x * dt;
    f.pos.y += f.vel.y * dt;
    f.pos.z += f.vel.z * dt;
    if (f.pos.y < 0.1) { f.pos.y = 0.1; f.vel.y *= -0.4; f.vel.x *= 0.7; f.vel.z *= 0.7; }
    if (f.fuse <= 0) {
      state.frags.splice(i, 1);
      if (f.kind === 'smoke') {
        state.smokes.push({ pos: { ...f.pos, y: 1 }, t: state.time, ttl: GRENADES.smoke.ttl });
        if (audio) audio.smoke();
      } else {
        state.flashes.push({ pos: { ...f.pos }, t: state.time, kind: 'frag' });
        if (audio) audio.explosion();
        const targets = [];
        if (state.player.alive) targets.push({ pos: state.player.pos, isPlayer: true });
        for (const b of state.bots) if (b.alive) targets.push({ pos: b.pos, bot: b });
        for (const t of targets) {
          const d = Math.hypot(t.pos.x - f.pos.x, t.pos.z - f.pos.z);
          if (d < GRENADES.frag.radius) {
            const dmg = GRENADES.frag.dmgMax - (GRENADES.frag.dmgMax - GRENADES.frag.dmgMin) * (d / GRENADES.frag.radius);
            if (t.isPlayer) {
              state.player.hp -= applyArmor(state.player, dmg);
              state.damageFlash = 1;
              if (state.player.hp <= 0) { state.player.hp = 0; state.player.alive = false; state.stats.deaths += 1; }
            } else {
              damageBot(state, t.bot, dmg, 'You', 'FRAG-2', false);
            }
          }
        }
      }
    }
  }
  // Expire tracers / smokes / flashes.
  state.shots = state.shots.filter((s) => state.time - s.t < (s.sunshot ? 0.12 : 0.06));
  state.smokes = state.smokes.filter((s) => state.time - s.t < s.ttl);
  state.flashes = state.flashes.filter((f) => state.time - f.t < 0.5);
  state.noise = state.noise.filter((n) => state.time - n.t < 2);
}
