// map.js — "Salt Flat Array": pure map data. Colliders are AABBs
// {minX,minY,minZ,maxX,maxY,maxZ, kind}; waypoints are the nav graph;
// zones name locations for the HUD. No three.js here — render.js draws it.

export const BOUNDS = { minX: -32, maxX: 32, minZ: -22, maxZ: 22, wallH: 5 };

export const SITES = {
  A: { name: 'ARRAY', x: -22, z: -12, r: 6 },
  B: { name: 'TOWER', x: 22, z: -12, r: 6 },
};

function box(cx, cz, w, h, d, kind, extra) {
  return Object.assign({
    minX: cx - w / 2, maxX: cx + w / 2,
    minY: 0, maxY: h,
    minZ: cz - d / 2, maxZ: cz + d / 2,
    kind: kind || 'solid',
  }, extra || {});
}

export function buildMapData() {
  const colliders = [];
  const panels = []; // tilted solar panels {x,z,rotY}
  const crates = [];
  const pylons = [];

  // Perimeter walls (h=5). Gaps are not needed: sites are entered inside.
  colliders.push(box(0, -22.5, 66, 5, 1, 'wall'));
  colliders.push(box(0, 22.5, 66, 5, 1, 'wall'));
  colliders.push(box(-32.5, 0, 1, 5, 46, 'wall'));
  colliders.push(box(32.5, 0, 1, 5, 46, 'wall'));

  // Heliostat tower — THE landmark: white cylinder r=3, h=14 at (22,-16).
  colliders.push({
    minX: 19, maxX: 25, minY: 0, maxY: 14, minZ: -19, maxZ: -13,
    kind: 'tower', cx: 22, cz: -16, r: 3, h: 14,
  });

  // Control building "HELIO CONTROL" 8x5x4 at (24,-6), door gap on west face.
  colliders.push(box(24, -8.5, 8, 4, 1.2, 'building'));
  colliders.push(box(24, -3.5, 8, 4, 1.2, 'building'));
  colliders.push(box(20.4, -6, 1.2, 4, 4, 'building'));
  colliders.push(box(27.6, -6, 1.2, 4, 4, 'building'));

  // Substation transformer boxes near (8,-14).
  colliders.push(box(8, -14, 3, 2.2, 2, 'substation'));
  colliders.push(box(12, -15, 2, 1.8, 1.6, 'substation'));
  colliders.push(box(4.5, -15.5, 1.6, 1.4, 1.4, 'substation'));

  // Water tank cylinder at (-8,-16).
  colliders.push({
    minX: -10, maxX: -6, minY: 0, maxY: 3.4, minZ: -18, maxZ: -14,
    kind: 'tank', cx: -8, cz: -16, r: 2, h: 3.4,
  });

  // Solar panel rows at Site A: 3 rows x 4 panels, tilted faces.
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const x = -26 + col * 3.4;
      const z = -16 + row * 4;
      panels.push({ x, z, rotY: 0 });
      colliders.push(box(x, z, 3.2, 2.2, 0.4, 'panel', { panel: true }));
    }
  }
  // Mirror Row panels along mid-west (the "MIRROR ROW" lane).
  for (let i = 0; i < 3; i++) {
    const x = -14, z = 6 - i * 5;
    panels.push({ x, z, rotY: Math.PI / 2 });
    colliders.push(box(x, z, 0.4, 2.2, 3.2, 'panel', { panel: true }));
  }

  // Concrete pylons.
  const pylonAt = [[-4, -10], [4, -10], [-12, 8], [12, 8], [0, -14]];
  for (const [x, z] of pylonAt) {
    pylons.push({ x, z });
    colliders.push(box(x, z, 1, 3.2, 1, 'pylon'));
  }

  // Crates (1.2-1.6 cubes, some stacked 2-high).
  const crateAt = [
    [-6, 4, 1.4, 1], [6, 4, 1.4, 1], [-18, 2, 1.6, 1], [18, 2, 1.6, 1],
    [-10, -6, 1.2, 1], [10, -6, 1.2, 1], [-2, 12, 1.4, 1], [14, -10, 1.4, 2],
    [-24, -4, 1.4, 1], [26, -4, 1.4, 1],
  ];
  for (const [x, z, s, stack] of crateAt) {
    crates.push({ x, z, s, stack });
    colliders.push(box(x, z, s, s * stack, s, 'crate'));
  }

  // Mid service-road barriers (low, waist-high, block movement not sight).
  colliders.push(box(-2, -2, 3, 1.1, 0.6, 'barrier'));
  colliders.push(box(3, 6, 3, 1.1, 0.6, 'barrier'));

  const waypoints = {
    spawnH: { x: 0, z: 18, edges: ['mid1', 'alongA1', 'alongB1'] },
    spawnU: { x: 0, z: -8, edges: ['mid3', 'holdA1', 'holdB1', 'linkW', 'linkE'] },
    mid1: { x: 0, z: 10, edges: ['spawnH', 'mid2', 'alongA1', 'alongB1'] },
    mid2: { x: 0, z: 0, edges: ['mid1', 'mid3', 'linkW', 'linkE'] },
    mid3: { x: 0, z: -8, edges: ['mid2', 'spawnU', 'siteA', 'siteB'] },
    alongA1: { x: -20, z: 10, edges: ['spawnH', 'mid1', 'alongA2'] },
    alongA2: { x: -20, z: 0, edges: ['alongA1', 'alongA3', 'linkW'] },
    alongA3: { x: -20, z: -10, edges: ['alongA2', 'siteA', 'holdA1'] },
    alongB1: { x: 20, z: 10, edges: ['spawnH', 'mid1', 'alongB2'] },
    alongB2: { x: 20, z: 0, edges: ['alongB1', 'alongB3', 'linkE'] },
    alongB3: { x: 20, z: -10, edges: ['alongB2', 'siteB', 'holdB1'] },
    linkW: { x: -12, z: 0, edges: ['mid2', 'alongA2', 'holdA1'] },
    linkE: { x: 12, z: 0, edges: ['mid2', 'alongB2', 'holdB1'] },
    siteA: { x: -22, z: -12, edges: ['alongA3', 'mid3', 'holdA2'] },
    siteB: { x: 22, z: -12, edges: ['alongB3', 'mid3', 'holdB2', 'towerBase'] },
    holdA1: { x: -18, z: -10, edges: ['alongA3', 'linkW', 'spawnU'] },
    holdA2: { x: -26, z: -10, edges: ['siteA', 'alongA3'] },
    holdB1: { x: 18, z: -10, edges: ['alongB3', 'linkE', 'spawnU'] },
    holdB2: { x: 26, z: -10, edges: ['siteB', 'alongB3'] },
    holdMid: { x: -3, z: -4, edges: ['mid2', 'mid3', 'linkW'] },
    towerBase: { x: 22, z: -14, edges: ['siteB'] },
  };

  const zones = [
    { name: 'ARRAY', x0: -30, x1: -14, z0: -20, z1: -6 },
    { name: 'TOWER', x0: 16, x1: 30, z0: -20, z1: -6 },
    { name: 'CONTROL', x0: 18, x1: 30, z0: -9, z1: -2 },
    { name: 'SUBSTATION', x0: 2, x1: 15, z0: -18, z1: -10 },
    { name: 'MIRROR ROW', x0: -17, x1: -11, z0: -2, z1: 10 },
    { name: 'SERVICE ROAD', x0: -5, x1: 5, z0: -12, z1: 14 },
    { name: 'SALT FLAT', x0: -32, x1: 32, z0: -22, z1: 22 },
  ];

  return { colliders, panels, crates, pylons, waypoints, zones, sites: SITES };
}

