/* =========================================================================
   环卫小卫士 (Sanitation Hero)
   -------------------------------------------------------------------------
   · ↑↓←→ / WASD 控制环卫工人移动
   · 踩到垃圾 = 捡进背包（最多 5 件）
   · 背包满了走到中间的垃圾桶旁 = 自动倒垃圾，每件 1 分
   · 地图随机冒垃圾；灰色小人乱逛并随手丢垃圾
   · 碰到灰色小人 = 感化成同伴，同伴自动捡垃圾并送桶
   · 分数 ≥ TARGET 通关；地图垃圾 ≥ MAX_DIRT 失败
   ========================================================================= */
'use strict';

/* ============================= 参数区 ============================= */
const W = 960, H = 640;
const HUD_H = 56, PAD = 14;
const FIELD = { x: PAD, y: HUD_H + PAD, w: W - PAD * 2, h: H - HUD_H - PAD * 2 };
const FR = FIELD.x + FIELD.w;      // 场地右边界
const FB = FIELD.y + FIELD.h;      // 场地下边界

const CAP = 5;                     // 背包容量（各难度一致）
const PICK_R = 11;                 // 垃圾拾取判定半径
const BIN = { x: W / 2, y: FIELD.y + FIELD.h / 2, r: 30 };

const PLAYER_SPEED = 240;
const PLAYER_FULL_SLOW = 0.85;     // 背包满时略微减速
const MOUSE_FOLLOW = true;         // 鼠标模式：鼠标移到哪，小人就走到哪
const CONTROL_DEFAULT = 'mouse';   // 默认操作方式：'mouse' | 'keyboard'
const MOUSE_SPEED_MULT = 1;        // 跟随速度倍率（调大更跟手，>5 基本等于瞬移）
const MOUSE_SNAP_R = 5;            // 离鼠标多近算“到了”，防抖动
const NPC_FLEE = true;             // 灰色小人是否会被吓跑
const NPC_FLEE_RANGE = 110;
const START_GARBAGE = 8;

/* ===================== 难度预设（改数值就改这里） ===================== */
/* drop/spawn/newNpc 都是「每隔多少秒」的随机区间，越小越难 */
const DIFFS = {
  easy: {
    label: '休闲', desc: '3 个灰人 · 冒得慢',
    startNpc: 3, maxNpc: 10, newNpc: [10, 14],
    drop: [3.5, 7.0], spawn: [3.5, 7.0],
    npcSpeed: 78, fleeSpeed: 118, greenSpeed: 106,
    target: 120, maxDirt: 50, ramp: 0.5
  },
  normal: {
    label: '标准', desc: '6 个灰人 · 丢得快',
    startNpc: 6, maxNpc: 16, newNpc: [6, 9],
    drop: [3.0, 6.0], spawn: [2.0, 4.0],
    npcSpeed: 84, fleeSpeed: 132, greenSpeed: 100,
    target: 150, maxDirt: 45, ramp: 0.7
  },
  hard: {
    label: '困难', desc: '9 个灰人 · 追到手软',
    startNpc: 9, maxNpc: 22, newNpc: [4, 6],
    drop: [4.5, 8.0], spawn: [1.6, 3.2],
    npcSpeed: 92, fleeSpeed: 152, greenSpeed: 96,
    target: 200, maxDirt: 40, ramp: 1.0
  }
};

let DIFF = 'normal';               // 当前难度（开局默认：标准 = 6 个灰人）
let START_NPC = 6, MAX_NPC = 16, TARGET = 150, MAX_DIRT = 45;
let NPC_SPEED = 84, NPC_FLEE_SPEED = 132, GREEN_SPEED = 100;
let DROP_T = [3.0, 6.0], SPAWN_T = [2.0, 4.0], NEWNPC_T = [6, 9], RAMP = 0.7;

function setDifficulty(id) {
  if (!DIFFS[id]) return;
  const d = DIFFS[id];
  DIFF = id;
  START_NPC = d.startNpc; MAX_NPC = d.maxNpc; NEWNPC_T = d.newNpc;
  DROP_T = d.drop; SPAWN_T = d.spawn;
  NPC_SPEED = d.npcSpeed; NPC_FLEE_SPEED = d.fleeSpeed; GREEN_SPEED = d.greenSpeed;
  TARGET = d.target; MAX_DIRT = d.maxDirt; RAMP = d.ramp;
}
setDifficulty(DIFF);

const TYPES = [
  { n: 'bottle', c1: '#8fd8f7', c2: '#3aa4d4' },
  { n: 'paper',  c1: '#ffffff', c2: '#cbd5de' },
  { n: 'peel',   c1: '#ffd96b', c2: '#dfa61d' },
  { n: 'can',    c1: '#f2a961', c2: '#b06a24' },
  { n: 'bag',    c1: '#cbb8e8', c2: '#8a6fb0' }
];

const C_PLAYER = '#ff9f43', C_HAT_P = '#1f9d55';
const C_GRAY = '#9aa3ad', C_HAT_G = '#6d7680';
const C_GREEN = '#3ddc84', C_HAT_GR = '#13925b';

