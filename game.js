import * as THREE from './three.module.js';

/* ============================================================
   NEON RIFT: BLACKOUT — arena FPS
   ============================================================ */

const $ = id => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const lerp = (a,b,t) => a + (b-a)*t;
const rand = (a,b) => a + Math.random()*(b-a);

const DEFAULT_SETTINGS = { sens:1.0, fov:75, volume:0.55, quality:1.5 };
function loadSettings(){
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem('neonRiftSettings') || '{}')) }; }
  catch(e){ return { ...DEFAULT_SETTINGS }; }
}
const SETTINGS = loadSettings();
function saveSettings(){ localStorage.setItem('neonRiftSettings', JSON.stringify(SETTINGS)); }

/* ---- rebindable keys ---- */
const DEFAULT_BINDS = {
  fwd:'KeyW', back:'KeyS', left:'KeyA', right:'KeyD',
  jump:'Space', sprint:'ShiftLeft', slide:'KeyQ', crouch:'KeyC', fire:'KeyX',
  reload:'KeyR', nade:'KeyG', finisher:'KeyF',
  gun:'Digit1', knife:'Digit2', ads:'ControlLeft',
};
const BIND_LABELS = {
  fwd:'Move Forward', back:'Move Back', left:'Strafe Left', right:'Strafe Right',
  jump:'Jump', sprint:'Sprint', slide:'Slide (hold sprint)', crouch:'Crouch (hold)', fire:'Fire / Swing',
  reload:'Reload', nade:'Throw Grenade', finisher:'Finisher',
  gun:'Weapon — Gun', knife:'Weapon — Knife', ads:'Aim / Scope (hold)',
};
if (!SETTINGS.binds || typeof SETTINGS.binds !== 'object') SETTINGS.binds = {};
SETTINGS.binds = { ...DEFAULT_BINDS, ...SETTINGS.binds };
// binds v2: slide moved C→Q and crouch took C; migrate old saves so they don't collide
if ((SETTINGS.bindVersion || 0) < 2){
  if (SETTINGS.binds.slide === 'KeyC') SETTINGS.binds.slide = 'KeyQ';
  SETTINGS.bindVersion = 2;
  saveSettings();
}
function bindCode(id){ return SETTINGS.binds[id] ?? DEFAULT_BINDS[id]; }
function bindDown(id){ return !!keys[bindCode(id)]; }
function friendlyKeyName(code){
  if (!code) return 'UNBOUND';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'NUM ')
    .replace(/^Control/, 'CTRL').replace(/^Shift/, 'SHIFT').replace(/^Alt/, 'ALT')
    .replace('Left', ' L').replace('Right', ' R').toUpperCase();
}
function assignBind(id, code){
  if (!BIND_LABELS[id] || !code) return;
  for (const other of Object.keys(DEFAULT_BINDS))   // a key can only drive one action
    if (other !== id && SETTINGS.binds[other] === code) SETTINGS.binds[other] = '';
  SETTINGS.binds[id] = code;
  saveSettings();
}

const SKINS = [
  { id:'rift',     name:'Rift Runner',    desc:'Standard black/cyan combat shell',      color:0x2c6eff, eye:0x2cf2ff, cost:0,    level:1 },
  { id:'crimson',  name:'Crimson Ghost',  desc:'Red assault armor for close fights',    color:0xb72a3a, eye:0xff3b57, cost:250,  level:2 },
  { id:'cobalt',   name:'Cobalt Wraith',  desc:'Deep blue recon shell',                 color:0x22409a, eye:0x66aaff, cost:350,  level:2 },
  { id:'ember',    name:'Ember Jackal',   desc:'Scorched orange raider plating',        color:0x9a4a1f, eye:0xff9a3c, cost:450,  level:3 },
  { id:'jade',     name:'Jade Ronin',     desc:'Temple green duelist frame',            color:0x1f7a5a, eye:0x66ffc2, cost:600,  level:4 },
  { id:'solar',    name:'Solar Warden',   desc:'Gold reactive plating',                 color:0xc87922, eye:0xffd040, cost:650,  level:4 },
  { id:'void',     name:'Void Specter',   desc:'Black violet stealth frame',            color:0x3d246a, eye:0xd040ff, cost:900,  level:5 },
  { id:'hornet',   name:'Circuit Hornet', desc:'Hazard yellow shock trooper',           color:0x8a7418, eye:0xffea66, cost:1050, level:6 },
  { id:'toxic',    name:'Toxic Phantom',  desc:'Green biohazard glow suit',             color:0x287a42, eye:0x8fe08a, cost:1250, level:7 },
  { id:'siren',    name:'Plasma Siren',   desc:'Magenta nightclub combat shell',        color:0x8a1f6a, eye:0xff5ad0, cost:1450, level:8 },
  { id:'arctic',   name:'Arctic Neon',    desc:'White/blue high contrast shell',        color:0x9eb9d6, eye:0x66eaff, cost:1700, level:9 },
  { id:'ghost',    name:'Ghost Protocol', desc:'Pale grey special-operations frame',    color:0x8a94a6, eye:0xeafcff, cost:1900, level:10 },
  { id:'obsidian', name:'Obsidian Shade', desc:'Matte black shell with power conduits', color:0x15161c, eye:0x2cf2ff, cost:2100, level:11 },
  { id:'royal',    name:'Royal Blackout', desc:'Prestige purple-gold operator',         color:0x5a36a0, eye:0xff9a3c, cost:2400, level:12 },
  { id:'nemesis',  name:'Nemesis Shell',  desc:'Blackened red breach armor',            color:0x3a1216, eye:0xff2020, cost:2800, level:13 },
  { id:'aurum',    name:'Aurum Prime',    desc:'Gilded champion frame of the rift',     color:0x8a6a1f, eye:0xffe680, cost:3200, level:14 },
];
function xpForLevel(level){ return level <= 1 ? 0 : Math.floor(120 * Math.pow(level-1, 1.65) + 80 * (level-1)); }
function levelFromXp(xp){ let lvl = 1; while (lvl < 99 && xp >= xpForLevel(lvl+1)) lvl++; return lvl; }
function skinDef(id){ return SKINS.find(s => s.id === id) || SKINS[0]; }
function defaultProgress(){ return { xp:0, cash:0, skin:'rift', unlocked:['rift'], totalKills:0, soloWaves:0, dmWins:0, name:'RIFT-OPS', challengeState:{} }; }
function loadProgress(){
  try {
    const p = { ...defaultProgress(), ...(JSON.parse(localStorage.getItem('neonRiftProgress') || '{}')) };
    if (!Array.isArray(p.unlocked)) p.unlocked = ['rift'];
    if (!p.challengeState || typeof p.challengeState !== 'object') p.challengeState = {};
    p.name = String(p.name || 'RIFT-OPS').toUpperCase().replace(/[<>]/g,'').slice(0,14);
    if (!p.unlocked.includes('rift')) p.unlocked.push('rift');
    if (!p.unlocked.includes(p.skin)) p.skin = 'rift';
    return p;
  } catch(e){ return defaultProgress(); }
}
const PROGRESS = loadProgress();
function saveProgress(){ localStorage.setItem('neonRiftProgress', JSON.stringify(PROGRESS)); }
function progressLevel(){ return levelFromXp(PROGRESS.xp); }
function grantProgress(xp=0, cash=0, reason=''){
  const before = progressLevel();
  PROGRESS.xp = Math.max(0, Math.floor(PROGRESS.xp + xp));
  PROGRESS.cash = Math.max(0, Math.floor(PROGRESS.cash + cash));
  if (typeof S !== 'undefined' && S.started){ S.xpEarned += xp; S.cashEarned += cash; }
  saveProgress();
  updateProgressUI();
  const after = progressLevel();
  if (after > before){ showBanner('LEVEL ' + after); SFX.roundStart(); }
  if ((xp || cash) && reason) addKillFeed(null, `+${cash} CR &nbsp;//&nbsp; +${xp} XP &nbsp;<b>${reason}</b>`);
}
function dateKey(){ const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; }
function weekKey(){ const d = new Date(); const oneJan = new Date(d.getFullYear(),0,1); return `${d.getFullYear()}-W${Math.ceil((((d-oneJan)/86400000)+oneJan.getDay()+1)/7)}`; }
function activeChallenges(){
  return [
    { id:'daily-kills-'+dateKey(), kind:'daily', type:'kill', title:'Daily Hunt', desc:'Get 30 eliminations', target:30, xp:500, cash:350 },
    { id:'daily-waves-'+dateKey(), kind:'daily', type:'wave', title:'Wavebreaker', desc:'Clear 5 solo waves', target:5, xp:450, cash:300 },
    { id:'weekly-wins-'+weekKey(), kind:'weekly', type:'dmWin', title:'Blackout Champion', desc:'Win 2 LAN rounds', target:2, xp:1500, cash:900 },
  ];
}
function challengeEntry(ch){
  if (!PROGRESS.challengeState[ch.id]) PROGRESS.challengeState[ch.id] = { value:0, complete:false };
  return PROGRESS.challengeState[ch.id];
}
function trackChallenge(type, amount=1){
  let changed = false;
  for (const ch of activeChallenges()){
    if (ch.type !== type) continue;
    const st = challengeEntry(ch);
    if (st.complete) continue;
    st.value = Math.min(ch.target, (st.value || 0) + amount);
    changed = true;
    if (st.value >= ch.target){
      st.complete = true;
      grantProgress(ch.xp, ch.cash, ch.title.toUpperCase());
      showBanner(ch.kind.toUpperCase() + ' COMPLETE');
    }
  }
  if (changed){ saveProgress(); updateChallengeUI(); }
}
function updateChallengeUI(){
  const box = $('challengeList'); if (!box) return;
  box.innerHTML = activeChallenges().map(ch => {
    const st = challengeEntry(ch); const v = Math.min(ch.target, st.value || 0); const pct = clamp(v/ch.target,0,1)*100;
    return `<div class="challengeRow ${st.complete?'done':''}"><div><b>${ch.title}</b><span>${ch.desc}</span></div><em>${st.complete?'CLAIMED':v+'/'+ch.target}</em><i style="width:${pct}%"></i></div>`;
  }).join('');
}

/* ---------------- deterministic rng for map ---------------- */
function mulberry32(seed){ return function(){ let t = seed += 0x6D2B79F5;
  t = Math.imul(t ^ t>>>15, t|1); t ^= t + Math.imul(t ^ t>>>7, t|61);
  return ((t ^ t>>>14) >>> 0) / 4294967296; }; }
const mrand = mulberry32(1337);

/* ================= RENDERER / SCENE ================= */
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, SETTINGS.quality));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x131a28, 0.0105);

const camera = new THREE.PerspectiveCamera(SETTINGS.fov, innerWidth/innerHeight, 0.05, 500);
camera.rotation.order = 'YXZ';
scene.add(camera);

function applyRuntimeSettings(){
  renderer.setPixelRatio(Math.min(devicePixelRatio, SETTINGS.quality));
  renderer.setSize(innerWidth, innerHeight);
  camera.fov = SETTINGS.fov;
  camera.updateProjectionMatrix();
  if (master) master.gain.value = SETTINGS.volume;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ================= SKY & LIGHTING ================= */
(function buildSky(){
  const c = document.createElement('canvas'); c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0,0,0,256);
  grad.addColorStop(0.0, '#060a18');
  grad.addColorStop(0.42,'#101c38');
  grad.addColorStop(0.58,'#3a2e55');
  grad.addColorStop(0.68,'#b04a3a');
  grad.addColorStop(0.75,'#ffa050');
  grad.addColorStop(1.0, '#1a1420');
  g.fillStyle = grad; g.fillRect(0,0,16,256);
  const tex = new THREE.CanvasTexture(c);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(380, 24, 16),
    new THREE.MeshBasicMaterial({ map:tex, side:THREE.BackSide, fog:false, depthWrite:false })
  );
  scene.add(sky);
  // sun glow sprite
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sg = sc.getContext('2d');
  const rg = sg.createRadialGradient(64,64,4,64,64,64);
  rg.addColorStop(0,'rgba(255,230,180,1)'); rg.addColorStop(0.25,'rgba(255,170,90,.8)'); rg.addColorStop(1,'rgba(255,120,60,0)');
  sg.fillStyle = rg; sg.fillRect(0,0,128,128);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(sc), blending:THREE.AdditiveBlending, fog:false, depthWrite:false }));
  sun.scale.set(90,90,1); sun.position.set(-180, 36, -300);
  scene.add(sun);
})();

// stars
(function buildStars(){
  const n = 420, pos = new Float32Array(n*3);
  for (let i=0;i<n;i++){
    const a = Math.random()*Math.PI*2, e = Math.acos(Math.random()*0.92);
    const r = 350;
    pos[i*3]   = Math.cos(a)*Math.sin(e)*r;
    pos[i*3+1] = Math.cos(e)*r + 14;
    pos[i*3+2] = Math.sin(a)*Math.sin(e)*r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color:0xcfe4ff, size:1.6, sizeAttenuation:false, fog:false, transparent:true, opacity:0.85, depthWrite:false }));
  scene.add(stars);
})();
// drifting dust motes
let dustCloud;
(function buildDust(){
  const n = 90, pos = new Float32Array(n*3);
  for (let i=0;i<n;i++){
    pos[i*3] = rand(-42,42); pos[i*3+1] = rand(0.4, 7); pos[i*3+2] = rand(-42,42);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustCloud = new THREE.Points(g, new THREE.PointsMaterial({ color:0x7fd8e8, size:1.5, sizeAttenuation:false, transparent:true, opacity:0.32, blending:THREE.AdditiveBlending, depthWrite:false }));
  scene.add(dustCloud);
})();

scene.add(new THREE.HemisphereLight(0x7a96d8, 0x4a4038, 1.9));
const sunLight = new THREE.DirectionalLight(0xffb070, 1.6);
sunLight.position.set(-60, 55, -80);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -70; sunLight.shadow.camera.right = 70;
sunLight.shadow.camera.top = 70;   sunLight.shadow.camera.bottom = -70;
sunLight.shadow.camera.far = 260;  sunLight.shadow.bias = -0.0006;
scene.add(sunLight);
const fillLight = new THREE.DirectionalLight(0x4a6ab0, 0.85);
fillLight.position.set(40, 30, 60);
scene.add(fillLight);

/* ================= AUDIO ENGINE (synth) ================= */
let actx = null, master = null, noiseBuf = null;
function initAudio(){
  if (actx) { actx.resume(); return; }
  actx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = actx.createDynamicsCompressor();
  master = actx.createGain(); master.gain.value = SETTINGS.volume;
  master.connect(comp); comp.connect(actx.destination);
  const len = actx.sampleRate * 1.2;
  noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i=0;i<len;i++) d[i] = Math.random()*2-1;
  // ambient wind bed
  const wind = actx.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
  const wf = actx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 240; wf.Q.value = 0.4;
  const wg = actx.createGain(); wg.gain.value = 0.05;
  const lfo = actx.createOscillator(); lfo.frequency.value = 0.13;
  const lfoG = actx.createGain(); lfoG.gain.value = 90;
  lfo.connect(lfoG); lfoG.connect(wf.frequency); lfo.start();
  wind.connect(wf); wf.connect(wg); wg.connect(master);
  wind.start();
}
function playNoise(dur, freq, q, vol, type='lowpass', decayPow=4){
  if (!actx) return;
  const t = actx.currentTime;
  const src = actx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = rand(0.9,1.1);
  const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}
function playTone(freq, endFreq, dur, vol, type='sine'){
  if (!actx) return;
  const t = actx.currentTime;
  const o = actx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(endFreq,1), t + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
const SFX = {
  rifle(){ playNoise(0.16, 1800, 0.8, 0.8); playTone(160, 40, 0.12, 0.5, 'triangle'); },
  shotgun(){ playNoise(0.34, 900, 0.6, 1.0); playTone(110, 30, 0.22, 0.7, 'sawtooth'); },
  pistol(){ playNoise(0.12, 2400, 0.9, 0.6); playTone(220, 60, 0.09, 0.4, 'triangle'); },
  sniper(){ playNoise(0.55, 1100, 0.6, 1.1); playTone(2600, 180, 0.3, 0.22, 'sawtooth'); playTone(85, 28, 0.35, 0.65, 'sine'); },
  slide(){ playNoise(0.38, 520, 0.6, 0.3); },
  nadeBounce(){ playTone(340, 220, 0.06, 0.22, 'square'); },
  bigBoom(){ playNoise(0.8, 260, 0.5, 1.2); playTone(55, 18, 0.55, 0.9, 'sine'); playNoise(0.3, 1500, 0.8, 0.5, 'bandpass'); },
  dry(){ playTone(900, 700, 0.05, 0.15, 'square'); },
  reload1(){ playTone(500, 300, 0.05, 0.2, 'square'); playNoise(0.05, 3000, 2, 0.2,'bandpass'); },
  reload2(){ playTone(700, 900, 0.06, 0.25, 'square'); playNoise(0.06, 4000, 2, 0.25,'bandpass'); },
  reloadMag(){ playTone(360, 180, 0.07, 0.18, 'triangle'); playNoise(0.07, 1800, 3, 0.24, 'bandpass'); },
  reloadBolt(){ playTone(880, 420, 0.08, 0.24, 'square'); playNoise(0.08, 5200, 2.5, 0.22, 'highpass'); },
  hit(){ playTone(2200, 1800, 0.045, 0.28, 'square'); },
  kill(){ playTone(1400, 2600, 0.12, 0.3, 'square'); playNoise(0.3, 700, 0.8, 0.5); },
  hurt(){ playTone(90, 40, 0.25, 0.7, 'sine'); playNoise(0.18, 500, 0.6, 0.4); },
  step(vol=1){ playNoise(0.07, rand(300,450), 0.7, 0.18 * vol); },
  jump(){ playNoise(0.1, 600, 0.8, 0.2); },
  land(){ playNoise(0.12, 350, 0.7, 0.35); },
  enemyShot(){ playTone(1200, 300, 0.14, 0.22, 'sawtooth'); playNoise(0.1, 2000, 1, 0.15,'bandpass'); },
  pickup(){ playTone(600, 1200, 0.12, 0.3, 'sine'); playTone(900, 1800, 0.14, 0.2, 'sine'); },
  wave(){ playTone(220, 440, 0.4, 0.3, 'sawtooth'); playTone(330, 660, 0.5, 0.2, 'sawtooth'); },
  roundStart(){ playTone(260, 620, 0.35, 0.38, 'sawtooth'); setTimeout(()=>playTone(420, 900, 0.25, 0.25, 'square'), 160); },
  roundWin(){ playTone(520, 1040, 0.45, 0.36, 'square'); setTimeout(()=>playTone(780, 1560, 0.42, 0.28, 'square'), 180); },
  vote(){ playTone(700, 1050, 0.09, 0.22, 'triangle'); },
  respawn(){ playTone(360, 900, 0.16, 0.28, 'sine'); playNoise(0.12, 1800, 1, 0.18, 'bandpass'); },
  bodyBreak(){ playNoise(0.32, 520, 0.9, 0.65); playTone(140, 55, 0.25, 0.28, 'sawtooth'); },
  explode(){ playNoise(0.5, 400, 0.5, 0.9); playTone(100, 25, 0.4, 0.6, 'sine'); },
};

/* ================= WORLD GEOMETRY ================= */
const ARENA = 46;              // half-size of play area
const solids = [];             // {min:Vector3, max:Vector3}
const worldGroup = new THREE.Group();
scene.add(worldGroup);

function makeFloorTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#242a36'; g.fillRect(0,0,256,256);
  for (let i=0;i<900;i++){ g.fillStyle = `rgba(${rand(10,40)|0},${rand(14,44)|0},${rand(20,56)|0},${rand(.1,.4)})`;
    g.fillRect(mrand()*256, mrand()*256, rand(1,3), rand(1,3)); }
  g.strokeStyle = 'rgba(70,90,120,.5)'; g.lineWidth = 2;
  g.strokeRect(1,1,254,254);
  g.strokeStyle = 'rgba(55,70,95,.3)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(128,0); g.lineTo(128,256); g.moveTo(0,128); g.lineTo(256,128); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24,24);
  tex.anisotropy = 8;
  return tex;
}

const MAT = {
  floor: new THREE.MeshStandardMaterial({ map:makeFloorTexture(), roughness:.92, metalness:.15 }),
  wall:  new THREE.MeshStandardMaterial({ color:0x39404f, roughness:.85, metalness:.3 }),
  crate: new THREE.MeshStandardMaterial({ color:0x4a5263, roughness:.7, metalness:.45 }),
  crate2:new THREE.MeshStandardMaterial({ color:0x5c5244, roughness:.75, metalness:.3 }),
  dark:  new THREE.MeshStandardMaterial({ color:0x262c38, roughness:.6, metalness:.6 }),
  cyanGlow:   new THREE.MeshBasicMaterial({ color:0x2cf2ff }),
  orangeGlow: new THREE.MeshBasicMaterial({ color:0xff9a3c }),
};

function addSolid(cx, cz, w, d, h, mat, { y0=0, glow=null, visual=true } = {}){
  if (visual){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(cx, y0 + h/2, cz);
    m.castShadow = true; m.receiveShadow = true;
    worldGroup.add(m);
    if (glow){
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w+0.04, 0.07, d+0.04), glow);
      strip.position.set(cx, y0 + h - 0.1, cz);
      worldGroup.add(strip);
    }
  }
  solids.push({ min:new THREE.Vector3(cx-w/2, y0, cz-d/2), max:new THREE.Vector3(cx+w/2, y0+h, cz+d/2) });
}

let currentMapName = 'FORGE';
const MAP_NAMES = ['FORGE','NEXUS','DUSK YARD','COLD STORAGE','RIFT DOCKS'];
let activeSpawnPoints = [[40,0],[-40,0],[0,40],[0,-40],[34,34],[-34,34],[34,-34],[-34,-34]];
let activePickupLayout = [[-20,0,'health'],[20,0,'health'],[0,-28,'health'],[0,0,'ammo'],[28,28,'ammo'],[-28,-28,'ammo'],[0,28,'health'],[28,-14,'ammo']];
let mapLampPositions = [];

const worldAnim = [];
const destructibles = [];
const weatherSystems = [];
const eventLights = [];

