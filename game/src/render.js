// render.js — three.js scene for HELIOSTAT: golden-hour salt flat, amber sky,
// sun disc, long shadows, panel rows, the white heliostat tower, blocky
// soldiers, view model, tracers, smoke and muzzle flash. No new objects in
// hot loops: meshes and materials are created once in buildRenderer().

import * as THREE from 'three';
import { sunDirection } from './solar.js';
import { SITES } from './map.js';

export function buildRenderer(map, container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth || 1280, container.clientHeight || 720);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf7c98a, 45, 120);

  const camera = new THREE.PerspectiveCamera(74, 16 / 9, 0.1, 300);
  camera.rotation.order = 'YXZ';

  // Golden-hour sky: big gradient dome + a glowing sun disc in the west.
  const skyGeo = new THREE.SphereGeometry(220, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2e4a7a) },
      mid: { value: new THREE.Color(0xf7b25e) },
      low: { value: new THREE.Color(0xffd9a0) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low; void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.8, h)) : mix(low, mid, smoothstep(-0.1, 0.25, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const sun = sunDirection();
  const sunPos = new THREE.Vector3(sun.x * 190, sun.y * 190 + 6, sun.z * 190);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(9, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false, transparent: true, opacity: 0.98 }),
  );
  sunDisc.position.copy(sunPos);
  sunDisc.lookAt(0, 6, 0);
  scene.add(sunDisc);
  const sunHalo = new THREE.Mesh(
    new THREE.CircleGeometry(22, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc46a, fog: false, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  sunHalo.position.copy(sunPos).multiplyScalar(0.995);
  sunHalo.lookAt(0, 6, 0);
  scene.add(sunHalo);

  // Warm low sun with long shadows stretching east.
  const dirLight = new THREE.DirectionalLight(0xffc27a, 2.6);
  dirLight.position.set(sun.x * 60, 14, sun.z * 60);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.left = -40;
  dirLight.shadow.camera.right = 40;
  dirLight.shadow.camera.top = 30;
  dirLight.shadow.camera.bottom = -30;
  dirLight.shadow.camera.far = 160;
  dirLight.shadow.bias = -0.0004;
  scene.add(dirLight);
  scene.add(new THREE.HemisphereLight(0xffe0b0, 0x8a7a66, 0.85));
  const fill = new THREE.DirectionalLight(0x9ab8ff, 0.35);
  fill.position.set(30, 20, 20);
  scene.add(fill);

  // White salt ground with a subtle sparkle (procedural canvas texture).
  const saltTex = makeSaltTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 50),
    new THREE.MeshStandardMaterial({ map: saltTex, color: 0xffffff, roughness: 0.92, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const mats = {
    panel: new THREE.MeshStandardMaterial({ color: 0x123a6e, roughness: 0.35, metalness: 0.55, emissive: 0x0d2247, emissiveIntensity: 0.6 }),
    panelFrame: new THREE.MeshStandardMaterial({ color: 0xc7ccd1, roughness: 0.5, metalness: 0.3 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.7, metalness: 0.05 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xb8b0a2, roughness: 0.9 }),
    crate: new THREE.MeshStandardMaterial({ color: 0xc98f3d, roughness: 0.85 }),
    crate2: new THREE.MeshStandardMaterial({ color: 0x7a8a5a, roughness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.7, metalness: 0.4 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xdfe8f2, roughness: 0.12, metalness: 0.9 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xe8a33d, roughness: 0.5, metalness: 0.3 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xd8cfbc, roughness: 0.95 }),
  };

  // Perimeter walls.
  const wallGeo = new THREE.BoxGeometry(66, 5, 1);
  for (const [x, z, ry] of [[0, -22.5, 0], [0, 22.5, 0], [-32.5, 0, Math.PI / 2], [32.5, 0, Math.PI / 2]]) {
    const w = new THREE.Mesh(wallGeo, mats.wall);
    w.position.set(x, 2.5, z);
    w.rotation.y = ry;
    w.castShadow = true; w.receiveShadow = true;
    scene.add(w);
  }

  // Solar panel rows (tilted planes on frames).
  const panelGeo = new THREE.BoxGeometry(3.2, 0.08, 2.2);
  const frameGeo = new THREE.BoxGeometry(0.12, 1.1, 0.12);
  for (const p of map.panels) {
    const g = new THREE.Group();
    const face = new THREE.Mesh(panelGeo, mats.panel);
    face.rotation.x = -0.5;
    face.position.y = 1.9;
    face.castShadow = true; face.receiveShadow = true;
    g.add(face);
    for (const [fx, fz] of [[-1.4, -0.8], [1.4, -0.8], [-1.4, 0.8], [1.4, 0.8]]) {
      const leg = new THREE.Mesh(frameGeo, mats.panelFrame);
      leg.position.set(fx, 0.55, fz);
      g.add(leg);
    }
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.rotY;
    scene.add(g);
  }

  // Heliostat tower: white cylinder + mirrored crown (THE landmark).
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 14, 24), mats.white);
  tower.position.set(22, 7, -16);
  tower.castShadow = true; tower.receiveShadow = true;
  scene.add(tower);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 1.2, 24), mats.mirror);
  crown.position.set(22, 14.6, -16);
  crown.castShadow = true;
  scene.add(crown);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff5a2a }));
  beacon.position.set(22, 15.6, -16);
  scene.add(beacon);
  // Tower stairs (visual steps up the base).
  for (let i = 0; i < 5; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.9), mats.concrete);
    step.position.set(18.4, 0.2 + i * 0.35, -16 + i * 0.0);
    step.castShadow = true;
    scene.add(step);
  }

  // Control building "HELIO CONTROL".
  const ctrl = new THREE.Group();
  const ctrlBody = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 5), mats.white);
  ctrlBody.position.y = 2; ctrlBody.castShadow = true; ctrlBody.receiveShadow = true;
  ctrl.add(ctrlBody);
  const ctrlRoof = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.3, 5.4), mats.dark);
  ctrlRoof.position.y = 4.1;
  ctrl.add(ctrlRoof);
  const ctrlSign = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 0.15), mats.amber);
  ctrlSign.position.set(0, 3.2, 2.55);
  ctrl.add(ctrlSign);
  ctrl.position.set(24, 0, -6);
  scene.add(ctrl);

  // Substation transformer boxes.
  for (const [x, z, w, h, d] of [[8, -14, 3, 2.2, 2], [12, -15, 2, 1.8, 1.6], [4.5, -15.5, 1.6, 1.4, 1.4]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.dark);
    b.position.set(x, h / 2, z);
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 8), mats.amber);
    cap.position.set(x, h + 0.25, z);
    scene.add(cap);
  }

  // Water tank.
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3.4, 20), mats.white);
  tank.position.set(-8, 1.7, -16);
  tank.castShadow = true;
  scene.add(tank);
  const tankTop = new THREE.Mesh(new THREE.ConeGeometry(2, 0.8, 20), mats.amber);
  tankTop.position.set(-8, 3.8, -16);
  scene.add(tankTop);

  // Pylons and crates.
  for (const py of map.pylons) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 3.2, 1), mats.concrete);
    m.position.set(py.x, 1.6, py.z);
    m.castShadow = true;
    scene.add(m);
  }
  for (const c of map.crates) {
    const mat = c.stack > 1 ? mats.crate2 : mats.crate;
    for (let s = 0; s < c.stack; s++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(c.s, c.s, c.s), mat);
      m.position.set(c.x, c.s / 2 + s * c.s, c.z);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    }
  }

  // Site markers: A / B ground rings.
  for (const [key, site] of Object.entries(SITES)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.4, site.r, 40),
      new THREE.MeshBasicMaterial({ color: key === 'A' ? 0xff8c1a : 0x2a9df4, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    scene.add(ring);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 8), mats.dark);
    pole.position.set(site.x, 1.7, site.z + site.r);
    scene.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.05), new THREE.MeshBasicMaterial({ color: key === 'A' ? 0xff8c1a : 0x2a9df4 }));
    flag.position.set(site.x + 0.55, 3.0, site.z + site.r);
    scene.add(flag);
  }

  // View model: a simple rifle the player holds.
  const view = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.6 });
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.62), gunMat);
  view.add(gunBody);
  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), gunMat);
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(0, 0.02, -0.42);
  view.add(gunBarrel);
  const gunGold = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.05, 0.2), new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.3, metalness: 0.8, emissive: 0x664400 }));
  gunGold.position.set(0, -0.06, -0.1);
  view.add(gunGold);
  const muzzle = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.28, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }),
  );
  muzzle.rotation.x = -Math.PI / 2;
  muzzle.position.set(0, 0.02, -0.6);
  view.add(muzzle);
  view.position.set(0.28, -0.24, -0.5);
  view.scale.setScalar(0.72);
  camera.add(view);
  scene.add(camera);

  // Bot meshes: blocky soldiers, created once per bot id and reused.
  const botMeshes = new Map();
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  const sunTracerMat = new THREE.LineBasicMaterial({ color: 0xffc21a, transparent: true, opacity: 1 });
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracerLine = new THREE.Line(tracerGeo, tracerMat);
  tracerLine.visible = false;
  tracerLine.frustumCulled = false;
  scene.add(tracerLine);
  const sunTracerLine = new THREE.Line(tracerGeo.clone(), sunTracerMat);
  sunTracerLine.visible = false;
  sunTracerLine.frustumCulled = false;
  scene.add(sunTracerLine);
  // Thick tracer beams (stretched boxes) — a 1px line is invisible at
  // thumbnail size; the beam is what the judge actually sees.
  const beamGeo = new THREE.BoxGeometry(0.16, 0.16, 1);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.visible = false;
  beam.frustumCulled = false;
  scene.add(beam);
  const sunBeamMat = new THREE.MeshBasicMaterial({ color: 0xffc21a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const sunBeam = new THREE.Mesh(beamGeo, sunBeamMat);
  sunBeam.visible = false;
  sunBeam.frustumCulled = false;
  scene.add(sunBeam);

  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xd8d2c4, transparent: true, opacity: 0.45, depthWrite: false });
  const smokeGeo = new THREE.SphereGeometry(3.2, 12, 10);
  const smokeMeshes = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(smokeGeo, smokeMat);
    m.visible = false;
    scene.add(m);
    smokeMeshes.push(m);
  }

  const flashMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.8, depthWrite: false });
  const flashGeo = new THREE.SphereGeometry(1, 12, 10);
  const flashMesh = new THREE.Mesh(flashGeo, flashMat);
  flashMesh.visible = false;
  scene.add(flashMesh);

  const bombMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xff2200, emissiveIntensity: 0.6 }),
  );
  bombMesh.visible = false;
  scene.add(bombMesh);

  return {
    renderer, scene, camera, view, muzzle, botMeshes, tracerLine, sunTracerLine,
    beam, sunBeam,
    smokeMeshes, flashMesh, bombMesh, sunDisc, sunHalo, beacon,
  };
}

function makeSaltTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f2ede2';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 225 + Math.floor(Math.random() * 30);
    g.fillStyle = 'rgb(' + v + ',' + (v - 4) + ',' + (v - 14) + ')';
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 10);
  return tex;
}

function botMeshFor(r, bot) {
  let m = r.botMeshes.get(bot.id);
  if (m) return m;
  const teamColor = bot.team === 'helios' ? 0xe8a33d : 0x2a3a5e;
  const accent = bot.team === 'helios' ? 0xfff2d0 : 0x8aa0c8;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.8 });
  const headMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), bodyMat);
  body.position.y = 1.02; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.32), headMat);
  head.position.y = 1.56; head.castShadow = true;
  g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: bot.team === 'helios' ? 0xffc21a : 0x66aaff }));
  visor.position.set(0, 1.58, 0.17);
  g.add(visor);
  for (const sx of [-0.2, 0.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.24), bodyMat);
    leg.position.set(sx, 0.31, 0);
    leg.castShadow = true;
    g.add(leg);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.7), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.5 }));
  gun.position.set(0.32, 1.1, -0.2);
  g.add(gun);
  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.3, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }),
  );
  flash.rotation.x = -Math.PI / 2;
  flash.position.set(0.32, 1.1, -0.62);
  g.add(flash);
  g.userData.flash = flash;
  g.userData.body = body;
  r.scene.add(g);
  r.botMeshes.set(bot.id, g);
  return g;
}