/* ============================= 工具函数 ============================= */
function rand(a, b) { return a + Math.random() * (b - a); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

function rr(x, y, w, h, r) {                       // 圆角矩形路径
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ============================= 音效 ============================= */
let actx = null;
function beep(freq, dur, type, vol) {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.05, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch (e) { /* 没声音也不影响游戏 */ }
}

/* ============================= 游戏状态 ============================= */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const keys = {};
const mouse = { x: W / 2, y: FIELD.y + FIELD.h * 0.7, active: false };
let CONTROL = CONTROL_DEFAULT;     // 当前操作方式
function setControl(id) { CONTROL = (id === 'keyboard') ? 'keyboard' : 'mouse'; }
function toggleControl() { setControl(CONTROL === 'mouse' ? 'keyboard' : 'mouse'); }

let state = 'menu';          // menu | play | pause | win | lose
let score = 0;
let elapsed = 0;
let nextId = 1;
let player = null;
let npcs = [];
let garbage = [];
let particles = [];
let floats = [];
let garbageT = 0;
let npcT = 0;

/* ============================= 世界构建 ============================= */
function spawnGarbage(x, y) {
  if (garbage.length >= MAX_DIRT) return null;
  const hasPos = typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y);
  for (let i = 0; i < 14; i++) {
    const gx = (hasPos && i === 0) ? x : rand(FIELD.x + 22, FR - 22);
    const gy = (hasPos && i === 0) ? y : rand(FIELD.y + 22, FB - 22);
    if (dist(gx, gy, BIN.x, BIN.y) < BIN.r + 26) continue;      // 别掉进桶里
    let ok = true;
    for (const g of garbage) if (dist(gx, gy, g.x, g.y) < 24) { ok = false; break; }
    if (!ok) continue;
    const t = pick(TYPES);
    const g = {
      id: nextId++, x: gx, y: gy, type: t,
      rot: rand(-0.5, 0.5), bob: rand(0, 6.28), claimed: 0
    };
    garbage.push(g);
    return g;
  }
  return null;
}

function spawnNpc() {
  for (let i = 0; i < 20; i++) {
    const x = rand(FIELD.x + 30, FR - 30);
    const y = rand(FIELD.y + 30, FB - 30);
    if (dist(x, y, BIN.x, BIN.y) < BIN.r + 40) continue;
    if (player && dist(x, y, player.x, player.y) < 150) continue;
    let ok = true;
    for (const n of npcs) if (dist(x, y, n.x, n.y) < 46) { ok = false; break; }
    if (!ok) continue;
    const n = {
      id: nextId++, kind: 'gray', x, y, r: 13,
      speed: NPC_SPEED, bag: [], bob: 0, dirx: 0, diry: 1,
      tx: x, ty: y, retarget: rand(0.5, 2), dropT: rand(2.5, 6),
      mode: 'seek', targetId: 0
    };
    npcs.push(n);
    return n;
  }
  return null;
}

function initWorld() {
  score = 0; elapsed = 0; nextId = 1;
  npcs = []; garbage = []; particles = []; floats = [];
  player = {
    id: 0, kind: 'player', x: FIELD.x + 70, y: FB - 80, r: 13,
    bag: [], bob: 0, dirx: 0, diry: -1
  };
  for (let i = 0; i < START_GARBAGE; i++) spawnGarbage();
  for (let i = 0; i < START_NPC; i++) spawnNpc();
  garbageT = rand(SPAWN_T[0], SPAWN_T[1]);
  npcT = rand(NEWNPC_T[0], NEWNPC_T[1]);
}

function reset() {
  initWorld();
  state = 'play';
}

/* ============================= 特效 ============================= */
function popParticles(x, y, color, n) {
  n = n || 6;
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(28, 115);
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 25,
      life: rand(0.35, 0.7), max: 0.7, r: rand(2, 4.5), c: color
    });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy += 170 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
}
function floatText(x, y, text, color, scale) {
  floats.push({ x, y, text, color: color || '#2b3440', life: 1, max: 1, scale: scale || 1 });
}
function updateFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.life -= dt; f.y -= 36 * dt;
    if (f.life <= 0) floats.splice(i, 1);
  }
}

/* ============================= 玩家 ============================= */
function playerSpeed() {
  return PLAYER_SPEED * (player.bag.length >= CAP ? PLAYER_FULL_SLOW : 1);
}

function movePlayer(dt) {
  let dx = 0, dy = 0;
  if (keys['ArrowLeft'] || keys['a']) dx -= 1;
  if (keys['ArrowRight'] || keys['d']) dx += 1;
  if (keys['ArrowUp'] || keys['w']) dy -= 1;
  if (keys['ArrowDown'] || keys['s']) dy += 1;

  const sp = playerSpeed();

  /* 键盘优先：一旦按了方向键，就以键盘为准，不被鼠标拽走 */
  if (dx || dy) {
    const l = Math.hypot(dx, dy);
    dx /= l; dy /= l;
    player.dirx = dx; player.diry = dy;
    player.bob += dt * 13;
    player.x = clamp(player.x + dx * sp * dt, FIELD.x + player.r, FR - player.r);
    player.y = clamp(player.y + dy * sp * dt, FIELD.y + player.r, FB - player.r);
    return;
  }

  /* 鼠标跟随：朝鼠标匀速靠拢，到了就停（不是瞬移，否则追人/赶路都没难度了） */
  if (CONTROL !== 'mouse' || !MOUSE_FOLLOW || !mouse.active) return;

  const tx = clamp(mouse.x, FIELD.x + player.r, FR - player.r);
  const ty = clamp(mouse.y, FIELD.y + player.r, FB - player.r);
  const d = Math.hypot(tx - player.x, ty - player.y);
  if (d <= MOUSE_SNAP_R) return;

  const step = Math.min(sp * MOUSE_SPEED_MULT * dt, d);
  player.dirx = (tx - player.x) / d;
  player.diry = (ty - player.y) / d;
  player.bob += dt * 13;
  player.x = clamp(player.x + player.dirx * step, FIELD.x + player.r, FR - player.r);
  player.y = clamp(player.y + player.diry * step, FIELD.y + player.r, FB - player.r);
}