// Whether a point is inside either plant site (used by the plant prompt).
export function siteAt(map, x, z) {
  for (const [key, site] of Object.entries(SITES)) {
    if (Math.hypot(site.x - x, site.z - z) <= site.r) return key;
  }
  return null;
}

export function locationAt(map, x, z) {
  for (const zone of map.zones) {
    if (x >= zone.x0 && x <= zone.x1 && z >= zone.z0 && z <= zone.z1) return zone.name;
  }
  return 'SALT FLAT';
}

// Breadth-first path over the waypoint graph; returns an array of node ids.
export function findPath(map, fromId, toId) {
  if (fromId === toId) return [toId];
  const prev = { [fromId]: null };
  const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift();
    for (const nxt of map.waypoints[cur].edges) {
      if (prev[nxt] === undefined) {
        prev[nxt] = cur;
        if (nxt === toId) {
          const path = [toId];
          let n = cur;
          while (n) { path.unshift(n); n = prev[n]; }
          return path;
        }
        queue.push(nxt);
      }
    }
  }
  return [toId];
}

export function nearestWaypoint(map, x, z) {
  let best = null, bestD = Infinity;
  for (const [id, wp] of Object.entries(map.waypoints)) {
    const d = (wp.x - x) ** 2 + (wp.z - z) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}