function makeSignTexture(text, color='#2cf2ff', sub='BLACKOUT ZONE'){
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const g = c.getContext('2d');
  g.clearRect(0,0,c.width,c.height);
  g.fillStyle = 'rgba(4,9,16,.82)'; g.fillRect(0,0,c.width,c.height);
  g.strokeStyle = color; g.lineWidth = 5; g.strokeRect(10,10,c.width-20,c.height-20);
  g.shadowColor = color; g.shadowBlur = 18;
  g.fillStyle = '#ffffff'; g.font = '900 42px Consolas, monospace'; g.textAlign='center'; g.textBaseline='middle';
  g.fillText(text, c.width/2, 78);
  g.shadowBlur = 10; g.fillStyle = color; g.font = '700 20px Consolas, monospace';
  g.fillText(sub, c.width/2, 130);
  g.fillStyle = 'rgba(255,255,255,.18)';
  for (let y=0;y<c.height;y+=8) g.fillRect(0,y,c.width,1);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function addWorldSign(text, x,y,z, ry=0, color='#2cf2ff', sub='BLACKOUT ZONE'){
  const tex = makeSignTexture(text, color, sub);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 2.15), new THREE.MeshBasicMaterial({ map:tex, transparent:true, side:THREE.DoubleSide, depthWrite:false }));
  m.position.set(x,y,z); m.rotation.y = ry; worldGroup.add(m);
  worldAnim.push({ obj:m, pulse:true, baseY:y, amp:0.03, speed:0.8 });
  return m;
}
function addPipe(x,z,len=7, horizontal='x', color=0x222a34){
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,len,12), new THREE.MeshStandardMaterial({ color, roughness:.58, metalness:.72 }));
  pipe.position.set(x,1.25,z);
  if (horizontal === 'x') pipe.rotation.z = Math.PI/2; else pipe.rotation.x = Math.PI/2;
  pipe.castShadow = true; worldGroup.add(pipe);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,len+0.04,8), MAT.cyanGlow);
  glow.position.copy(pipe.position); glow.rotation.copy(pipe.rotation); worldGroup.add(glow);
  return pipe;
}
function addRotatingRing(x,z,y,radius,color=0x2cf2ff,speed=0.7){
  const mat = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.72, blending:THREE.AdditiveBlending, depthWrite:false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 8, 72), mat);
  ring.position.set(x,y,z); ring.rotation.x = Math.PI/2; worldGroup.add(ring);
  worldAnim.push({ obj:ring, rot:new THREE.Vector3(speed*0.35, speed, speed*0.18), pulse:true, baseY:y, amp:0.06, speed:1.1 });
  return ring;
}
function addBeacon(x,z,color=0x2cf2ff,intensity=2.2){
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.24,14,10), new THREE.MeshBasicMaterial({ color }));
  core.position.set(x,2.4,z); worldGroup.add(core);
  const light = new THREE.PointLight(color, intensity, 16, 2.1); light.position.copy(core.position); worldGroup.add(light);
  eventLights.push({ light, base:intensity, phase:Math.random()*10, speed:1.2+Math.random()*1.8 });
  worldAnim.push({ obj:core, pulse:true, baseScale:core.scale.clone(), phase:Math.random()*8, speed:1.6, scaleAmp:0.18 });
  return core;
}
function addDestructibleProp(x,z,kind='crate'){
  const isBarrel = kind === 'barrel';
  const explosive = kind === 'barrel';
  const color = isBarrel ? 0xff7a3c : (kind === 'data' ? 0x2cf2ff : 0x6b7284);
  const mat = new THREE.MeshStandardMaterial({ color:isBarrel?0x88412b:(kind==='data'?0x244a5a:0x4b5568), roughness:.55, metalness:.55, transparent:true });
  const mesh = isBarrel
    ? new THREE.Mesh(new THREE.CylinderGeometry(0.48,0.54,1.25,14), mat)
    : new THREE.Mesh(new THREE.BoxGeometry(1.25,1.05,1.25), mat);
  mesh.position.set(x, isBarrel ? 0.625 : 0.525, z);
  mesh.rotation.y = rand(-0.4,0.4);
  mesh.castShadow = true; mesh.receiveShadow = true; worldGroup.add(mesh);
  const glow = new THREE.Mesh(isBarrel ? new THREE.CylinderGeometry(0.51,0.56,0.06,14) : new THREE.BoxGeometry(1.28,0.06,1.28), explosive ? MAT.orangeGlow : MAT.cyanGlow);
  glow.position.set(x, isBarrel ? 1.08 : 0.98, z); glow.rotation.copy(mesh.rotation); worldGroup.add(glow);
  const solid = { min:new THREE.Vector3(x-0.62,0,z-0.62), max:new THREE.Vector3(x+0.62,isBarrel?1.25:1.05,z+0.62), destructible:true };
  solids.push(solid);
  const d = { mesh, glow, solid, hp: explosive ? 55 : 85, maxHp: explosive ? 55 : 85, kind, color, explosive, broken:false };
  mesh.userData.destructible = d; glow.userData.destructible = d;
  destructibles.push(d);
  worldAnim.push({ obj:glow, pulse:true, baseScale:glow.scale.clone(), phase:Math.random()*9, speed:2.2, scaleAmp:0.16 });
  return d;
}
function destroyDestructible(d, hitPos){
  if (!d || d.broken) return;
  d.broken = true;
  const pos = d.mesh.position.clone();
  worldGroup.remove(d.mesh); worldGroup.remove(d.glow);
  const idx = solids.indexOf(d.solid); if (idx >= 0) solids.splice(idx, 1);
  spawnGibs(pos.clone().add(new THREE.Vector3(0,0.5,0)), d.color, d.explosive ? 14 : 8);
  spawnSmoke(pos.clone().add(new THREE.Vector3(0,0.6,0)), d.explosive ? 5 : 2);
  spawnRing(pos, d.explosive ? 0xff9a3c : 0x2cf2ff);
  if (d.explosive) explodeAt(pos.clone().add(new THREE.Vector3(0,0.65,0))); else SFX.bodyBreak();
}
function damageDestructible(d, dmg, hitPos){
  if (!d || d.broken) return false;
  d.hp -= dmg;
  spawnSparks(hitPos, d.explosive ? 0xff9a3c : 0x2cf2ff, d.explosive ? 8 : 5);
  if (d.mesh.material) d.mesh.material.opacity = clamp(0.38 + d.hp/d.maxHp*0.62, 0.38, 1);
  if (d.hp <= 0){ destroyDestructible(d, hitPos); return true; }
  return false;
}
function addWeather(kind='embers', count=240){
  const pos = new Float32Array(count*3);
  const vel = new Float32Array(count*3);
  for (let i=0;i<count;i++){
    pos[i*3] = rand(-ARENA,ARENA); pos[i*3+1] = rand(0.4,12); pos[i*3+2] = rand(-ARENA,ARENA);
    if (kind === 'rain'){ vel[i*3]=rand(-0.4,0.4); vel[i*3+1]=rand(-18,-26); vel[i*3+2]=rand(-1.8,-2.8); }
    else if (kind === 'data'){ vel[i*3]=rand(-.3,.3); vel[i*3+1]=rand(.7,1.8); vel[i*3+2]=rand(-.3,.3); }
    else { vel[i*3]=rand(-.6,.6); vel[i*3+1]=rand(.5,1.6); vel[i*3+2]=rand(-.6,.6); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: kind==='rain'?0x8fb8ff:(kind==='data'?0x2cf2ff:0xff9a3c), size:kind==='rain'?0.045:0.08, transparent:true, opacity:kind==='rain'?0.38:0.55, depthWrite:false, blending:THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat); worldGroup.add(pts);
  weatherSystems.push({ points:pts, pos, vel, kind, count });
}
function addForgeDressing(){
  addRotatingRing(0,0,5.25,4.4,0xff9a3c,0.95); addRotatingRing(0,0,5.55,3.15,0x2cf2ff,-1.25);
  addBeacon(0,0,0xff9a3c,3.4);
  for (const [x,z] of [[-30,6],[30,-6],[-6,-30],[6,30]]) addPipe(x,z,8,Math.abs(x)>Math.abs(z)?'z':'x');
  for (const [x,z] of [[-12,22],[13,-23],[24,14],[-23,-13]]) addDestructibleProp(x,z,'barrel');
  for (const [x,z] of [[-18,16],[18,-16],[26,-22],[-27,21]]) addDestructibleProp(x,z,'crate');
  addWorldSign('FORGE 09', -40.9, 3.2, -16, Math.PI/2, '#ff9a3c', 'THERMAL REACTOR LIVE');
  addWorldSign('NEMESIS', 16, 3.1, -40.9, 0, '#ff3b57', 'BOSS BREACH EVERY 5 WAVES');
  addWeather('embers', 260);
}
function addNexusDressing(){
  addRotatingRing(0,0,5.1,5.2,0x2cf2ff,1.25); addRotatingRing(0,0,5.65,2.6,0xd040ff,-1.6);
  for (const [x,z] of [[0,0],[30,0],[-30,0],[0,30],[0,-30]]) addBeacon(x,z,0x2cf2ff,2.1);
  for (const [x,z] of [[12,28],[-12,-28],[28,-12],[-28,12]]) addDestructibleProp(x,z,'data');
  addWorldSign('NEXUS CORE', -40.9, 3.3, 14, Math.PI/2, '#2cf2ff', 'SIMULATION LANES ONLINE');
  addWorldSign('RIFT INDEX', 14, 3.3, 40.9, Math.PI, '#d040ff', 'CONTRACT DATA STREAM');
  addWeather('data', 330);
}
function addDuskDressing(){
  // crane gantries and sweeping industrial lights
  for (const x of [-32,32]){
    addSolid(x,0,1.0,54,5.6,MAT.dark,{glow:MAT.orangeGlow});
    addPipe(x,0,50,'z',0x303846);
  }
  for (const [x,z] of [[-12,28],[12,-28],[-34,0],[34,0]]) addDestructibleProp(x,z,'barrel');
  for (const [x,z] of [[-12,-28],[12,28],[28,0],[-28,0]]) addDestructibleProp(x,z,'crate');
  addWorldSign('DUSK YARD', -40.9, 3.4, 10, Math.PI/2, '#ff9a3c', 'CONTAINER BLOCKADE');
  addWorldSign('EVAC DENIED', 10, 3.4, 40.9, Math.PI, '#ff3b57', 'BLACKOUT RAIN FRONT');
  const l1 = new THREE.SpotLight(0x88bbff, 3.2, 70, 0.28, 0.45, 1.2); l1.position.set(-34,9,-34); l1.target.position.set(0,0,0); worldGroup.add(l1); worldGroup.add(l1.target);
  const l2 = new THREE.SpotLight(0xff9a3c, 2.4, 58, 0.32, 0.45, 1.2); l2.position.set(34,9,34); l2.target.position.set(0,0,0); worldGroup.add(l2); worldGroup.add(l2.target);
  worldAnim.push({ spot:l1, target:l1.target, center:new THREE.Vector3(0,0,0), radius:22, speed:0.45, phase:0 });
  worldAnim.push({ spot:l2, target:l2.target, center:new THREE.Vector3(0,0,0), radius:18, speed:-0.55, phase:2.4 });
  addWeather('rain', 520);
}
function updateWorldAtmosphere(dt, now){
  const t = now * 0.001;
  for (const a of worldAnim){
    if (a.obj){
      if (a.rot){ a.obj.rotation.x += a.rot.x*dt; a.obj.rotation.y += a.rot.y*dt; a.obj.rotation.z += a.rot.z*dt; }
      if (a.baseY !== undefined) a.obj.position.y = a.baseY + Math.sin(t*a.speed + (a.phase||0))*a.amp;
      if (a.baseScale) a.obj.scale.copy(a.baseScale).multiplyScalar(1 + Math.sin(t*a.speed + (a.phase||0))*a.scaleAmp);
      if (a.pulse && a.obj.material && 'opacity' in a.obj.material) a.obj.material.opacity = clamp(0.5 + Math.sin(t*2.0 + (a.phase||0))*0.18, 0.22, 0.88);
    }
    if (a.spot && a.target){
      const ang = t*a.speed + a.phase;
      a.target.position.set(Math.cos(ang)*a.radius, 0, Math.sin(ang)*a.radius);
      a.spot.target.updateMatrixWorld();
    }
  }
  for (const e of eventLights){ e.light.intensity = e.base * (0.74 + Math.sin(t*e.speed + e.phase)*0.26); }
  for (const w of weatherSystems){
    const arr = w.pos, vel = w.vel;
    for (let i=0;i<w.count;i++){
      const ix=i*3;
      arr[ix] += vel[ix]*dt; arr[ix+1] += vel[ix+1]*dt; arr[ix+2] += vel[ix+2]*dt;
      if (arr[ix] < -ARENA) arr[ix] = ARENA; else if (arr[ix] > ARENA) arr[ix] = -ARENA;
      if (arr[ix+2] < -ARENA) arr[ix+2] = ARENA; else if (arr[ix+2] > ARENA) arr[ix+2] = -ARENA;
      if (w.kind === 'rain') { if (arr[ix+1] < 0.1) { arr[ix+1] = rand(8,15); arr[ix]=rand(-ARENA,ARENA); arr[ix+2]=rand(-ARENA,ARENA); } }
      else if (arr[ix+1] > 12) { arr[ix+1] = rand(0.15,1.2); arr[ix]=rand(-ARENA,ARENA); arr[ix+2]=rand(-ARENA,ARENA); }
    }
    w.points.geometry.attributes.position.needsUpdate = true;
  }
  // Lamp bloom breathes subtly across every map.
  for (let i=0;i<lampGlows.length;i++){
    const g = lampGlows[i];
    const p = 1 + Math.sin(t*1.7 + i*0.8)*0.08;
    g.scale.set(2.6*p,2.6*p,1);
    g.material.opacity = 0.62 + Math.sin(t*1.3 + i)*0.16;
  }
}


function clearWorld(){
  while (worldGroup.children.length) worldGroup.remove(worldGroup.children[0]);
  solids.length = 0;
  mapLampPositions = [];
  worldAnim.length = 0;
  destructibles.length = 0;
  weatherSystems.length = 0;
  eventLights.length = 0;
}
function addFloor(){
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA*2+20, ARENA*2+20), MAT.floor);
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  worldGroup.add(floor);
}
function addPerimeter(){
  const W = ARENA + 1;
  addSolid(0, -W, ARENA*2+4, 2, 5.5, MAT.wall, { glow:MAT.orangeGlow });
  addSolid(0,  W, ARENA*2+4, 2, 5.5, MAT.wall, { glow:MAT.orangeGlow });
  addSolid(-W, 0, 2, ARENA*2+4, 5.5, MAT.wall, { glow:MAT.orangeGlow });
  addSolid( W, 0, 2, ARENA*2+4, 5.5, MAT.wall, { glow:MAT.orangeGlow });
}
function addLamp(x,z,color=0x2cf2ff){
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.12,5.4,8), MAT.dark);
  pole.position.set(x, 2.7, z); pole.castShadow = true;
  worldGroup.add(pole);
  const headMat = color === 0xff9a3c ? MAT.orangeGlow : MAT.cyanGlow;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22,10,8), headMat);
  head.position.set(x, 5.4, z);
  worldGroup.add(head);
  mapLampPositions.push([x,z,color]);
}
function buildForgeLayout(){
  // corner towers (inset from the perimeter so bots and players can route around them)
  for (const [sx,sz] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
    addSolid(sx*32, sz*32, 7, 7, 4.2, MAT.wall, { glow:MAT.cyanGlow });
    addSolid(sx*27.5, sz*32, 2.2, 3, 1.1, MAT.crate);
    addSolid(sx*32, sz*27.5, 3, 2.2, 2.1, MAT.crate);
  }
  addSolid(0, 0, 11, 11, 1.0, MAT.dark, { glow:MAT.cyanGlow });
  for (const [sx,sz] of [[1,1],[1,-1],[-1,1],[-1,-1]]) addSolid(sx*4.6, sz*4.6, 1.1, 1.1, 4.4, MAT.dark);
  addSolid(0, 0, 12, 12, 0.5, MAT.dark, { y0:4.4, glow:MAT.orangeGlow });
  addSolid(0,  7.2, 4, 2.4, 0.5, MAT.crate);
  addSolid(0, -7.2, 4, 2.4, 0.5, MAT.crate);
  addSolid(-16,  10, 10, 1.4, 2.6, MAT.wall, { glow:MAT.cyanGlow });
  addSolid( 16, -10, 10, 1.4, 2.6, MAT.wall, { glow:MAT.cyanGlow });
  addSolid( 10,  18, 1.4, 10, 2.6, MAT.wall, { glow:MAT.orangeGlow });
  addSolid(-10, -18, 1.4, 10, 2.6, MAT.wall, { glow:MAT.orangeGlow });
  let placed = 0;
  while (placed < 16){
    const x = (mrand()*2-1) * 38, z = (mrand()*2-1) * 38;
    if (Math.hypot(x,z) < 12 || (Math.abs(x) > 28 && Math.abs(z) > 28)) continue;
    const s = 1.4 + mrand()*1.4, h = 0.9 + mrand()*1.3;
    addSolid(x, z, s, s, h, mrand() > .5 ? MAT.crate : MAT.crate2, { glow: mrand() > .6 ? MAT.cyanGlow : null });
    placed++;
  }
  for (const [x,z,w,d,h] of [[-24,-2,6,1,1.15],[24,2,6,1,1.15],[-2,24,1,6,1.15],[2,-24,1,6,1.15],[12,8,5,1,1.15],[-12,-8,5,1,1.15]])
    addSolid(x, z, w, d, h, MAT.dark, { glow:MAT.orangeGlow });
  for (const [x,z] of [[-20,20],[20,-20],[20,20],[-20,-20]]) addLamp(x,z,0x2cf2ff);
  addForgeDressing();
  activeSpawnPoints = [[40,0],[-40,0],[0,40],[0,-40],[27,27],[-27,27],[27,-27],[-27,-27]];
  activePickupLayout = [[-20,0,'health'],[20,0,'health'],[0,-28,'health'],[0,0,'ammo'],[28,28,'ammo'],[-28,-28,'ammo'],[0,28,'health'],[28,-14,'ammo']];
}
function buildNexusLayout(){
  // fast competitive map: mirrored lanes, inner ring, clean sightlines
  addSolid(0,0,8,8,1.2,MAT.dark,{glow:MAT.cyanGlow});
  addSolid(0,0,5.4,5.4,3.1,MAT.wall,{y0:1.2,glow:MAT.orangeGlow});
  for (const [x,z,w,d] of [[0,21,26,1.2],[0,-21,26,1.2],[21,0,1.2,26],[-21,0,1.2,26]]) addSolid(x,z,w,d,2.4,MAT.wall,{glow:MAT.cyanGlow});
  for (const [x,z,w,d] of [[14,14,9,1.1],[-14,-14,9,1.1],[14,-14,1.1,9],[-14,14,1.1,9]]) addSolid(x,z,w,d,1.3,MAT.dark,{glow:MAT.orangeGlow});
  for (const [x,z] of [[30,0],[-30,0],[0,30],[0,-30]]) addSolid(x,z,5,5,2.0,MAT.crate2,{glow:MAT.cyanGlow});
  for (const [x,z] of [[-28,28],[28,-28],[-28,-28],[28,28]]) addSolid(x,z,6,3,1.0,MAT.crate);
  for (const [x,z,c] of [[0,30,0x2cf2ff],[0,-30,0x2cf2ff],[30,0,0xff9a3c],[-30,0,0xff9a3c],[0,0,0x2cf2ff]]) addLamp(x,z,c);
  addNexusDressing();
  activeSpawnPoints = [[38,0],[-38,0],[0,38],[0,-38],[34,20],[-34,-20],[20,-34],[-20,34]];
  activePickupLayout = [[0,0,'ammo'],[18,18,'health'],[-18,-18,'health'],[18,-18,'ammo'],[-18,18,'ammo'],[0,34,'health'],[0,-34,'health'],[34,0,'ammo']];
}
function buildDuskYardLayout(){
  // wider yard with container stacks, flanking alleys, sniper angles
  for (const [x,z,w,d,h] of [[-18,0,4,28,2.7],[18,0,4,28,2.7],[0,18,25,3,2.2],[0,-18,25,3,2.2]])
    addSolid(x,z,w,d,h,MAT.wall,{glow:MAT.orangeGlow});
  for (const [x,z,w,d,h] of [[-30,-12,10,3,2.2],[-30,12,10,3,2.2],[30,-12,10,3,2.2],[30,12,10,3,2.2],[0,0,3,18,1.3]])
    addSolid(x,z,w,d,h,MAT.crate2,{glow:MAT.cyanGlow});
  for (const [sx,sz] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
    addSolid(sx*36, sz*30, 7, 10, 1.4, MAT.crate, { glow:MAT.cyanGlow });
    addSolid(sx*36, sz*33.5, 5, 3, 3.0, MAT.wall, { glow:MAT.orangeGlow });
  }
  for (const [x,z] of [[-8,31],[8,-31],[-31,8],[31,-8],[0,0]]) addSolid(x,z,2.2,2.2,1.1,MAT.dark,{glow:MAT.cyanGlow});
  for (const [x,z,c] of [[-24,24,0xff9a3c],[24,-24,0xff9a3c],[24,24,0x2cf2ff],[-24,-24,0x2cf2ff],[0,34,0x2cf2ff],[0,-34,0xff9a3c]]) addLamp(x,z,c);
  addDuskDressing();
  activeSpawnPoints = [[40,22],[-40,-22],[40,-22],[-40,22],[0,40],[0,-40],[36,0],[-36,0]];
  activePickupLayout = [[0,0,'ammo'],[-24,0,'health'],[24,0,'health'],[0,26,'ammo'],[0,-26,'ammo'],[-34,22,'health'],[34,-22,'health'],[34,22,'ammo'],[-34,-22,'ammo']];
}
function addColdStorageDressing(){
  addRotatingRing(0,0,5.6,3.6,0x66eaff,1.1); addRotatingRing(0,0,5.95,2.2,0x2cf2ff,-1.4);
  addBeacon(0,14,0x66eaff,2.6); addBeacon(0,-14,0x66eaff,2.6);
  for (const [x,z] of [[-24,-9],[24,9],[-24,9],[24,-9]]) addDestructibleProp(x,z,'crate');
  for (const [x,z] of [[-8,-30],[8,30],[30,-8],[-30,8]]) addDestructibleProp(x,z,'barrel');
  addWorldSign('COLD STORAGE', -40.9, 3.3, -12, Math.PI/2, '#66eaff', 'FREEZER AISLES 12-B');
  addWorldSign('KEEP FROZEN', 12, 3.3, 40.9, Math.PI, '#2cf2ff', 'THERMAL LOCK ENGAGED');
  for (const [x,z] of [[-36,0],[36,0]]) addPipe(x,z,9,'z');
  addWeather('data', 320);
}
function buildColdStorageLayout(){
  // chilled warehouse: raised freezer hub, twin rack aisles, vault corners, blue frost lighting
  addSolid(0, 0, 12, 12, 0.9, MAT.dark, { glow:MAT.cyanGlow });
  addSolid(0, 0, 5.0, 5.0, 3.0, MAT.wall, { y0:0.9, glow:MAT.cyanGlow });
  for (const sx of [-1,1]){
    addSolid(sx*13, -12, 2.8, 16, 3.4, MAT.crate2, { glow:MAT.cyanGlow });
    addSolid(sx*13,  12, 2.8, 16, 3.4, MAT.crate2, { glow:MAT.cyanGlow });
    addSolid(sx*25, 0, 2.8, 22, 4.2, MAT.wall, { glow:MAT.orangeGlow });
    addSolid(sx*25, -25, 8, 3.2, 1.1, MAT.crate);
    addSolid(sx*25, 25, 8, 3.2, 1.1, MAT.crate);
  }
  for (const [sx,sz] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
    addSolid(sx*33, sz*33, 7, 7, 4.6, MAT.wall, { glow:MAT.cyanGlow });
    addSolid(sx*25, sz*33, 2, 6, 1.2, MAT.crate2);
  }
  for (const [x,z,w,d,h] of [[-6,21,4,2,1.15],[6,-21,4,2,1.15],[21,-6,2,4,1.15],[-21,6,2,4,1.15]]) addSolid(x,z,w,d,h,MAT.dark,{glow:MAT.orangeGlow});
  for (const [x,z,c] of [[0,18,0x66eaff],[0,-18,0x66eaff],[18,0,0xff9a3c],[-18,0,0xff9a3c],[33,33,0x66eaff],[-33,-33,0x66eaff]]) addLamp(x,z,c);
  addColdStorageDressing();
  activeSpawnPoints = [[38,0],[-38,0],[0,38],[0,-38],[30,30],[-30,30],[30,-30],[-30,-30]];
  activePickupLayout = [[0,14,'health'],[0,-14,'health'],[14,0,'ammo'],[-14,0,'ammo'],[33,0,'health'],[-33,0,'health'],[0,0,'ammo'],[0,33,'ammo'],[0,-33,'health']];
}
function addCrane(x,z){
  addSolid(x, z-9, 1.2, 1.2, 6.8, MAT.dark);
  addSolid(x, z+9, 1.2, 1.2, 6.8, MAT.dark);
  addSolid(x, z, 1.0, 20, 0.7, MAT.dark, { y0: 6.1, glow: MAT.orangeGlow });
}
function addRiftDocksDressing(){
  addCrane(-26,-26); addCrane(26,26);
  addRotatingRing(0,34,4.6,3.4,0xff9a3c,0.8);
  addBeacon(0,-34,0xff9a3c,2.6); addBeacon(0,34,0x2cf2ff,2.6);
  for (const [x,z] of [[-12,0],[12,0],[-34,-12],[34,12]]) addDestructibleProp(x,z,'crate');
  for (const [x,z] of [[-6,-24],[6,24],[24,-20],[-24,20]]) addDestructibleProp(x,z,'barrel');
  addWorldSign('RIFT DOCKS', -40.9, 3.4, 12, Math.PI/2, '#2cf2ff', 'CONTAINER BERTH 7');
  addWorldSign('NO MANIFEST', 12, 3.4, -40.9, 0, '#ff9a3c', 'BLACKOUT RAIN FRONT');
  const l1 = new THREE.SpotLight(0x2cf2ff, 2.8, 64, 0.3, 0.45, 1.2); l1.position.set(-30,9,30); l1.target.position.set(0,0,0); worldGroup.add(l1); worldGroup.add(l1.target);
  const l2 = new THREE.SpotLight(0xff9a3c, 2.4, 58, 0.32, 0.45, 1.2); l2.position.set(30,9,-30); l2.target.position.set(0,0,0); worldGroup.add(l2); worldGroup.add(l2.target);
  worldAnim.push({ spot:l1, target:l1.target, center:new THREE.Vector3(0,0,0), radius:20, speed:0.5, phase:1.2 });
  worldAnim.push({ spot:l2, target:l2.target, center:new THREE.Vector3(0,0,0), radius:18, speed:-0.6, phase:3.1 });
  addWeather('rain', 540);
}
function buildRiftDocksLayout(){
  // rain-slick dockside: long container lanes, gantry cranes, pier cover
  for (const [x,z,w,d,h] of [[0,-14,26,3,3.0],[0,14,26,3,3.0]]) addSolid(x,z,w,d,h,MAT.crate2,{glow:MAT.orangeGlow});
  addSolid(0, 0, 4, 10, 1.2, MAT.dark, { glow:MAT.cyanGlow });
  addSolid(0, 0, 2.4, 4, 2.8, MAT.wall, { y0:1.2, glow:MAT.cyanGlow });
  for (const sx of [-1,1]){
    addSolid(sx*20, 0, 6, 14, 1.5, MAT.crate, { glow:MAT.cyanGlow });
    addSolid(sx*30, 0, 3.4, 24, 3.6, MAT.wall, { glow:MAT.orangeGlow });
    addSolid(sx*12, -28, 10, 2.6, 2.4, MAT.crate2, { glow:MAT.cyanGlow });
    addSolid(sx*12, 28, 10, 2.6, 2.4, MAT.crate2, { glow:MAT.cyanGlow });
  }
  for (const [x,z,c] of [[-20,-14,0xff9a3c],[20,14,0xff9a3c],[20,-14,0x2cf2ff],[-20,14,0x2cf2ff],[0,36,0x2cf2ff],[0,-36,0xff9a3c]]) addLamp(x,z,c);
  addRiftDocksDressing();
  activeSpawnPoints = [[38,-20],[-38,20],[38,20],[-38,-20],[0,34],[0,-34],[34,0],[-34,0]];
  activePickupLayout = [[0,0,'ammo'],[-20,7,'health'],[20,-7,'health'],[0,22,'ammo'],[0,-22,'ammo'],[-34,20,'health'],[34,-20,'health'],[34,20,'ammo'],[-34,-20,'ammo']];
}
function buildMap(name='FORGE'){
  currentMapName = (name || 'FORGE').toUpperCase();
  clearWorld();
  addFloor();
  addPerimeter();
  if (currentMapName === 'NEXUS') buildNexusLayout();
  else if (currentMapName === 'DUSK YARD') buildDuskYardLayout();
  else if (currentMapName === 'COLD STORAGE') buildColdStorageLayout();
  else if (currentMapName === 'RIFT DOCKS') buildRiftDocksLayout();
  else { currentMapName = 'FORGE'; buildForgeLayout(); }
}
function setMap(name){
  buildMap(name);
  if (typeof addLampGlows === 'function') addLampGlows();
  if (typeof rebuildPickups === 'function') rebuildPickups();
  for (const e of enemies || []){ if (e.group) scene.remove(e.group); e.dead = true; }
  if (typeof enemies !== 'undefined') enemies.length = 0;
  showBanner(currentMapName);
  const mapEl = $('mapName'); if (mapEl) mapEl.textContent = currentMapName;
}

/* map vote thumbnails: a top-down blueprint render of each arena, generated once
   from the real solid data so every map offers a true picture of itself */
const MAP_THUMBS = {};
const MAP_THUMB_TINT = { 'FORGE':'#ff9a2c', 'NEXUS':'#2cf2ff', 'DUSK YARD':'#b06cff', 'COLD STORAGE':'#9fd8ff', 'RIFT DOCKS':'#2c9fff' };
function blueprintThumb(mapName){
  const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 220;
  const g = canvas.getContext('2d');
  const tint = MAP_THUMB_TINT[mapName] || '#2cf2ff';
  const grd = g.createLinearGradient(0, 0, 0, 220);
  grd.addColorStop(0, '#0a1522'); grd.addColorStop(1, '#05090f');
  g.fillStyle = grd; g.fillRect(0, 0, 360, 220);
  g.strokeStyle = 'rgba(44,242,255,0.07)'; g.lineWidth = 1;
  for (let x = 0; x <= 360; x += 18){ g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 220); g.stroke(); }
  for (let y = 0; y <= 220; y += 18){ g.beginPath(); g.moveTo(0, y); g.lineTo(360, y); g.stroke(); }
  const pad = 16, sx = (360 - pad*2) / (ARENA*2), sz = (220 - pad*2) / (ARENA*2);
  const X = wx => pad + (wx + ARENA)*sx, Z = wz => pad + (wz + ARENA)*sz;
  g.strokeStyle = tint; g.globalAlpha = .55; g.lineWidth = 2;
  g.strokeRect(X(-ARENA), Z(-ARENA), ARENA*2*sx, ARENA*2*sz);
  g.globalAlpha = 1;
  for (const s of solids){
    const height = s.max.y - s.min.y;
    g.fillStyle = height >= 6 ? tint : height >= 2.2 ? 'rgba(150,220,255,.55)' : 'rgba(120,160,190,.42)';
    g.globalAlpha = height >= 6 ? .85 : .75;
    g.fillRect(X(s.min.x), Z(s.min.z), (s.max.x - s.min.x)*sx, (s.max.z - s.min.z)*sz);
    if (height >= 6){ g.globalAlpha = .22; g.fillStyle = '#fff'; g.fillRect(X(s.min.x), Z(s.min.z), (s.max.x - s.min.x)*sx, Math.max(1.5, (s.max.z - s.min.z)*sz*.18)); }
  }
  g.globalAlpha = 1; g.fillStyle = '#ffd040';
  for (const [px, pz] of activeSpawnPoints){ g.beginPath(); g.arc(X(px), Z(pz), 2.2, 0, 7); g.fill(); }
  g.fillStyle = tint; g.font = '900 15px Consolas, monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText(mapName, pad, 9);
  return canvas.toDataURL('image/png');
}
function generateMapThumbnails(){
  if (generateMapThumbnails.done) return MAP_THUMBS;
  generateMapThumbnails.done = true;
  const keep = currentMapName;
  for (const m of MAP_NAMES){ setMap(m); MAP_THUMBS[m] = blueprintThumb(m); }
  setMap(keep);
  return MAP_THUMBS;
}
function thumbFor(map){
  if (!Object.keys(MAP_THUMBS).length) generateMapThumbnails();
  return MAP_THUMBS[map] || '';
}
const lampGlows = [];
function addLampGlows(){
  while (lampGlows.length){
    const g = lampGlows.pop();
    scene.remove(g);
    if (g.material) g.material.dispose();
  }
  for (const [x,z,color=0x2cf2ff] of mapLampPositions){
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, color, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0.75 }));
    glow.raycast = () => {};
    glow.scale.set(2.6, 2.6, 1);
    glow.position.set(x, 5.4, z);
    scene.add(glow);
    lampGlows.push(glow);
  }
}
buildMap();

/* ---------------- collision helpers ---------------- */
const P_RADIUS = 0.55, P_HEIGHT = 1.8, EYE = 1.62, STEP = 0.55;

function collideXZ(pos, feetY, headY){
  for (const s of solids){
    if (feetY >= s.max.y - STEP) continue;           // can step onto / standing on
    if (headY <= s.min.y) continue;                  // passing under
    const exMinX = s.min.x - P_RADIUS, exMaxX = s.max.x + P_RADIUS;
    const exMinZ = s.min.z - P_RADIUS, exMaxZ = s.max.z + P_RADIUS;
    if (pos.x > exMinX && pos.x < exMaxX && pos.z > exMinZ && pos.z < exMaxZ){
      const dx1 = pos.x - exMinX, dx2 = exMaxX - pos.x;
      const dz1 = pos.z - exMinZ, dz2 = exMaxZ - pos.z;
      const m = Math.min(dx1, dx2, dz1, dz2);
      if (m === dx1) pos.x = exMinX;
      else if (m === dx2) pos.x = exMaxX;
      else if (m === dz1) pos.z = exMinZ;
      else pos.z = exMaxZ;
    }
  }
}
function groundHeight(pos, feetY){
  let g = 0;
  for (const s of solids){
    if (pos.x > s.min.x - P_RADIUS*0.6 && pos.x < s.max.x + P_RADIUS*0.6 &&
        pos.z > s.min.z - P_RADIUS*0.6 && pos.z < s.max.z + P_RADIUS*0.6){
      if (s.max.y <= feetY + STEP && s.max.y > g) g = s.max.y;
    }
  }
  return g;
}
/* push a point out of any solid it overlaps (used to keep bots from spawning inside walls) */
function resolvePenetration(p, r){
  for (const s of solids){
    if (s.min.y > 0.6) continue;
    const exMinX = s.min.x - r, exMaxX = s.max.x + r;
    const exMinZ = s.min.z - r, exMaxZ = s.max.z + r;
    if (p.x > exMinX && p.x < exMaxX && p.z > exMinZ && p.z < exMaxZ){
      const dx1 = p.x - exMinX, dx2 = exMaxX - p.x;
      const dz1 = p.z - exMinZ, dz2 = exMaxZ - p.z;
      const m = Math.min(dx1, dx2, dz1, dz2);
      if (m === dx1) p.x = exMinX; else if (m === dx2) p.x = exMaxX;
      else if (m === dz1) p.z = exMinZ; else p.z = exMaxZ;
    }
  }
  p.x = clamp(p.x, -ARENA+1, ARENA-1);
  p.z = clamp(p.z, -ARENA+1, ARENA-1);
}
// ray vs world AABBs; returns distance or Infinity
const _tmpInv = new THREE.Vector3();
function castWorld(origin, dir, maxDist){
  let best = maxDist;
  if (dir.y < -1e-6){
    const t = -origin.y / dir.y;
    if (t > 0 && t < best) best = t;
  }
  _tmpInv.set(1/dir.x, 1/dir.y, 1/dir.z);
  for (const s of solids){
    let tmin = (s.min.x - origin.x) * _tmpInv.x, tmax = (s.max.x - origin.x) * _tmpInv.x;
    if (tmin > tmax){ const q = tmin; tmin = tmax; tmax = q; }
    let tymin = (s.min.y - origin.y) * _tmpInv.y, tymax = (s.max.y - origin.y) * _tmpInv.y;
    if (tymin > tymax){ const q = tymin; tymin = tymax; tymax = q; }
    if (tmin > tymax || tymin > tmax) continue;
    tmin = Math.max(tmin, tymin); tmax = Math.min(tmax, tymax);
    let tzmin = (s.min.z - origin.z) * _tmpInv.z, tzmax = (s.max.z - origin.z) * _tmpInv.z;
    if (tzmin > tzmax){ const q = tzmin; tzmin = tzmax; tzmax = q; }
    if (tmin > tzmax || tzmin > tmax) continue;
    tmin = Math.max(tmin, tzmin); tmax = Math.min(tmax, tzmax);
    if (tmin <= 0 && tmax > 0) return 0.06;   // origin is inside the solid — treat as blocked so bots sense the wall
    if (tmin > 0 && tmin < best) best = tmin;
  }
  return best;
}
const _segDir = new THREE.Vector3();
function hasLOS(a, b){
  _segDir.subVectors(b, a);
  const dist = _segDir.length();
  if (dist < 0.001) return true;
  _segDir.multiplyScalar(1/dist);
  return castWorld(a, _segDir, dist) >= dist - 0.01;
}
const _botRay = new THREE.Vector3(), _botDir = new THREE.Vector3();

/* ================= GAME STATE ================= */
let mode = 'solo';   // 'solo' (waves) or 'dm' (LAN deathmatch)
const SOLO_FINAL_WAVE = 15;
const S = {
  started:false, paused:true, dead:false, victory:false,
  wave:0, score:0, kills:0, deaths:0, shotsFired:0, shotsHit:0, headshots:0,
  longestStreak:0, cashEarned:0, xpEarned:0, weaponKills:{},
  toSpawn:[], spawnTimer:0, intermission:3, startTime:0,
};
function resetMatchStats(){
  Object.assign(S, { score:0, kills:0, deaths:0, shotsFired:0, shotsHit:0, headshots:0, longestStreak:0, cashEarned:0, xpEarned:0, weaponKills:{}, startTime:performance.now() });
  streak = 0; streakT = 0;
  currentRarity = RARITIES[0];
}

/* ================= PLAYER ================= */
const player = {
  pos: new THREE.Vector3(0, 0, 20),   // feet position
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  hp: 100, maxHp: 100,
  grounded: true, lastDamage: -99,
  bobT: 0, stepT: 0, shake: 0,
  fovKick: 0,
  grenades: 3, slideT: 0, slideCd: 0, crouch: 0, invuln:0,
};
const slideDir = new THREE.Vector3();

const keys = {};
let mouseL = false, mouseR = false, locked = false;

