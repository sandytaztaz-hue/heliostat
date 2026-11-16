// bots.js — waypoint AI for HELIOSTAT. Defenders hold sites, attackers push
// lanes, everyone reacts to sight and sound, bursts of 3-5 with gaps.

import { makeBot, HELIOS_NAMES, UMBRA_NAMES, addFeed, addRadio } from './state.js';
import { findPath, nearestWaypoint, SITES } from './map.js';
import { segmentBlocked } from './solar.js';

const REACT_MIN = 0.35, REACT_MAX = 0.6;

export function spawnBots(state, map) {
  const bots = [];
  const heliosSpots = [[-3, 18], [3, 18], [-6, 16], [6, 16]];
  const heliosRoles = ['a', 'a', 'b', 'mid'];
  const heliosDest = ['siteA', 'siteA', 'siteB', 'mid2'];
  HELIOS_NAMES.forEach((name, i) => {
    const b = makeBot('h' + i, 'helios', name, heliosRoles[i], { x: heliosSpots[i][0], z: heliosSpots[i][1] });
    b.weapon = i === 3 ? 'smg' : 'rifle';
    b.dest = heliosDest[i];
    b.path = findPath(map, nearestWaypoint(map, b.pos.x, b.pos.z), heliosDest[i]);
    b.wp = 0;
    bots.push(b);
  });
  const umbraSpots = [[-18, -10], [-26, -10], [18, -10], [26, -10], [-3, -4]];
  const umbraRoles = ['a', 'a', 'b', 'b', 'mid'];
  const umbraHold = ['holdA1', 'holdA2', 'holdB1', 'holdB2', 'holdMid'];
  UMBRA_NAMES.forEach((name, i) => {
    const b = makeBot('u' + i, 'umbra', name, umbraRoles[i], { x: umbraSpots[i][0], z: umbraSpots[i][1] });
    b.weapon = i === 4 ? 'smg' : 'rifle';
    b.dest = umbraHold[i];
    b.mode = 'hold';
    b.path = [umbraHold[i]];
    b.wp = 0;
    bots.push(b);
  });
  state.bots = bots;
}

function botEye(b) {
  return { x: b.pos.x, y: 1.55, z: b.pos.z };
}

function canSee(state, map, b, targetPos) {
  const from = botEye(b);
  const to = { x: targetPos.x, y: targetPos.y + 1.2, z: targetPos.z };
  const dx = to.x - from.x, dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 55) return false;
  // Smoke blocks line of sight.
  for (const s of state.smokes) {
    const mx = (from.x + to.x) / 2, mz = (from.z + to.z) / 2;
    if (Math.hypot(mx - s.pos.x, mz - s.pos.z) < 3.2) return false;
  }
  if (segmentBlocked(from, to, map.colliders)) return false;
  return true;
}

function moveToward(state, map, b, tx, tz, dt) {
  const dx = tx - b.pos.x, dz = tz - b.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.3) return true;
  const step = b.speed * dt;
  const nx = b.pos.x + (dx / d) * Math.min(step, d);
  const nz = b.pos.z + (dz / d) * Math.min(step, d);
  // Cheap collision: refuse a step that lands inside a solid collider.
  let blocked = false;
  for (const c of map.colliders) {
    if (c.kind === 'wall') continue;
    if (nx > c.minX - 0.4 && nx < c.maxX + 0.4 && nz > c.minZ - 0.4 && nz < c.maxZ + 0.4) {
      if (c.maxY > 0.8) { blocked = true; break; }
    }
  }
  if (!blocked) {
    b.pos.x = Math.max(-31, Math.min(31, nx));
    b.pos.z = Math.max(-21, Math.min(21, nz));
  }
  // Mesh forward is -z: to face (dx,dz) the yaw is atan2(-dx,-dz).
  b.yaw = Math.atan2(-dx, -dz);
  return d < 0.5;
}