function playerPickup() {
  if (player.bag.length >= CAP) return;
  for (let i = garbage.length - 1; i >= 0; i--) {
    const g = garbage[i];
    if (dist(player.x, player.y, g.x, g.y) < player.r + PICK_R) {
      garbage.splice(i, 1);
      player.bag.push(g.type);
      popParticles(g.x, g.y, g.type.c1, 5);
      beep(760 + player.bag.length * 40, 0.07, 'sine', 0.035);
      if (player.bag.length >= CAP) {
        floatText(player.x, player.y - 40, '背包满了 去扔!', '#ff6b6b', 1.05);
      }
      return;
    }
  }
}

function playerDeposit() {
  if (!player.bag.length) return;
  if (dist(player.x, player.y, BIN.x, BIN.y) > BIN.r + player.r + 8) return;
  const n = player.bag.length;
  score += n;
  player.bag.length = 0;
  floatText(BIN.x, BIN.y - 52, '+' + n + ' 分', '#1f9d55', 1.25);
  popParticles(BIN.x, BIN.y - 12, C_GREEN, 10);
  beep(560, 0.09, 'sine', 0.05);
  setTimeout(() => beep(880, 0.12, 'sine', 0.05), 80);
  checkEnd();
}

/* ============================= 灰色小人 ============================= */
function updateGray(n, dt) {
  const dP = dist(n.x, n.y, player.x, player.y);

  if (dP < n.r + player.r + 2) { convert(n); return; }

  if (NPC_FLEE && dP < NPC_FLEE_RANGE) {           // 被吓跑
    const ax = n.x - player.x, ay = n.y - player.y;
    const l = Math.hypot(ax, ay) || 1;
    n.dirx = ax / l; n.diry = ay / l;
    n.x = clamp(n.x + n.dirx * NPC_FLEE_SPEED * dt, FIELD.x + n.r, FR - n.r);
    n.y = clamp(n.y + n.diry * NPC_FLEE_SPEED * dt, FIELD.y + n.r, FB - n.r);
    n.bob += dt * 17;
    return;                                        // 逃跑时顾不上丢垃圾
  }

  n.retarget -= dt;
  if (n.retarget <= 0 || dist(n.x, n.y, n.tx, n.ty) < 14) {
    n.tx = rand(FIELD.x + 34, FR - 34);
    n.ty = rand(FIELD.y + 34, FB - 34);
    n.retarget = rand(1.6, 3.4);
  }
  moveToward(n, n.tx, n.ty, n.speed, dt);

  n.dropT -= dt;
  if (n.dropT <= 0) {
    n.dropT = rand(DROP_T[0], DROP_T[1]) / diffScale();
    const g = spawnGarbage(n.x + rand(-10, 10), n.y + rand(8, 18));
    if (g) {
      floatText(n.x, n.y - 38, '随手丢!', '#8e98a3', 0.92);
      popParticles(g.x, g.y, g.type.c1, 4);
      beep(200, 0.07, 'triangle', 0.03);
    }
  }
}

/* ============================= 同伴（已感化） ============================= */
function updateGreen(n, dt) {
  if (n.bag.length >= CAP) n.mode = 'deliver';

  if (n.mode === 'deliver') {
    moveToward(n, BIN.x, BIN.y, n.speed, dt);
    if (dist(n.x, n.y, BIN.x, BIN.y) < BIN.r + n.r + 6) {
      const k = n.bag.length;
      if (k) {
        score += k;
        n.bag.length = 0;
        floatText(BIN.x, BIN.y - 52, '+' + k, '#3ddc84', 1);
        popParticles(BIN.x, BIN.y - 12, C_GREEN, 8);
        beep(700, 0.08, 'sine', 0.03);
        checkEnd();
      }
      n.mode = 'seek';
    }
    return;
  }

  /* --- 找垃圾：优先自己已经占住的那一件，避免几个同伴抢同一个 --- */
  let target = null;
  if (n.targetId) {
    target = garbage.find(g => g.id === n.targetId) || null;
    if (!target) n.targetId = 0;
  }
  if (!target) {
    let best = null, bd = Infinity;
    for (const g of garbage) {
      if (g.claimed && g.claimed !== n.id) continue;
      const d = dist(n.x, n.y, g.x, g.y);
      if (d < bd) { bd = d; best = g; }
    }
    if (best) { best.claimed = n.id; n.targetId = best.id; target = best; }
  }

  if (target) {
    moveToward(n, target.x, target.y, n.speed, dt);
    if (dist(n.x, n.y, target.x, target.y) < n.r + PICK_R) {
      const i = garbage.indexOf(target);
      if (i >= 0) garbage.splice(i, 1);
      n.bag.push(target.type);
      popParticles(target.x, target.y, target.type.c1, 4);
      n.targetId = 0;
    }
    return;
  }

  /* --- 场上没垃圾了：背包有货就先去倒，否则四处转转 --- */
  if (n.bag.length > 0) { n.mode = 'deliver'; return; }
  n.retarget -= dt;
  if (n.retarget <= 0 || dist(n.x, n.y, n.tx, n.ty) < 16) {
    n.tx = rand(FIELD.x + 34, FR - 34);
    n.ty = rand(FIELD.y + 34, FB - 34);
    n.retarget = rand(1.2, 2.6);
  }
  moveToward(n, n.tx, n.ty, n.speed * 0.8, dt);
}