let captureBindAction = null;   // non-null while the settings menu waits for a key press
function actionForCode(code){
  for (const id of Object.keys(DEFAULT_BINDS)) if (bindCode(id) === code) return id;
  return null;
}
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (captureBindAction){
    e.preventDefault(); e.stopPropagation();
    if (e.code !== 'Escape') assignBind(captureBindAction, e.code);
    captureBindAction = null;
    renderBindList();
    return;
  }
  if (e.code === bindCode('ads')) e.preventDefault();         // keep CTRL from triggering browser shortcuts while aiming
  if (net.voteActive && ['Digit1','Digit2','Digit3'].includes(e.code)){
    const idx = Number(e.code.slice(-1)) - 1;
    castMapVote(net.voteChoices[idx]);
    return;
  }
  if (!locked || S.dead) return;
  const action = actionForCode(e.code);
  // Manual gun switching stays disabled: guns only advance through kills. The knife slot (key 2) is always available.
  if (action === 'reload') tryReload();
  else if (action === 'nade') throwGrenade();
  else if (action === 'slide') trySlide();
  else if (action === 'finisher') tryFinisher();
  else if (action === 'gun') equipGunSlot();
  else if (action === 'knife') equipKnifeSlot();
  else if (action === 'jump') player.jumpBufferT = 0.14;
}, { capture:false });
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('mousedown', e => {
  // keep trying to engage a real pointer lock whenever the user clicks in-game
  if (locked && S.started && !S.paused && !S.dead && !document.pointerLockElement){
    try { const pr = canvas.requestPointerLock(); if (pr && pr.catch) pr.catch(()=>{}); } catch(err){}
  }
  if (!locked || S.paused || S.dead) return;
  if (e.button === 0) mouseL = true;
  if (e.button === 2) mouseR = true;
});
addEventListener('mouseup', e => {
  if (e.button === 0) mouseL = false;
  if (e.button === 2) mouseR = false;
});
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', e => {
  // Manual weapon cycling is disabled. The arsenal rotates only after kills.
  if (!locked || S.dead) return;
});

let swayX = 0, swayY = 0;
addEventListener('mousemove', e => {
  if (!locked) return;
  // ignore bogus giant deltas (Chrome pointer-lock glitch / synthetic events)
  if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
  const sens = 0.00165 * SETTINGS.sens * (CW().scoped && adsT > 0.6 ? 0.35 : 1);   // slow, precise aim through the scope
  player.yaw   -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  player.pitch = clamp(player.pitch, -1.45, 1.45);
  swayX = clamp(swayX - e.movementX * 0.00022, -0.03, 0.03);
  swayY = clamp(swayY + e.movementY * 0.00022, -0.03, 0.03);
});

/* ---- game start: pointer lock with graceful fallback ---- */
let fallbackMode = false;

function beginPlay(){
  if (!S.started){ S.started = true; S.startTime = performance.now(); }
  S.paused = false;
  document.body.classList.add('inGame');
  $('menu').classList.add('hidden');
  $('paused').classList.add('hidden');
}

function enableFallback(){
  if (fallbackMode && locked) return;
  fallbackMode = true;
  locked = true;                 // input handlers treat fallback as "locked"
  canvas.style.cursor = 'none';
  beginPlay();
}

function showDeploySequence(kind='solo'){
  const ov = $('deployOverlay'); if (!ov) return;
  const title = $('deployTitle'), sub = $('deploySub');
  const arsenalLbl = $('deployArsenalLbl');
  if (arsenalLbl) arsenalLbl.textContent = kind === 'dm' ? 'Shared gun ladder protocol' : 'Random arsenal protocol';
  if (title) title.textContent = kind === 'dm' ? 'LAN BLACKOUT' : 'SOLO DEPLOY';
  if (sub) sub.textContent = kind === 'dm'
    ? `Round ${net.round || 1} // map ${currentMapName} // shared gun ladder // kill 30 is golden-shank only`
    : `Wave mission // map ${currentMapName} // Nemesis signatures at waves 5, 10, and 15`;
  ov.classList.remove('hidden','fadeOut','show');
  void ov.offsetWidth;
  ov.classList.add('show');
  clearTimeout(showDeploySequence._fade);
  clearTimeout(showDeploySequence._hide);
  showDeploySequence._fade = setTimeout(() => ov.classList.add('fadeOut'), 2100);
  showDeploySequence._hide = setTimeout(() => ov.classList.add('hidden'), 2850);
}

function startGame(){
  initAudio();
  let gotLock = false;
  try {
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => { if (!gotLock) enableFallback(); });
  } catch (err) {
    enableFallback();
    return;
  }
  // if pointer lock never engages (blocked by iframe permissions), start anyway
  setTimeout(() => {
    gotLock = document.pointerLockElement === canvas;
    if (!gotLock && !S.dead) enableFallback();
  }, 450);
}

document.addEventListener('pointerlockchange', () => {
  const nowLocked = document.pointerLockElement === canvas;
  if (nowLocked){
    fallbackMode = false;
    locked = true;
    canvas.style.cursor = 'none';
    beginPlay();
  } else if (!fallbackMode){
    locked = false;
    if (S.started && !S.dead){
      S.paused = true;
      $('paused').classList.remove('hidden');
    }
  }
});
document.addEventListener('pointerlockerror', () => enableFallback());

function pauseGame(){
  if (!S.started || S.dead || S.paused) return;
  S.paused = true;
  locked = false;
  mouseL = mouseR = false;
  canvas.style.cursor = 'crosshair';
  $('paused').classList.remove('hidden');
}
// Escape pauses manually in fallback mode, and also acts as a reliable pause shortcut outside pointer lock.
addEventListener('keydown', e => {
  if (e.code === 'Escape') pauseGame();
});

$('startBtn').addEventListener('click', () => { mode = 'solo'; setMap(MAP_NAMES[(Math.random()*MAP_NAMES.length)|0]); savePlayerName(); showDeploySequence('solo'); startGame(); });
function requestLAN(){
  const el = $('callsign');
  const typed = String(el ? el.value : '').trim();          // LAN requires a callsign — no ghosting in as a default name
  if (!typed){
    if (el){
      el.classList.add('needName');
      el.placeholder = 'ENTER A NAME FIRST';
      el.value = '';
      el.focus();
      setTimeout(() => el.classList.remove('needName'), 900);
    }
    return;
  }
  mode = 'dm';
  savePlayerName();
  connectNet();
  $('objective').innerHTML = '';
  showDeploySequence('dm');
  startGame();
}
$('mpBtn').addEventListener('click', () => requestLAN());

function resumeGame(){
  initAudio();
  $('paused').classList.add('hidden');
  if (!S.started){ startGame(); return; }
  if (fallbackMode){
    locked = true;
    S.paused = false;
    canvas.style.cursor = 'none';
    return;
  }
  S.paused = false;
  canvas.style.cursor = 'none';
  let gotLock = false;
  try {
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => { if (!gotLock) enableFallback(); });
  } catch (err) { enableFallback(); return; }
  setTimeout(() => {
    gotLock = document.pointerLockElement === canvas;
    if (!gotLock && !S.dead && !S.paused) enableFallback();
  }, 220);
}
function bindMenuButton(id, fn){
  const el = $(id);
  const handler = e => { e.preventDefault(); e.stopPropagation(); fn(); };
  el.addEventListener('mouseup', handler);
  el.addEventListener('click', handler);
  el.addEventListener('touchend', handler, { passive:false });
}
bindMenuButton('resumeBtn', resumeGame);
bindMenuButton('mainMenuBtn', () => location.reload());
bindMenuButton('restartBtn', () => location.reload());
addEventListener('mouseup', e => {
  if (S.started && S.paused && !S.dead && !$('paused').classList.contains('hidden') && !net.voteActive){
    if (e.target && e.target.id === 'mainMenuBtn') return;
    // Fallback for browsers / pointer-lock modes that misroute the pause-menu click to the canvas.
    if (e.target === canvas || e.target.id === 'paused' || e.target.id === 'resumeBtn') resumeGame();
  }
}, true);

function updateSettingsUI(){
  const sens = $('sensRange'), fov = $('fovRange'), vol = $('volumeRange'), qual = $('qualityRange');
  if (!sens) return;
  sens.value = Math.round(SETTINGS.sens * 100);
  fov.value = SETTINGS.fov;
  vol.value = Math.round(SETTINGS.volume * 100);
  qual.value = Math.round(SETTINGS.quality * 100);
  $('sensVal').textContent = sens.value + '%';
  $('fovVal').textContent = fov.value;
  $('volumeVal').textContent = vol.value + '%';
  $('qualityVal').textContent = qual.value + '%';
}
function bindRange(id, outId, transform, label){
  const el = $(id), out = $(outId); if (!el) return;
  el.addEventListener('input', () => {
    transform(Number(el.value));
    out.textContent = label(Number(el.value));
    applyRuntimeSettings();
    saveSettings();
  });
}
$('settingsBtn').addEventListener('click', () => { updateSettingsUI(); renderBindList(); $('settingsMenu').classList.remove('hidden'); });
$('settingsBackBtn').addEventListener('click', () => { captureBindAction = null; $('settingsMenu').classList.add('hidden'); });
$('settingsResetBtn').addEventListener('click', () => {
  Object.assign(SETTINGS, DEFAULT_SETTINGS);
  SETTINGS.binds = { ...DEFAULT_BINDS };
  captureBindAction = null;
  applyRuntimeSettings(); saveSettings(); updateSettingsUI(); renderBindList();
});
/* ---- keybind changer ---- */
function renderBindList(){
  const list = $('bindList'); if (!list) return;
  list.innerHTML = '';
  for (const id of Object.keys(BIND_LABELS)){
    const row = document.createElement('div');
    row.className = 'bindRow';
    const waiting = captureBindAction === id;
    row.innerHTML = `<span>${BIND_LABELS[id]}</span><button class="bindKey${waiting ? ' waiting' : ''}" type="button">${waiting ? 'PRESS ANY KEY…' : friendlyKeyName(bindCode(id))}</button>`;
    row.querySelector('button').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      captureBindAction = captureBindAction === id ? null : id;
      renderBindList();
    });
    list.appendChild(row);
  }
}
renderBindList();
bindRange('sensRange', 'sensVal', v => SETTINGS.sens = v / 100, v => v + '%');
bindRange('fovRange', 'fovVal', v => SETTINGS.fov = v, v => String(v));
bindRange('volumeRange', 'volumeVal', v => SETTINGS.volume = v / 100, v => v + '%');
bindRange('qualityRange', 'qualityVal', v => SETTINGS.quality = v / 100, v => v + '%');
updateSettingsUI();
applyRuntimeSettings();

function applyLocalSkinAppearance(){
  const sk = skinDef(PROGRESS.skin);
  try {
    if (armMats?.plate) armMats.plate.color.setHex(sk.eye);
    if (armMats?.sleeve) armMats.sleeve.color.setHex(Math.max(0x111111, sk.color));
  } catch(e){}
  try { if (net && net.on) netSend({ t:'skin', skin:PROGRESS.skin }); } catch(e){}
}
function updateProgressUI(){
  const lvl = progressLevel();
  const cur = xpForLevel(lvl), next = xpForLevel(lvl+1);
  const frac = clamp((PROGRESS.xp - cur) / Math.max(1, next - cur), 0, 1);
  const sk = skinDef(PROGRESS.skin);
  const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  setText('profileLevel', 'LVL ' + lvl);
  setText('profileSkinName', sk.name);
  setText('profileXpText', `${PROGRESS.xp - cur} / ${next - cur} XP`);
  setText('profileCash', PROGRESS.cash + ' CR');
  setText('skinWallet', PROGRESS.cash + ' CR');
  setText('skinLevelText', 'LEVEL ' + lvl + ' // TOTAL KILLS ' + (PROGRESS.totalKills || 0));
  const bar = $('profileXpBar'); if (bar) bar.style.width = (frac*100).toFixed(1) + '%';
  renderSkinGrid();
  updateChallengeUI();
}
function renderSkinGrid(){
  const grid = $('skinGrid'); if (!grid) return;
  const lvl = progressLevel();
  grid.innerHTML = '';
  for (const sk of SKINS){
    const unlocked = PROGRESS.unlocked.includes(sk.id);
    const levelOk = lvl >= sk.level;
    const afford = PROGRESS.cash >= sk.cost;
    const selected = PROGRESS.skin === sk.id;
    const card = document.createElement('button');
    card.className = 'skinCard' + (selected ? ' selected' : '');
    const state = selected ? 'EQUIPPED' : unlocked ? 'SELECT' : !levelOk ? `REQUIRES LVL ${sk.level}` : `${sk.cost} CR`;
    card.innerHTML = `<div class="skinSwatch" style="background:linear-gradient(135deg,#${sk.color.toString(16).padStart(6,'0')},#${sk.eye.toString(16).padStart(6,'0')}); box-shadow:0 0 22px #${sk.eye.toString(16).padStart(6,'0')}55 inset;"></div><b>${sk.name}</b><small>${sk.desc}</small><div class="skinAction">${state}</div>`;
    card.onclick = () => {
      if (unlocked){ PROGRESS.skin = sk.id; saveProgress(); applyLocalSkinAppearance(); updateProgressUI(); return; }
      if (!levelOk){ addKillFeed(null, `SKIN LOCKED — REACH <b>LEVEL ${sk.level}</b>`); return; }
      if (!afford){ addKillFeed(null, `NOT ENOUGH CREDITS — NEED <b>${sk.cost} CR</b>`); return; }
      PROGRESS.cash -= sk.cost;
      PROGRESS.unlocked.push(sk.id);
      PROGRESS.skin = sk.id;
      saveProgress(); applyLocalSkinAppearance(); updateProgressUI(); SFX.pickup();
    };
    grid.appendChild(card);
  }
}
$('skinsBtn').addEventListener('click', () => { updateProgressUI(); $('skinsMenu').classList.remove('hidden'); });
$('skinsBackBtn').addEventListener('click', () => $('skinsMenu').classList.add('hidden'));
$('progressResetBtn').addEventListener('click', () => {
  if (!confirm('Reset all saved progress, credits, levels, and skins?')) return;
  Object.assign(PROGRESS, defaultProgress()); saveProgress(); applyLocalSkinAppearance(); updateProgressUI();
});
updateProgressUI();

/* surface runtime errors on screen instead of failing silently */
window.addEventListener('error', e => {
  const box = $('errBox');
  if (box){
    box.classList.remove('hidden');
    box.textContent = 'ERROR: ' + (e.message || 'unknown') + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : '');
  }
});

/* ================= WEAPONS ================= */
const WEAPON_BLUEPRINTS = [
  // name, slot, auto, dmg, rpm, mag, reserve, hip spread, ADS spread, recoil, kick, pellets, sfx, range, scoped
  ['VX-7 PHANTOM',       'RIFLE',   true,  22, 690, 30, 150, .014, .0040, .011, .050, 1,  'rifle',   120, false],
  ['RIOT-8 BREACHER',    'SHOTGUN', false, 13,  78,  6,  30, .055, .0380, .035, .140, 8,  'shotgun',  40, false],
  ['FANG .45',           'PISTOL',  false, 42, 320, 12,  72, .006, .0015, .016, .070, 1,  'pistol',  150, false],
  ['LS-9 LONGSHOT',      'SNIPER',  false,130,  42,  5,  25, .045, .0004, .050, .200, 1,  'sniper',  250, true ],
  ['KRAKEN CARBINE',     'RIFLE',   true,  19, 810, 35, 210, .016, .0050, .010, .045, 1,  'rifle',   112, false],
  ['ORION-3 MARKSMAN',   'DMR',     false, 34, 360, 24, 120, .009, .0022, .015, .065, 1,  'rifle',   165, false],
  ['NOVA-11 AR',         'RIFLE',   true,  24, 620, 32, 160, .013, .0038, .012, .055, 1,  'rifle',   125, false],
  ['TALON PDW',          'SMG',     true,  16,1060, 42, 252, .022, .0100, .008, .035, 1,  'rifle',    82, false],
  ['MANTIS SMG',         'SMG',     true,  18, 920, 36, 216, .020, .0090, .009, .038, 1,  'rifle',    92, false],
  ['HELIX VECTOR',       'SMG',     true,  14,1220, 50, 300, .026, .0120, .007, .030, 1,  'rifle',    78, false],
  ['ARES-77 LMG',        'LMG',     true,  28, 540, 75, 225, .019, .0065, .015, .070, 1,  'rifle',   135, false],
  ['CERBERUS LMG',       'LMG',     true,  24, 680, 90, 270, .021, .0080, .013, .060, 1,  'rifle',   125, false],
  ['IRONWALL HMG',       'LMG',     true,  34, 430, 60, 180, .024, .0085, .020, .090, 1,  'rifle',   145, false],
  ['PULSE RAIL DMR',     'DMR',     false, 72, 190, 10,  60, .011, .0012, .025, .110, 1,  'sniper',  210, true ],
  ['GHOST NEEDLE',       'SNIPER',  false,105,  58,  7,  35, .040, .0006, .040, .160, 1,  'sniper',  240, true ],
  ['TITAN HUNTER',       'SNIPER',  false,175,  32,  3,  18, .055, .0003, .070, .240, 1,  'sniper',  280, true ],
  ['DUSK CARVER',        'SHOTGUN', false, 16,  60,  5,  25, .060, .0440, .040, .160, 7,  'shotgun',  38, false],
  ['MULE KICK',          'SHOTGUN', false, 12,  75,  8,  40, .062, .0430, .035, .140,10,  'shotgun',  37, false],
  ['CYCLONE AUTO-12',    'SHOTGUN', true,   8, 220, 16,  64, .066, .0500, .024, .080, 6,  'shotgun',  34, false],
  ['DRAGONBREATH-9',     'SHOTGUN', false, 10,  92,  7,  42, .072, .0520, .034, .130, 9,  'shotgun',  35, false],
  ['VIPER 9',            'PISTOL',  false, 30, 520, 18, 108, .010, .0030, .010, .045, 1,  'pistol',  115, false],
  ['JUDGE REVOLVER',     'PISTOL',  false, 78, 165,  6,  42, .012, .0020, .028, .115, 1,  'pistol',  155, false],
  ['WRAITH SILENCER',    'PISTOL',  false, 38, 390, 15,  90, .007, .0018, .011, .045, 1,  'pistol',  140, false],
  ['HAWK HANDCANNON',    'PISTOL',  false, 64, 220,  8,  56, .010, .0020, .023, .095, 1,  'pistol',  160, false],
  ['COMET XR',           'RIFLE',   true,  21, 760, 30, 180, .015, .0045, .010, .048, 1,  'rifle',   116, false],
  ['RAZORBACK-25',       'RIFLE',   true,  27, 560, 25, 125, .012, .0030, .015, .067, 1,  'rifle',   138, false],
  ['TEMPEST-40',         'RIFLE',   true,  18, 900, 40, 240, .018, .0060, .009, .040, 1,  'rifle',   105, false],
  ['NIGHTFALL DMR',      'DMR',     false, 58, 240, 14,  84, .010, .0016, .020, .085, 1,  'rifle',   180, false],
  ['SPECTRE CARBINE',    'RIFLE',   true,  20, 720, 28, 168, .013, .0038, .010, .046, 1,  'rifle',   118, false],
  ['GLACIER-80',         'LMG',     true,  26, 600, 80, 240, .020, .0070, .014, .065, 1,  'rifle',   130, false],
  ['MAELSTROM SMG',      'SMG',     true,  15,1150, 45, 270, .024, .0110, .008, .034, 1,  'rifle',    84, false],
  ['RONIN CQB',          'SMG',     true,  19, 840, 32, 192, .018, .0080, .010, .043, 1,  'rifle',    96, false],
  ['THUNDERCLAP',        'SHOTGUN', false, 18,  64,  6,  30, .064, .0470, .045, .170, 5,  'shotgun',  44, false],
  ['SUNPIKE-14',         'SNIPER',  false,140,  44,  5,  30, .045, .0004, .055, .205, 1,  'sniper',  260, true ],
  ['HORIZON SCOUT',      'DMR',     false, 50, 300, 16,  96, .009, .0018, .017, .075, 1,  'rifle',   175, false],
  ['ODIN ASSAULT',       'RIFLE',   true,  31, 500, 30, 150, .014, .0035, .017, .075, 1,  'rifle',   145, false],
  ['PHOTON REPEATER',    'SMG',     true,  17, 980, 48, 288, .020, .0085, .008, .036, 1,  'rifle',    98, false],
  ['NEEDLESTORM',        'SMG',     true,  13,1280, 60, 360, .028, .0130, .006, .028, 1,  'rifle',    75, false],
  ['WARLOCK-36',         'RIFLE',   true,  23, 660, 36, 180, .013, .0037, .011, .052, 1,  'rifle',   124, false],
  ['BULLDOG-10',         'SHOTGUN', false, 14, 105, 10,  50, .058, .0420, .030, .120, 8,  'shotgun',  39, false],
  ['REAPER MARKSMAN',    'DMR',     false, 86, 130,  9,  54, .012, .0010, .028, .115, 1,  'sniper',  220, true ],
  ['ECLIPSE VSR',        'SNIPER',  false,120,  52,  6,  36, .043, .0005, .047, .175, 1,  'sniper',  245, true ],
  ['HAMMERHEAD-70',      'LMG',     true,  30, 520, 70, 210, .022, .0075, .017, .078, 1,  'rifle',   138, false],
  ['SIDEWINDER MP',      'PISTOL',  true,  18, 850, 25, 150, .020, .0080, .009, .036, 1,  'pistol',   90, false],
  ['SCORPION TMP',       'PISTOL',  true,  14,1080, 32, 192, .024, .0110, .007, .030, 1,  'pistol',   80, false],
  ['VALKYRIE-34',        'RIFLE',   true,  25, 600, 34, 170, .012, .0032, .012, .055, 1,  'rifle',   132, false],
  ['LANCER RAIL',        'RAIL',    false, 96,  90,  6,  36, .018, .0008, .035, .145, 1,  'sniper',  260, true ],
  ['FURNACE QUAD',       'SHOTGUN', false, 44,  52,  4,  24, .072, .0500, .052, .200, 4,  'shotgun',  42, false],
  ['MIRAGE PDW',         'SMG',     true,  17,1000, 44, 264, .021, .0095, .008, .036, 1,  'rifle',    88, false],
  ['PROTOCOL ZERO',      'EXOTIC',  false,155,  48,  4,  24, .035, .0005, .060, .220, 1,  'sniper',  275, true ],
];
const WEAPONS = WEAPON_BLUEPRINTS.map((b, i) => ({
  name:b[0], slot:b[1], auto:b[2], dmg:b[3], rpm:b[4], mag:b[5], reserve:b[6],
  spread:b[7], adsSpread:b[8], recoil:b[9], kick:b[10], pellets:b[11], sfx:b[12], range:b[13], scoped:!!b[14],
  index:i, accent:[0x2cf2ff,0xff9a3c,0xff3b57,0x8fe08a,0xd040ff,0xffd040][i % 6],
  darkAccent:[0x0d6670,0x7a3a10,0x701929,0x1f6a38,0x4e196a,0x745c14][i % 6]
}));
WEAPONS.forEach(w => { w.ammo = w.mag; w.res = w.reserve; w.cool = 0; w.reloading = 0; });
const RARITIES = [
  { id:'common', name:'COMMON', color:0x9ab0cc, chance:0.50, dmg:1.00, spread:1.00, recoil:1.00 },
  { id:'uncommon', name:'UNCOMMON', color:0x8fe08a, chance:0.25, dmg:1.08, spread:0.93, recoil:0.95 },
  { id:'rare', name:'RARE', color:0x2cf2ff, chance:0.14, dmg:1.18, spread:0.86, recoil:0.90 },
  { id:'epic', name:'EPIC', color:0xd040ff, chance:0.08, dmg:1.32, spread:0.78, recoil:0.84 },
  { id:'exotic', name:'EXOTIC', color:0xff9a3c, chance:0.03, dmg:1.55, spread:0.68, recoil:0.78 },
];
let currentRarity = RARITIES[0];
function rollRarity(){
  let r = Math.random();
  for (const rr of RARITIES){ r -= rr.chance; if (r <= 0) return rr; }
  return RARITIES[0];
}
let weaponIndex = 0;
const CW = () => WEAPONS[weaponIndex];

/* ---- viewmodels ---- */
const gunRoot = new THREE.Group();
camera.add(gunRoot);
const gunMats = {
  body: new THREE.MeshStandardMaterial({ color:0x4a5264, roughness:.45, metalness:.55 }),
  grip: new THREE.MeshStandardMaterial({ color:0x2e3440, roughness:.7, metalness:.35 }),
  accent: new THREE.MeshBasicMaterial({ color:0x2cf2ff }),
  accentO: new THREE.MeshBasicMaterial({ color:0xff9a3c }),
};
function box(w,h,d,mat,x,y,z,parent){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x,y,z); parent.add(m); return m;
}
function tagPart(g, name, obj){
  g.userData[name] = obj;
  obj.userData.basePos = obj.position.clone();
  obj.userData.baseRot = obj.rotation.clone();
  return obj;
}
function prepareGunModel(g){
  g.traverse(o => {
    if (!o.userData.basePos) o.userData.basePos = o.position.clone();
    if (!o.userData.baseRot) o.userData.baseRot = o.rotation.clone();
  });
  return g;
}
function resetGunModel(g){
  if (!g) return;
  g.traverse(o => {
    if (o.userData.basePos) o.position.copy(o.userData.basePos);
    if (o.userData.baseRot) o.rotation.copy(o.userData.baseRot);
  });
}
function procMat(color, glow=false){
  return glow
    ? new THREE.MeshBasicMaterial({ color })
    : new THREE.MeshStandardMaterial({ color, roughness:.42, metalness:.62 });
}
function buildProceduralGunModel(w, i){
  const g = new THREE.Group();
  const slot = w.slot;
  const accent = procMat(w.accent, true);
  const bodyMat = procMat(0x3c4658 + ((i % 3) * 0x050505));
  const darkMat = procMat(0x222936);
  const hotMat = procMat(w.darkAccent);
  const isPistol = slot === 'PISTOL';
  const isShotgun = slot === 'SHOTGUN';
  const isSniper = slot === 'SNIPER' || slot === 'DMR' || slot === 'RAIL' || slot === 'EXOTIC';
  const isLMG = slot === 'LMG';
  const isSMG = slot === 'SMG';
  const len = isPistol ? .28 : isShotgun ? .56 : isSniper ? .82 : isLMG ? .68 : isSMG ? .42 : .54;
  const width = isPistol ? .06 : isShotgun ? .105 : isLMG ? .105 : .078;
  const height = isPistol ? .08 : isLMG ? .12 : .095;
  tagPart(g, 'receiver', box(width,height,len, bodyMat, 0, isPistol ? .018 : 0, -len*.22, g));

  const barrelLen = isPistol ? .14 : isShotgun ? .44 : isSniper ? .58 : isLMG ? .48 : .36;
  const barrelRad = isShotgun ? .032 : isSniper ? .017 : isPistol ? .014 : .019;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(barrelRad, barrelRad, barrelLen, 10), bodyMat);
  barrel.rotation.x = Math.PI/2; barrel.position.set(0, isShotgun ? .032 : .018, -len*.48 - barrelLen*.35); g.add(barrel); tagPart(g, 'barrel', barrel);

  if (!isPistol){
    const stock = box(width*.95, .095, isSniper ? .30 : .22, darkMat, 0, -.035, len*.24, g);
    stock.rotation.x = isShotgun ? .08 : -.03; tagPart(g, 'stock', stock);
    const grip = box(width*.76, .16, .075, darkMat, 0, -.12, len*.12, g);
    grip.rotation.x = .26; tagPart(g, 'grip', grip);
  } else {
    const grip = box(.052,.16,.07, darkMat, 0,-.085,.045, g);
    grip.rotation.x = .18; tagPart(g, 'grip', grip);
  }

  if (isShotgun){
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(.023,.023,barrelLen*.92,10), darkMat);
    tube.rotation.x = Math.PI/2; tube.position.set(0,-.035,-len*.48 - barrelLen*.28); g.add(tube); tagPart(g, 'tube', tube);
    const pump = box(width*.8,.072,.18, hotMat, 0,-.04,-len*.52, g); tagPart(g, 'pump', pump);
  } else {
    const magH = isPistol ? .13 : isLMG ? .28 : isSniper ? .16 : isSMG ? .18 : .21;
    const mag = box(width*.7, magH, isLMG ? .16 : .075, darkMat, isLMG ? -.052 : 0, isPistol ? -.145 : -.13, isPistol ? .055 : -len*.18, g);
    mag.rotation.x = isPistol ? .18 : -.1; tagPart(g, 'mag', mag);
  }

  const rail = box(width*.98,.013, len*.70, accent, 0, height*.78, -len*.22, g); tagPart(g, 'rail', rail);
  const strip = box(width*1.05,.011, len*.65, accent, 0, -height*.47, -len*.18, g); tagPart(g, 'strip', strip);
  if (isSniper){
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(.036,.036,.28,12), darkMat);
    scope.rotation.x = Math.PI/2; scope.position.set(0, .105, -len*.22); g.add(scope); tagPart(g, 'scopeTube', scope);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(.029,.029,.006,12), accent);
    lens.rotation.x = Math.PI/2; lens.position.set(0, .105, -len*.22-.144); g.add(lens); tagPart(g, 'lens', lens);
  } else if (!isPistol){
    tagPart(g, 'frontSight', box(.014,.035,.014, accent, 0, height*.92, -len*.46, g));
  }
  const bolt = box(width*.42,.025,.07, hotMat, width*.58, height*.45, -len*.11, g); tagPart(g, 'bolt', bolt);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, isShotgun ? .032 : .018, -len*.48 - barrelLen*.78); g.add(muzzle);
  g.userData.muzzle = muzzle;
  g.userData.weaponSlot = slot;
  g.userData.variantScale = isPistol ? .72 : isLMG ? .86 : isSniper ? .83 : .78;
  return prepareGunModel(g);
}
function buildGunModels(){
  const models = [];
  // RIFLE
  {
    const g = new THREE.Group();
    box(0.075,0.095,0.52, gunMats.body, 0,0,-0.1, g);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.34,10), gunMats.body);
    barrel.rotation.x = Math.PI/2; barrel.position.set(0,0.012,-0.5); g.add(barrel);
    box(0.06,0.17,0.07, gunMats.grip, 0,-0.12,0.08, g).rotation.x = 0.25;
    const mag = box(0.05,0.2,0.09, gunMats.grip, 0,-0.14,-0.14, g); mag.rotation.x = -0.12; g.userData.mag = mag;   // mag
    box(0.07,0.06,0.2, gunMats.grip, 0,0.07,-0.18, g);                        // rail
    box(0.012,0.035,0.012, gunMats.accent, 0,0.115,-0.26, g);                 // front post
    box(0.05,0.03,0.03, gunMats.body, 0,0.105,0.05, g);                       // rear sight
    box(0.08,0.012,0.4, gunMats.accent, 0,-0.045,-0.12, g);                   // glow strip
    const muzzle = new THREE.Object3D(); muzzle.position.set(0,0.012,-0.68); g.add(muzzle);
    g.userData.muzzle = muzzle;
    models.push(g);
  }
  // SHOTGUN
  {
    const g = new THREE.Group();
    box(0.095,0.11,0.46, gunMats.body, 0,0,-0.05, g);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.4,10), gunMats.body);
    barrel.rotation.x = Math.PI/2; barrel.position.set(0,0.03,-0.45); g.add(barrel);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.36,10), gunMats.grip);
    tube.rotation.x = Math.PI/2; tube.position.set(0,-0.03,-0.42); g.add(tube);
    const pump = box(0.07,0.07,0.14, gunMats.accentO, 0,-0.03,-0.34, g); g.userData.pump = pump;                   // pump
    box(0.065,0.16,0.08, gunMats.grip, 0,-0.12,0.1, g).rotation.x = 0.3;
    box(0.09,0.012,0.3, gunMats.accentO, 0,0.062,-0.2, g);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0,0.03,-0.66); g.add(muzzle);
    g.userData.muzzle = muzzle;
    models.push(g);
  }
  // PISTOL
  {
    const g = new THREE.Group();
    box(0.055,0.08,0.26, gunMats.body, 0,0.02,-0.06, g);
    const grip = box(0.05,0.15,0.07, gunMats.grip, 0,-0.08,0.04, g); grip.rotation.x = 0.18;
    const mag = box(0.042,0.115,0.05, gunMats.grip, 0,-0.145,0.055, g); mag.rotation.x = 0.18; g.userData.mag = mag;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,0.1,8), gunMats.body);
    barrel.rotation.x = Math.PI/2; barrel.position.set(0,0.03,-0.22); g.add(barrel);
    box(0.012,0.025,0.012, gunMats.accent, 0,0.075,-0.16, g);
    box(0.056,0.01,0.18, gunMats.accent, 0,-0.025,-0.05, g);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0,0.03,-0.3); g.add(muzzle);
    g.userData.muzzle = muzzle;
    models.push(g);
  }
  // SNIPER
  {
    const g = new THREE.Group();
    box(0.07,0.09,0.82, gunMats.body, 0,0,-0.2, g);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,0.52,10), gunMats.body);
    barrel.rotation.x = Math.PI/2; barrel.position.set(0,0.015,-0.82); g.add(barrel);
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.036,0.036,0.26,12), gunMats.grip);
    scopeTube.rotation.x = Math.PI/2; scopeTube.position.set(0,0.1,-0.2); g.add(scopeTube);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.005,12), gunMats.accent);
    lens.rotation.x = Math.PI/2; lens.position.set(0,0.1,-0.335); g.add(lens);
    box(0.06,0.17,0.08, gunMats.grip, 0,-0.12,0.06, g).rotation.x = 0.28;
    box(0.055,0.13,0.2, gunMats.grip, 0,-0.05,0.22, g);                       // stock
    const mag = box(0.05,0.16,0.08, gunMats.grip, 0,-0.13,-0.26, g); mag.rotation.x = -0.1; g.userData.mag = mag;    // mag
    box(0.075,0.012,0.6, gunMats.accentO, 0,-0.042,-0.25, g);                 // glow strip
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.09), gunMats.grip);
    brake.position.set(0,0.015,-1.06); g.add(brake);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0,0.015,-1.12); g.add(muzzle);
    g.userData.muzzle = muzzle;
    models.push(g);
  }
  while (models.length < WEAPONS.length) models.push(buildProceduralGunModel(WEAPONS[models.length], models.length));
  models.forEach(prepareGunModel);
  return models;
}
function enhanceGunModel(g, w, i){
  const accent = new THREE.MeshBasicMaterial({ color:w.accent || 0x2cf2ff });
  const dark = gunMats.grip;
  const metal = gunMats.body;
  const len = w.slot === 'PISTOL' ? .22 : (w.slot === 'SHOTGUN' ? .46 : (w.scoped ? .72 : .52));
  // vented handguard / barrel shroud
  for (let k=0;k<3;k++){
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, 0.09), accent);
    vent.position.set((k-1)*0.03, -0.01, -len*0.45 - k*0.055);
    g.add(vent); tagPart(g, 'vent'+k, vent);
  }
  // trigger guard and trigger
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.004, 6, 14), dark);
  guard.rotation.x = Math.PI/2; guard.scale.y = 0.65; guard.position.set(0, -0.072, 0.055);
  g.add(guard); tagPart(g, 'triggerGuard', guard);
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.045, 0.012), accent);
  trigger.position.set(0, -0.085, 0.03); trigger.rotation.x = -0.18;
  g.add(trigger); tagPart(g, 'trigger', trigger);
  // muzzle brake / suppressor profile
  const brake = new THREE.Mesh(new THREE.BoxGeometry(w.slot === 'SHOTGUN' ? .07 : .052, w.slot === 'SHOTGUN' ? .052 : .038, .07), dark);
  brake.position.set(0, w.slot === 'SHOTGUN' ? .032 : .018, g.userData.muzzle ? g.userData.muzzle.position.z + .035 : -0.72);
  g.add(brake); tagPart(g, 'muzzleBrake', brake);
  // side plate/ejection port
  const port = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.035, 0.12), metal);
  port.position.set(0.045, 0.034, -0.09); g.add(port); tagPart(g, 'ejectionPort', port);
  // compact optic for non-scope guns
  if (!w.scoped && w.slot !== 'PISTOL'){
    const optic = new THREE.Mesh(new THREE.BoxGeometry(0.052,0.036,0.07), dark);
    optic.position.set(0, .105, -0.12); g.add(optic); tagPart(g, 'optic', optic);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.046,0.024,0.006), accent);
    lens.position.set(0, .105, -0.158); g.add(lens); tagPart(g, 'opticLens', lens);
  }
  // visible foregrip / hand stop so the support hand has something to hold instead of floating under the gun
  if (w.slot !== 'PISTOL'){
    const gripZ = w.slot === 'SHOTGUN' ? -len*.48 : -len*.36;
    const foreGrip = new THREE.Mesh(new THREE.BoxGeometry(.052, .15, .06), dark);
    foreGrip.position.set(0, -.108, gripZ);
    foreGrip.rotation.x = .08;
    g.add(foreGrip); tagPart(g, 'foreGrip', foreGrip);
    const gripCap = new THREE.Mesh(new THREE.BoxGeometry(.068, .018, .078), accent);
    gripCap.position.set(0, -.19, gripZ);
    g.add(gripCap); tagPart(g, 'foreGripCap', gripCap);
  }
  prepareGunModel(g);
}
const gunModels = buildGunModels();
gunModels.forEach((g,i) => { enhanceGunModel(g, WEAPONS[i], i); g.visible = i === 0; g.scale.setScalar(g.userData.variantScale || 0.78); gunRoot.add(g); });

