// hud.js — dense, readable HUD: minimap, scores + plan, kill feed, radio,
// health/armour/cash, weapon slots + ammo, CELL meter, glare icon, hitmarker,
// damage vignette, round banners, crosshair with spread feedback. All DOM,
// styled in code so index.html stays small.

import { WEAPONS } from './weapons.js';
import { locationAt, SITES } from './map.js';

let els = null;

export function buildHUD(map) {
  const hud = document.getElementById('hud');
  hud.innerHTML = '';
  const mk = (id, cls, parent) => {
    const d = document.createElement('div');
    d.id = id;
    if (cls) d.className = cls;
    (parent || hud).appendChild(d);
    return d;
  };
  els = {};
  els.minimap = mk('minimap', 'panel');
  els.mmCanvas = document.createElement('canvas');
  els.mmCanvas.width = 168; els.mmCanvas.height = 132;
  els.minimap.appendChild(els.mmCanvas);
  els.locName = mk('locname', '', els.minimap);
  els.topbar = mk('topbar', 'panel');
  els.scores = mk('scores', '', els.topbar);
  els.timer = mk('timer', '', els.topbar);
  els.round = mk('round', '', els.topbar);
  els.plan = mk('plan', '', els.topbar);
  els.feed = mk('feed', 'panel');
  els.radio = mk('radio', 'panel');
  els.vitals = mk('vitals', 'panel');
  els.hp = mk('hp', '', els.vitals);
  els.armor = mk('armor', '', els.vitals);
  els.cash = mk('cash', '', els.vitals);
  els.weapons = mk('weapons', 'panel');
  els.ammo = mk('ammo', '', els.weapons);
  els.slots = mk('slots', '', els.weapons);
  els.cell = mk('cell', 'panel');
  els.cellIcon = mk('cellicon', '', els.cell);
  els.cellBar = mk('cellbar', '', els.cell);
  els.cellFill = mk('cellfill', '', els.cellBar);
  els.cellLabel = mk('celllabel', '', els.cell);
  els.glare = mk('glare', '', els.cell);
  els.cross = mk('crosshair', '');
  for (let i = 0; i < 4; i++) {
    const arm = document.createElement('div');
    arm.className = 'ch-arm';
    els.cross.appendChild(arm);
  }
  els.dot = mk('ch-dot', '', els.cross);
  els.hitmark = mk('hitmark', '');
  els.hitmark.textContent = '✕';
  els.vignette = mk('vignette', '');
  els.banner = mk('banner', '');
  els.buy = mk('buy', 'panel');
  els.prompt = mk('prompt', '');
  els.plant = mk('plantbar', '');
  els.plantFill = mk('plantfill', '', els.plant);
  els.staging = mk('staging', '');
  els.mmCtx = els.mmCanvas.getContext('2d');
  els.map = map;
  return els;
}

function mm(map, x, z) {
  // World (-32..32, -22..22) -> minimap (168x132).
  return [((x + 32) / 64) * 168, ((z + 22) / 44) * 132];
}