function convert(n) {
  n.kind = 'green';
  n.speed = GREEN_SPEED;
  n.bag = [];
  n.mode = 'seek';
  n.targetId = 0;
  n.dropT = Infinity;
  n.r = 13;
  floatText(n.x, n.y - 42, '加入队伍!', '#1f9d55', 1.15);
  popParticles(n.x, n.y, C_GREEN, 14);
  beep(620, 0.08, 'sine', 0.05);
  setTimeout(() => beep(950, 0.14, 'sine', 0.05), 70);
}

/* ============================= 通用移动 ============================= */
function moveToward(e, tx, ty, speed, dt) {
  const dx = tx - e.x, dy = ty - e.y;
  const l = Math.hypot(dx, dy);
  if (l < 0.6) return;
  e.dirx = dx / l; e.diry = dy / l;
  e.x = clamp(e.x + e.dirx * speed * dt, FIELD.x + e.r, FR - e.r);
  e.y = clamp(e.y + e.diry * speed * dt, FIELD.y + e.r, FB - e.r);
  e.bob += dt * (speed / 8);
}

function diffScale() {                       // 随时间越来越难（上限由难度决定）
  return 1 + Math.min(elapsed / 150, RAMP);
}

/* ============================= 主更新 ============================= */
function tick(dt) {
  elapsed += dt;

  movePlayer(dt);
  playerPickup();
  playerDeposit();

  for (const n of npcs) {
    if (n.kind === 'gray') updateGray(n, dt);
    else updateGreen(n, dt);
  }

  /* 地图上随机冒垃圾 */
  garbageT -= dt;
  if (garbageT <= 0) {
    garbageT = rand(SPAWN_T[0], SPAWN_T[1]) / diffScale();
    spawnGarbage();
  }

  /* 路人不断冒出来 */
  npcT -= dt;
  if (npcT <= 0) {
    npcT = rand(NEWNPC_T[0], NEWNPC_T[1]) / diffScale();
    const grays = npcs.filter(n => n.kind === 'gray').length;
    if (npcs.length < MAX_NPC && grays < MAX_NPC) spawnNpc();
  }

  checkEnd();          // 每帧都要判：垃圾可能是被 NPC 丢满的
}

function checkEnd() {
  if (state !== 'play') return;
  if (score >= TARGET) {
    state = 'win';
    [660, 830, 990, 1320].forEach((f, i) => setTimeout(() => beep(f, 0.16, 'sine', 0.06), i * 110));
  } else if (garbage.length >= MAX_DIRT) {
    state = 'lose';
    beep(300, 0.3, 'sawtooth', 0.05);
    setTimeout(() => beep(180, 0.5, 'sawtooth', 0.05), 200);
  }
}

/* ============================= 绘制 ============================= */
function drawField() {
  ctx.fillStyle = '#eef2f5';
  ctx.fillRect(0, 0, W, H);

  rr(FIELD.x, FIELD.y, FIELD.w, FIELD.h, 16);
  ctx.fillStyle = '#f6faf6';
  ctx.fill();
  ctx.strokeStyle = '#dce5dd';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.save();
  rr(FIELD.x, FIELD.y, FIELD.w, FIELD.h, 16);
  ctx.clip();
  ctx.strokeStyle = 'rgba(120,160,135,.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = FIELD.x + 32; x < FR; x += 32) { ctx.moveTo(x, FIELD.y); ctx.lineTo(x, FB); }
  for (let y = FIELD.y + 32; y < FB; y += 32) { ctx.moveTo(FIELD.x, y); ctx.lineTo(FR, y); }
  ctx.stroke();
  ctx.restore();
}