const armMats = {
  sleeve: new THREE.MeshStandardMaterial({ color:0x172235, roughness:.72, metalness:.25 }),
  glove: new THREE.MeshStandardMaterial({ color:0x0c111a, roughness:.82, metalness:.2 }),
  plate: new THREE.MeshBasicMaterial({ color:0x2cf2ff })
};
function armBox(w,h,d,mat,x,y,z,parent){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x,y,z); m.castShadow = true; parent.add(m);
  m.userData.basePos=m.position.clone(); m.userData.baseRot=m.rotation.clone();
  return m;
}
function bakeArmBases(root){
  root.traverse(o => {
    if (o.isMesh){ o.userData.basePos = o.position.clone(); o.userData.baseRot = o.rotation.clone(); }
  });
}
function buildFirstPersonArms(){
  const g = new THREE.Group();
  // Support arm: forearm -> wrist cuff -> palm/fingers, all touching the underside foregrip.
  const lFore = armBox(.082,.088,.46,armMats.sleeve,-.135,-.266,-.155,g); lFore.rotation.set(-.34,.12,.13);
  const lWrist = armBox(.086,.072,.155,armMats.sleeve,-.082,-.228,-.318,g); lWrist.rotation.set(-.24,.08,.10);
  const lHand = armBox(.118,.058,.175,armMats.glove,-.018,-.190,-.386,g); lHand.rotation.set(-.10,.035,.055);
  const lThumb = armBox(.030,.038,.102,armMats.glove,.052,-.176,-.372,g); lThumb.rotation.set(.12,-.18,-.35);
  const lFingerA = armBox(.026,.034,.118,armMats.glove,-.062,-.158,-.415,g); lFingerA.rotation.set(.16,.03,.05);
  const lFingerB = armBox(.026,.034,.118,armMats.glove,-.020,-.156,-.424,g); lFingerB.rotation.set(.16,.01,.02);
  const lFingerC = armBox(.026,.034,.112,armMats.glove,.022,-.158,-.416,g); lFingerC.rotation.set(.16,-.03,-.04);

  // Firing arm: tucked back onto the grip/trigger.
  const rFore = armBox(.082,.088,.45,armMats.sleeve,.145,-.267,-.128,g); rFore.rotation.set(-.38,-.13,-.15);
  const rWrist = armBox(.084,.070,.135,armMats.sleeve,.092,-.226,-.026,g); rWrist.rotation.set(-.18,-.07,-.10);
  const rHand = armBox(.104,.062,.128,armMats.glove,.054,-.198,.038,g); rHand.rotation.set(-.08,-.05,-.08);
  const lPlate = armBox(.084,.012,.20,armMats.plate,-.135,-.213,-.245,g); lPlate.rotation.set(-.08,.04,.08);
  const rPlate = armBox(.084,.012,.20,armMats.plate,.145,-.216,-.205,g); rPlate.rotation.set(-.08,-.04,-.08);
  bakeArmBases(g);
  g.userData = { lFore, lWrist, lHand, lThumb, lFingerA, lFingerB, lFingerC, lPlate, rFore, rWrist, rHand, rPlate };
  return g;
}
const armsRoot = buildFirstPersonArms();
gunRoot.add(armsRoot);
applyLocalSkinAppearance();

// small light so the viewmodel isn't silhouetted when facing away from the sun
const vmLight = new THREE.PointLight(0xcfe0ff, 1.4, 2.2, 2);
vmLight.position.set(0.25, 0.25, -0.15);
camera.add(vmLight);

// muzzle flash
const flashTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32,32,2,32,32,32);
  rg.addColorStop(0,'rgba(255,240,200,1)'); rg.addColorStop(0.3,'rgba(255,180,80,.9)'); rg.addColorStop(1,'rgba(255,120,30,0)');
  g.fillStyle = rg; g.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
})();
const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, blending:THREE.AdditiveBlending, depthWrite:false }));
flash.scale.set(0.3,0.3,1); flash.visible = false;
scene.add(flash);
addLampGlows();
const flashLight = new THREE.PointLight(0xffa550, 0, 9, 2);
camera.add(flashLight);
flashLight.position.set(0.1, -0.1, -0.8);
let flashTimer = 0;

const GUN_HIP = new THREE.Vector3(0.235, -0.235, -0.44);
const GUN_ADS = new THREE.Vector3(0, -0.166, -0.33);
let gunKick = 0, adsT = 0, switchT = 0;

function switchWeapon(i, opts={}){
  if (!WEAPONS.length) return;
  i = ((i % WEAPONS.length) + WEAPONS.length) % WEAPONS.length;
  const oldW = CW();
  if (!opts.force && (i === weaponIndex || oldW.reloading > 0)) return;
  if (opts.force) oldW.reloading = 0;
  resetGunModel(gunModels[weaponIndex]);
  weaponIndex = i;
  switchT = opts.roll ? 0.48 : 0.3;
  adsT = 0;
  mouseR = false;
  updateWeaponVisibility();
  if (!opts.silent) (opts.roll ? SFX.reloadBolt() : SFX.reload1());
  updateAmmoHUD();
}
function showWeaponRoll(w, tierLabel='RANDOMIZED'){
  const el = $('weaponRoll');
  const rc = '#' + currentRarity.color.toString(16).padStart(6,'0');
  if (el){
    el.innerHTML = `<span>${tierLabel} // <b style="color:${rc}">${currentRarity.name}</b></span><b>${w.name}</b><small>${w.slot} // TIER ${mode === 'dm' ? Math.min((net.myScore||0)+1, 30) : weaponIndex+1} // DMG ×${currentRarity.dmg.toFixed(2)}</small>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  addKillFeed(null, `ARSENAL ${tierLabel === 'RANDOMIZED' ? 'ROTATED' : 'ADVANCED'} &nbsp;⟶&nbsp; <b style="color:${rc}">${currentRarity.name}</b> ${w.name}`);
}
function rotateWeaponForKill(){
  if (WEAPONS.length <= 1) return;
  let next = weaponIndex;
  for (let tries=0; tries<18 && next === weaponIndex; tries++) next = (Math.random() * WEAPONS.length) | 0;
  if (next === weaponIndex) next = (weaponIndex + 1) % WEAPONS.length;
  switchWeapon(next, { force:true, roll:true });
  currentRarity = rollRarity();
  const w = CW();
  w.ammo = w.mag;                                        // every kill gives a loaded new gun
  w.res = Math.max(w.res, Math.min(w.reserve, w.mag * 3));
  w.cool = 0; w.reloading = 0;
  updateAmmoHUD();
  showWeaponRoll(w);
}

/* ================= KNIFE (key 2) ================= */
const KNIFE_DEFS = [
  { name:'RIPPER SHANK', dmg:25,  backstab:99999, golden:false, speedMul:1.05 },
  { name:'GOLDEN SHANK', dmg:50,  backstab:99999, golden:true,  speedMul:1.15 },
];
const BS_DOT = -0.35;               // attacker must sit inside the victim's rear 140° cone for a backstab
const KNIFE_CODE = 100;            // replicated weapon slot: 100 = knife, 101 = golden knife
let knifeMode = 0;                 // 0 = gun, 1 = knife
let knifeSwingT = 0, knifeSwingCd = 0, knifeSwingId = 0;
function knifeGolden(){ return mode === 'dm' && (net.myScore || 0) >= FINAL_TIER_SCORE; }
function knifeLocked(){ return knifeGolden(); }       // final tier is knife-only
function currentKnifeDef(){ return KNIFE_DEFS[knifeGolden() ? 1 : 0]; }

function buildKnifeModel(golden){
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: golden ? 0xd8b13c : 0xb8c4d4, roughness:.26, metalness:.92 });
  const dark  = new THREE.MeshStandardMaterial({ color: golden ? 0x4a3512 : 0x2e3440, roughness:.7, metalness:.4 });
  const glow  = new THREE.MeshBasicMaterial({ color: golden ? 0xffe680 : 0x2cf2ff });
  const handle = box(.045,.15,.085, dark, 0,-.115,.075, g); handle.rotation.x = -.12;
  box(.088,.026,.05, dark, 0,-.028,.048, g);                                    // guard
  const blade = box(.03,.30,.058, steel, 0,.135,.012, g); blade.rotation.x = .06;
  const tip = box(.03,.06,.058, steel, 0,.316,-.006, g); tip.rotation.x = .5;
  const edge = box(.011,.30,.012, glow, .018,.135,-.004, g); edge.rotation.x = .06;
  tagPart(g,'blade',blade); tagPart(g,'edge',edge); tagPart(g,'tip',tip);
  return prepareGunModel(g);
}
const knifeModels = [buildKnifeModel(false), buildKnifeModel(true)];
knifeModels[0].name = 'knifeNormal';
knifeModels[1].name = 'knifeGolden';
// reverse grip: canted forward so the blade reads as a knife, not a baton
knifeModels.forEach(m => { m.visible = false; m.scale.setScalar(.8); m.position.set(-.02,.07,.02); m.rotation.set(.12,.3,.5); gunRoot.add(m); });

function updateWeaponVisibility(){
  gunModels.forEach((g,k) => g.visible = knifeMode ? false : k === weaponIndex);
  const golden = knifeGolden() ? 1 : 0;
  knifeModels.forEach((m,i) => m.visible = knifeMode && i === golden);
}
function equipGunSlot(){
  if (!knifeMode) return;
  if (knifeLocked()){ addKillFeed(null, 'FINAL TIER — <b style="color:#ffd040">GOLDEN SHANK</b> ONLY'); return; }
  knifeMode = 0;
  switchT = Math.max(switchT, 0.2);
  knifeSwingT = knifeSwingCd = 0;
  updateWeaponVisibility(); updateAmmoHUD(); SFX.reload1();
}
function equipKnifeSlot(){
  if (knifeMode) return;
  knifeMode = 1; mouseR = false; adsT = 0;
  switchT = Math.max(switchT, 0.2);
  updateWeaponVisibility(); updateAmmoHUD(); SFX.reloadBolt();
}
function tryKnifeSwing(){
  if (!S.started || S.paused || S.dead || !knifeMode) return;
  if (knifeSwingCd > 0 || knifeSwingT > 0) return;
  knifeSwingId++;
  knifeSwingT = 0.42; knifeSwingCd = 0.575;                             // 15% more cooldown (was 0.5s)
  setTimeout(() => playNoise(0.04, 1500, 0.55, 0.14), 110);          // whoosh at the strike frame
  setTimeout(knifeStrike, 150);                                       // connect at the mid-swing contact frame
  gunKick = Math.min(gunKick + 0.03, 0.22);                           // tiny forward punch
  if (net.on){
    netSend({ t:'shoot', w:knifeGolden() ? 101 : 100,
      o:[+player.pos.x.toFixed(2), +(player.pos.y+1.3).toFixed(2), +player.pos.z.toFixed(2)],
      p:[+player.pos.x.toFixed(2), +(player.pos.y+1.3).toFixed(2), +player.pos.z.toFixed(2)] });
  }
}
function isBackstab(fx, fz, vx, vz){
  // fx/fz = victim's visual forward, v = unit vector from victim to attacker
  const vl = Math.hypot(vx, vz) || 1;
  return (fx*vx + fz*vz) / vl < BS_DOT;
}
function knifeStrike(){
  if (!S.started || S.dead || S.paused || !knifeMode) return;
  const def = currentKnifeDef();
  const range = 3.0, minDot = 0.42;
  const fx = -Math.sin(player.yaw) * Math.cos(player.pitch), fy = Math.sin(player.pitch), fz = -Math.cos(player.yaw) * Math.cos(player.pitch);
  let anyHit = false, anyKill = false;
  for (const e of enemies){
    if (e.dead) continue;
    const tp = e.group.position;
    const dx = tp.x - player.pos.x, dy = (tp.y + 1.1*e.type.scale) - (player.pos.y+1.5), dz = tp.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range + e.radius) continue;
    const len = Math.sqrt(dx*dx+dy*dy+dz*dz) || 1;
    if ((dx*fx+dy*fy+dz*fz)/len < minDot && d > 1.1) continue;
    anyHit = true;
    const eth = e.group.rotation.y;
    const bs = isBackstab(-Math.sin(eth), -Math.cos(eth), player.pos.x - tp.x, player.pos.z - tp.z);
    const dmg = bs ? def.backstab : def.dmg;
    if (bs){
      spawnSparks(new THREE.Vector3(tp.x, tp.y + 1.1*e.type.scale, tp.z), 0xff7040, 22);
      spawnDamagePopup(new THREE.Vector3(tp.x, tp.y + 1.5*e.type.scale, tp.z), 999, true);
      addKillFeed(null, `<b style="color:#ffd040">⚔ BACKSTAB!</b> ${e.type && e.type.name ? e.type.name : 'HOSTILE'} — ONE HIT`);
      SFX.kill();
    } else {
      spawnSparks(new THREE.Vector3(tp.x, tp.y + 1.1*e.type.scale, tp.z), knifeGolden() ? 0xffe680 : 0xffd040, 10);
      spawnDamagePopup(new THREE.Vector3(tp.x, tp.y + 1.5*e.type.scale, tp.z), dmg, false);
      SFX.hit();
    }
    if (damageEnemy(e, dmg)) anyKill = true;
  }
  if (net.on){
    for (const rp of net.players.values()){
      if (!rp.group.visible || isTeammate(rp)) continue;
      const tp = rp.group.position;
      const dx = tp.x - player.pos.x, dy = (tp.y + 1.1) - (player.pos.y+1.5), dz = tp.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const len = Math.sqrt(dx*dx+dy*fy+dz*dz) || 1;
      if ((dx*fx+dy*fy+dz*fz)/len < minDot && d > 1.1) continue;
      anyHit = true;
      const bs = isBackstab(-Math.sin(rp.yaw), -Math.cos(rp.yaw), player.pos.x - tp.x, player.pos.z - tp.z);
      const dmg = bs ? 200 : def.dmg;                 // server caps dmg at 200 — enough to drop 100 hp instantly
      if (bs){
        spawnSparks(new THREE.Vector3(tp.x, tp.y + 1.15, tp.z), 0xff7040, 24);
        spawnDamagePopup(new THREE.Vector3(tp.x, tp.y + 1.55, tp.z), dmg, true);
        SFX.kill();
      } else {
        spawnSparks(new THREE.Vector3(tp.x, tp.y + 1.15, tp.z), knifeGolden() ? 0xffe680 : 0xffd040, 12);
        spawnDamagePopup(new THREE.Vector3(tp.x, tp.y + 1.55, tp.z), dmg, false);
        SFX.hit();
      }
      netSend({ t:'hit', target:rp.id, dmg, knife:true, bs:bs || undefined });
    }
  }
  for (const dd of destructibles){
    if (dd.broken) continue;
    const tp = dd.mesh.position;
    const dx = tp.x - player.pos.x, dz = tp.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range + 0.8) continue;
    const len = dist || 1;
    if ((dx*fx+dz*fz)/len < minDot*0.6 && dist > 1.2) continue;
    anyHit = true;
    damageDestructible(dd, def.dmg, tp.clone());
  }
  if (anyHit) showHitmarker(anyKill);
}

/* ================= SHARED GUN LADDER (LAN DM) =================
   Every player gets the same weapon at the same score. Kills promote you
   one tier; getting shanked costs you one point and one tier. The final
   tier (29+) locks you to the golden knife — the 30th kill is knife-only. */
const GUN_LADDER = [
  43, 20,  2, 22, 44, 23,           // pistols
   9,  8,  7, 48, 36, 30, 31, 37,   // smgs
  17, 18, 39, 19,  1, 16, 32,       // shotguns
  24, 26,  6, 38, 35, 45,           // rifles
  47, 15,                           // heavy hitters
];
const FINAL_TIER_SCORE = 29;
function ladderRarity(sc){
  return sc >= 27 ? RARITIES[4] : sc >= 21 ? RARITIES[3] : sc >= 14 ? RARITIES[2] : sc >= 6 ? RARITIES[1] : RARITIES[0];
}
function equipLadderTier(sc, { quiet=false } = {}){
  sc = clamp(sc|0, 0, FINAL_TIER_SCORE + 1);
  if (sc >= FINAL_TIER_SCORE){
    knifeMode = 1; mouseR = false; adsT = 0;
    switchT = Math.max(switchT, 0.22);
    updateWeaponVisibility(); updateAmmoHUD();
    if (!quiet){
      showBanner('FINAL TIER — GOLDEN SHANK');
      addKillFeed(null, 'FINAL TIER ⟶ <b style="color:#ffd040">GOLDEN SHANK</b> ONLY // +15% SPEED');
      SFX.reloadBolt();
    }
    return;
  }
  knifeMode = 0;
  currentRarity = ladderRarity(sc);
  switchWeapon(GUN_LADDER[clamp(sc, 0, GUN_LADDER.length-1)], { force:true, roll:true });
  const w = CW();
  w.ammo = w.mag; w.res = w.reserve; w.cool = 0; w.reloading = 0;
  updateWeaponVisibility(); updateAmmoHUD();
  if (!quiet) showWeaponRoll(w, `TIER ${sc + 1}`);
}
function syncLadderWeapon(){
  if (mode !== 'dm') return;
  const me = (net.scores || []).find(p => p.id === net.id);
  const sc = me ? (me.score || 0) : 0;
  if (net.myScore === undefined || net.myScore < 0){ net.myScore = sc; equipLadderTier(sc, { quiet:true }); return; }
  if (sc === net.myScore) return;
  const promoted = sc > net.myScore;
  net.myScore = sc;
  if (!promoted){
    showBanner('KNIFED — DEMOTED');
    addKillFeed(null, `<b>KNIFED!</b> DEMOTED BACK TO ${sc} // ONE TIER LOST`);
  }
  equipLadderTier(sc);
}

function reloadDuration(w){
  if (w.slot === 'LMG') return 2.45;
  if (w.slot === 'SHOTGUN') return 2.05;
  if (w.slot === 'SNIPER' || w.slot === 'RAIL' || w.slot === 'EXOTIC') return 2.18;
  if (w.slot === 'PISTOL') return 1.28;
  if (w.slot === 'SMG') return 1.38;
  return 1.62;
}
function tryReload(){
  const w = CW();
  if (knifeMode || w.reloading > 0 || w.ammo === w.mag || w.res <= 0) return;
  const dur = reloadDuration(w);
  w.reloading = dur;
  w.reloadTime = dur;
  w.reloadToken = (w.reloadToken || 0) + 1;
  const token = w.reloadToken;
  SFX.reload1();
  setTimeout(() => { if (actx && w.reloadToken === token && w.reloading > 0) SFX.reloadMag(); }, dur * 420);
  setTimeout(() => { if (actx && w.reloadToken === token && w.reloading > 0) SFX.reload2(); },  dur * 700);
  setTimeout(() => { if (actx && w.reloadToken === token) SFX.reloadBolt(); }, Math.max(120, dur*1000 - 260));
  updateAmmoHUD();
}
function ease01(x){ x = clamp(x, 0, 1); return x*x*(3 - 2*x); }
function pulse01(x, c, w){ return clamp(1 - Math.abs(x - c) / w, 0, 1); }
function reloadProgress(w){ return w.reloading > 0 ? clamp(1 - w.reloading / (w.reloadTime || reloadDuration(w)), 0, 1) : 0; }
function animateWeaponModel(model, w){
  if (!model) return;
  resetGunModel(model);
  const u = reloadProgress(w);
  if (u <= 0) return;
  const magPulse = ease01(pulse01(u, .43, .28));
  const boltPulse = ease01(pulse01(u, .78, .18));
  const insertPulse = ease01(pulse01(u, .66, .20));
  const mag = model.userData.mag;
  if (mag && mag.userData.basePos){
    mag.position.y = mag.userData.basePos.y - 0.34 * magPulse + 0.08 * insertPulse;
    mag.position.z = mag.userData.basePos.z + 0.05 * magPulse;
    mag.rotation.x = mag.userData.baseRot.x - 0.75 * magPulse;
    mag.rotation.z = mag.userData.baseRot.z + 0.22 * insertPulse;
  }
  const pump = model.userData.pump;
  if (pump && pump.userData.basePos){
    const p = ease01(pulse01(u, .58, .38));
    pump.position.z = pump.userData.basePos.z + 0.18 * Math.sin(p * Math.PI);
  }
  const bolt = model.userData.bolt;
  if (bolt && bolt.userData.basePos){
    bolt.position.z = bolt.userData.basePos.z + 0.11 * boltPulse;
    bolt.position.x = bolt.userData.basePos.x + 0.035 * boltPulse;
  }
  const slide = model.userData.receiver;
  if (slide && w.slot === 'PISTOL' && slide.userData.basePos){
    const p = ease01(pulse01(u, .78, .20));
    slide.position.z = slide.userData.basePos.z + 0.06 * p;
  }
}
function animateFirstPersonArms(w, hSpeed){
  const u = reloadProgress(w);
  const reloadLean = ease01(pulse01(u, .52, .42));
  const bolt = ease01(pulse01(u, .82, .18));
  const bob = Math.sin(player.bobT * 2) * 0.012 * clamp(hSpeed/7, 0, 1);
  armsRoot.position.set(0.015 * (1-adsT), bob - reloadLean*0.035, reloadLean*0.04 - gunKick*0.15);
  armsRoot.rotation.set(-reloadLean*0.18 + gunKick*0.35, reloadLean*0.10, -reloadLean*0.18);
  const a = armsRoot.userData;
  const supportShiftZ = reloadLean*.13 - bolt*.035;
  const supportShiftY = -reloadLean*.035;
  for (const part of [a.lWrist, a.lHand, a.lThumb, a.lFingerA, a.lFingerB, a.lFingerC]){
    if (!part) continue;
    part.position.z = part.userData.basePos.z + supportShiftZ;
    part.position.y = part.userData.basePos.y + supportShiftY;
    part.rotation.z = part.userData.baseRot.z + reloadLean*.34;
    part.rotation.x = part.userData.baseRot.x - reloadLean*.10;
  }
  if (a.rHand){ a.rHand.position.z = a.rHand.userData.basePos.z + bolt*.08 - gunKick*.05; a.rHand.rotation.x = a.rHand.userData.baseRot.x - bolt*.45 + gunKick*.8; }
  if (a.rWrist){ a.rWrist.position.z = a.rWrist.userData.basePos.z + bolt*.045 - gunKick*.025; a.rWrist.rotation.x = a.rWrist.userData.baseRot.x - bolt*.24 + gunKick*.35; }
  if (a.lFore){ a.lFore.rotation.z = a.lFore.userData.baseRot.z + reloadLean*.22; a.lFore.rotation.x = a.lFore.userData.baseRot.x - reloadLean*.12; }
  if (a.rFore){ a.rFore.rotation.x = a.rFore.userData.baseRot.x - bolt*.25 + gunKick*.45; }
  // knife stance: the support arm (which normally grips the gun) tucks away entirely —
  // including its forearm armor plate, which is a separate mesh — and the dominant
  // hand rises onto the knife grip with a closed wrist. The armor plates read as
  // floating shards in this pose, so both plates hide while knifing.
  for (const part of [a.lWrist, a.lHand, a.lThumb, a.lFingerA, a.lFingerB, a.lFingerC, a.lPlate, a.rPlate]) if (part) part.visible = !knifeMode;
  if (knifeMode){
    if (a.rHand){ // fist wraps the knife handle, angled with the blade
      a.rHand.position.y = a.rHand.userData.basePos.y + 0.185; a.rHand.position.z = a.rHand.userData.basePos.z + 0.022; a.rHand.position.x = a.rHand.userData.basePos.x - 0.012;
      a.rHand.rotation.x = a.rHand.userData.baseRot.x + 0.32; a.rHand.rotation.y = a.rHand.userData.baseRot.y + 0.30; a.rHand.rotation.z = a.rHand.userData.baseRot.z + 0.50;
    }
    if (a.rWrist){ // cuff trails the fist
      a.rWrist.position.x = a.rWrist.userData.basePos.x - 0.002; a.rWrist.position.y = a.rWrist.userData.basePos.y + 0.106; a.rWrist.position.z = a.rWrist.userData.basePos.z + 0.076;
      a.rWrist.rotation.x = a.rWrist.userData.baseRot.x + 0.32; a.rWrist.rotation.y = a.rWrist.userData.baseRot.y + 0.25; a.rWrist.rotation.z = a.rWrist.userData.baseRot.z + 0.40;
    }
    if (a.rFore) a.rFore.rotation.x = a.rFore.userData.baseRot.x + 0.22;
    if (a.lFore) a.lFore.visible = false;
  } else if (a.lFore) a.lFore.visible = true;
}