function nearestEnemy(state, b) {
  let best = null, bestD = Infinity;
  const foes = [];
  if (b.team === 'umbra') {
    if (state.player.alive) foes.push({ pos: state.player.pos, isPlayer: true, hp: state.player.hp });
    for (const o of state.bots) if (o.team === 'helios' && o.alive) foes.push({ pos: o.pos, bot: o });
  } else {
    for (const o of state.bots) if (o.team === 'umbra' && o.alive) foes.push({ pos: o.pos, bot: o });
  }
  for (const f of foes) {
    const d = Math.hypot(f.pos.x - b.pos.x, f.pos.z - b.pos.z);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best ? { foe: best, dist: bestD } : null;
}

export function updateBots(state, map, dt, combat) {
  for (const b of state.bots) {
    if (!b.alive) continue;
    b.fireT -= dt;
    b.reactT -= dt;
    b.holdT += dt;

    // Hearing: a recent gunshot noise nearby pulls the bot toward it.
    let heard = null;
    for (const n of state.noise) {
      if (state.time - n.t < 1.2) {
        const d = Math.hypot(n.pos.x - b.pos.x, n.pos.z - b.pos.z);
        if (d < n.radius) heard = n.pos;
      }
    }

    const seen = nearestEnemy(state, b);
    let visible = null;
    if (seen && canSee(state, map, b, seen.foe.pos)) {
      if (b.reactT <= 0) {
        b.reactT = REACT_MIN + Math.random() * (REACT_MAX - REACT_MIN);
        b.target = seen.foe;
        b.mode = 'engage';
        b.burstLeft = 3 + Math.floor(Math.random() * 3);
      }
      if (b.mode === 'engage') visible = seen;
    }

    if (b.mode === 'engage' && visible) {
      const t = visible.foe.pos;
      const dx = t.x - b.pos.x, dz = t.z - b.pos.z;
      b.yaw = Math.atan2(-dx, -dz);
      // Strafe a little while firing, so bots are not statues.
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafeDir *= -1; b.strafeT = 0.7 + Math.random() * 0.8; }
      const sx = Math.cos(b.yaw) * b.strafeDir, sz = -Math.sin(b.yaw) * b.strafeDir;
      moveToward(state, map, b, b.pos.x + sx * 0.5, b.pos.z + sz * 0.5, dt);
      if (b.reactT <= 0 && b.fireT <= 0 && b.burstLeft > 0) {
        combat.botShoot(state, map, b, visible.foe, visible.dist);
        b.burstLeft -= 1;
        b.fireT = 0.11;
        if (b.burstLeft <= 0) { b.fireT = 0.5 + Math.random() * 0.5; b.burstLeft = 3 + Math.floor(Math.random() * 3); }
      }
      if (!canSee(state, map, b, t)) {
        b.mode = b.team === 'umbra' ? 'hold' : 'route';
        b.target = null;
      }
      continue;
    }

    // Planted bomb: defenders retake, attackers hold.
    if (state.bomb.state === 'planted') {
      if (b.team === 'umbra') {
        const site = SITES[state.bomb.site];
        if (Math.hypot(site.x - b.pos.x, site.z - b.pos.z) < 2.5) {
          b.mode = 'defuse';
          b.defuseT += dt;
          if (b.defuseT >= 5) {
            state.bomb.state = 'defused';
            addFeed(state, b.name + ' defused the charge');
            addRadio(state, b.name + ': Charge defused!');
          }
        } else {
          b.mode = 'retake';
          moveToward(state, map, b, site.x, site.z, dt);
        }
        continue;
      }
      // HELIOS bots hold near the planted site.
      const site = SITES[state.bomb.site];
      if (Math.hypot(site.x - b.pos.x, site.z - b.pos.z) > 6) {
        moveToward(state, map, b, site.x + 2, site.z + 2, dt);
      }
      continue;
    }

    // Route / hold behaviour.
    if (b.mode === 'route' || b.mode === 'retake' || b.mode === 'hunt') {
      if (b.path && b.wp < b.path.length) {
        const node = map.waypoints[b.path[b.wp]];
        if (node && moveToward(state, map, b, node.x, node.z, dt)) b.wp += 1;
      } else {
        b.mode = 'hold';
        b.holdT = 0;
      }
      continue;
    }
    if (b.mode === 'hold') {
      // Defenders watch their lane; a heard shot makes them peek.
      if (heard) {
        b.yaw = Math.atan2(-(heard.x - b.pos.x), -(heard.z - b.pos.z));
        if (b.holdT > 4) {
          b.mode = 'route';
          b.path = findPath(map, nearestWaypoint(map, b.pos.x, b.pos.z), 'mid2');
          b.wp = 0;
        }
      } else {
        // Slow scan of the lane.
        b.yaw += Math.sin(state.time * 0.4 + b.id.charCodeAt(1)) * 0.15 * dt;
      }
    }
  }

  // Last-alive hunt: when one side is down to a single bot, it sweeps.
  const umbraAlive = state.bots.filter((x) => x.team === 'umbra' && x.alive);
  if (umbraAlive.length === 1 && state.phase === 'live') {
    const last = umbraAlive[0];
    if (last.mode === 'hold' && last.holdT > 6) {
      last.mode = 'hunt';
      last.path = findPath(map, nearestWaypoint(map, last.pos.x, last.pos.z), state.bomb.site === 'A' ? 'siteA' : 'siteB');
      last.wp = 0;
    }
  }
}

export function damageBot(state, bot, dmg, attackerName, weaponName, headshot) {
  if (!bot.alive) return;
  bot.hp -= dmg;
  bot.flashT = 0.12;
  if (bot.hp <= 0) {
    bot.alive = false;
    bot.hp = 0;
    addFeed(state, attackerName + ' ' + weaponName + ' ' + bot.name + (headshot ? ' (headshot)' : ''));
    if (attackerName === 'You') {
      state.stats.kills += 1;
      state.money += 300;
    }
  }
}

export function radioChatter(state) {
  const lines = [
    'Sol: Contact Array', 'Ray: Push Tower', 'Dawn: Smokes out mid',
    'Shade: Rotating B', 'Dusk: Holding Array', 'Flare: One mid, one mid',
    'Umber: They are pushing A', 'Gloam: Watch the sun glare',
  ];
  if (Math.random() < 0.5) addRadio(state, lines[Math.floor(Math.random() * lines.length)]);
}

// How many defenders are still holding each site (HUD / plan helpers).
export function defendersAt(state, role) {
  return state.bots.filter((b) => b.team === 'umbra' && b.alive && b.role === role).length;
}
