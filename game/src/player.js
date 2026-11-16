// player.js — first-person movement: WASD with acceleration, sprint, crouch,
// jump, gravity, and AABB collision against the map. Fixed-step friendly.

import { BOUNDS } from './map.js';

const RADIUS = 0.4;
const GRAVITY = 22;
const JUMP_V = 7.2;

export function updatePlayer(state, map, input, dt) {
  const p = state.player;
  if (!p.alive) return;
  const w = p.weapon === 'sniper' ? 4.9 : p.weapon === 'smg' ? 5.4 : 5.2;
  let targetSpeed = w;
  if (p.ads) targetSpeed *= 0.65;
  if (p.crouching) targetSpeed = 2.4;
  if (input.sprint && !p.ads && !p.crouching) targetSpeed *= 1.25;

  // Wish direction in world space from yaw.
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let fx = 0, fz = 0;
  if (input.forward) { fx += -sy; fz += -cy; }
  if (input.back) { fx += sy; fz += cy; }
  if (input.left) { fx += -cy; fz += sy; }
  if (input.right) { fx += cy; fz += -sy; }
  const fl = Math.hypot(fx, fz);
  if (fl > 0) { fx /= fl; fz /= fl; }

  const accel = p.onGround ? 34 : 8;
  p.vel.x += fx * accel * dt;
  p.vel.z += fz * accel * dt;
  // Friction / clamp to target speed.
  const hs = Math.hypot(p.vel.x, p.vel.z);
  if (hs > 0) {
    const max = fl > 0 ? targetSpeed : 0;
    const dec = p.onGround ? 26 * dt : 0.4 * dt;
    const ns = Math.max(max, hs - dec);
    const clamped = Math.min(hs, Math.max(ns, max));
    p.vel.x = (p.vel.x / hs) * clamped;
    p.vel.z = (p.vel.z / hs) * clamped;
  }

  if (input.jump && p.onGround) {
    p.vel.y = JUMP_V;
    p.onGround = false;
  }
  p.vel.y -= GRAVITY * dt;

  // Integrate with per-axis AABB resolution.
  p.pos.x += p.vel.x * dt;
  resolveAxis(state, map, 'x');
  p.pos.z += p.vel.z * dt;
  resolveAxis(state, map, 'z');
  p.pos.y += p.vel.y * dt;
  if (p.pos.y <= 0) { p.pos.y = 0; p.vel.y = 0; p.onGround = true; }
  else p.onGround = false;

  p.pos.x = Math.max(BOUNDS.minX + 0.5, Math.min(BOUNDS.maxX - 0.5, p.pos.x));
  p.pos.z = Math.max(BOUNDS.minZ + 0.5, Math.min(BOUNDS.maxZ - 0.5, p.pos.z));
  p.eye = p.crouching ? 1.15 : 1.6;
}

function resolveAxis(state, map, axis) {
  const p = state.player;
  const h = p.crouching ? 1.3 : 1.72;
  for (const c of map.colliders) {
    if (c.maxY < 0.5) continue; // low barriers are stepped over visually, not blocked
    if (p.pos.y + h < c.minY || p.pos.y > c.maxY) continue;
    const minX = c.minX - RADIUS, maxX = c.maxX + RADIUS;
    const minZ = c.minZ - RADIUS, maxZ = c.maxZ + RADIUS;
    if (p.pos.x < minX || p.pos.x > maxX || p.pos.z < minZ || p.pos.z > maxZ) continue;
    if (axis === 'x') {
      if (p.vel.x > 0) p.pos.x = minX;
      else if (p.vel.x < 0) p.pos.x = maxX;
      p.vel.x = 0;
    } else {
      if (p.vel.z > 0) p.pos.z = minZ;
      else if (p.vel.z < 0) p.pos.z = maxZ;
      p.vel.z = 0;
    }
  }
}

export function applyLook(state, dx, dy) {
  const p = state.player;
  const sens = p.ads ? 0.0011 : 0.0021;
  p.yaw -= dx * sens;
  p.pitch -= dy * sens;
  p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));
}

// Current horizontal speed (used for spread and the HUD bob).
export function horizontalSpeed(state) {
  return Math.hypot(state.player.vel.x, state.player.vel.z);
}