/* ---- shooting ---- */
const raycaster = new THREE.Raycaster();
const _dir = new THREE.Vector3(), _origin = new THREE.Vector3(), _hitPoint = new THREE.Vector3();

function fireWeapon(){
  const w = CW();
  if (w.cool > 0 || w.reloading > 0 || switchT > 0) return;
  if (w.ammo <= 0){ SFX.dry(); w.cool = 0.25; if (w.res > 0) tryReload(); return; }
  w.ammo--; w.cool = 60 / w.rpm;
  S.shotsFired += w.pellets;
  SFX[w.sfx]();

  // recoil & effects
  const recoilMul = currentRarity.recoil || 1;
  gunKick = Math.min(gunKick + w.kick * recoilMul, 0.22);
  player.pitch += w.recoil * recoilMul * rand(0.75, 1.2);
  player.yaw += w.recoil * recoilMul * rand(-0.35, 0.35);
  player.shake = Math.min(player.shake + w.kick * recoilMul * 0.5, 0.1);
  flashTimer = 0.045;
  flashLight.intensity = 2.6;

  const muzzle = gunModels[weaponIndex].userData.muzzle;
  muzzle.getWorldPosition(flash.position);
  flash.material.rotation = rand(0, Math.PI*2);
  flash.scale.setScalar(w.slot === 'SHOTGUN' ? 0.5 : 0.32);
  flash.visible = true;

  camera.getWorldPosition(_origin);
  let anyHit = false, anyKill = false;
  const spread = (adsT > 0.5 ? w.adsSpread : w.spread) * (currentRarity.spread || 1) * (player.grounded ? (player.crouched ? 0.62 : 1) : 1.7);   // crouching steadies your aim

  for (let p = 0; p < w.pellets; p++){
    camera.getWorldDirection(_dir);
    _dir.x += rand(-spread, spread); _dir.y += rand(-spread, spread); _dir.z += rand(-spread, spread);
    _dir.normalize();

    const worldDist = castWorld(_origin, _dir, w.range);

    // enemies + remote players
    raycaster.set(_origin, _dir);
    raycaster.far = worldDist + 0.04;
    let hitEnemy = null, hitNetId = null, hitDestructible = null, hitDist = worldDist, headshot = false;
    const meshes = [];
    for (const e of enemies) if (!e.dead) meshes.push(e.group);
    if (net.on) for (const rp of net.players.values()){ if (isTeammate(rp)) continue; meshes.push(rp.group); }
    for (const d of destructibles) if (!d.broken) { meshes.push(d.mesh); if (d.glow) meshes.push(d.glow); }
    const hits = raycaster.intersectObjects(meshes, true);
    if (hits.length){
      const h = hits[0];
      let o = h.object;
      while (o){
        if (o.userData.enemy){ hitEnemy = o.userData.enemy; break; }
        if (o.userData.netId){ hitNetId = o.userData.netId; break; }
        if (o.userData.destructible){ hitDestructible = o.userData.destructible; break; }
        o = o.parent;
      }
      if (hitEnemy || hitNetId || hitDestructible){
        hitDist = h.distance;
        headshot = h.object.name === 'head';
      }
    }

    _hitPoint.copy(_origin).addScaledVector(_dir, hitDist);
    spawnTracer(flash.position, _hitPoint);
    if (net.on && p === 0)
      netSend({ t:'shoot', w:weaponIndex, o:[+flash.position.x.toFixed(2), +flash.position.y.toFixed(2), +flash.position.z.toFixed(2)],
                p:[+_hitPoint.x.toFixed(2), +_hitPoint.y.toFixed(2), +_hitPoint.z.toFixed(2)] });

    if (hitEnemy){
      anyHit = true;
      const dmg = w.dmg * (currentRarity.dmg || 1) * (headshot ? 2 : 1);
      S.shotsHit++; if (headshot) S.headshots++;
      spawnSparks(_hitPoint, headshot ? 0xffd040 : 0xff8040, headshot ? 14 : 8);
      spawnDamagePopup(_hitPoint, Math.round(dmg), headshot);
      if (damageEnemy(hitEnemy, dmg)) anyKill = true;
    } else if (hitNetId){
      anyHit = true;
      const dmg = w.dmg * (currentRarity.dmg || 1) * (headshot ? 2 : 1);
      S.shotsHit++; if (headshot) S.headshots++;
      spawnSparks(_hitPoint, headshot ? 0xffd040 : 0xff8040, headshot ? 14 : 8);
      spawnDamagePopup(_hitPoint, Math.round(dmg), headshot);
      netSend({ t:'hit', target:hitNetId, dmg });
    } else if (hitDestructible){
      anyHit = true;
      const dmg = w.dmg * (currentRarity.dmg || 1);
      S.shotsHit++;
      spawnSparks(_hitPoint, hitDestructible.explosive ? 0xff9a3c : 0x2cf2ff, hitDestructible.explosive ? 14 : 8);
      damageDestructible(hitDestructible, dmg, _hitPoint);
    } else if (hitDist < w.range - 0.01){
      spawnSparks(_hitPoint, 0x9ab0cc, 5);
      spawnSmoke(_hitPoint, 1);
    }
  }

  if (anyHit) showHitmarker(anyKill);
  updateAmmoHUD();
}

/* ================= TRACERS / PARTICLES / POPUPS ================= */
const tracers = [];
const tracerGeo = new THREE.BoxGeometry(0.018, 0.018, 1);
function spawnTracer(from, to){
  const len = from.distanceTo(to);
  if (len < 0.5) return;
  const mat = new THREE.MeshBasicMaterial({ color:0xffd9a0, transparent:true, opacity:0.95, blending:THREE.AdditiveBlending, depthWrite:false });
  const m = new THREE.Mesh(tracerGeo, mat);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.lookAt(to);
  m.scale.z = len;
  scene.add(m);
  tracers.push({ mesh:m, life:0.07 });
}

const particles = [];
const sparkGeo = new THREE.TetrahedronGeometry(0.035);
const smokeGeo = new THREE.SphereGeometry(0.1, 6, 5);
function spawnSparks(pos, color, n){
  for (let i=0;i<n;i++){
    const mat = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:1, blending:THREE.AdditiveBlending, depthWrite:false });
    const m = new THREE.Mesh(sparkGeo, mat);
    m.position.copy(pos);
    scene.add(m);
    particles.push({ mesh:m, vel:new THREE.Vector3(rand(-4,4), rand(1,6), rand(-4,4)), life:rand(0.2,0.45), maxLife:0.45, grav:-14, type:'spark' });
  }
}
function spawnSmoke(pos, n){
  for (let i=0;i<n;i++){
    const mat = new THREE.MeshBasicMaterial({ color:0x8a93a5, transparent:true, opacity:0.4, depthWrite:false });
    const m = new THREE.Mesh(smokeGeo, mat);
    m.position.copy(pos);
    scene.add(m);
    particles.push({ mesh:m, vel:new THREE.Vector3(rand(-0.5,0.5), rand(0.8,1.6), rand(-0.5,0.5)), life:rand(0.5,0.9), maxLife:0.9, grav:0, type:'smoke' });
  }
}
function spawnExplosion(pos){
  spawnSparks(pos, 0xffa040, 22);
  spawnSparks(pos, 0xff4060, 10);
  spawnSmoke(pos, 5);
  SFX.explode();
}

const popups = [];
function spawnDamagePopup(pos, dmg, crit){
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.font = `bold ${crit ? 46 : 36}px Consolas, monospace`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = crit ? '#ffb020' : '#2cf2ff'; g.shadowBlur = 12;
  g.fillStyle = crit ? '#ffd040' : '#eafcff';
  g.fillText(String(dmg), 64, 32);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false }));
  sp.scale.set(crit ? 1.1 : 0.8, crit ? 0.55 : 0.4, 1);
  sp.position.copy(pos).add(new THREE.Vector3(rand(-0.2,0.2), rand(0.1,0.35), rand(-0.2,0.2)));
  scene.add(sp);
  popups.push({ sp, life:0.7, maxLife:0.7 });
}

/* ================= EXPLOSIONS / GIBS / RINGS ================= */
const expLight = new THREE.PointLight(0xffa050, 0, 34, 2);
scene.add(expLight);

function spawnRing(pos, color){
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 36),
    new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.85, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, depthWrite:false }));
  ring.rotation.x = -Math.PI/2;
  ring.position.copy(pos); ring.position.y = Math.max(ring.position.y, 0.14);
  scene.add(ring);
  particles.push({ mesh:ring, vel:new THREE.Vector3(), life:0.5, maxLife:0.5, grav:0, type:'ring' });
}
function spawnGibs(pos, color, n){
  for (let i=0;i<n;i++){
    const s = rand(0.07, 0.2);
    const mat = new THREE.MeshStandardMaterial({ color, roughness:.6, metalness:.5, transparent:true });
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s*rand(0.5,1.4), s*rand(0.5,1.4)), mat);
    m.position.copy(pos).add(new THREE.Vector3(rand(-0.3,0.3), rand(-0.2,0.4), rand(-0.3,0.3)));
    m.castShadow = true;
    scene.add(m);
    particles.push({ mesh:m, vel:new THREE.Vector3(rand(-5,5), rand(2,7.5), rand(-5,5)),
      life:rand(0.9,1.5), maxLife:1.5, grav:-19, type:'gib',
      spin:new THREE.Vector3(rand(-9,9), rand(-9,9), rand(-9,9)) });
  }
}
function spawnPlayerPieces(pos, color=0x2c6eff){
  const specs = [
    [0.55,0.48,0.32, 0,1.15,0, color], [0.28,0.26,0.28, 0,1.78,0, color],
    [0.16,0.55,0.18,-0.43,1.22,0, 0x172235], [0.16,0.55,0.18,0.43,1.22,0, 0x172235],
    [0.18,0.68,0.20,-0.18,0.55,0, 0x111822], [0.18,0.68,0.20,0.18,0.55,0, 0x111822],
    [0.16,0.10,0.70, 0.24,1.18,-0.40, 0x303846], [0.08,0.08,0.32,-0.18,1.05,-0.24, 0x0c111a]
  ];
  SFX.bodyBreak();
  for (const [w,h,d,x,y,z,c] of specs){
    const mat = new THREE.MeshStandardMaterial({ color:c, roughness:.62, metalness:.45, transparent:true });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(pos.x + x, pos.y + y, pos.z + z);
    m.rotation.set(rand(-.8,.8), rand(-.8,.8), rand(-.8,.8));
    m.castShadow = true;
    scene.add(m);
    particles.push({ mesh:m, vel:new THREE.Vector3(rand(-4.8,4.8), rand(2.6,7.8), rand(-4.8,4.8)),
      life:rand(2.0,3.4), maxLife:3.4, grav:-19, type:'gib',
      spin:new THREE.Vector3(rand(-8,8), rand(-8,8), rand(-8,8)) });
  }
  spawnRing(pos.clone().add(new THREE.Vector3(0,0.08,0)), 0x2cf2ff);
  spawnSparks(pos.clone().add(new THREE.Vector3(0,1.2,0)), color, 16);
}

/* ================= GRENADES ================= */
const grenadesLive = [];
function throwGrenade(){
  if (!S.started || S.paused || S.dead || player.grenades <= 0) return;
  if (knifeLocked()){ addKillFeed(null, 'FINAL TIER — <b style="color:#ffd040">GOLDEN SHANK</b> ONLY'); return; }
  player.grenades--;
  updateAmmoHUD();
  SFX.reload1();
  const mat = new THREE.MeshStandardMaterial({ color:0x39424f, roughness:.4, metalness:.6, emissive:0x22ff88, emissiveIntensity:0.9 });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat);
  camera.getWorldDirection(_dir);
  m.position.copy(camera.position).addScaledVector(_dir, 0.5);
  m.castShadow = true;
  scene.add(m);
  grenadesLive.push({ mesh:m, fuse:1.7,
    vel:_dir.clone().multiplyScalar(15.5).add(new THREE.Vector3(player.vel.x*0.4, 3.4, player.vel.z*0.4)) });
}
function explodeAt(pos){
  SFX.bigBoom();
  spawnSparks(pos, 0xffb050, 26);
  spawnSparks(pos, 0xff5040, 14);
  spawnSmoke(pos, 7);
  spawnRing(pos, 0xffa050);
  spawnRing(pos, 0xff5040);
  expLight.position.copy(pos); expLight.position.y += 0.6;
  expLight.intensity = 90;
  const R = 6.5;
  // hurt AI enemies
  for (const e of enemies){
    if (e.dead) continue;
    const d = e.group.position.distanceTo(pos);
    if (d < R){
      const dmg = Math.round(135 * (1 - d/R) + 15);
      spawnDamagePopup(e.group.position.clone().add(new THREE.Vector3(0, 1.6*e.type.scale, 0)), dmg, false);
      damageEnemy(e, dmg);
    }
  }
  // hurt rival players in deathmatch
  if (net.on) for (const [pid, rp] of net.players){
    if (isTeammate(rp)) continue;
    const d = rp.group.position.distanceTo(pos);
    if (d < R) netSend({ t:'hit', target:pid, dmg:Math.round(120 * (1 - d/R)) });
  }
  // self-damage if too close
  const selfD = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
  if (selfD < 4.2) damagePlayer(Math.round(50 * (1 - selfD/4.2)), pos);
  player.shake = Math.min(player.shake + clamp(0.3 - selfD * 0.012, 0.05, 0.3), 0.3);
}
function updateGrenades(dt, now){
  for (let i = grenadesLive.length-1; i >= 0; i--){
    const g = grenadesLive[i];
    g.fuse -= dt;
    g.vel.y -= 17 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    g.mesh.rotation.x += dt*6; g.mesh.rotation.z += dt*4;
    // floor bounce
    if (g.mesh.position.y < 0.09){
      g.mesh.position.y = 0.09;
      if (g.vel.y < -0.8) SFX.nadeBounce();
      g.vel.y *= -0.42; g.vel.x *= 0.72; g.vel.z *= 0.72;
    }
    // bounce off solids
    const r = 0.09, mp = g.mesh.position;
    for (const s of solids){
      if (mp.x > s.min.x-r && mp.x < s.max.x+r && mp.z > s.min.z-r && mp.z < s.max.z+r && mp.y > s.min.y-r && mp.y < s.max.y+r){
        const dx1 = mp.x-(s.min.x-r), dx2 = (s.max.x+r)-mp.x;
        const dz1 = mp.z-(s.min.z-r), dz2 = (s.max.z+r)-mp.z;
        const dy2 = (s.max.y+r)-mp.y;
        const m = Math.min(dx1, dx2, dz1, dz2, dy2);
        if (m === dy2){ mp.y = s.max.y+r; if (g.vel.y < 0){ g.vel.y *= -0.42; } g.vel.x *= 0.75; g.vel.z *= 0.75; }
        else if (m === dx1){ mp.x = s.min.x-r; g.vel.x = -Math.abs(g.vel.x)*0.55; SFX.nadeBounce(); }
        else if (m === dx2){ mp.x = s.max.x+r; g.vel.x =  Math.abs(g.vel.x)*0.55; SFX.nadeBounce(); }
        else if (m === dz1){ mp.z = s.min.z-r; g.vel.z = -Math.abs(g.vel.z)*0.55; SFX.nadeBounce(); }
        else               { mp.z = s.max.z+r; g.vel.z =  Math.abs(g.vel.z)*0.55; SFX.nadeBounce(); }
      }
    }
    // warning blink as the fuse runs out
    const m2 = g.mesh.material;
    if (g.fuse < 0.65){
      m2.emissive.setHex(Math.sin(now * 0.045) > 0 ? 0xff2020 : 0x330000);
      m2.emissiveIntensity = 2.2;
    }
    if (g.fuse <= 0){
      explodeAt(g.mesh.position.clone());
      scene.remove(g.mesh); m2.dispose();
      grenadesLive.splice(i, 1);
    }
  }
}

/* ================= SLIDE ================= */
function trySlide(){
  if (!S.started || S.paused || S.dead) return;
  if (player.slideCd > 0 || player.slideT > 0 || !player.grounded) return;
  const hs = Math.hypot(player.vel.x, player.vel.z);
  if (hs < 6.5) return;                       // must be sprinting
  slideDir.set(player.vel.x / hs, 0, player.vel.z / hs);
  player.slideT = 0.62;
  player.slideCd = 1.25;
  SFX.slide();
}
function findFinisherTarget(){
  let best = null, bestD = 99;
  for (const e of enemies){
    if (e.dead || e.executing) continue;
    const d = Math.hypot(e.group.position.x - player.pos.x, e.group.position.z - player.pos.z);
    const eligible = e.hp <= e.maxHp * 0.35 || e.hurtT > 0 || e.type.boss && e.hp <= e.maxHp * 0.18;
    if (eligible && d < bestD && d < (e.type.boss ? 3.6 : 2.65)){ best = e; bestD = d; }
  }
  return best;
}
function tryFinisher(){
  if (!S.started || S.paused || S.dead) return;
  let best = findFinisherTarget();
  if (!best){ addKillFeed(null, 'NO FINISHER TARGET'); return; }
  best.executing = true; best.executeT = 0.55; best._attackQueued = true; best.attackKind = 'execute'; best.attackT = 0.55; best.attackDur = 0.55;
  showBanner('EXECUTION');
  SFX.kill(); player.shake = Math.min(player.shake + 0.08, 0.22);
  spawnRing(best.group.position, 0xffd040);
  spawnSparks(best.group.position.clone().add(new THREE.Vector3(0,1.2*best.type.scale,0)), 0xffd040, 18);
  grantProgress(120, 90, 'EXECUTION BONUS');
  setTimeout(() => { if (!best.dead) damageEnemy(best, best.hp + 9999); }, 330);
}

/* ================= KILL STREAKS ================= */
let streak = 0, streakT = 0;
function registerKill(){
  streak++; streakT = 4;
  S.longestStreak = Math.max(S.longestStreak || 0, streak);
  const wn = knifeMode ? currentKnifeDef().name : CW().name;
  S.weaponKills[wn] = (S.weaponKills[wn] || 0) + 1;
  if (mode === 'solo') rotateWeaponForKill();       // LAN uses the shared ladder instead (synced from server scores)
  if (streak < 2) return;
  const table = { 2:['DOUBLE KILL',100], 3:['TRIPLE KILL',250], 4:['QUAD KILL',400], 5:['MEGA KILL',600] };
  const [txt, bonus] = table[streak] || ['RAMPAGE ×' + streak, 750];
  S.score += bonus;
  const el = $('streak');
  el.textContent = txt + '  +' + bonus;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  for (let i = 0; i < Math.min(streak, 6); i++)
    setTimeout(() => playTone(480 + i*170, 480 + i*170, 0.12, 0.22, 'square'), i * 75);
}

/* ================= DAMAGE DIRECTION ================= */
let dmgDirT = 0;
function showDamageDir(fromPos){
  if (!fromPos) return;
  const dx = fromPos.x - player.pos.x, dz = fromPos.z - player.pos.z;
  if (dx*dx + dz*dz < 0.4) return;
  const deg = -(Math.atan2(dx, dz) - player.yaw - Math.PI) * 180 / Math.PI;
  $('dmgDir').style.transform = `rotate(${deg.toFixed(1)}deg) translateY(-112px)`;
  dmgDirT = 0.9;
}

/* ================= ENEMIES ================= */
const ENEMY_TYPES = {
  scout:   { hp:45,  speed:5.2, scale:0.82, color:0xc93a4e, eye:0xff2a3e, dmg:8,  fireCd:[1.1,1.9], projSpeed:26, range:26, score:100, name:'SCOUT', faction:'RIFT MARAUDERS' },
  soldier: { hp:95,  speed:3.4, scale:1.0,  color:0x8a3242, eye:0xff4020, dmg:10, fireCd:[1.4,2.2], projSpeed:24, range:30, score:150, name:'SOLDIER', faction:'RIFT MARAUDERS', burst:3 },
  stalker: { hp:70,  speed:6.6, scale:0.9,  color:0x5a2a66, eye:0xd040ff, dmg:22, fireCd:[0,0],     projSpeed:0,  range:2.1,score:200, name:'STALKER', faction:'VOID BROOD', melee:true },
  brute:   { hp:280, speed:2.3, scale:1.5,  color:0x6e2230, eye:0xff8020, dmg:20, fireCd:[2.2,3.2], projSpeed:18, range:34, score:400, name:'BRUTE', faction:'BLACK IRON' },
  drone:   { hp:55,  speed:5.8, scale:0.68, color:0x2b5d77, eye:0x66eaff, dmg:7,  fireCd:[0.9,1.5], projSpeed:30, range:28, score:140, name:'DRONE', faction:'ECLIPSE DRONES', burst:2 },
  sentinel:{ hp:145, speed:2.9, scale:1.12, color:0x45526e, eye:0x2cf2ff, dmg:14, fireCd:[1.7,2.6], projSpeed:25, range:35, score:260, name:'SENTINEL', faction:'CORP SENTINELS', burst:4 },
  reaver:  { hp:120, speed:4.4, scale:1.05, color:0x7a2d5a, eye:0xff3bcb, dmg:16, fireCd:[1.2,2.0], projSpeed:22, range:24, score:240, name:'REAVER', faction:'NEON CULT' },
  nemesis: { hp:1650,speed:2.0, scale:2.05, color:0x231a2d, eye:0xff9a3c, dmg:28, fireCd:[1.6,2.4], projSpeed:22, range:38, score:1800,name:'NEMESIS', faction:'BLACKOUT LORDS', boss:true, burst:5 },
};
const enemies = [];
const enemyMats = {};
function getEnemyMat(color){
  if (!enemyMats[color]) enemyMats[color] = new THREE.MeshStandardMaterial({ color, roughness:.55, metalness:.6 });
  return enemyMats[color];
}
const eyeMats = {};
function getEyeMat(color){
  if (!eyeMats[color]) eyeMats[color] = new THREE.MeshBasicMaterial({ color });
  return eyeMats[color];
}

function bakeEnemyPart(part){
  if (!part) return part;
  part.userData.basePos = part.position.clone();
  part.userData.baseRot = part.rotation.clone();
  part.userData.baseScale = part.scale.clone();
  return part;
}
function buildEnemyMesh(t){
  const g = new THREE.Group();
  const bodyMat = getEnemyMat(t.color);
  const darkMat = gunMats.grip;
  const glowMat = getEyeMat(t.eye);
  const scale = t.scale || 1;

  const pelvis = box(0.58,0.22,0.38, darkMat, 0,0.92,0.02, g);
  const torso = box(0.72,0.78,0.46, bodyMat, 0,1.28,0, g);
  const chest = box(0.54,0.08,0.035, glowMat, 0,1.44,-0.245, g);
  const neck = box(0.25,0.12,0.28, darkMat, 0,1.70,0, g);
  const head = box(0.36,0.30,0.34, bodyMat, 0,1.91,0, g); head.name = 'head';
  const eye = box(0.25,0.075,0.035, glowMat, 0,1.93,-0.19, g); eye.name = 'head';
  const shoulder = box(0.96,0.14,0.32, darkMat, 0,1.55,0, g);
  const backGlow = box(0.55,0.05,0.42, glowMat, 0,1.64,0.25, g);

  // limbs use translated geometry so they rotate naturally from the upper joint.
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.20,0.72,0.22), darkMat);
  legL.geometry.translate(0,-0.36,0); legL.position.set(-0.20,0.88,0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.20; g.add(legR);
  const footL = box(0.25,0.12,0.38, darkMat, -0.20,0.10,-0.07, g);
  const footR = box(0.25,0.12,0.38, darkMat,  0.20,0.10,-0.07, g);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.62,0.19), bodyMat);
  armL.geometry.translate(0,-0.31,0); armL.position.set(-0.48,1.50,0.02); g.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.62,0.19), bodyMat);
  armR.geometry.translate(0,-0.31,0); armR.position.set( 0.48,1.50,0.02); g.add(armR);
  const handL = box(0.18,0.13,0.20, darkMat, -0.48,0.86,-0.02, g);
  const handR = box(0.18,0.13,0.20, darkMat,  0.48,0.86,-0.02, g);
  const clawL = box(0.035,0.22,0.035, glowMat, -0.49,0.72,-0.10, g);
  const clawR = box(0.035,0.22,0.035, glowMat,  0.49,0.72,-0.10, g);

  // Better ranged weapon silhouette: receiver + barrel + glowing muzzle node.
  const gun = box(0.11,0.10,0.54, darkMat, 0.43,1.18,-0.30, g);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.36,10), darkMat);
  barrel.rotation.x = Math.PI/2; barrel.position.set(0.43,1.18,-0.72); g.add(barrel);
  const gunGlow = box(0.075,0.012,0.40, glowMat, 0.43,1.13,-0.36, g);
  const gunTip = new THREE.Object3D(); gunTip.position.set(0.43,1.18,-0.93); g.add(gunTip);
  const muzzleOrb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), glowMat);
  muzzleOrb.position.copy(gunTip.position); g.add(muzzleOrb);

  // Stalker/brute silhouettes get more menace.
  if (t.melee){
    gun.visible = barrel.visible = gunGlow.visible = muzzleOrb.visible = false;
    clawL.scale.set(1.35,1.45,1.35); clawR.scale.set(1.35,1.45,1.35);
  }
  if (t.name === 'BRUTE' || t.boss){
    shoulder.scale.set(t.boss ? 1.28 : 1.12, t.boss ? 1.35 : 1.15, 1.08);
    handL.scale.set(t.boss ? 1.55 : 1.25, t.boss ? 1.45 : 1.25, t.boss ? 1.45 : 1.25);
    handR.scale.copy(handL.scale);
    if (t.boss){ chest.scale.x = 1.35; backGlow.scale.x = 1.3; muzzleOrb.scale.setScalar(1.8); }
  }

  g.traverse(o => { if (o.isMesh){ o.castShadow = true; } });
  g.scale.setScalar(scale);
  const parts = { pelvis, torso, chest, neck, head, eye, shoulder, backGlow, legL, legR, footL, footR, armL, armR, handL, handR, clawL, clawR, gun, barrel, gunGlow, muzzleOrb };
  for (const part of Object.values(parts)) bakeEnemyPart(part);
  g.userData.legs = [legL, legR];
  g.userData.parts = parts;
  g.userData.gunTip = gunTip;
  return g;
}

// health bar sprites
function makeBarSprites(){
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color:0x101418, depthWrite:false }));
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color:0xff3b57, depthWrite:false }));
  bg.scale.set(0.9, 0.09, 1); fg.scale.set(0.86, 0.055, 1);
  bg.visible = fg.visible = false;
  bg.raycast = () => {}; fg.raycast = () => {};   // bullets must not hit the UI bars
  return { bg, fg };
}

// activeSpawnPoints is set by the active map layout.
function spawnEnemy(typeName){
  const t = ENEMY_TYPES[typeName];
  // pick spawn far from player
  let best = null, bestD = -1;
  for (const [x,z] of activeSpawnPoints){
    const d = Math.hypot(x - player.pos.x, z - player.pos.z) + rand(0, 14);
    if (d > bestD){ bestD = d; best = [x,z]; }
  }
  const group = buildEnemyMesh(t);
  group.position.set(best[0] + rand(-2,2), 0, best[1] + rand(-2,2));
  resolvePenetration(group.position, 0.55*t.scale);   // never spawn inside cover
  scene.add(group);
  const { bg, fg } = makeBarSprites();
  group.add(bg, fg);
  bg.position.y = 2.35; fg.position.y = 2.35;
  const e = {
    type:t, typeName, group, hp:t.hp, maxHp:t.hp, dead:false,
    fireCd:rand(1,2), animT:rand(0,9), radius:0.55*t.scale,
    barBg:bg, barFg:fg, hurtT:0, meleeCd:0, moveBlend:0, strafeBlend:0,
    attackT:0, attackDur:0, attackKind:'idle', lastAttackKind:'idle', lastAttackT:0, attackFlashT:0, spawnT:0.55, _attackQueued:false,
    strafeDir: Math.random() > .5 ? 1 : -1, strafeT: rand(1,3),
    avoidT:0, avoidDirX:0, avoidDirZ:0, senseT:rand(0,.25), stuckT:0, progT:0, _px:null, _pz:null,
  };
  group.traverse(o => o.userData.enemy = e);
  enemies.push(e);
  spawnSparks(group.position.clone().add(new THREE.Vector3(0,1.2,0)), 0x2cf2ff, 14);
  return e;
}

function damageEnemy(e, dmg){
  if (e.dead) return false;
  e.hp -= dmg;
  e.hurtT = 0.12;
  SFX.hit();
  if (e.hp <= 0){
    e.dead = true;
    S.kills++;
    PROGRESS.totalKills = (PROGRESS.totalKills || 0) + 1;
    trackChallenge('kill', 1);
    grantProgress(Math.round(e.type.score * 0.25), Math.round(e.type.score * 0.08), e.type.name + ' ELIMINATED');
    S.score += e.type.score;
    if (e.type.boss) showBanner('BOSS ELIMINATED');
    registerKill();
    addKillFeed(e.type.name);
    const c = e.group.position.clone().add(new THREE.Vector3(0, 1.1*e.type.scale, 0));
    spawnExplosion(c);
    spawnGibs(c, e.type.color, e.type.boss ? 18 : (e.typeName === 'brute' ? 11 : 7));
    spawnRing(e.group.position, e.type.eye);
    scene.remove(e.group);
    SFX.kill();
    spawnScorePopup(e.group.position.clone().add(new THREE.Vector3(0, 1.8*e.type.scale, 0)), e.type.score);
    updateTopHUD();
    return true;
  }
  return false;
}
function spawnScorePopup(pos, score){
  const c = document.createElement('canvas'); c.width = 160; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff9a3c'; g.shadowBlur = 14; g.fillStyle = '#ffba60';
  g.fillText('+' + score, 80, 32);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(c), transparent:true, depthWrite:false }));
  sp.scale.set(1.3, 0.52, 1); sp.position.copy(pos);
  scene.add(sp);
  popups.push({ sp, life:0.9, maxLife:0.9 });
}

