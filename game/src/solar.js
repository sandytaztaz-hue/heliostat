// solar.js — the light mechanic: SUN direction, GLARE, SUNLIGHT raycast and
// CELL charge. The sun is low in the west (azimuth 270 deg, elevation ~12 deg).

export const SUN = {
  azimuthDeg: 270,
  elevationDeg: 12,
  // Unit vector pointing FROM the scene TOWARD the sun.
  dir: null,
};

function sunDir() {
  if (!SUN.dir) {
    // Azimuth 270 deg = due west (-x), elevation ~12 deg above the horizon.
    const el = (SUN.elevationDeg * Math.PI) / 180;
    SUN.dir = { x: -Math.cos(el), y: Math.sin(el), z: 0 };
  }
  return SUN.dir;
}

export function sunDirection() {
  return sunDir();
}

// Glare 0..1: how directly the camera yaw faces the sun azimuth.
// Yaw convention (three.js, rotation.y): yaw 0 faces -z (north),
// yaw +PI/2 faces -x (west, into the sun), yaw -PI/2 faces +x (east).
export function glareFactor(yaw) {
  const sunYaw = Math.PI / 2; // facing west
  let d = Math.abs(((yaw - sunYaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  const half = (40 * Math.PI) / 180;
  if (d >= half) return 0;
  const t = 1 - d / half;
  return t * t * (3 - 2 * t);
}

// Ray vs AABB (slab test). Returns nearest hit distance or Infinity.
export function rayAABB(ox, oy, oz, dx, dy, dz, box) {
  let tmin = 0;
  let tmax = Infinity;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const mn = [box.minX, box.minY, box.minZ];
  const mx = [box.maxX, box.maxY, box.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return Infinity;
    } else {
      let t1 = (mn[i] - o[i]) / d[i];
      let t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Honest sunlight test: cast a ray from the eye toward the sun; sunlit only
// when no collider blocks it within 60 m.
export function isSunlit(pos, eyeHeight, colliders) {
  const s = sunDir();
  const ex = pos.x, ey = pos.y + eyeHeight, ez = pos.z;
  for (const c of colliders) {
    if (c.noSun) continue;
    const t = rayAABB(ex, ey, ez, s.x, s.y, s.z, c);
    if (t !== Infinity && t < 60) return false;
  }
  return true;
}

// Segment vs colliders: true when any box blocks the line between a and b.
export function segmentBlocked(a, b, colliders) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return false;
  const d = { x: dx / len, y: dy / len, z: dz / len };
  for (const c of colliders) {
    const t = rayAABB(a.x, a.y, a.z, d.x, d.y, d.z, c);
    if (t !== Infinity && t < len) return true;
  }
  return false;
}

// Per-frame solar update: glare from yaw, charge from sunlight, ready state.
export function updateSolar(state, dt, colliders) {
  const p = state.player;
  state.solar.glare = glareFactor(p.yaw);
  state.solar.sunlit = p.alive && isSunlit(p.pos, p.eye, colliders);
  if (state.solar.sunlit && state.phase === 'live') {
    state.solar.cell = Math.min(100, state.solar.cell + 8 * dt);
  }
  const ready = state.solar.cell >= 100;
  if (ready && !state.solar.sunshotReady) {
    state.solar.charged = true; // audio layer plays the charge chime on this edge
  }
  state.solar.sunshotReady = ready;
}

export function fireSunshot(state) {
  if (!state.solar.sunshotReady) return false;
  state.solar.cell = 0;
  state.solar.sunshotReady = false;
  return true;
}