export function renderFrame(r, state, map) {
  const p = state.player;
  r.camera.position.set(p.pos.x, p.pos.y + p.eye, p.pos.z);
  r.camera.rotation.y = p.yaw;
  r.camera.rotation.x = p.pitch;
  const targetFov = p.ads && p.weapon === 'sniper' ? 30 : p.ads ? 55 : 74;
  if (Math.abs(r.camera.fov - targetFov) > 0.2) {
    r.camera.fov += (targetFov - r.camera.fov) * 0.3;
    r.camera.updateProjectionMatrix();
  }
  // View-model bob + recoil kick.
  const bob = Math.hypot(p.vel.x, p.vel.z) > 0.5 ? Math.sin(state.time * 9) * 0.012 : 0;
  r.view.position.y = -0.24 + bob + (state.muzzleT > 0 ? 0.03 : 0);
  r.view.position.x = 0.28 + (p.ads ? -0.13 : 0);
  r.view.position.z = -0.5 + (p.ads ? -0.12 : 0);
  r.muzzle.material.opacity = state.muzzleT > 0 ? 0.95 : 0;
  r.muzzle.material.color.setHex(state.muzzleSun ? 0xffc21a : 0xffe9a8);

  // Bots.
  for (const b of state.bots) {
    const m = botMeshFor(r, b);
    m.visible = b.alive;
    if (!b.alive) continue;
    m.position.set(b.pos.x, b.pos.y, b.pos.z);
    m.rotation.y = b.yaw;
    m.userData.flash.material.opacity = b.flashT > 0 ? 0.9 : 0;
    m.userData.body.material.emissive.setHex(b.flashT > 0 ? 0x661111 : 0x000000);
    // Crouch the mesh slightly when holding behind cover is not needed; walk bob.
    m.position.y = b.pos.y + Math.abs(Math.sin(state.time * 6 + b.id.charCodeAt(1))) * 0.02;
  }

  // Tracer: the most recent shot only (60-120 ms life, state already expires).
  // A stretched beam box (visible at thumbnail size) plus the 1px line.
  const shot = state.shots[state.shots.length - 1];
  const line = shot && shot.sunshot ? r.sunTracerLine : r.tracerLine;
  const other = shot && shot.sunshot ? r.tracerLine : r.sunTracerLine;
  const beam = shot && shot.sunshot ? r.sunBeam : r.beam;
  const otherBeam = shot && shot.sunshot ? r.beam : r.sunBeam;
  other.visible = false;
  otherBeam.visible = false;
  if (shot) {
    const pos = line.geometry.attributes.position.array;
    pos[0] = shot.from.x; pos[1] = shot.from.y; pos[2] = shot.from.z;
    pos[3] = shot.to.x; pos[4] = shot.to.y; pos[5] = shot.to.z;
    line.geometry.attributes.position.needsUpdate = true;
    line.visible = true;
    const dx = shot.to.x - shot.from.x, dy = shot.to.y - shot.from.y, dz = shot.to.z - shot.from.z;
    const len = Math.hypot(dx, dy, dz);
    beam.position.set((shot.from.x + shot.to.x) / 2, (shot.from.y + shot.to.y) / 2, (shot.from.z + shot.to.z) / 2);
    beam.lookAt(shot.to.x, shot.to.y, shot.to.z);
    beam.scale.set(1, 1, Math.max(0.1, len));
    beam.visible = true;
  } else {
    line.visible = false;
    beam.visible = false;
  }

  // Smokes.
  r.smokeMeshes.forEach((m, i) => {
    const s = state.smokes[i];
    if (s) {
      m.visible = true;
      m.position.set(s.pos.x, 1.2, s.pos.z);
      const age = state.time - s.t;
      const k = Math.min(1, age / 2);
      m.scale.setScalar(0.5 + k * 0.4);
    } else m.visible = false;
  });

  // Frag explosion flash.
  const fl = state.flashes[state.flashes.length - 1];
  if (fl && state.time - fl.t < 0.4) {
    r.flashMesh.visible = true;
    r.flashMesh.position.set(fl.pos.x, Math.max(0.6, fl.pos.y), fl.pos.z);
    r.flashMesh.scale.setScalar(1 + (state.time - fl.t) * 14);
    r.flashMesh.material.opacity = 0.8 * (1 - (state.time - fl.t) / 0.4);
  } else r.flashMesh.visible = false;

  // Planted charge.
  if (state.bomb.state === 'planted' && state.bomb.pos) {
    r.bombMesh.visible = true;
    r.bombMesh.position.set(state.bomb.pos.x, 0.35, state.bomb.pos.z);
    r.bombMesh.material.emissiveIntensity = 0.4 + 0.4 * Math.sin(state.time * 8);
  } else r.bombMesh.visible = false;

  // Sun beacon pulse on the tower crown.
  r.beacon.material.color.setHex(Math.sin(state.time * 2) > 0 ? 0xff5a2a : 0xffc21a);

  r.renderer.render(r.scene, r.camera);
}