function startEnemyAttack(e, kind, dur){
  e.attackKind = kind;
  e.lastAttackKind = kind;
  e.lastAttackT = 0.9;
  e.attackT = dur;
  e.attackDur = dur;
  e.attackFlashT = Math.max(e.attackFlashT || 0, dur * 0.45);
}
function enemyAttackProgress(e){
  return e.attackT > 0 && e.attackDur ? clamp(1 - e.attackT / e.attackDur, 0, 1) : 1;
}
function resetEnemyParts(parts){
  for (const part of Object.values(parts)){
    if (!part || !part.userData.basePos) continue;
    part.position.copy(part.userData.basePos);
    part.rotation.copy(part.userData.baseRot);
    part.scale.copy(part.userData.baseScale || new THREE.Vector3(1,1,1));
  }
}
function queueEnemyMelee(e, dirX, dirZ, playerEye){
  if (e.dead || e._attackQueued) return;
  e._attackQueued = true;
  startEnemyAttack(e, 'melee', 0.58);
  SFX.enemyShot();
  const p0 = e.group.position.clone().add(new THREE.Vector3(0, 1.05*e.type.scale, 0));
  spawnSparks(p0, e.type.eye, 5);
  setTimeout(() => {
    e._attackQueued = false;
    if (e.dead || S.paused || S.dead) return;
    const p = e.group.position;
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (d < e.type.range + 0.85){
      damagePlayer(e.type.dmg, p);
      spawnSparks(playerEye.clone().addScaledVector(new THREE.Vector3(dirX,0,dirZ), -0.35), e.type.eye, 12);
      player.shake = Math.min(player.shake + 0.055, 0.18);
    }
  }, 210);
}
function queueBruteSlam(e){
  if (e.dead || e._attackQueued) return;
  e._attackQueued = true;
  startEnemyAttack(e, 'slam', 0.72);
  const base = e.group.position.clone();
  spawnRing(base, 0xff8020);
  playTone(95, 48, 0.28, 0.36, 'sawtooth');
  setTimeout(() => {
    e._attackQueued = false;
    if (e.dead || S.paused || S.dead) return;
    const p = e.group.position;
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    spawnRing(p, 0xff8020);
    spawnSparks(p.clone().add(new THREE.Vector3(0,0.35,0)), 0xff8020, 22);
    playNoise(0.38, 210, 0.55, 0.85);
    if (d < 4.1) damagePlayer(Math.round(30 * (1 - d/5.2) + 10), p);
    player.shake = Math.min(player.shake + clamp(0.18 - d*0.02, 0.06, 0.22), 0.28);
  }, 430);
}
function animateEnemyCinematic(e, t, phase, dist){
  const parts = e.group.userData.parts || {};
  resetEnemyParts(parts);
  const move = e.moveBlend || 0;
  const idle = 1 - move;
  const amp = (t.melee ? 0.86 : 0.60) * move;
  const stride = Math.sin(phase) * amp;
  const stride2 = Math.sin(phase + Math.PI) * amp;
  const footLiftL = Math.max(0, Math.sin(phase)) * 0.12 * move;
  const footLiftR = Math.max(0, Math.sin(phase + Math.PI)) * 0.12 * move;
  const bob = Math.abs(Math.sin(phase)) * 0.072 * move + Math.sin(performance.now()*0.002 + e.animT) * 0.018 * idle;
  const breath = Math.sin(performance.now()*0.003 + e.animT) * 0.025;
  const strafeLean = clamp(e.strafeBlend || 0, -1, 1) * 0.14;
  const hurt = clamp((e.hurtT || 0) / 0.12, 0, 1);
  const spawn = clamp((e.spawnT || 0) / 0.55, 0, 1);
  e.group.scale.setScalar((t.scale || 1) * (1 - spawn*0.18));
  const atk = e.attackT > 0 ? enemyAttackProgress(e) : 1;
  const wind = e.attackT > 0 ? ease01(clamp(atk / 0.45, 0, 1)) : 0;
  const strike = e.attackT > 0 ? ease01(pulse01(atk, 0.62, 0.18)) : 0;
  const recover = e.attackT > 0 ? ease01(clamp((atk - 0.62) / 0.38, 0, 1)) : 0;
  const shoot = e.attackKind === 'shoot' && e.attackT > 0 ? ease01(pulse01(atk, 0.45, 0.28)) : 0;
  const melee = e.attackKind === 'melee' && e.attackT > 0 ? 1 : 0;
  const slam = e.attackKind === 'slam' && e.attackT > 0 ? 1 : 0;
  const execute = e.attackKind === 'execute' && e.attackT > 0 ? ease01(pulse01(atk, 0.48, 0.55)) : 0;

  e.group.rotation.z = -strafeLean * 0.22 + hurt * 0.10 * (Math.sin(phase) > 0 ? 1 : -1) + execute*0.22;

  if (parts.pelvis){ parts.pelvis.position.y += bob*0.45; parts.pelvis.rotation.z += strafeLean*0.30; }
  if (parts.torso){
    parts.torso.position.y += bob + breath - slam*wind*0.22 + slam*strike*0.10;
    parts.torso.rotation.z += strafeLean + hurt*0.18;
    parts.torso.rotation.x += Math.sin(phase*0.5)*0.04*move - hurt*0.22 + slam*wind*0.30 - slam*strike*0.55 - execute*0.62;
  }
  if (parts.shoulder){ parts.shoulder.position.y += bob + breath*.5; parts.shoulder.rotation.z += strafeLean*1.15; parts.shoulder.rotation.x += slam*wind*0.22 - slam*strike*0.35; }
  if (parts.chest){ parts.chest.position.y += bob + breath*.7; parts.chest.scale.x *= 1 + (e.attackFlashT||0)*1.2; }
  if (parts.backGlow){ parts.backGlow.position.y += bob; parts.backGlow.scale.x *= 1 + (e.attackFlashT||0)*0.9; }
  if (parts.head){
    parts.head.position.y += bob*0.42 + breath*.25;
    parts.head.rotation.y += Math.sin(phase*0.42)*0.08*move;
    parts.head.rotation.z += -strafeLean*0.46 + hurt*0.16;
    parts.head.rotation.x += -shoot*0.10 + melee*wind*0.16 + slam*wind*0.12 - execute*0.34;
  }
  if (parts.eye){
    parts.eye.position.y += bob*0.42 + breath*.25;
    parts.eye.scale.x *= 1 + (e.attackFlashT||0)*1.8 + hurt*0.8;
    parts.eye.scale.y *= 1 + (e.attackFlashT||0)*0.8;
    parts.eye.rotation.copy(parts.head ? parts.head.rotation : parts.eye.rotation);
  }

  if (parts.legL){ parts.legL.rotation.x += stride + execute*0.34; parts.legL.rotation.z += Math.sin(phase+0.7)*0.08*move - strafeLean*0.28 - execute*0.16; }
  if (parts.legR){ parts.legR.rotation.x += stride2 + execute*0.18; parts.legR.rotation.z -= Math.sin(phase+0.7)*0.08*move - strafeLean*0.28; }
  if (parts.footL){ parts.footL.position.y += footLiftL; parts.footL.rotation.x += -stride*0.32; parts.footL.rotation.z += strafeLean*0.20; }
  if (parts.footR){ parts.footR.position.y += footLiftR; parts.footR.rotation.x += -stride2*0.32; parts.footR.rotation.z += strafeLean*0.20; }

  // Default tactical pose: arms/gun up and tracking the player.
  if (!t.melee){
    if (parts.armL){ parts.armL.rotation.x += -0.72 - stride*0.12 + shoot*0.18; parts.armL.rotation.y += 0.12; parts.armL.rotation.z += strafeLean*0.35; }
    if (parts.armR){ parts.armR.rotation.x += -0.96 + stride*0.10 + shoot*0.26; parts.armR.rotation.y += -0.10; parts.armR.rotation.z += strafeLean*0.25; }
    if (parts.handL){ parts.handL.position.y += bob*.3; parts.handL.position.z += -0.28; parts.handL.rotation.x += -0.52 + shoot*0.22; }
    if (parts.handR){ parts.handR.position.y += bob*.3; parts.handR.position.z += -0.33 + shoot*0.06; parts.handR.rotation.x += -0.62 + shoot*0.35; }
    for (const k of ['gun','barrel','gunGlow','muzzleOrb']) if (parts[k]){
      parts[k].position.y += bob*.45 + shoot*0.025;
      parts[k].position.z += -shoot*0.09;
      parts[k].rotation.x += -0.06 - shoot*0.22;
      parts[k].rotation.z += strafeLean*0.26;
    }
    if (parts.muzzleOrb) parts.muzzleOrb.scale.setScalar(1 + shoot*1.7);
  } else {
    // Stalker claws: predatory lope + actual slash pose.
    const slashL = melee ? wind*0.85 - strike*1.55 + recover*0.45 : 0;
    const slashR = melee ? wind*0.70 + strike*1.35 - recover*0.35 : 0;
    if (parts.armL){ parts.armL.rotation.x += -0.25 - stride*0.30 - slashL; parts.armL.rotation.z += 0.55 + strafeLean*0.45 + strike*0.70; }
    if (parts.armR){ parts.armR.rotation.x += -0.20 + stride*0.26 - slashR; parts.armR.rotation.z += -0.55 + strafeLean*0.35 - strike*0.70; }
    if (parts.handL){ parts.handL.position.z += -0.12 - strike*0.36; parts.handL.position.y += bob*.3 - strike*0.07; parts.handL.rotation.x += -0.62 - slashL; }
    if (parts.handR){ parts.handR.position.z += -0.12 - strike*0.36; parts.handR.position.y += bob*.3 - strike*0.07; parts.handR.rotation.x += -0.62 - slashR; }
    if (parts.clawL){ parts.clawL.position.z += -0.18 - strike*0.46; parts.clawL.position.y += -strike*0.04; parts.clawL.scale.y *= 1 + strike*1.2; }
    if (parts.clawR){ parts.clawR.position.z += -0.18 - strike*0.46; parts.clawR.position.y += -strike*0.04; parts.clawR.scale.y *= 1 + strike*1.2; }
  }

  if (execute){
    if (parts.armL){ parts.armL.rotation.x += -0.8*execute; parts.armL.rotation.z += 0.8*execute; }
    if (parts.armR){ parts.armR.rotation.x += -0.55*execute; parts.armR.rotation.z += -0.8*execute; }
    if (parts.handL){ parts.handL.position.z += -0.25*execute; parts.handL.position.y += 0.22*execute; }
    if (parts.handR){ parts.handR.position.z += -0.25*execute; parts.handR.position.y += 0.18*execute; }
    if (parts.chest) parts.chest.scale.x *= 1 + execute*0.9;
  }

  // Brute-specific slam windup: huge overhead anticipation, then downstroke.
  if (slam){
    if (parts.armL){ parts.armL.rotation.x += -wind*1.55 + strike*2.15; parts.armL.rotation.z += 0.35; }
    if (parts.armR){ parts.armR.rotation.x += -wind*1.55 + strike*2.15; parts.armR.rotation.z += -0.35; }
    if (parts.handL){ parts.handL.position.y += wind*0.42 - strike*0.30; parts.handL.position.z += wind*0.12 - strike*0.38; }
    if (parts.handR){ parts.handR.position.y += wind*0.42 - strike*0.30; parts.handR.position.z += wind*0.12 - strike*0.38; }
  }

  e.group.position.y = bob * (t.melee ? 1.15 : 0.85) + (slam ? Math.max(0, Math.sin(atk*Math.PI))*0.08 : 0) + spawn*0.18;
}

/* ---- enemy projectiles ---- */
const projectiles = [];
const projGeo = new THREE.SphereGeometry(0.09, 8, 6);
const projGlowTex = flashTex;
function enemyFire(e){
  const t = e.type;
  startEnemyAttack(e, 'shoot', 0.26);
  const origin = new THREE.Vector3();
  if (e.group.userData.gunTip) e.group.userData.gunTip.getWorldPosition(origin);
  else origin.copy(e.group.position).add(new THREE.Vector3(0, 1.7*t.scale, 0));
  const target = new THREE.Vector3(player.pos.x, player.pos.y + EYE - 0.15, player.pos.z);
  const dir = target.sub(origin).normalize();
  const inacc = 0.035;
  dir.x += rand(-inacc, inacc); dir.y += rand(-inacc*0.6, inacc*0.6); dir.z += rand(-inacc, inacc);
  dir.normalize();
  const mat = new THREE.MeshBasicMaterial({ color: t.eye });
  const m = new THREE.Mesh(projGeo, mat);
  if (t.name === 'BRUTE') m.scale.setScalar(2.2);
  m.position.copy(origin);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:projGlowTex, color:t.eye, blending:THREE.AdditiveBlending, depthWrite:false }));
  glow.scale.setScalar(t.name === 'BRUTE' ? 0.9 : 0.45);
  m.add(glow);
  scene.add(m);
  projectiles.push({ mesh:m, vel:dir.multiplyScalar(t.projSpeed), dmg:t.dmg, life:3, color:t.eye });
  spawnSparks(origin, t.eye, 3);       // enemy muzzle flare
  SFX.enemyShot();
}

function updateEnemies(dt, now){
  for (const e of enemies){
    if (e.dead) continue;
    const t = e.type;
    const p = e.group.position;
    e.fireCd -= dt;
    e.meleeCd -= dt;
    e.strafeT -= dt;
    if (e.attackT > 0) e.attackT = Math.max(0, e.attackT - dt);
    if (e.lastAttackT > 0) e.lastAttackT = Math.max(0, e.lastAttackT - dt);
    if (e.attackFlashT > 0) e.attackFlashT = Math.max(0, e.attackFlashT - dt * 5);
    if (e.spawnT > 0) e.spawnT = Math.max(0, e.spawnT - dt);
    if (e.strafeT <= 0){ e.strafeDir *= -1; e.strafeT = rand(1.2, 3); }
    if (e.hurtT > 0){
      e.hurtT -= dt;
      e.group.traverse(o => { if (o.isMesh && o.material.emissive) o.material = o.material; });
    }

    const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
    const dist = Math.hypot(dx, dz);
    const dirX = dx/dist, dirZ = dz/dist;

    // face player
    e.group.rotation.y = Math.atan2(dx, dz) + Math.PI;

    const eyePos = p.clone().add(new THREE.Vector3(0, 1.7*t.scale, 0));
    const playerEye = new THREE.Vector3(player.pos.x, player.pos.y + EYE, player.pos.z);
    const los = dist < 60 ? hasLOS(eyePos, playerEye) : false;

    // close-range cinematic attacks are queued before movement/collision so the windup reads clearly.
    if ((t.name === 'BRUTE' || t.boss) && dist < (t.boss ? 5.6 : 4.2) && e.meleeCd <= 0 && !e._attackQueued){
      e.meleeCd = 2.6;
      queueBruteSlam(e);
    } else if (t.melee && dist < t.range + 0.75 && e.meleeCd <= 0 && !e._attackQueued){
      e.meleeCd = 1.15;
      queueEnemyMelee(e, dirX, dirZ, playerEye);
    }

    if (e.executing){
      e.executeT = Math.max(0, (e.executeT || 0) - dt);
      e.moveBlend = lerp(e.moveBlend || 0, 0, 1 - Math.exp(-12*dt));
      e.animT += dt * 3;
      animateEnemyCinematic(e, t, e.animT, dist);
      e.fireCd = Math.max(e.fireCd, 0.4); e.meleeCd = Math.max(e.meleeCd, 0.4);
    }

    // movement
    let mvx = 0, mvz = 0;
    const desired = t.melee ? 0.5 : (t.name === 'BRUTE' ? 14 : 11);
    if (dist > desired || !los){
      mvx += dirX; mvz += dirZ;
    } else if (dist < desired - 4){
      mvx -= dirX * 0.6; mvz -= dirZ * 0.6;
    }
    if (!t.melee && los && dist < 24){
      // strafe
      mvx += -dirZ * e.strafeDir * 0.7;
      mvz +=  dirX * e.strafeDir * 0.7;
    }
    if (e.executing){ mvx = 0; mvz = 0; }

    /* ---- smarter navigation: sense walls ahead, route around, recover when stuck ---- */
    e.senseT = (e.senseT ?? rand(0, .25)) - dt;
    e.avoidT = Math.max(0, (e.avoidT || 0) - dt);
    const wantsMove = (mvx*mvx + mvz*mvz) > 0.01;
    if (e.senseT <= 0 && wantsMove && !e.executing){
      e.senseT = 0.22;
      // sample the wall straight ahead at chest height; steer around it before getting pinned
      _botRay.set(p.x, Math.min(0.9*t.scale, 1.2), p.z);
      const il = Math.hypot(mvx, mvz) || 1;
      _botDir.set(mvx/il, 0, mvz/il);
      const clear = castWorld(_botRay, _botDir, 2.6);
      if (clear < 2.6) e.avoidT = 0; // force a fresh route pick below
      if (clear < 2.6){
        // fan of candidate escape directions, prefer the one closest to the player with open space
        const baseAng = Math.atan2(dirX, dirZ);
        let bestAng = null, bestScore = -1;
        for (const off of [0.6, -0.6, 1.15, -1.15, 1.75, -1.75, 2.4, -2.4, Math.PI]){
          const a = baseAng + off;
          const cx = Math.sin(a), cz = Math.cos(a);
          _botDir.set(cx, 0, cz);
          const free = castWorld(_botRay, _botDir, 3.4);
          const score = free - Math.abs(off) * 0.5;
          if (score > bestScore){ bestScore = score; bestAng = a; }
          if (free >= 3.4 && Math.abs(off) <= 1.2) break;   // good enough, take it
        }
        if (bestAng !== null){
          e.avoidDirX = Math.sin(bestAng); e.avoidDirZ = Math.cos(bestAng);
          e.avoidT = rand(0.6, 1.05);
          if (!t.melee && (Math.random() < 0.5)) e.strafeDir *= -1;
        }
      }
    }
    if (e.avoidT > 0 && !e.executing){
      // detour override: move along the escape vector instead of beelining into the wall
      mvx = e.avoidDirX || 0; mvz = e.avoidDirZ || 0;
      if (!t.melee){ mvx += -mvz * e.strafeDir * 0.15; mvz += e.avoidDirX * e.strafeDir * 0.15; }
    }
    // separation
    for (const o of enemies){
      if (o === e || o.dead) continue;
      const ox = p.x - o.group.position.x, oz = p.z - o.group.position.z;
      const od = Math.hypot(ox, oz);
      if (od < 1.6 && od > 0.001){ mvx += (ox/od) * 1.2; mvz += (oz/od) * 1.2; }
    }
    const ml = Math.hypot(mvx, mvz);
    const moveIntent = clamp(ml, 0, 1);
    e.moveBlend = lerp(e.moveBlend || 0, moveIntent, 1 - Math.exp(-9*dt));
    e.strafeBlend = lerp(e.strafeBlend || 0, (!t.melee && los && dist < 24 ? e.strafeDir : 0), 1 - Math.exp(-6*dt));
    e.animT += dt * (2.0 + t.speed * 2.25 * e.moveBlend);
    if (ml > 0.01){
      // axis-separated movement: slide along walls instead of wedging into them
      const step = t.speed * dt, nx = (mvx/ml) * step, nz = (mvz/ml) * step;
      const blocked = (x, z) => {
        for (const s of solids){
          if (s.max.y < 0.6 || s.min.y >= 1) continue;
          if (x > s.min.x - e.radius && x < s.max.x + e.radius && z > s.min.z - e.radius && z < s.max.z + e.radius) return true;
        }
        return false;
      };
      if (!blocked(p.x + nx, p.z + nz)){ p.x += nx; p.z += nz; }
      else if (!blocked(p.x + nx, p.z)){ p.x += nx; }                    // slide along z-face
      else if (!blocked(p.x, p.z + nz)){ p.z += nz; }                    // slide along x-face
      // fully boxed in: the stuck watchdog below will detour / shove out
    }
    p.x = clamp(p.x, -ARENA+1, ARENA-1);
    p.z = clamp(p.z, -ARENA+1, ARENA-1);

    // stuck watchdog: if the bot wanted to move but barely progressed, force a new detour
    e.progT = (e.progT || 0) + dt;
    if (e.progT >= 0.4){
      const moved = Math.hypot(p.x - (e._px ?? p.x), p.z - (e._pz ?? p.z));
      const expected = (t.melee ? 0.5 : 0.35);
      const intended = (mvx*mvx + mvz*mvz) > 0.01;
      if (intended && moved < expected && e.spawnT <= 0){
        e.stuckT = (e.stuckT || 0) + 0.4;
        if (e.stuckT >= 0.4){
          e.stuckT = 0;
          e.avoidT = 0;                                        // force re-pick of the escape route
          e.senseT = 0;
          e.strafeDir *= -1;
          resolvePenetration(p, e.radius);                     // shove out if wedged inside a solid
          if (Math.random() < 0.35){                           // hard nudge out of corners after repeated attempts
            e.avoidDirX = rand(-1, 1); e.avoidDirZ = rand(-1, 1);
            const al = Math.hypot(e.avoidDirX, e.avoidDirZ) || 1;
            e.avoidDirX /= al; e.avoidDirZ /= al;
            e.avoidT = rand(0.7, 1.1);
          }
        }
      } else if (moved >= expected) e.stuckT = 0;
      e._px = p.x; e._pz = p.z; e.progT = 0;
    }

    // cinematic full-body animation: locomotion, idle breathing, hurt reaction, weapon recoil, melee/slam windups
    animateEnemyCinematic(e, t, e.animT, dist);

    // attacks now have visible anticipation + a real hit frame
    if (t.name === 'BRUTE' && dist < 3.7 && e.meleeCd <= 0 && !e._attackQueued){
      e.meleeCd = 2.6;
      queueBruteSlam(e);
    }

    if (t.melee){
      if (dist < t.range && e.meleeCd <= 0 && !e._attackQueued){
        e.meleeCd = 1.15;
        queueEnemyMelee(e, dirX, dirZ, playerEye);
      }
    } else if (los && dist < t.range && e.fireCd <= 0 && !e._attackQueued){
      e.fireCd = rand(t.fireCd[0], t.fireCd[1]);
      if (t.burst){
        for (let b=0;b<t.burst;b++) setTimeout(() => { if (!e.dead && !S.paused && !S.dead) enemyFire(e); }, b*130);
      } else enemyFire(e);
    }

    // health bar
    const frac = e.hp / e.maxHp;
    if (frac < 1){
      e.barBg.visible = e.barFg.visible = true;
      e.barFg.scale.x = 0.86 * frac;
      e.barFg.position.x = -(0.86 * (1-frac)) / 2;
    }
  }
  // purge dead
  for (let i = enemies.length-1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i,1);
}

function updateProjectiles(dt){
  for (let i = projectiles.length-1; i >= 0; i--){
    const pr = projectiles[i];
    pr.life -= dt;
    const step = pr.vel.length() * dt;
    const dir = pr.vel.clone().normalize();
    const wd = castWorld(pr.mesh.position, dir, step);
    // player hit
    const px = pr.mesh.position.x - player.pos.x, pz = pr.mesh.position.z - player.pos.z;
    const py = pr.mesh.position.y - (player.pos.y + 0.9);
    const hitPlayer = (px*px + pz*pz) < 0.45 && Math.abs(py) < 1.1;
    if (hitPlayer){
      damagePlayer(pr.dmg, pr.mesh.position);
      spawnSparks(pr.mesh.position, 0xff5050, 6);
      scene.remove(pr.mesh); projectiles.splice(i,1); continue;
    }
    if (wd < step){
      pr.mesh.position.addScaledVector(dir, wd);
      spawnSparks(pr.mesh.position, 0xff7050, 4);
      scene.remove(pr.mesh); projectiles.splice(i,1); continue;
    }
    pr.mesh.position.addScaledVector(dir, step);
    // glowing trail
    if (Math.random() < dt * 22){
      const mat = new THREE.MeshBasicMaterial({ color:pr.color || 0xff5050, transparent:true, opacity:0.8, blending:THREE.AdditiveBlending, depthWrite:false });
      const tm = new THREE.Mesh(sparkGeo, mat);
      tm.position.copy(pr.mesh.position);
      scene.add(tm);
      particles.push({ mesh:tm, vel:new THREE.Vector3(), life:0.22, maxLife:0.22, grav:0, type:'spark' });
    }
    if (pr.life <= 0){ scene.remove(pr.mesh); projectiles.splice(i,1); }
  }
}

/* ================= PICKUPS ================= */
const pickups = [];
function buildPickup(kind){
  const g = new THREE.Group();
  if (kind === 'health'){
    const mat = new THREE.MeshStandardMaterial({ color:0x18e07a, roughness:.3, metalness:.5, emissive:0x0a7a3a, emissiveIntensity:.8 });
    box(0.5,0.16,0.16, mat, 0,0,0, g);
    box(0.16,0.5,0.16, mat, 0,0,0, g);
  } else {
    const mat = new THREE.MeshStandardMaterial({ color:0xffc040, roughness:.35, metalness:.7, emissive:0x8a5a10, emissiveIntensity:.7 });
    box(0.44,0.3,0.3, mat, 0,0,0, g);
    box(0.5,0.08,0.34, gunMats.grip, 0,0.14,0, g);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 8, 24),
    new THREE.MeshBasicMaterial({ color: kind === 'health' ? 0x18e07a : 0xffc040 }));
  ring.rotation.x = Math.PI/2; ring.position.y = -0.5;
  g.add(ring);
  return g;
}
function clearPickups(){
  while (pickups.length){
    const pk = pickups.pop();
    scene.remove(pk.mesh);
  }
}
function spawnPickupAt(x, z, kind){
  const mesh = buildPickup(kind);
  const gy = groundHeight({x, z}, 10);
  mesh.position.set(x, gy + 0.75, z);
  scene.add(mesh);
  pickups.push({ kind, mesh, active:true, respawn:0, baseY: gy + 0.75 });
}
function rebuildPickups(){
  clearPickups();
  for (const [x,z,kind] of activePickupLayout) spawnPickupAt(x,z,kind);
}
rebuildPickups();
function updatePickups(dt, now){
  for (const pk of pickups){
    if (!pk.active){
      pk.respawn -= dt;
      if (pk.respawn <= 0){ pk.active = true; pk.mesh.visible = true; spawnSparks(pk.mesh.position, 0x2cf2ff, 8); }
      continue;
    }
    pk.mesh.rotation.y += dt * 1.6;
    pk.mesh.position.y = pk.baseY + Math.sin(now*0.002 + pk.baseY) * 0.12;
    const d = Math.hypot(pk.mesh.position.x - player.pos.x, pk.mesh.position.z - player.pos.z);
    if (d < 1.2 && Math.abs(pk.mesh.position.y - (player.pos.y + 0.9)) < 1.6){
      if (pk.kind === 'health'){
        if (player.hp >= player.maxHp) continue;
        player.hp = Math.min(player.maxHp, player.hp + 40);
        addKillFeed(null, '+40 INTEGRITY RESTORED');
      } else {
        for (const w of WEAPONS) w.res = Math.min(w.reserve, w.res + w.mag * 2);
        player.grenades = Math.min(4, player.grenades + 1);
        addKillFeed(null, 'MUNITIONS RESUPPLIED');
        updateAmmoHUD();
      }
      SFX.pickup();
      pk.active = false; pk.mesh.visible = false; pk.respawn = 22;
      updateHealthHUD();
    }
  }
}

/* ================= LAN MULTIPLAYER ================= */
const net = { on:false, ws:null, id:0, players:new Map(), sendT:0, lastHitBy:0,
  scores:[], limit:30, round:1, currentMap:'FORGE', voteChoices:[], voteCounts:{}, voteEndsAt:0, voteEndsLocal:0, votePhase:'map', voteActive:false, roundOver:false, pendingMap:'',
  spectateId:0, spectateT:0, myScore:-1,
  dmMode:'ffa', myTeam:0, teamTotals:{ red:0, blue:0 }, __voteSecs:-1 };
const TEAM_COLORS = ['', '#ff5040', '#4aa0ff'];
const TEAM_NAMES = ['', 'RED TEAM', 'BLUE TEAM'];
function otherTeam(t){ return t === 1 ? 2 : 1; }
function isTeammate(rp){ return net.dmMode === 'team' && net.myTeam && rp.team === net.myTeam; }
function fmtTeamTag(t){ return t ? `<span style="color:${TEAM_COLORS[t]}">${TEAM_NAMES[t]}</span>` : ''; }
function fmtColoredName(name, t){ return net.dmMode === 'team' && t ? `<span style="color:${TEAM_COLORS[t]}">${name}</span>` : name; }

function cleanPlayerName(v){ return String(v || 'RIFT-OPS').toUpperCase().replace(/[<>]/g,'').slice(0,14); }
function savePlayerName(){
  const el = $('callsign');
  if (!el) return cleanPlayerName(PROGRESS.name);
  const typed = el.value.trim();
  PROGRESS.name = cleanPlayerName(typed || PROGRESS.name || 'RIFT-OPS');
  if (typed) el.value = PROGRESS.name;   // solo may ghost a name behind the scenes, but never writes one into the box for the player
  saveProgress();
  return PROGRESS.name;
}
function netName(){ return savePlayerName(); }
const nameInput = $('callsign');
if (nameInput){
  // restore a saved custom callsign, but never ghost-fill the default — LAN requires typing one
  nameInput.value = (PROGRESS.name && PROGRESS.name !== 'RIFT-OPS') ? cleanPlayerName(PROGRESS.name) : '';
  nameInput.addEventListener('input', () => {
    nameInput.classList.remove('needName');
    if (nameInput.value.trim()){ PROGRESS.name = cleanPlayerName(nameInput.value); saveProgress(); }
  });
  nameInput.addEventListener('blur', savePlayerName);
}
function makeNameSprite(text, color='#2cf2ff'){
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 10; g.fillStyle = '#eafcff';
  g.fillText(text, 128, 32);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(c), transparent:true, depthWrite:false }));
  sp.scale.set(2.2, 0.55, 1);
  sp.raycast = () => {};
  return sp;
}
function buildThirdPersonWeaponModel(w){
  const g = new THREE.Group();
  const accent = new THREE.MeshBasicMaterial({ color:w.accent || 0x2cf2ff });
  const body = new THREE.MeshStandardMaterial({ color:0x313a4a, roughness:.5, metalness:.55 });
  const dark = new THREE.MeshStandardMaterial({ color:0x111822, roughness:.75, metalness:.35 });
  const shotgun = w.slot === 'SHOTGUN', pistol = w.slot === 'PISTOL', scoped = w.scoped;
  const len = pistol ? .34 : shotgun ? .72 : scoped ? .9 : .66;
  const rec = new THREE.Mesh(new THREE.BoxGeometry(pistol?.09:.12, pistol?.09:.12, len*.62), body);
  rec.position.set(0,0,0); g.add(rec);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(shotgun?.035:.018, shotgun?.035:.018, len*.56, 10), body);
  barrel.rotation.x = Math.PI/2; barrel.position.set(0,.032,-len*.52); g.add(barrel);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0,.032,-len*.84); g.add(muzzle); g.userData.muzzle = muzzle;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(.075,.19,.085), dark); grip.position.set(0,-.13,len*.08); grip.rotation.x=.24; g.add(grip);
  if (!pistol){ const stock = new THREE.Mesh(new THREE.BoxGeometry(.11,.10,.28), dark); stock.position.set(0,-.02,len*.38); stock.rotation.x=-.08; g.add(stock); }
  const mag = new THREE.Mesh(new THREE.BoxGeometry(.075, pistol?.13:.20, shotgun?.08:.095), dark); mag.position.set(0,-.15,pistol?.10:-len*.05); mag.rotation.x=pistol?.18:-.08; g.add(mag);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(.13,.014,len*.48), accent); rail.position.set(0,.092,-len*.12); g.add(rail);
  if (scoped){ const scope = new THREE.Mesh(new THREE.CylinderGeometry(.042,.042,.32,12), dark); scope.rotation.x=Math.PI/2; scope.position.set(0,.15,-len*.13); g.add(scope); }
  else if (!pistol){ const sight = new THREE.Mesh(new THREE.BoxGeometry(.07,.04,.08), dark); sight.position.set(0,.13,-len*.20); g.add(sight); }
  const brake = new THREE.Mesh(new THREE.BoxGeometry(shotgun?.075:.055, shotgun?.055:.042, .07), dark); brake.position.set(0,.032,-len*.78); g.add(brake);
  g.traverse(o => { if (o.isMesh){ o.castShadow = true; o.userData.netGun = true; } });
  g.scale.setScalar(pistol ? .9 : .78);
  return g;
}
function buildThirdPersonKnife(golden){
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: golden ? 0xd8b13c : 0xb8c4d4, roughness:.28, metalness:.9 });
  const dark = new THREE.MeshStandardMaterial({ color: golden ? 0x4a3512 : 0x1c222c, roughness:.7, metalness:.4 });
  const glow = new THREE.MeshBasicMaterial({ color: golden ? 0xffe680 : 0x2cf2ff });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(.035,.36,.05), steel); blade.rotation.x = 1.35; blade.position.set(0,.04,-.15); g.add(blade);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(.012,.34,.014), glow); edge.rotation.x = 1.35; edge.position.set(.02,.042,-.155); g.add(edge);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(.05,.16,.07), dark); grip.rotation.x = 1.35; grip.position.set(0,-.02,.05); g.add(grip);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0,.09,-.32); g.add(muzzle); g.userData.muzzle = muzzle;
  g.traverse(o => { if (o.isMesh){ o.castShadow = true; o.userData.netGun = true; } });
  return g;
}
function setRemoteWeapon(rp, idx){
  idx = clamp(idx|0, 0, 101);
  if (rp.weaponIndex === idx && rp.weaponModel) return;
  if (rp.weaponModel) rp.weaponRoot.remove(rp.weaponModel);
  rp.weaponIndex = idx;
  rp.weaponModel = idx >= 100 ? buildThirdPersonKnife(idx === 101) : buildThirdPersonWeaponModel(WEAPONS[idx]);
  rp.weaponRoot.add(rp.weaponModel);
  rp.muzzle = rp.weaponModel.userData.muzzle;
  rp.weaponRoot.traverse(o => { if (o.isMesh){ o.userData.netId = rp.id; } });
}
function avatarTypeForSkin(skinId){ const sk = skinDef(skinId); return { color:sk.color, eye:sk.eye, scale:1, name:'PLAYER' }; }
function applyAvatarSkin(group, skinId){
  const sk = skinDef(skinId), parts = group.userData.parts || {};
  const bodyMat = getEnemyMat(sk.color), eyeMat = getEyeMat(sk.eye);
  for (const key of ['torso','head','armL','armR']) if (parts[key]) parts[key].material = bodyMat;
  for (const key of ['eye','chest','backGlow','clawL','clawR','gunGlow','muzzleOrb']) if (parts[key]) parts[key].material = eyeMat;
}