function drawBin() {
  const d = dist(player.x, player.y, BIN.x, BIN.y);
  const near = d < BIN.r + player.r + 34;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);

  if (near || player.bag.length > 0) {
    ctx.save();
    ctx.globalAlpha = (near ? 0.20 : 0.10) + 0.12 * pulse;
    ctx.fillStyle = C_GREEN;
    ctx.beginPath();
    ctx.arc(BIN.x, BIN.y, BIN.r + 14 + pulse * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(20,40,30,.15)';
  ctx.beginPath();
  ctx.ellipse(BIN.x, BIN.y + BIN.r * 0.92, BIN.r * 0.95, BIN.r * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  const bw = BIN.r * 1.5, bh = BIN.r * 1.7;
  const bx = BIN.x - bw / 2, by = BIN.y - bh / 2;
  const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  grad.addColorStop(0, '#5a6a77');
  grad.addColorStop(0.45, '#86969f');
  grad.addColorStop(1, '#5a6a77');
  rr(bx, by, bw, bh, 10);
  ctx.fillStyle = grad;
  ctx.fill();

  rr(bx - 5, by - 9, bw + 10, 15, 7);
  ctx.fillStyle = '#3f4d59';
  ctx.fill();

  rr(BIN.x - 9, by - 17, 18, 9, 4);
  ctx.fillStyle = '#2f3b45';
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,.5)';
  rr(bx + 8, by + bh * 0.34, bw - 16, 4, 2); ctx.fill();
  rr(bx + 13, by + bh * 0.52, bw - 26, 4, 2); ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.strokeText('垃圾桶', BIN.x, by - 30);
  ctx.fillStyle = '#5b6a76';
  ctx.fillText('垃圾桶', BIN.x, by - 30);
}

function drawGarbageItem(g) {
  const t = g.type;
  const wob = Math.sin(performance.now() / 420 + g.bob) * 1.2;
  const x = g.x, y = g.y + wob;

  ctx.fillStyle = 'rgba(20,40,30,.12)';
  ctx.beginPath();
  ctx.ellipse(x, g.y + 7, 9, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(g.rot);

  if (t.n === 'bottle') {
    rr(-5, -6, 10, 13, 3); ctx.fillStyle = t.c1; ctx.fill();
    ctx.fillStyle = t.c2; rr(-5, -6, 10, 4, 3); ctx.fill();
    rr(-2.5, -10, 5, 5, 2); ctx.fillStyle = t.c2; ctx.fill();
  } else if (t.n === 'paper') {
    rr(-8, -6, 16, 12, 2); ctx.fillStyle = t.c1; ctx.fill();
    ctx.strokeStyle = t.c2; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-5, -2); ctx.lineTo(2, -2);
    ctx.moveTo(-5, 2); ctx.lineTo(4, 2);
    ctx.stroke();
  } else if (t.n === 'peel') {
    ctx.beginPath();
    ctx.arc(0, 1, 8, Math.PI * 1.05, Math.PI * 1.95);
    ctx.arc(0, 4, 6, Math.PI * 1.95, Math.PI * 1.05, true);
    ctx.closePath();
    ctx.fillStyle = t.c1; ctx.fill();
    ctx.strokeStyle = t.c2; ctx.lineWidth = 1.6; ctx.stroke();
  } else if (t.n === 'can') {
    rr(-5, -7, 10, 14, 2.5); ctx.fillStyle = t.c1; ctx.fill();
    ctx.fillStyle = t.c2;
    ctx.fillRect(-5, -4, 10, 2.5);
    ctx.beginPath(); ctx.ellipse(0, -7, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    rr(-6.5, -6, 13, 12, 2); ctx.fillStyle = t.c1; ctx.fill();
    ctx.strokeStyle = t.c2; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-2, -6); ctx.lineTo(-4, -9);
    ctx.moveTo(2, -6); ctx.lineTo(4, -9);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPerson(p, body, hat, isPlayer) {
  const bobY = Math.sin(p.bob) * 1.7;
  const x = p.x, y = p.y + bobY, r = p.r;

  ctx.fillStyle = 'rgba(20,40,30,.13)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + r * 0.98, r * 0.95, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  /* 身体 */
  ctx.fillStyle = body;
  rr(x - r * 0.72, y - r * 0.22, r * 1.44, r * 1.28, r * 0.5);
  ctx.fill();

  /* 反光条（环卫工特点） */
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  rr(x - r * 0.62, y + r * 0.22, r * 1.24, r * 0.14, r * 0.07);
  ctx.fill();

  /* 头 */
  ctx.fillStyle = '#f7d3b2';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.95, r * 0.62, 0, Math.PI * 2);
  ctx.fill();

  /* 帽子 */
  ctx.fillStyle = hat;
  ctx.beginPath();
  ctx.arc(x, y - r * 1.0, r * 0.64, Math.PI, Math.PI * 2);
  ctx.fill();
  rr(x - r * 0.82, y - r * 1.12, r * 1.64, r * 0.2, r * 0.1);
  ctx.fill();

  /* 眼睛（朝移动方向偏一点） */
  const ex = (p.dirx || 0) * r * 0.16, ey = (p.diry || 0) * r * 0.12;
  ctx.fillStyle = '#2b3440';
  ctx.beginPath(); ctx.arc(x - r * 0.22 + ex, y - r * 0.9 + ey, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.22 + ex, y - r * 0.9 + ey, r * 0.1, 0, Math.PI * 2); ctx.fill();

  /* 背包数量 */
  if (p.bag && p.bag.length) {
    const full = p.bag.length >= CAP;
    ctx.fillStyle = full ? '#ff5c5c' : (isPlayer ? C_PLAYER : C_GREEN);
    rr(x - 11, y - r * 2.35, 22, 17, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.bag.length + '', x, y - r * 2.35 + 9);
  }
}

function drawHUD() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, HUD_H);
  ctx.fillStyle = 'rgba(30,50,40,.08)';
  ctx.fillRect(0, HUD_H - 2, W, 2);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  /* 分数 */
  ctx.fillStyle = '#7b8894'; ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('分数', 20, 19);
  ctx.fillStyle = '#1f9d55'; ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(score + ' / ' + TARGET, 20, 39);

  /* 背包 */
  ctx.fillStyle = '#7b8894'; ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('背包', 165, 19);
  for (let i = 0; i < CAP; i++) {
    const sx = 165 + i * 27, sy = 28, s = 22;
    if (i < (player.bag.length || 0)) {
      const t = player.bag[i];
      rr(sx, sy, s, s, 6);
      ctx.fillStyle = t.c1; ctx.fill();
      ctx.strokeStyle = t.c2; ctx.lineWidth = 2; ctx.stroke();
    } else {
      rr(sx, sy, s, s, 6);
      ctx.fillStyle = '#f1f4f6'; ctx.fill();
      ctx.strokeStyle = '#dde4e9'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  /* 同伴数 */
  const greens = npcs.filter(n => n.kind === 'green').length;
  ctx.fillStyle = '#7b8894'; ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('同伴', 330, 19);
  ctx.fillStyle = '#3ddc84'; ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(greens + '', 330, 39);

  /* 脏乱度 */
  const t = Math.min(garbage.length / MAX_DIRT, 1);
  ctx.fillStyle = '#7b8894'; ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('脏乱度', 400, 19);
  rr(400, 28, 250, 20, 10);
  ctx.fillStyle = '#eef1f4'; ctx.fill();
  if (t > 0) {
    rr(400, 28, Math.max(250 * t, 12), 20, 10);
    ctx.fillStyle = 'hsl(' + (128 - 128 * t) + ',72%,' + (52 - 6 * t) + '%)';
    ctx.fill();
  }
  ctx.strokeStyle = '#e2e8ec'; ctx.lineWidth = 1.5;
  rr(400, 28, 250, 20, 10); ctx.stroke();
  ctx.fillStyle = t > 0.8 ? '#e74c3c' : '#5b6a76';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(garbage.length + ' / ' + MAX_DIRT, 662, 39);

  /* 时间 */
  const m = Math.floor(elapsed / 60), s = Math.floor(elapsed % 60);
  ctx.fillStyle = '#7b8894'; ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('时间', 770, 19);
  ctx.fillStyle = '#2b3440'; ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText((m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s), 770, 39);

  /* 当前难度 */
  const dl = '难度 ' + DIFFS[DIFF].label;
  ctx.textAlign = 'right';
  ctx.font = 'bold 12px system-ui, sans-serif';
  const dw = ctx.measureText(dl).width;
  rr(940 - dw - 18, 8, dw + 18, 20, 10);
  ctx.fillStyle = '#eaf6ee'; ctx.fill();
  ctx.strokeStyle = '#cfe6d8'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#2f8f5b';
  ctx.fillText(dl, 931, 18.5);

  /* 当前操作方式（这枚胶囊可以点，游戏中也能切） */
  const cl = '操作 ' + (CONTROL === 'mouse' ? '鼠标' : '键盘');
  const cr = controlPillRect();
  rr(cr.x, cr.y, cr.w, cr.h, 10);
  ctx.fillStyle = CONTROL === 'mouse' ? '#e9f3ff' : '#fff4e4';
  ctx.fill();
  ctx.strokeStyle = CONTROL === 'mouse' ? '#c9dff5' : '#f0dcc0';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = CONTROL === 'mouse' ? '#2f6fb0' : '#b07a2f';
  ctx.fillText(cl, cr.x + cr.w - 9, cr.y + 10.5);
}

function panel(lines) {
  ctx.fillStyle = 'rgba(12,22,30,.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = H / 2 - (lines.length - 1) * 26;
  for (const l of lines) {
    ctx.font = l.f;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.strokeText(l.t, W / 2, y);
    ctx.fillStyle = l.c;
    ctx.fillText(l.t, W / 2, y);
    y += l.gap || 52;
  }
}

/* ================= 难度按钮（菜单 / 暂停界面可点） ================= */
const DIFF_BTNS = [
  { id: 'easy', label: '休闲' },
  { id: 'normal', label: '标准' },
  { id: 'hard', label: '困难' }
];
const BTN_W = 140, BTN_H = 50, BTN_GAP = 20, BTN_Y = 436;

function btnRect(i) {
  const total = DIFF_BTNS.length * BTN_W + (DIFF_BTNS.length - 1) * BTN_GAP;
  const x0 = (W - total) / 2;
  return { x: x0 + i * (BTN_W + BTN_GAP), y: BTN_Y, w: BTN_W, h: BTN_H };
}

function hitButton(x, y) {
  for (let i = 0; i < DIFF_BTNS.length; i++) {
    const r = btnRect(i);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

function diffButtonsInfo() {
  return DIFF_BTNS.map((b, i) => {
    const r = btnRect(i);
    return { id: b.id, label: b.label, x: r.x, y: r.y, w: r.w, h: r.h, selected: b.id === DIFF };
  });
}

function drawDifficultyButtons() {
  const hv = mouse.active ? hitButton(mouse.x, mouse.y) : -1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  DIFF_BTNS.forEach((b, i) => {
    const r = btnRect(i);
    const sel = b.id === DIFF;
    rr(r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = sel ? '#3ddc84' : (hv === i ? 'rgba(255,255,255,.30)' : 'rgba(255,255,255,.10)');
    ctx.fill();
    ctx.strokeStyle = sel ? '#3ddc84' : 'rgba(255,255,255,.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = sel ? '#0d2b1c' : '#ffffff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(b.label, r.x + r.w / 2, r.y + 17);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = sel ? 'rgba(13,43,28,.75)' : 'rgba(255,255,255,.72)';
    ctx.fillText(DIFFS[b.id].desc, r.x + r.w / 2, r.y + 37);
  });
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('点难度按钮直接开局 · 当前：' + DIFFS[DIFF].label + '（' + DIFFS[DIFF].desc + '）',
    W / 2, BTN_Y + BTN_H + 16);
}

/* ================= 操作方式按钮（鼠标 / 键盘） ================= */
const CTRL_BTNS = [
  { id: 'mouse', label: '鼠标控制' },
  { id: 'keyboard', label: '键盘控制' }
];
const CTRL_W = 150, CTRL_H = 40, CTRL_GAP = 16, CTRL_Y = 516;

function ctrlBtnRect(i) {
  const total = CTRL_BTNS.length * CTRL_W + (CTRL_BTNS.length - 1) * CTRL_GAP;
  const x0 = (W - total) / 2;
  return { x: x0 + i * (CTRL_W + CTRL_GAP), y: CTRL_Y, w: CTRL_W, h: CTRL_H };
}
function hitControlButton(x, y) {
  for (let i = 0; i < CTRL_BTNS.length; i++) {
    const r = ctrlBtnRect(i);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}
function controlButtonsInfo() {
  return CTRL_BTNS.map((b, i) => {
    const r = ctrlBtnRect(i);
    return { id: b.id, label: b.label, x: r.x, y: r.y, w: r.w, h: r.h, selected: b.id === CONTROL };
  });
}

/* HUD 右上角那枚能点的小胶囊（游戏中也能切） */
function controlPillRect() {
  ctx.font = 'bold 12px system-ui, sans-serif';
  const w = ctx.measureText('操作 键盘').width + 18;
  return { x: 940 - w, y: 30, w: w, h: 20 };
}
function hitControlPill(x, y) {
  const r = controlPillRect();
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function drawControlButtons() {
  const hv = mouse.active ? hitControlButton(mouse.x, mouse.y) : -1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  CTRL_BTNS.forEach((b, i) => {
    const r = ctrlBtnRect(i);
    const sel = b.id === CONTROL;
    rr(r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = sel ? '#2fa8ff' : (hv === i ? 'rgba(255,255,255,.30)' : 'rgba(255,255,255,.10)');
    ctx.fill();
    ctx.strokeStyle = sel ? '#2fa8ff' : 'rgba(255,255,255,.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = sel ? '#062033' : '#ffffff';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(b.label, r.x + r.w / 2, r.y + r.h / 2);
  });
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('M 键也能随时切换操作方式 · P 暂停 · R 重开', W / 2, CTRL_Y + CTRL_H + 22);
}

function drawMouseTarget() {
  if (CONTROL !== 'mouse' || !MOUSE_FOLLOW || !mouse.active || state === 'menu') return;
  const x = clamp(mouse.x, FIELD.x + 6, FR - 6);
  const y = clamp(mouse.y, FIELD.y + 6, FB - 6);
  const t = 0.5 + 0.5 * Math.sin(performance.now() / 300);
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.25 * t;
  ctx.strokeStyle = '#2fa8ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 9 + t * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#2fa8ff';
  ctx.fill();
  ctx.restore();
}

function draw() {
  drawField();
  drawBin();
  drawMouseTarget();
  for (const g of garbage) drawGarbageItem(g);

  /* 按 y 排序做前后遮挡 */
  const people = npcs.concat([player]).sort((a, b) => a.y - b.y);
  for (const p of people) {
    if (p.kind === 'player') drawPerson(p, C_PLAYER, C_HAT_P, true);
    else if (p.kind === 'green') drawPerson(p, C_GREEN, C_HAT_GR, false);
    else drawPerson(p, C_GRAY, C_HAT_G, false);
  }

  drawParticles();
  drawFloats();
  drawHUD();

  if (state === 'menu') {
    panel([
      { t: '环卫小卫士', f: 'bold 54px system-ui, sans-serif', c: '#ffffff', gap: 62 },
      { t: '鼠标移到哪，小人就走到哪（也可以切成键盘控制）', f: '20px system-ui, sans-serif', c: '#cfe9d8', gap: 34 },
      { t: '捡垃圾装满背包（5 件）→ 送到中间的垃圾桶，每件 1 分', f: '19px system-ui, sans-serif', c: '#cfe9d8', gap: 34 },
      { t: '灰色小人随手丢垃圾，追上碰到他 → 感化成同伴帮你扫街', f: '19px system-ui, sans-serif', c: '#cfe9d8', gap: 34 },
      { t: '目标 ' + TARGET + ' 分通关 · 地图垃圾满 ' + MAX_DIRT + ' 件失败', f: '19px system-ui, sans-serif', c: '#ffd76a', gap: 52 },
      { t: '按 空格 或 点一下鼠标 开始', f: 'bold 26px system-ui, sans-serif', c: '#3ddc84', gap: 40 }
    ]);
  } else if (state === 'pause') {
    panel([
      { t: '暂停', f: 'bold 48px system-ui, sans-serif', c: '#ffffff', gap: 56 },
      { t: '按 P 继续 · 按 R 重开', f: '20px system-ui, sans-serif', c: '#cfe9d8', gap: 40 },
      { t: '点下面的难度按钮 = 换难度重新开局', f: '16px system-ui, sans-serif', c: '#9fb8c9' }
    ]);
  } else if (state === 'win') {
    panel([
      { t: '通关！街区干净了', f: 'bold 46px system-ui, sans-serif', c: '#3ddc84', gap: 58 },
      { t: DIFFS[DIFF].label + '难度 · 得分 ' + score + ' · 用时 ' + elapsed.toFixed(1) + ' 秒 · 带出 ' + npcs.filter(n => n.kind === 'green').length + ' 名同伴',
        f: '22px system-ui, sans-serif', c: '#ffffff', gap: 50 },
      { t: '按 空格 或 R 再来一局', f: '20px system-ui, sans-serif', c: '#ffd76a' }
    ]);
  } else if (state === 'lose') {
    panel([
      { t: '城市太脏了…', f: 'bold 48px system-ui, sans-serif', c: '#ff6b6b', gap: 58 },
      { t: DIFFS[DIFF].label + '难度 · 得分 ' + score + ' · 坚持 ' + elapsed.toFixed(1) + ' 秒 · 垃圾堆到 ' + garbage.length + ' 件',
        f: '22px system-ui, sans-serif', c: '#ffffff', gap: 50 },
      { t: '下次先追灰色小人，让他们一起干', f: '19px system-ui, sans-serif', c: '#cfe9d8', gap: 44 },
      { t: '按 空格 或 R 再来一局', f: '20px system-ui, sans-serif', c: '#ffd76a' }
    ]);
  }

  if (state === 'menu' || state === 'pause') {
    drawDifficultyButtons();
    drawControlButtons();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloats() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of floats) {
    ctx.globalAlpha = Math.max(0, f.life / f.max);
    ctx.font = 'bold ' + Math.round(16 * f.scale) + 'px system-ui, sans-serif';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(255,255,255,.92)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

/* ============================= 输入 ============================= */
function onKeyDown(e) {
  const k = e.key;
  if (k.indexOf('Arrow') === 0 || k === ' ') e.preventDefault();
  keys[k] = true;
  keys[k.toLowerCase()] = true;

  /* M 键：随时切换鼠标 / 键盘操作 */
  if (k === 'm' || k === 'M') { toggleControl(); return; }

  /* 1 / 2 / 3：在菜单或暂停界面直接选难度开局 */
  if ((state === 'menu' || state === 'pause') && (k === '1' || k === '2' || k === '3')) {
    setDifficulty(['easy', 'normal', 'hard'][Number(k) - 1]);
    reset();
    return;
  }

  if (state === 'menu') {
    if (k === ' ' || k === 'Enter') reset();
    return;
  }
  if (k === 'p' || k === 'P') {
    if (state === 'play') state = 'pause';
    else if (state === 'pause') state = 'play';
    return;
  }
  if ((state === 'win' || state === 'lose') && (k === ' ' || k === 'Enter')) { reset(); return; }
  if (k === 'r' || k === 'R') {
    if (state === 'pause' || state === 'win' || state === 'lose') reset();
  }
}
function onKeyUp(e) {
  keys[e.key] = false;
  keys[e.key.toLowerCase()] = false;
}

/* 鼠标 / 触摸：屏幕坐标要换算成画布逻辑坐标（画布是等比缩放的） */
function setMouseFromEvent(e) {
  const rect = cv.getBoundingClientRect();
  if (!rect || !rect.width || !rect.height) return;
  mouse.x = (e.clientX - rect.left) * (W / rect.width);
  mouse.y = (e.clientY - rect.top) * (H / rect.height);
  mouse.active = true;
}
function setMouseFromTouch(e) {
  if (!e.touches || !e.touches.length) return;
  setMouseFromEvent(e.touches[0]);
  if (e.preventDefault) e.preventDefault();
}

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('mousemove', setMouseFromEvent);
window.addEventListener('mousedown', function (e) {
  setMouseFromEvent(e);

  /* 操作方式：菜单/暂停的大按钮，以及 HUD 上的小胶囊（任何界面都能切） */
  if (state === 'menu' || state === 'pause') {
    const ci = hitControlButton(mouse.x, mouse.y);
    if (ci >= 0) { setControl(CTRL_BTNS[ci].id); return; }
  }
  if (hitControlPill(mouse.x, mouse.y)) { toggleControl(); return; }

  /* 菜单 / 暂停界面：点难度按钮 = 换难度并直接开局 */
  const hit = hitButton(mouse.x, mouse.y);
  if ((state === 'menu' || state === 'pause') && hit >= 0) {
    setDifficulty(DIFF_BTNS[hit].id);
    reset();
    return;
  }
  if (state === 'menu') { reset(); return; }
  if (state === 'win' || state === 'lose') { reset(); return; }
  if (state === 'pause') { state = 'play'; return; }
});
window.addEventListener('touchstart', setMouseFromTouch, { passive: false });
window.addEventListener('touchmove', setMouseFromTouch, { passive: false });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

/* ============================= 主循环 ============================= */
let last = 0;
let frames = 0;
let loopErrors = 0;

function loop(ts) {
  if (!last) last = ts;
  let dt = (ts - last) / 1000;
  last = ts;
  dt = Math.min(dt, 0.05);              // 切标签页回来别跳帧
  frames++;

  /* 单帧出错不能让整个主循环死掉（否则画面永远停住，谁都看不出来为什么） */
  try {
    updateParticles(dt);
    updateFloats(dt);
    if (state === 'play') tick(dt);
    draw();
  } catch (err) {
    loopErrors++;
    if (loopErrors <= 3) console.error('[环卫小卫士] 渲染出错：', err);
  }

  requestAnimationFrame(loop);
}

/* 进菜单之前就把场景建好：player 一旦是 null，draw() 会在第一帧就炸掉 */
initWorld();
state = 'menu';
requestAnimationFrame(loop);

/* ============================= 调试接口 ============================= */
window.SG = {
  reset,
  tick,
  step(n) { for (let i = 0; i < (n || 1); i++) if (state === 'play') tick(1 / 60); },
  state() { return state; },
  setState(s) { state = s; },
  score() { return score; },
  dirt() { return garbage.length; },
  bag() { return player.bag.length; },
  npcs() { return npcs.map(n => ({ kind: n.kind, x: n.x, y: n.y, bag: n.bag.length })); },
  frames() { return frames; },
  errors() { return loopErrors; },
  mouse() { return { x: mouse.x, y: mouse.y, active: mouse.active }; },
  setMouse(x, y) { mouse.x = x; mouse.y = y; mouse.active = true; },
  clearMouse() { mouse.active = false; },
  difficulty() { return DIFF; },
  setDifficulty(id) { setDifficulty(id); },
  control() { return CONTROL; },
  setControl(id) { setControl(id); },
  toggleControl() { toggleControl(); },
  controlButtons() { return controlButtonsInfo(); },
  controlPill() { const r = controlPillRect(); return { x: r.x, y: r.y, w: r.w, h: r.h, mode: CONTROL }; },
  diffButtons() { return diffButtonsInfo(); },
  target() { return TARGET; },
  maxDirt() { return MAX_DIRT; },
  startNpc() { return START_NPC; },
  presets() { return DIFFS; },
  player() { return player; },
  garbageList() { return garbage.map(g => ({ id: g.id, x: g.x, y: g.y })); },
  bin: BIN,
  consts: { W, H, CAP, TARGET, MAX_DIRT, FIELD, FR, FB, PICK_R }
};