function drawMinimap(state) {
  const ctx = els.mmCtx;
  if (!ctx) return;
  ctx.clearRect(0, 0, 168, 132);
  ctx.fillStyle = 'rgba(20,18,12,0.72)';
  ctx.fillRect(0, 0, 168, 132);
  ctx.strokeStyle = 'rgba(255,210,130,0.5)';
  ctx.strokeRect(1, 1, 166, 130);
  // Panel rows + tower footprint, faint.
  ctx.fillStyle = 'rgba(60,110,200,0.55)';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const [px, py] = mm(els.map, -26 + c * 3.4, -16 + r * 4);
    ctx.fillRect(px - 4, py - 2, 8, 4);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const [tx, ty] = mm(els.map, 22, -16);
  ctx.beginPath(); ctx.arc(tx, ty, 4, 0, Math.PI * 2); ctx.fill();
  // Sites.
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  for (const [key, site] of Object.entries(SITES)) {
    const [sx, sy] = mm(els.map, site.x, site.z);
    ctx.fillStyle = key === 'A' ? '#ff8c1a' : '#2a9df4';
    ctx.fillText(key, sx, sy - 8);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.stroke();
  }
  // Planted charge marker.
  if (state.bomb.state === 'planted' && state.bomb.pos) {
    const [bx, by] = mm(els.map, state.bomb.pos.x, state.bomb.pos.z);
    ctx.fillStyle = '#ff2200';
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();
  }
  // Bots: amber = HELIOS teammates, blue-grey = UMBRA.
  for (const b of state.bots) {
    if (!b.alive) continue;
    const [bx, by] = mm(els.map, b.pos.x, b.pos.z);
    ctx.fillStyle = b.team === 'helios' ? '#ffc21a' : '#7fa8e8';
    ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
  }
  // Player arrow.
  const p = state.player;
  const [px, py] = mm(els.map, p.pos.x, p.pos.z);
  ctx.save();
  ctx.translate(px, py);
  // Minimap north is up (-z); yaw 0 faces north.
  ctx.rotate(-p.yaw);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function updateHUD(state, dt) {
  if (!els) return;
  drawMinimap(state);
  const p = state.player;
  els.locName.textContent = '▸ ' + locationAt(els.map, p.pos.x, p.pos.z);
  const t = Math.max(0, Math.ceil(state.roundTime));
  els.timer.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  els.timer.style.color = t <= 10 && (state.phase === 'live' || state.phase === 'planted') ? '#ff5a3c' : '#fff';
  els.scores.innerHTML = '<span class="helios">HELIOS ' + state.score.helios + '</span> &nbsp;·&nbsp; <span class="umbra">' + state.score.umbra + ' UMBRA</span>';
  els.round.textContent = 'ROUND ' + state.round + ' OF 13';
  els.plan.textContent = state.plan;
  const phaseLabel = { buy: 'BUY PHASE', live: 'LIVE', planted: 'CHARGE PLANTED', roundEnd: 'ROUND OVER', matchEnd: 'MATCH OVER' }[state.phase];
  els.round.textContent += ' — ' + phaseLabel;

  els.feed.innerHTML = state.feed.map((f) => '<div>' + esc(f.text) + '</div>').join('');
  els.radio.innerHTML = state.radio.map((r) => '<div>📻 ' + esc(r.text) + '</div>').join('');

  els.hp.innerHTML = '♥ ' + Math.max(0, Math.round(p.hp)) + ' <span class="lbl">HEALTH</span>';
  els.hp.style.color = p.hp <= 30 ? '#ff5a3c' : '#fff';
  els.armor.innerHTML = '🛡 ' + Math.round(p.armor) + ' <span class="lbl">ARMOUR</span>';
  els.cash.innerHTML = '$' + state.money + ' <span class="lbl">CASH</span>';

  const w = WEAPONS[p.weapon];
  const load = state.loadout[p.weapon];
  els.ammo.innerHTML = (load ? load.mag : 0) + ' <span class="res">/ ' + (load ? load.reserve : 0) + '</span>'
    + (state.reloading ? ' <span class="rel">RELOADING…</span>' : '');
  els.slots.innerHTML = ['rifle', 'smg', 'sniper', 'pistol'].map((k, i) => {
    const owned = state.loadout[k].owned;
    const cur = p.weapon === k;
    return '<span class="' + (cur ? 'cur' : '') + ' ' + (owned ? '' : 'no') + '">' + (i + 1) + ' ' + WEAPONS[k].name + '</span>';
  }).join(' &nbsp; ');
  els.weapons.querySelector('.wname')?.remove();
  const wn = document.createElement('div');
  wn.className = 'wname';
  wn.textContent = w ? w.name : '';
  els.weapons.insertBefore(wn, els.ammo);

  // CELL meter + glare.
  els.cellFill.style.width = Math.round(state.solar.cell) + '%';
  els.cellIcon.textContent = '☀';
  els.cellLabel.textContent = state.solar.sunshotReady
    ? 'SUNSHOT READY — press F'
    : (state.solar.sunlit ? 'CHARGING ' + Math.round(state.solar.cell) + '%' : 'CELL ' + Math.round(state.solar.cell) + '% — FIND SUNLIGHT');
  els.cell.classList.toggle('ready', state.solar.sunshotReady);
  els.glare.textContent = '◉ GLARE ' + Math.round(state.solar.glare * 100) + '%';
  els.glare.style.opacity = String(0.35 + state.solar.glare * 0.65);

  // Crosshair spread feedback.
  const spreadPx = 6 + (state.bloom * 900) + (p.ads ? -2 : 2);
  const arms = els.cross.querySelectorAll('.ch-arm');
  arms[0].style.transform = 'translate(-50%,0) translateY(' + (-spreadPx) + 'px)';
  arms[1].style.transform = 'translate(-50%,0) translateY(' + spreadPx + 'px)';
  arms[2].style.transform = 'translate(0,-50%) translateX(' + (-spreadPx) + 'px)';
  arms[3].style.transform = 'translate(0,-50%) translateX(' + spreadPx + 'px)';
  els.cross.style.opacity = p.alive ? '1' : '0';

  els.hitmark.style.opacity = state.hitmarkT > 0 ? '1' : '0';
  els.hitmark.style.color = state.hitmarkKill ? '#ff3c2a' : '#fff';
  els.vignette.style.opacity = String(Math.min(0.85, state.damageFlash + (p.hp <= 30 && p.alive ? 0.25 + 0.15 * Math.sin(state.time * 6) : 0)));

  if (state.bannerT > 0) {
    els.banner.textContent = state.banner;
    els.banner.className = 'show ' + state.bannerKind;
  } else {
    els.banner.textContent = '';
    els.banner.className = '';
  }

  // Buy menu.
  if (state.buyOpen && state.phase === 'buy') {
    els.buy.style.display = 'block';
    els.buy.innerHTML = '<b>BUY — $' + state.money + '</b><br>'
      + '[1] VK-47 $2700 &nbsp; [2] Kestrel-9 $1500 &nbsp; [3] Lance .50 $4750<br>'
      + '[4] P9 (owned) &nbsp; [5] FRAG-2 $300 &nbsp; [6] SMK-1 $300 &nbsp; [7] Armour $650<br>'
      + '<span class="dim">B closes · buy ends when the round goes live</span>';
  } else els.buy.style.display = 'none';

  // Plant / defuse prompt.
  if (state.phase === 'live' && state.bomb.state === 'carried' && state.bomb.carrier === 'player') {
    const loc = locationAt(els.map, p.pos.x, p.pos.z);
    if (loc === 'ARRAY' || loc === 'TOWER') {
      els.prompt.textContent = 'HOLD E TO PLANT — ' + loc;
      els.prompt.style.display = 'block';
      els.plant.style.display = 'block';
      els.plantFill.style.width = Math.round((state.bomb.plantT / 3) * 100) + '%';
    } else {
      els.prompt.style.display = 'none';
      els.plant.style.display = 'none';
    }
  } else {
    els.prompt.style.display = 'none';
    els.plant.style.display = 'none';
  }
  if (state.phase === 'planted' && state.bomb.pos) {
    els.prompt.textContent = 'CHARGE AT ' + (state.bomb.site || '') + ' — ' + Math.ceil(state.bomb.fuse) + 's TO DETONATION';
    els.prompt.style.display = 'block';
  }

  // Glare wash overlay on the whole view.
  const glareEl = document.getElementById('glarewash');
  if (glareEl) {
    glareEl.style.opacity = String(state.solar.glare * 0.55);
  }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// One-line match summary for the match-end banner.
export function matchSummary(state) {
  return 'HELIOS ' + state.score.helios + ' — ' + state.score.umbra + ' UMBRA · KILLS ' + state.stats.kills;
}