function cleanupPlayerAvatar(group){
  const parts = group.userData.parts || {};
  // buildEnemyMesh is reused for players, but enemy claws and the baked-in enemy rifle should not remain on player avatars.
  for (const key of ['clawL','clawR','gun','barrel','gunGlow','muzzleOrb']){
    const obj = parts[key];
    if (obj && obj.parent) obj.parent.remove(obj);
    delete parts[key];
  }
  // Bring detached hand meshes up to the weapon grip instead of leaving them hanging near the hips.
  if (parts.handL){ parts.handL.position.set(-0.22, 1.20, -0.43); parts.handL.userData.basePos = parts.handL.position.clone(); }
  if (parts.handR){ parts.handR.position.set( 0.24, 1.18, -0.46); parts.handR.userData.basePos = parts.handR.position.clone(); }
  if (parts.armL){ parts.armL.position.set(-0.43, 1.50, -0.02); parts.armL.userData.basePos = parts.armL.position.clone(); }
  if (parts.armR){ parts.armR.position.set( 0.43, 1.50, -0.02); parts.armR.userData.basePos = parts.armR.position.clone(); }
}

function setRemoteSkin(rp, skinId){
  rp.skin = skinId || 'rift';
  rp.skinDef = skinDef(rp.skin);
  applyAvatarSkin(rp.group, rp.skin);
}
function addRemotePlayer(id, name, skinId='rift', team=0){
  if (net.players.has(id)){ const rp0 = net.players.get(id); setRemoteSkin(rp0, skinId || rp0.skin || 'rift'); setRemoteTeam(rp0, team || rp0.team || 0); return rp0; }
  const group = buildEnemyMesh(avatarTypeForSkin(skinId));
  cleanupPlayerAvatar(group);
  group.traverse(o => { o.userData.netId = id; });
  const tag = makeNameSprite(name || 'PLAYER');
  tag.position.y = 2.45; group.add(tag);
  const weaponRoot = new THREE.Group();
  weaponRoot.position.set(0.08, 1.24, -0.54);
  weaponRoot.rotation.set(-0.12, 0.02, -0.02);
  group.add(weaponRoot);
  // team shoulder light — the floating partner-look without re-skinning anyone
  const teamPad = new THREE.Mesh(new THREE.BoxGeometry(.62,.05,.14), new THREE.MeshBasicMaterial({ color:0x000000 }));
  teamPad.position.set(0, 1.52, .16);
  teamPad.visible = false;
  group.add(teamPad);
  group.position.set(0, -80, 0);   // hidden until first state arrives
  scene.add(group);
  const rp = { id, name:name || 'PLAYER', skin:skinId || 'rift', skinDef:skinDef(skinId || 'rift'), group, tag, weaponRoot, teamPad, team:0, weaponModel:null, weaponIndex:-1, muzzle:null,
    target:new THREE.Vector3(0,-80,0), yaw:0, yawT:0, lastPos:new THREE.Vector3(), speed:0, animT:0, fireT:0, deadT:0 };
  setRemoteSkin(rp, skinId || 'rift');
  setRemoteWeapon(rp, 0);
  setRemoteTeam(rp, team);
  group.traverse(o => { if (o.isMesh) o.userData.netId = id; });
  net.players.set(id, rp);
  return rp;
}
function setRemoteTeam(rp, team){
  const prev = rp.team || 0;
  rp.team = team || 0;
  if (rp.teamPad){
    rp.teamPad.visible = !!rp.team && net.dmMode === 'team';
    if (rp.team) rp.teamPad.material.color.set(TEAM_COLORS[rp.team]);
  }
  // redraw the nametag tinted by team (or back to cyan when squads dissolve)
  if ((rp.team && net.dmMode === 'team' && rp.team !== prev) || (!rp.team && prev)){
    rp.group.remove(rp.tag);
    rp.tag = makeNameSprite(rp.name, rp.team ? TEAM_COLORS[rp.team] : '#2cf2ff');
    rp.tag.position.y = 2.45; rp.group.add(rp.tag);
  }
}
function updateTeamHUD(){
  const chip = $('teamChip');
  if (!chip) return;
  // squads never race to a collective score — the chip only reminds you WHICH side can't hurt you
  if (mode !== 'dm' || net.dmMode !== 'team'){ chip.classList.add('hidden'); return; }
  chip.classList.remove('hidden');
  chip.innerHTML = `<b class="${net.myTeam===1?'you-red':'you-blue'}">YOU ARE ${TEAM_NAMES[net.myTeam] || 'ON A TEAM'}</b>`;
}
function removeRemotePlayer(id){
  const rp = net.players.get(id);
  if (rp){ scene.remove(rp.group); net.players.delete(id); }
}
function netSend(o){ if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(o)); }

function connectNet(){
  if (net.on || (net.ws && net.ws.readyState === 0)) return;
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  let ws;
  try { ws = new WebSocket(proto + location.host); } catch (e){ addKillFeed(null, 'MULTIPLAYER UNAVAILABLE'); return; }
  net.ws = ws;
  ws.onopen = () => { net.on = true; net.dmMode = 'ffa'; net.myTeam = 0; net.teamTotals = { red:0, blue:0 }; netSend({ t:'hello', name:netName(), skin:PROGRESS.skin }); addKillFeed(null, 'CONNECTED — VOTE MAP & MODE'); };
  ws.onerror = () => addKillFeed(null, 'LAN CONNECTION FAILED');
  ws.onclose = () => {
    if (net.on) addKillFeed(null, 'DISCONNECTED FROM SERVER');
    net.on = false;
    net.dmMode = 'ffa'; net.myTeam = 0; net.teamTotals = { red:0, blue:0 };
    updateTeamHUD();
    for (const id of [...net.players.keys()]) removeRemotePlayer(id);
  };
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch (e){ return; }
    switch (m.t){
      case 'welcome':
        net.id = m.id;
        net.limit = m.limit || 30; net.round = m.round || 1; net.scores = m.scores || []; net.currentMap = m.map || 'FORGE';
        net.dmMode = m.mode || 'ffa'; net.teamTotals = m.totals || net.teamTotals;
        net.myScore = -1;
        if (currentMapName !== net.currentMap) setMap(net.currentMap);
        for (const p of m.players){ const rp = addRemotePlayer(p.id, p.name, p.skin || 'rift', p.team || 0); if (p.state) applyNetState(rp, p.state); }
        syncLadderWeapon();
        respawnDMPlayer(true);
        updateScoreboardHUD();
        updateTeamHUD();
        if (!m.active){
          if (m.phase === 'mode') showModeVote(m.pendingMap || m.map || 'MAP', m.voteCounts || {}, voteLocalEnd(m.voteEndsAt || 0, m.now || 0));
          else if (m.voteChoices && m.voteChoices.length) showMapVote(m.winnersName || m.winnerName || 'STARTING MAP', m.voteChoices, m.voteCounts || {}, voteLocalEnd(m.voteEndsAt || 0, m.now || 0));
        }
        updateTopHUD();
        break;
      case 'mode':
        net.dmMode = m.mode || 'ffa'; net.myTeam = m.team || 0;
        if (net.dmMode === 'team'){ showBanner(`ASSIGNED — ${TEAM_NAMES[net.myTeam]}`); addKillFeed(null, `YOU PLAY FOR <span style="color:${TEAM_COLORS[net.myTeam]}">${TEAM_NAMES[net.myTeam]}</span>`); }
        updateTeamHUD();
        break;
      case 'team': { const rp = net.players.get(m.id); if (rp) setRemoteTeam(rp, m.team || 0); break; }
      case 'join': addRemotePlayer(m.id, m.name, m.skin || 'rift', m.team || 0); addKillFeed(null, `<b>${m.name}</b> JOINED THE MATCH${fmtTeamTag(m.team) ? ' — ' + fmtTeamTag(m.team) : ''}`); updateTopHUD(); break;
      case 'name': { const rp = net.players.get(m.id); if (rp){ rp.name = m.name; rp.group.remove(rp.tag); rp.tag = makeNameSprite(m.name, net.dmMode === 'team' && rp.team ? TEAM_COLORS[rp.team] : '#2cf2ff'); rp.tag.position.y = 2.45; rp.group.add(rp.tag); } break; }
      case 'skin': { const rp = net.players.get(m.id); if (rp) setRemoteSkin(rp, m.skin || 'rift'); break; }
      case 'leave': { const rp = net.players.get(m.id); if (rp) addKillFeed(null, `<b>${rp.name}</b> LEFT`); removeRemotePlayer(m.id); updateTopHUD(); break; }
      case 'state': { const rp = net.players.get(m.id) || addRemotePlayer(m.id, 'PLAYER'); applyNetState(rp, m.s); break; }
      case 'shoot': {
        const rp = net.players.get(m.id);
        const isKnifeShot = (m.w || 0) >= 100;
        if (rp){ setRemoteWeapon(rp, m.w || rp.weaponIndex || 0); rp.fireT = 0.12; }
        const o = new THREE.Vector3(m.o[0], m.o[1], m.o[2]);
        const p = new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
        if (isKnifeShot){ playNoise(0.06, 2600, 0.3, 0.18); }
        else {
          spawnTracer(o, p);
          spawnSparks(p, 0x9ab0cc, 3);
          playNoise(0.1, 1100, 0.8, 0.2);
        }
        break; }
      case 'hit': {
        net.lastHitBy = m.from;
        const atk = net.players.get(m.from);
        damagePlayer(m.dmg, atk ? atk.group.position : null);
        break; }
      case 'kill':
        if (m.victim !== net.id){
          const victim = net.players.get(m.victim);
          if (victim) remotePlayerKilled(victim, m.by);
        }
        if (m.by === net.id){ S.kills++; S.score += 150; PROGRESS.totalKills = (PROGRESS.totalKills || 0) + 1; trackChallenge('kill', 1); grantProgress(m.knife ? (m.bs ? 130 : 95) : 65, m.knife ? (m.bs ? 75 : 55) : 35, m.bs ? 'BACKSTAB EXECUTION' : m.knife ? 'SHANKED A RIVAL' : 'PLAYER ELIMINATED'); SFX.kill(); showHitmarker(true); registerKill(); }
        net.scores = m.scores || net.scores;
        if (m.mode) net.dmMode = m.mode;
        if (m.totals){ net.teamTotals = m.totals; updateTeamHUD(); }
        if (m.knife) addKillFeed(null, `<b>${fmtColoredName(m.names.k, m.kteam)}</b> <span style="color:#ffd040">⚔ ${m.bs ? 'BACKSTABBED' : 'SHANKED'}</span> ${fmtColoredName(m.names.v, m.vteam)}${m.demoted ? ' — DEMOTED ONE TIER' : ''}`);
        else addKillFeed(null, `<b>${fmtColoredName(m.names.k, m.kteam)}</b> ⟶ ${fmtColoredName(m.names.v, m.vteam)}`);
        updateScoreboardHUD();
        updateTopHUD();
        syncLadderWeapon();   // shared ladder: promotion on your kill, demotion if you were shanked
        break;
      case 'score':
        net.scores = m.scores || [];
        net.limit = m.limit || net.limit;
        net.round = m.round || net.round;
        net.currentMap = m.map || net.currentMap;
        if (m.mode) net.dmMode = m.mode;
        if (m.totals) net.teamTotals = m.totals;
        updateScoreboardHUD(); updateTopHUD(); updateTeamHUD();
        syncLadderWeapon();
        break;
      case 'roundOver':
        net.roundOver = true; net.voteActive = true; net.scores = m.scores || net.scores;
        if (m.mode) net.dmMode = m.mode;
        if (m.totals){ net.teamTotals = m.totals; updateTeamHUD(); }
        if (m.winnerId === net.id){ PROGRESS.dmWins = (PROGRESS.dmWins || 0) + 1; trackChallenge('dmWin', 1); grantProgress(500, 300, 'LAN MATCH WON'); }
        SFX.roundWin();
        showBanner((m.winnerName || 'PLAYER') + ' WINS');
        showMapVote(m.winnerName || 'ROUND COMPLETE', m.choices || [], m.counts || {}, voteLocalEnd(m.voteEndsAt || 0, m.now || 0));
        updateScoreboardHUD(); updateTopHUD();
        break;
      case 'modeVote':   // map settled — the second ballot picks the rules
        net.pendingMap = m.map || net.pendingMap;
        showModeVote(m.map || 'MAP', m.counts || {}, voteLocalEnd(m.voteEndsAt || 0, m.now || 0));
        addKillFeed(null, `<b>${m.map || 'MAP'}</b> TAKES THE MAP VOTE — NOW VOTE THE MODE`);
        break;
      case 'modeDecided':
        net.dmMode = m.mode || 'ffa';
        showBanner(m.modeName || 'FREE FOR ALL');
        addKillFeed(null, `<b>${m.map || net.pendingMap}</b> // <b>${m.modeName}</b> — ROUND INCOMING`);
        if (net.dmMode !== 'team'){ net.myTeam = 0; updateTeamHUD(); }
        $('voteTimer').textContent = `LOCKED IN — ${m.map || net.pendingMap} // ${m.modeName || ''}`;
        break;
      case 'voteUpdate': {
        if (m.voteEndsAt && m.now) net.voteEndsLocal = voteLocalEnd(m.voteEndsAt, m.now);
        if (m.phase === net.votePhase) net.voteCounts = m.counts || net.voteCounts;
        updateVoteCounts();
        break; }
      case 'roundStart':
        net.roundOver = false; net.voteActive = false; net.round = m.round || (net.round+1); net.limit = m.limit || net.limit;
        net.scores = m.scores || []; net.currentMap = m.map || 'FORGE';
        if (m.mode) net.dmMode = m.mode;
        if (m.totals) net.teamTotals = m.totals;
        updateTeamHUD();
        net.myScore = -1; knifeMode = 0;
        hideMapVote(); setMap(net.currentMap); resetMatchStats(); syncLadderWeapon(); respawnDMPlayer(true);
        SFX.roundStart(); showBanner('ROUND ' + net.round);
        updateScoreboardHUD(); updateTopHUD();
        break;
    }
  };
}
function applyNetState(rp, s){
  const firstContact = rp.group.position.y < -20;
  rp.target.set(s[0], s[1], s[2]);
  rp.yawT = s[3] || 0;
  if (s.length > 4) setRemoteWeapon(rp, s[4]);
  rp.slide = !!s[5];
  rp.crouching = !!s[6];
  rp.group.visible = true;
  if (firstContact){ rp.group.position.copy(rp.target); rp.lastPos.copy(rp.target); }
}
function updateNet(dt){
  if (!net.on) return;
  net.sendT -= dt;
  if (net.sendT <= 0 && S.started && !S.dead){
    net.sendT = 0.05;
    const slotCode = knifeMode ? (knifeGolden() ? 101 : 100) : weaponIndex;
    netSend({ t:'state', s:[+player.pos.x.toFixed(2), +player.pos.y.toFixed(2), +player.pos.z.toFixed(2), +player.yaw.toFixed(3), slotCode, player.slideT > 0 ? 1 : 0, player.crouched ? 1 : 0] });
  }
  const k = 1 - Math.exp(-12 * dt);
  for (const rp of net.players.values()){
    const g = rp.group;
    g.position.lerp(rp.target, k);
    let d = rp.yawT - rp.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    rp.yaw += d * k;
    g.rotation.y = rp.yaw;
    // walk animation from actual velocity
    const sp = g.position.distanceTo(rp.lastPos) / Math.max(dt, 1e-4);
    rp.lastPos.copy(g.position);
    rp.speed = lerp(rp.speed, sp, 0.25);
    rp.animT += dt * clamp(rp.speed, 0, 9);
    const blend = clamp(rp.speed / 6, 0, 1);
    rp.fireT = Math.max(0, rp.fireT - dt);
    const phase = rp.animT * 2.2;
    const swing = Math.sin(phase) * 0.55 * blend;
    const parts = g.userData.parts || {};
    const bob = Math.abs(Math.sin(phase)) * 0.055 * blend;
    const recoil = rp.fireT > 0 ? rp.fireT / 0.12 : 0;
    if (parts.legL) parts.legL.rotation.x = parts.legL.userData.baseRot.x + swing;
    if (parts.legR) parts.legR.rotation.x = parts.legR.userData.baseRot.x - swing;
    // Player avatars use a clean two-hand weapon pose, not the old enemy side-claw / baked-gun rig.
    if (parts.armL){ parts.armL.rotation.x = -1.28 - swing*0.10; parts.armL.rotation.y = -0.28; parts.armL.rotation.z = parts.armL.userData.baseRot.z + 0.38; }
    if (parts.armR){ parts.armR.rotation.x = -1.34 + swing*0.08 - recoil*0.28; parts.armR.rotation.y = 0.22; parts.armR.rotation.z = parts.armR.userData.baseRot.z - 0.32; }
    if (parts.handL){ parts.handL.position.set(-0.22, 1.20 + bob*.32, -0.48); parts.handL.rotation.x = -1.05; parts.handL.rotation.z = 0.20; }
    if (parts.handR){ parts.handR.position.set( 0.24, 1.18 + bob*.32, -0.47 - recoil*0.03); parts.handR.rotation.x = -1.10 - recoil*0.20; parts.handR.rotation.z = -0.18; }
    if (parts.torso){ parts.torso.position.y = parts.torso.userData.basePos.y + bob; parts.torso.rotation.z = Math.sin(phase*.5)*0.035*blend; }
    if (parts.head){ parts.head.position.y = parts.head.userData.basePos.y + bob*0.45; parts.head.rotation.z = -parts.torso?.rotation.z*0.45 || 0; }
    if (rp.weaponRoot){
      rp.weaponRoot.position.set(0.08, 1.24 + bob*0.35 - (rp.slideBlend||0)*0.30 - (rp.crouchBlend||0)*0.18, -0.54 + recoil*0.06 - (rp.slideBlend||0)*0.10);
      rp.weaponRoot.rotation.set(-0.15 - recoil*0.22 + Math.sin(phase)*0.018*blend - (rp.slideBlend||0)*0.35, 0.02, -0.03 + Math.sin(phase*.7)*0.025*blend);
    }
    // networked slide: squash + forward lean so everyone sees the slide, not just extra speed
    rp.slideBlend = lerp(rp.slideBlend || 0, rp.slide ? 1 : 0, 1 - Math.exp(-14*dt));
    rp.crouchBlend = lerp(rp.crouchBlend || 0, (rp.crouching && !rp.slide) ? 1 : 0, 1 - Math.exp(-10*dt));
    const sb = rp.slideBlend, cb = rp.crouchBlend;
    g.scale.set(1 + sb*0.16 + cb*0.05, 1 - sb*0.38 - cb*0.26, 1 + sb*0.16 + cb*0.05);   // slides squash long, crouches shorten
    g.rotation.x = sb * 0.22;
  }
}
function remotePlayerKilled(rp, killerId){
  if (!rp || !rp.group.visible) return;
  spawnPlayerPieces(rp.group.position.clone(), (rp.skinDef || skinDef(rp.skin)).color);
  rp.group.visible = false;
  rp.deadT = 2.6;
  setTimeout(() => { if (rp.group) rp.group.visible = true; }, 2600);
}
function respawnDMPlayer(silent=false){
  const sp = activeSpawnPoints[(Math.random() * activeSpawnPoints.length) | 0];
  player.pos.set(sp[0] * 0.8 + rand(-2, 2), 0, sp[1] * 0.8 + rand(-2, 2));
  player.vel.set(0, 0, 0);
  player.hp = player.maxHp;
  player.invuln = 1.5;
  netSend({ t:'spawn' });
  S.dead = false;
  if (mode === 'dm' && !net.voteActive){ S.paused = false; fallbackMode = true; locked = true; canvas.style.cursor = 'none'; }
  net.spectateId = 0; net.spectateT = 0;
  $('spectate').classList.remove('show');
  const rw = CW();                                   // redeploy locked & loaded — respawn always tops off your gun
  rw.reloading = 0; rw.ammo = rw.mag; rw.cool = 0;
  updateAmmoHUD();
  updateHealthHUD();
  if (!silent){ SFX.respawn(); showBanner('REDEPLOYED'); }
}
function dmDeath(){
  if (S.dead) return;
  S.dead = true; S.deaths++; mouseL = mouseR = false;
  const deathPos = player.pos.clone(); net.deathPos = deathPos.clone();
  net.spectateId = net.lastHitBy || 0; net.spectateT = 2.55;
  netSend({ t:'kill', by:net.lastHitBy });
  showBanner('ELIMINATED');
  const killer = net.players.get(net.spectateId);
  const s = $('spectate');
  s.innerHTML = killer ? `SPECTATING <b>${killer.name}</b>` : 'RESPAWNING';
  s.classList.add('show');
  spawnPlayerPieces(new THREE.Vector3(deathPos.x, deathPos.y, deathPos.z), skinDef(PROGRESS.skin).color);
  setTimeout(() => { if (mode === 'dm' && S.dead) respawnDMPlayer(false); }, 2700);
}
function updateSpectate(dt){
  if (mode !== 'dm' || !S.dead) return;
  net.spectateT = Math.max(0, net.spectateT - dt);
  const rp = net.players.get(net.spectateId);
  const focus = rp && rp.group.visible ? rp.group.position.clone().add(new THREE.Vector3(0,1.35,0)) : (net.deathPos || player.pos).clone().add(new THREE.Vector3(0,1.2,0));
  const yaw = rp ? rp.yaw : player.yaw;
  const camPos = focus.clone().add(new THREE.Vector3(Math.sin(yaw)*-4.2, 1.25, Math.cos(yaw)*-4.2));
  camera.position.lerp(camPos, 1 - Math.exp(-8*dt));
  camera.lookAt(focus);
}

/* ================= PLAYER DAMAGE / WAVES ================= */
function favoriteWeapon(){
  let best = '—', bestN = 0;
  for (const [name,n] of Object.entries(S.weaponKills || {})) if (n > bestN){ best = name; bestN = n; }
  return bestN ? `${best} (${bestN})` : '—';
}
function matchStatsHtml(label='RUN COMPLETE'){
  const acc = S.shotsFired ? Math.round(100 * S.shotsHit / S.shotsFired) : 0;
  const mins = ((performance.now() - S.startTime) / 60000);
  return `${label}<br>` +
    `KILLS <b>${S.kills}</b> &nbsp;//&nbsp; DEATHS <b>${S.deaths}</b> &nbsp;//&nbsp; SCORE <b>${S.score}</b><br>` +
    `ACCURACY <b>${acc}%</b> &nbsp;//&nbsp; HEADSHOTS <b>${S.headshots}</b> &nbsp;//&nbsp; BEST STREAK <b>${S.longestStreak}</b><br>` +
    `FAVORITE WEAPON <b>${favoriteWeapon()}</b><br>` +
    `EARNED <b>${S.cashEarned} CR</b> &nbsp;//&nbsp; <b>${S.xpEarned} XP</b> &nbsp;//&nbsp; TIME <b>${mins.toFixed(1)} MIN</b>`;
}
function damagePlayer(dmg, fromPos){
  if (S.dead || S.paused) return;
  if (mode === 'dm' && player.invuln > 0) return;
  player.hp -= dmg;
  player.lastDamage = performance.now();
  player.shake = Math.min(player.shake + 0.06, 0.14);
  SFX.hurt();
  showDamageDir(fromPos);
  dmgVignette = Math.min(dmgVignette + 0.55, 1);
  updateHealthHUD();
  if (player.hp <= 0){
    player.hp = 0;
    if (mode === 'dm') dmDeath(); else die();
  }
}
function die(){
  S.dead = true;
  S.victory = false;
  canvas.style.cursor = 'crosshair';
  try { document.exitPointerLock(); } catch(e){}
  S.deaths++;
  $('deadTitle').textContent = 'K.I.A.';
  $('deadSubtitle').textContent = 'Rift runner eliminated';
  $('restartBtn').textContent = 'Redeploy';
  $('deadStats').innerHTML = matchStatsHtml(`WAVES SURVIVED <b>${Math.max(0, S.wave - 1)}</b>`);
  $('paused').classList.add('hidden');
  $('dead').classList.remove('hidden');
}
function soloVictory(){
  if (S.dead) return;
  S.dead = true;
  S.victory = true;
  S.paused = true;
  mouseL = mouseR = false;
  canvas.style.cursor = 'crosshair';
  try { document.exitPointerLock(); } catch(e){}
  PROGRESS.soloWaves = Math.max(PROGRESS.soloWaves || 0, SOLO_FINAL_WAVE);
  grantProgress(750, 500, 'MISSION COMPLETE');
  S.score += 2500;
  updateTopHUD();
  SFX.roundWin();
  $('deadTitle').textContent = 'MISSION COMPLETE';
  $('deadSubtitle').textContent = 'Wave 15 cleared — extraction authorized';
  $('restartBtn').textContent = 'Main Menu';
  $('deadStats').innerHTML = matchStatsHtml(`SOLO WAVES CLEARED <b>${SOLO_FINAL_WAVE}</b>`);
  $('paused').classList.add('hidden');
  $('dead').classList.remove('hidden');
}

function waveComposition(n){
  const list = [];
  const scouts = 2 + n;
  const soldiers = Math.floor(n * 0.75);
  const stalkers = n >= 2 ? 1 + Math.floor(n/3) : 0;
  const brutes = n >= 4 ? Math.floor((n-2)/3) : 0;
  const drones = n >= 3 ? Math.floor(n/2) : 0;
  const sentinels = n >= 6 ? Math.floor((n-4)/3) : 0;
  const reavers = n >= 7 ? Math.floor((n-5)/3) : 0;
  for (let i=0;i<scouts;i++) list.push('scout');
  for (let i=0;i<soldiers;i++) list.push('soldier');
  for (let i=0;i<stalkers;i++) list.push('stalker');
  for (let i=0;i<brutes;i++) list.push('brute');
  for (let i=0;i<drones;i++) list.push('drone');
  for (let i=0;i<sentinels;i++) list.push('sentinel');
  for (let i=0;i<reavers;i++) list.push('reaver');
  for (let i=list.length-1;i>0;i--){ const j = (Math.random()*(i+1))|0; [list[i],list[j]] = [list[j],list[i]]; }
  const capped = list.slice(0, n % 5 === 0 ? 22 : 26);
  if (n > 0 && n % 5 === 0) capped.push('nemesis');
  return capped;
}
function updateWaves(dt){
  // Solo is a 15-wave mission. LAN Deathmatch is the only mode that uses the first-to-30-kills rule.
  if (mode === 'solo' && S.wave >= SOLO_FINAL_WAVE && S.toSpawn.length === 0 && enemies.length === 0){
    soloVictory();
    return;
  }
  if (S.toSpawn.length === 0 && enemies.length === 0){
    if (S.intermission <= 0){
      S.intermission = S.wave === 0 ? 0.1 : 6;
      if (S.wave > 0){
        showBanner('WAVE ' + S.wave + ' CLEARED');
        PROGRESS.soloWaves = Math.max(PROGRESS.soloWaves || 0, S.wave);
        trackChallenge('wave', 1);
        grantProgress(75 + S.wave * 20, 40 + S.wave * 8, 'WAVE ' + S.wave + ' CLEARED');
        S.score += 250;
      }
    }
    S.intermission -= dt;
    if (S.intermission <= 0){
      S.wave++;
      S.toSpawn = waveComposition(S.wave);
      S.spawnTimer = 0;
      showBanner(S.wave % 5 === 0 ? 'BOSS WAVE ' + S.wave + ' — NEMESIS INBOUND' : 'WAVE ' + S.wave);
      SFX.wave();
      updateTopHUD();
    }
  } else if (S.toSpawn.length > 0){
    S.spawnTimer -= dt;
    if (S.spawnTimer <= 0 && enemies.length < 14){
      S.spawnTimer = clamp(1.1 - S.wave * 0.05, 0.35, 1.1);
      spawnEnemy(S.toSpawn.pop());
      updateTopHUD();
    }
  }
}

/* ================= HUD ================= */
let dmgVignette = 0;
let hitmarkerT = 0;
function showHitmarker(kill){
  hitmarkerT = 0.14;
  const hm = $('hitmarker');
  hm.classList.toggle('kill', kill);
  hm.style.opacity = 1;
}
function showBanner(text){
  const b = $('banner');
  b.textContent = text;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}
function addKillFeed(enemyName, custom){
  const kf = $('killfeed');
  const div = document.createElement('div');
  div.className = 'kf';
  div.innerHTML = custom ? custom : `RIFT-OPS &nbsp;⟶&nbsp; <b>${enemyName}</b>`;
  kf.prepend(div);
  setTimeout(() => div.remove(), 4100);
  while (kf.children.length > 5) kf.lastChild.remove();
}
function updateScoreboardHUD(){
  const panel = $('scoreboardPanel'), rows = $('scoreRows');
  if (!panel || !rows) return;
  panel.classList.toggle('hidden', mode !== 'dm' && !net.on);
  panel.querySelector('.sbTitle').textContent = net.dmMode === 'team'
    ? `RED v BLUE // FIRST TEAM TO ${net.limit || 30}`
    : `LEADERBOARD // FIRST TO ${net.limit || 30}`;
  if (net.dmMode === 'team'){
    const list = (net.scores || []);
    const row = p => `<div class="scoreRow ${p.id===net.id?'me':''}"><span class="${p.team===1?'tr':'tb'}">${p.name || 'PLAYER'}</span><b>${p.score || 0}<small>${p.deaths || 0}D</small></b></div>`;
    const red = list.filter(p => p.team === 1).sort((a,b)=>(b.score||0)-(a.score||0));
    const blue = list.filter(p => p.team === 2).sort((a,b)=>(b.score||0)-(a.score||0));
    const t = net.teamTotals || { red:0, blue:0 };
    rows.innerHTML =
      `<div class="scoreRow sbTeamHdr tr"><span>RED TEAM</span><b>${t.red}</b></div>` +
      (red.map(row).join('') || '<div class="scoreRow tr"><span>—</span><b>0</b></div>') +
      `<div class="scoreRow sbTeamHdr tb"><span>BLUE TEAM</span><b>${t.blue}</b></div>` +
      (blue.map(row).join('') || '<div class="scoreRow tb"><span>—</span><b>0</b></div>');
    return;
  }
  const list = (net.scores || []).slice(0, 8);
  rows.innerHTML = list.length ? list.map((p,i) => `<div class="scoreRow ${p.id===net.id?'me':''}"><span>${i+1}. ${p.name || 'PLAYER'}</span><b>${p.score || 0}/${net.limit || 30}<small>${p.deaths || 0}D</small></b></div>`).join('') : '<div class="scoreRow"><span>WAITING</span><b>0/30<small>0D</small></b></div>';
}
function voteDescription(name){
  if (name === 'NEXUS') return 'Symmetric lanes, fast duels, tight mid control';
  if (name === 'DUSK YARD') return 'Containers, long angles, flank routes';
  if (name === 'COLD STORAGE') return 'Freezer hub, rack aisles, frost-blue vaults';
  if (name === 'RIFT DOCKS') return 'Rain-slick pier, cranes, container lanes';
  return 'Balanced forge arena with center roof and corner towers';
}
function renderRoundStats(){
  const box = $('voteStats'); if (!box) return;
  const rows = (net.scores || []).slice(0, 10).map((p,i) =>
    `<div class="roundStatsRow ${p.id===net.id?'me':''}"><span>${i+1}. ${p.name || 'PLAYER'}</span><b>${p.score || 0}</b></div>`
  ).join('') || '<div class="roundStatsRow"><span>NO PLAYERS</span><b>0</b></div>';
  const acc = S.shotsFired ? Math.round(100 * S.shotsHit / S.shotsFired) : 0;
  box.innerHTML = `<div class="roundStatsPanel"><h3>FULL SCOREBOARD</h3>${rows}</div>` +
    `<div class="roundStatsPanel personalStats"><h3>MATCH STATS</h3>` +
    `KILLS <b>${S.kills}</b><br>DEATHS <b>${S.deaths}</b><br>ACCURACY <b>${acc}%</b><br>` +
    `HEADSHOTS <b>${S.headshots}</b><br>BEST STREAK <b>${S.longestStreak}</b><br>` +
    `EARNED <b>${S.cashEarned} CR / ${S.xpEarned} XP</b></div>`;
}
/* The result of a vote message with server timestamps (now/voteEndsAt) — builds a LOCAL deadline so a
   different machine clock can't skew the countdown (was the infamous "0s/99s" vote-timer bug on LAN). */
function voteLocalEnd(endsAt=0, now=0){
  const rem = now ? Math.max(0, endsAt - now) : 6000;
  return Date.now() + rem;
}
const MODE_CARD = {
  FFA:  { title:'FREE FOR ALL', sub:'every runner for themselves — first to 30 kills takes it', cls:'vmFFA' },
  TEAM: { title:'RED v BLUE',   sub:'teammates can\'t hurt you — first runner to 30 kills still wins', cls:'vmTEAM' },
};
function enterVoteMode(paused=true){
  net.voteActive = true;
  S.paused = true; locked = false; mouseL = mouseR = false; canvas.style.cursor = 'crosshair';
  try { document.exitPointerLock(); } catch(e){}
  $('voteOverlay').classList.remove('hidden');
}
function showMapVote(winner, choices, counts={}, endsLocal=0){
  enterVoteMode();
  net.votePhase = 'map'; net.voteChoices = choices; net.voteCounts = counts;
  if (endsLocal) net.voteEndsLocal = endsLocal;
  $('voteWinner').textContent = (winner === 'STARTING MAP') ? 'VOTE STARTING MAP' : `${winner} WINS — VOTE NEXT MAP`;
  renderRoundStats();
  const box = $('voteChoices'); box.innerHTML = '';
  choices.forEach((m,i) => {
    const btn = document.createElement('button'); btn.className = 'voteBtn'; btn.dataset.map = m;
    btn.innerHTML = `<img class="voteThumb" src="${thumbFor(m)}" alt="${m}" onerror="this.remove()"><b>${i+1}. ${m}</b><span>${voteDescription(m)}</span><span class="voteCount">${counts[m] || 0} VOTES</span>`;
    btn.onclick = () => castMapVote(m);
    box.appendChild(btn);
  });
  net.__voteSecs = -1; updateVoteCounts();
}
function showModeVote(mapName, counts={}, endsLocal=0){
  enterVoteMode();
  net.votePhase = 'mode'; net.pendingMap = mapName || net.pendingMap; net.voteChoices = ['FFA','TEAM']; net.voteCounts = counts;
  if (endsLocal) net.voteEndsLocal = endsLocal;
  $('voteWinner').textContent = `${(mapName || 'MAP').toUpperCase()} LOCKED — VOTE THE MODE`;
  renderRoundStats();
  const box = $('voteChoices'); box.innerHTML = '';
  ['FFA','TEAM'].forEach((m,i) => {
    const c = MODE_CARD[m];
    const btn = document.createElement('button'); btn.className = 'voteBtn voteModeBtn ' + c.cls; btn.dataset.map = m;
    btn.innerHTML = `<b>${i+1}. ${c.title}</b><span>${c.sub}</span><span class="voteCount">${counts[m] || 0} VOTES</span>`;
    btn.onclick = () => castMapVote(m);
    box.appendChild(btn);
  });
  net.__voteSecs = -1; updateVoteCounts();
}
function updateVoteCounts(){
  const counts = net.voteCounts || {};
  for (const btn of document.querySelectorAll('.voteBtn')){
    const m = btn.dataset.map;
    const c = btn.querySelector('.voteCount'); if (c && counts[m] !== undefined) c.textContent = `${counts[m]} VOTES`;
  }
  const secs = Math.max(0, Math.ceil(((net.voteEndsLocal || 0) - Date.now()) / 1000));
  if (secs !== net.__voteSecs){
    net.__voteSecs = secs;
    $('voteTimer').textContent = net.votePhase === 'mode' ? `MODE VOTE — MOUSE OR KEYS 1–2 · ${secs}s` : `MAP VOTE — MOUSE OR KEYS 1–3 · ${secs}s`;
  }
}
function hideMapVote(){
  $('voteOverlay').classList.add('hidden');
  net.voteActive = false; net.votePhase = 'map'; net.__voteSecs = -1;
  if (mode === 'dm' && S.started && !S.dead){ S.paused = false; fallbackMode = true; locked = true; canvas.style.cursor = 'none'; }
}
function castMapVote(choice){
  if (!net.voteActive || !choice || !net.voteChoices.includes(choice)) return;
  for (const b of document.querySelectorAll('.voteBtn')) b.classList.toggle('selected', b.dataset.map === choice);
  SFX.vote();
  netSend({ t:'vote', map:choice });
}
function updateAmmoHUD(){
  const w = CW();
  const sg = $('slotGun'), sk = $('slotKnife');
  if (sg) sg.classList.toggle('active', !knifeMode);
  if (sk){
    sk.classList.toggle('active', !!knifeMode);
    sk.classList.toggle('gold', !!knifeGolden());
    sk.textContent = knifeGolden() ? '2 ★ SHANK' : '2 KNIFE';
  }
  if (knifeMode){
    const def = currentKnifeDef();
    $('weaponName').innerHTML = def.golden ? `<span style="color:#ffd040">${def.name}</span>` : def.name;
    $('ammoMag').textContent = '—';
    $('ammoMag').classList.remove('lowammo');
    $('ammoReserve').textContent = ' ∞';
    const av = $('arsenalVal'); if (av) av.textContent = mode === 'dm' ? `${Math.min((net.myScore || 0) + 1, 30)} / 30` : `${weaponIndex+1} / ${WEAPONS.length}`;
    $('nadeVal').textContent = '×' + player.grenades;
    $('reloadHint').textContent = knifeGolden() ? 'FINAL TIER — SHANK TO WIN' : '';
    return;
  }
  const rc = '#' + currentRarity.color.toString(16).padStart(6,'0');
  $('weaponName').innerHTML = `<span style="color:${rc}">${currentRarity.name}</span> ${w.name}`;
  $('ammoMag').textContent = w.ammo;
  $('ammoMag').classList.toggle('lowammo', w.ammo <= w.mag * 0.25);
  $('ammoReserve').textContent = ' / ' + w.res;
  const av = $('arsenalVal');
  if (av) av.textContent = mode === 'dm' ? `TIER ${Math.min((net.myScore || 0) + 1, 30)} / 30` : `${weaponIndex+1} / ${WEAPONS.length}`;
  $('nadeVal').textContent = '×' + player.grenades;
  const fin = (S.started && !S.dead && !S.paused && enemies && findFinisherTarget()) ? 'PRESS F TO EXECUTE' : '';
  $('reloadHint').textContent = w.reloading > 0 ? `RELOADING ${Math.round(reloadProgress(w)*100)}%` : (w.ammo === 0 ? 'PRESS R TO RELOAD' : fin);
}
function updateHealthHUD(){
  const frac = clamp(player.hp / player.maxHp, 0, 1);
  $('healthBar').style.width = (frac*100) + '%';
  $('healthNum').textContent = Math.ceil(player.hp);
  $('healthPanel').classList.toggle('low', frac < 0.35);
}
function updateTopHUD(){
  const mapEl = $('mapName'); if (mapEl) mapEl.textContent = currentMapName;
  if (mode === 'dm'){
    $('modeLbl').textContent = 'ROUND';
    $('hostilesLbl').textContent = 'PLAYERS';
    $('waveVal').textContent = net.round || 1;
    $('hostilesVal').textContent = net.players.size + 1;
    const me = (net.scores || []).find(p => p.id === net.id);
    const leader = (net.scores || [])[0];
    if (net.dmMode === 'team'){
      const t = net.teamTotals || { red:0, blue:0 };
      $('scoreVal').textContent = me ? me.score : S.kills;
      $('killsVal').textContent = `${t.red} – ${t.blue}`;
    } else {
      $('scoreVal').textContent = me ? me.score : S.kills;
      $('killsVal').textContent = leader ? `${leader.score}/${net.limit || 30}` : `0/${net.limit || 30}`;
    }
  } else {
    $('modeLbl').textContent = 'WAVE';
    $('hostilesLbl').textContent = 'HOSTILES';
    $('waveVal').textContent = S.wave || '—';
    $('hostilesVal').textContent = enemies.filter(e=>!e.dead).length + S.toSpawn.length;
    $('scoreVal').textContent = S.score;
    $('killsVal').textContent = S.kills;
  }
}

/* ---- minimap ---- */
const mm = $('minimap').getContext('2d');
function drawMinimap(){
  const sz = 176, scale = sz / (ARENA*2 + 8);
  mm.clearRect(0,0,sz,sz);
  mm.fillStyle = 'rgba(8,14,24,.85)';
  mm.fillRect(0,0,sz,sz);
  const toMap = (x,z) => [sz/2 + x*scale, sz/2 + z*scale];
  mm.fillStyle = 'rgba(70,95,130,.7)';
  for (const s of solids){
    if (s.max.y < 0.8) continue;
    const [x1,z1] = toMap(s.min.x, s.min.z);
    mm.fillRect(x1, z1, (s.max.x-s.min.x)*scale, (s.max.z-s.min.z)*scale);
  }
  // pickups
  for (const pk of pickups){
    if (!pk.active) continue;
    const [x,z] = toMap(pk.mesh.position.x, pk.mesh.position.z);
    mm.fillStyle = pk.kind === 'health' ? '#18e07a' : '#ffc040';
    mm.fillRect(x-2, z-2, 4, 4);
  }
  // enemies
  for (const e of enemies){
    if (e.dead) continue;
    const [x,z] = toMap(e.group.position.x, e.group.position.z);
    mm.fillStyle = '#ff3b57';
    mm.beginPath(); mm.arc(x, z, 2.6, 0, 7); mm.fill();
  }
  // remote players — teammates in team color, rivals red (ffa: everyone a rival)
  for (const rp of net.players.values()){
    const [x,z] = toMap(rp.group.position.x, rp.group.position.z);
    mm.fillStyle = isTeammate(rp) ? TEAM_COLORS[net.myTeam] : '#ff3b57';
    mm.beginPath(); mm.arc(x, z, 2.6, 0, 7); mm.fill();
  }
  // player
  const [px,pz] = toMap(player.pos.x, player.pos.z);
  mm.save();
  mm.translate(px, pz);
  mm.rotate(-player.yaw);
  mm.fillStyle = '#2cf2ff';
  mm.shadowColor = '#2cf2ff'; mm.shadowBlur = 6;
  mm.beginPath(); mm.moveTo(0,-6); mm.lineTo(4.4,5); mm.lineTo(-4.4,5); mm.closePath(); mm.fill();
  mm.restore();
}

/* ================= MAIN LOOP ================= */
const clock = new THREE.Clock();
let crosshairGap = 10;

function updatePlayer(dt, now){
  player.invuln = Math.max(0, (player.invuln || 0) - dt);
  // input direction
  let ix = 0, iz = 0;
  if (bindDown('fwd')) iz -= 1;
  if (bindDown('back')) iz += 1;
  if (bindDown('left')) ix -= 1;
  if (bindDown('right')) ix += 1;
  const moving = ix !== 0 || iz !== 0;
  player.crouched = bindDown('crouch') && player.grounded && player.slideT <= 0;
  const sprinting = bindDown('sprint') && moving && !player.crouched && adsT < 0.3;   // sprint in ANY direction, not just forward — sideways strafe-sprints carry speed too; crouching cancels it
  const adsHeld = (mouseR || bindDown('ads')) && !knifeMode;   // RMB or the rebindable CTRL aim key
  const ads = adsHeld && CW().reloading <= 0;
  adsT = clamp(adsT + (ads ? dt*8 : -dt*8), 0, 1);

  const speedMul = knifeMode ? currentKnifeDef().speedMul : 1;  // knife +5%, golden shank +15% move speed
  const speed = (ads ? 3.6 : player.crouched ? 3.1 : (sprinting ? 8.4 : 5.7)) * speedMul;
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  let wx = 0, wz = 0;
  if (moving){
    const il = Math.hypot(ix, iz); ix /= il; iz /= il;
    wx = (ix * cos - iz * sin) * speed;
    wz = (-ix * sin - iz * cos) * -speed;
    // rotate input by yaw:
    wx = (ix * cos + iz * sin) * speed;
    wz = (iz * cos - ix * sin) * speed;
  }
  // smooth accel (stronger air control so mid-air corrections feel fluent)
  const accel = player.grounded ? 14 : 6.5;
  player.vel.x = lerp(player.vel.x, wx, 1 - Math.exp(-accel*dt));
  player.vel.z = lerp(player.vel.z, wz, 1 - Math.exp(-accel*dt));

  // slide
  player.slideCd = Math.max(0, player.slideCd - dt);
  if (player.slideT > 0){
    player.slideT -= dt;
    const ss = 10.8 * (0.4 + player.slideT / 0.62);
    player.vel.x = slideDir.x * ss;
    player.vel.z = slideDir.z * ss;
  }
  player.crouch = lerp(player.crouch, player.slideT > 0 ? 1 : (player.crouched ? 0.92 : 0), 1 - Math.exp(-13*dt));

  // gravity & jump — buffered input + coyote time so jumps always register even mid-sprint / mid-crowd
  player.vel.y -= 21 * dt;
  player.jumpBufferT = Math.max(0, (player.jumpBufferT || 0) - dt);
  if (player.grounded) player.coyoteT = 0.12;
  else player.coyoteT = Math.max(0, (player.coyoteT || 0) - dt);
  if (player.jumpBufferT > 0 && player.coyoteT > 0){
    player.jumpBufferT = 0;
    player.coyoteT = 0;
    player.vel.y = 7.6;
    player.grounded = false;
    player.slideT = 0;
    SFX.jump();
  }

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  collideXZ(player.pos, player.pos.y, player.pos.y + P_HEIGHT);
  player.pos.x = clamp(player.pos.x, -ARENA+0.8, ARENA-0.8);
  player.pos.z = clamp(player.pos.z, -ARENA+0.8, ARENA-0.8);

  player.pos.y += player.vel.y * dt;
  const g = groundHeight(player.pos, player.pos.y + 0.3);
  if (player.pos.y <= g){
    if (!player.grounded && player.vel.y < -4) SFX.land();
    player.pos.y = g;
    player.vel.y = 0;
    player.grounded = true;
  } else if (player.pos.y > g + 0.05) player.grounded = false;

  // footsteps & bob
  const hSpeed = Math.hypot(player.vel.x, player.vel.z);
  if (player.grounded && hSpeed > 1.5){
    player.bobT += dt * hSpeed * 1.35;
    player.stepT -= dt;
    if (player.stepT <= 0){ player.stepT = sprinting ? 0.31 : player.crouched ? 0.6 : 0.42; SFX.step(player.crouched ? 0.4 : 1); }
  } else {
    player.bobT = lerp(player.bobT, Math.round(player.bobT / Math.PI) * Math.PI, dt*8);
  }

  // health regen
  if (now - player.lastDamage > 4500 && player.hp < player.maxHp && player.hp > 0){
    player.hp = Math.min(player.maxHp, player.hp + 16 * dt);
    updateHealthHUD();
  }

  // camera
  const bobY = Math.sin(player.bobT * 2) * 0.035 * (player.grounded ? 1 : 0);
  const bobX = Math.cos(player.bobT) * 0.02 * (player.grounded ? 1 : 0);
  player.shake = Math.max(0, player.shake - dt * 0.5);
  const shX = (Math.random()-0.5) * player.shake, shY = (Math.random()-0.5) * player.shake;
  camera.position.set(player.pos.x + bobX + shX, player.pos.y + EYE - player.crouch * 0.72 + bobY + shY, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, player.crouch * 0.07);

  // FOV
  const baseFov = SETTINGS.fov;
  let targetFov = ads ? (CW().scoped ? 26 : clamp(baseFov - 23, 44, 62)) : (sprinting && moving ? baseFov + 7 : baseFov);
  targetFov += player.crouch * 5;
  camera.fov = lerp(camera.fov, targetFov, dt*10);
  camera.updateProjectionMatrix();

  // weapon handling
  const w = CW();
  w.cool -= dt;
  if (switchT > 0) switchT -= dt;
  if (w.reloading > 0){
    w.reloading -= dt;
    updateAmmoHUD();
    if (w.reloading <= 0){
      const need = w.mag - w.ammo;
      const take = Math.min(need, w.res);
      w.ammo += take; w.res -= take;
      updateAmmoHUD();
    }
  }
  // knife swing timers + attack input — mouse or the rebindable FIRE key for touchpad/keyboard-only players
  const fireHeld = mouseL || bindDown('fire');
  if (knifeSwingCd > 0) knifeSwingCd -= dt;
  if (knifeSwingT > 0) knifeSwingT -= dt;
  if (fireHeld && knifeMode){ tryKnifeSwing(); }
  else if (fireHeld && !knifeMode && (w.auto || w.cool <= -0.0001)){
    if (w.auto) fireWeapon();
    else { if (!player._firedHeld){ fireWeapon(); player._firedHeld = true; } }
  }
  if (!fireHeld) player._firedHeld = false;

  // gun transform + cinematic reload choreography
  gunKick = Math.max(0, gunKick - dt * 0.9);
  swayX = lerp(swayX, 0, dt*6); swayY = lerp(swayY, 0, dt*6);
  animateWeaponModel(gunModels[weaponIndex], w);
  animateFirstPersonArms(w, hSpeed);
  const target = adsT > 0 ? GUN_ADS.clone().lerp(GUN_HIP, 1-adsT) : GUN_HIP;
  const gb = Math.sin(player.bobT * 2) * 0.012 * (1 - adsT*0.8);
  const gbx = Math.cos(player.bobT) * 0.01 * (1 - adsT*0.8);
  const ru = reloadProgress(w);
  const rDrop = ease01(pulse01(ru, .22, .32));
  const rMag  = ease01(pulse01(ru, .52, .34));
  const rSlam = ease01(pulse01(ru, .86, .16));
  gunRoot.position.set(
    target.x + swayX*(1-adsT*0.7) + gbx + rMag*0.09 - rSlam*0.025,
    target.y + swayY*(1-adsT*0.7) + gb - (switchT > 0 ? switchT*0.6 : 0) - rDrop*0.19 + rSlam*0.055,
    target.z + gunKick + rDrop*0.12 - rSlam*0.06
  );
  gunRoot.rotation.set(
    swayY*2 + gunKick*0.8 + rDrop*0.62 - rSlam*0.34,
    swayX*2 - rMag*0.16 + rSlam*0.10,
    -rMag*0.55 + rSlam*0.24
  );

  // hard guarantee every frame: exactly one knife variant visible, and only in knife mode
  knifeModels[0].visible = !!knifeMode && !knifeGolden();
  knifeModels[1].visible = !!knifeMode && knifeGolden();

  // knife choreography: snappy windup, big explosive slash straight across the screen
  // (mirrored every other swing), fast recover. No jabs.
  if (knifeMode){
    const T = 0.42;
    const p = knifeSwingT > 0 ? 1 - knifeSwingT / T : 0;
    const phase = (s0, d) => ease01(clamp((p - s0) / d, 0, 1));
    const windup = phase(0, .26), strike = phase(.26, .30), recov = phase(.64, .36);
    const a = windup * (1 - strike);     // weight of the windup pose
    const b = strike * (1 - recov);      // weight of the strike pose
    // SLASH: haul out to one side, then carve a wide horizontal arc through the crosshair
    const s = (knifeSwingId & 1) ? 1 : -1;
    gunRoot.rotation.x += -0.16*a + 0.26*b;
    gunRoot.rotation.y += s * (-0.72*a + 1.55*b);
    gunRoot.rotation.z += s * (-0.48*a + 1.05*b);
    gunRoot.position.x += s * (-0.10*a + 0.30*b);
    gunRoot.position.y +=  0.04*a - 0.03*b;
    gunRoot.position.z +=  0.04*a - 0.08*b;
  }

  // flash
  if (flashTimer > 0){
    flashTimer -= dt;
    if (flashTimer <= 0){ flash.visible = false; }
  }
  flashLight.intensity = Math.max(0, flashLight.intensity - dt * 30);

  // crosshair dynamics + scope overlay
  const scoped = w.scoped && adsT > 0.7;
  $('scope').classList.toggle('hidden', !scoped);
  const spreadPx = 8 + hSpeed * 1.6 + (player.grounded ? 0 : 10) + gunKick * 90 - adsT * 6;
  crosshairGap = lerp(crosshairGap, clamp(spreadPx, 3, 34), dt*12);
  document.documentElement.style.setProperty('--gap', crosshairGap + 'px');
  $('crosshair').style.opacity = scoped ? 0 : (adsT > 0.6 ? 0.4 : 1);
}

function updateEffects(dt){
  for (let i = tracers.length-1; i >= 0; i--){
    const t = tracers[i];
    t.life -= dt;
    t.mesh.material.opacity = Math.max(0, t.life / 0.07);
    if (t.life <= 0){ scene.remove(t.mesh); t.mesh.material.dispose(); tracers.splice(i,1); }
  }
  for (let i = particles.length-1; i >= 0; i--){
    const p = particles[i];
    p.life -= dt;
    p.vel.y += p.grav * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    const f = p.life / p.maxLife;
    if (p.type === 'smoke'){
      p.mesh.material.opacity = f * 0.4;
      p.mesh.scale.setScalar(1 + (1-f)*2.5);
    } else if (p.type === 'ring'){
      p.mesh.scale.addScalar(dt * 26);
      p.mesh.material.opacity = f * 0.85;
    } else if (p.type === 'gib'){
      // bounce on the floor, tumble, fade out at the end
      if (p.mesh.position.y < 0.07 && p.vel.y < 0){
        p.mesh.position.y = 0.07;
        p.vel.y *= -0.42; p.vel.x *= 0.6; p.vel.z *= 0.6;
      }
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      p.mesh.material.opacity = Math.min(1, f * 3);
    } else {
      p.mesh.material.opacity = f;
      p.mesh.rotation.x += dt*9; p.mesh.rotation.y += dt*7;
    }
    if (p.life <= 0){ scene.remove(p.mesh); p.mesh.material.dispose(); particles.splice(i,1); }
  }
  for (let i = popups.length-1; i >= 0; i--){
    const p = popups[i];
    p.life -= dt;
    p.sp.position.y += dt * 1.1;
    p.sp.material.opacity = clamp(p.life / (p.maxLife*0.5), 0, 1);
    if (p.life <= 0){
      scene.remove(p.sp);
      if (p.sp.material.map) p.sp.material.map.dispose();
      p.sp.material.dispose();
      popups.splice(i,1);
    }
  }
  // hud fades
  if (hitmarkerT > 0){
    hitmarkerT -= dt;
    if (hitmarkerT <= 0) $('hitmarker').style.opacity = 0;
  }
  if (dmgVignette > 0){
    dmgVignette = Math.max(0, dmgVignette - dt * 1.4);
  }
  const lowHp = player.hp < 35 ? (0.35 + Math.sin(performance.now()*0.008)*0.12) : 0;
  $('damageVignette').style.opacity = Math.max(dmgVignette, lowHp);

  // explosion light decay
  expLight.intensity = Math.max(0, expLight.intensity - dt * 480);

  // damage direction arrow fade
  if (dmgDirT > 0){
    dmgDirT = Math.max(0, dmgDirT - dt);
    $('dmgDir').style.opacity = (dmgDirT / 0.9).toFixed(2);
  }

  // kill streak window
  if (streakT > 0){ streakT -= dt; if (streakT <= 0) streak = 0; }

  // low-health heartbeat
  if (S.started && !S.dead && player.hp > 0 && player.hp < 35){
    hbT -= dt;
    if (hbT <= 0){
      hbT = player.hp < 18 ? 0.55 : 0.85;
      playTone(62, 46, 0.1, 0.5, 'sine');
      setTimeout(() => playTone(56, 42, 0.09, 0.35, 'sine'), 150);
    }
  }

  // map vote countdown
  if (net.voteActive && net.voteEndsLocal) updateVoteCounts();

  // drifting dust
  if (dustCloud) dustCloud.rotation.y += dt * 0.006;
}
let hbT = 0;

let frameCount = 0;
function loop(){
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  gunRoot.visible = S.started && !(CW().scoped && adsT > 0.7);

  if (S.started && !S.paused && !S.dead){
    updatePlayer(dt, now);
    if (mode === 'solo'){
      updateEnemies(dt, now);
      updateProjectiles(dt);
      updateWaves(dt);
    }
    updateGrenades(dt, now);
    updatePickups(dt, now);
  } else {
    // idle camera drift on menu
    if (!S.started){
      const t = now * 0.0001;
      camera.position.set(Math.sin(t)*26, 9, Math.cos(t)*26);
      camera.lookAt(0, 2, 0);
    }
  }
  if (S.started && S.dead && mode === 'dm') updateSpectate(dt);
  updateNet(dt);
  updateWorldAtmosphere(dt, now);
  updateEffects(dt);
  if (frameCount % 2 === 0) drawMinimap();
  if (frameCount % 10 === 0) updateTopHUD();
  frameCount++;
  renderer.render(scene, camera);
}
updateAmmoHUD();
updateHealthHUD();
loop();
window.__gameReady = true;
window.__dbg = { player, S, camera, enemies, net, keys, spawnEnemy, fireWeapon, grenadesLive, explodeAt, throwGrenade, WEAPONS, RARITIES, waveComposition, tryReload, rotateWeaponForKill, setMap, spawnPlayerPieces, dmDeath, respawnDMPlayer, PROGRESS, SKINS, grantProgress, updateProgressUI, skinDef, trackChallenge, findFinisherTarget, tryFinisher, destructibles, weatherSystems, worldAnim, eventLights, damageDestructible, destroyDestructible, cleanupPlayerAvatar, savePlayerName, addRemotePlayer, tryKnifeSwing, knifeStrike, isBackstab, KNIFE_DEFS, knifeModels,
  MAP_NAMES, SETTINGS, DEFAULT_BINDS, BIND_LABELS, bindCode, bindDown, assignBind, friendlyKeyName, renderBindList, GUN_LADDER, FINAL_TIER_SCORE, equipLadderTier, syncLadderWeapon, equipGunSlot, equipKnifeSlot, tryKnifeSwing, knifeStrike, updateWeaponVisibility, knifeModels, solids, castWorld, hasLOS, resolvePenetration, updateEnemies, updatePlayer, isTeammate, setRemoteTeam, TEAM_COLORS, TEAM_NAMES, updateTeamHUD,
  get knifeSwingCt(){ return knifeSwingId; },
  get inputLocked(){ return locked; },
  get knifeMode(){ return knifeMode; },
  getKnifeState(){ return { mode:knifeMode, golden:knifeGolden(), locked:knifeLocked(), def:currentKnifeDef() }; },
  resetKnifeTimers(){ knifeSwingT = knifeSwingCd = 0; },
  getAdsT(){ return adsT; } };
