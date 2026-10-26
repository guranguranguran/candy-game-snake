/* 核心规则测试用例：Node 无头 与 浏览器 都能跑 */
(function () {
  const results = [];
  function ok(name, cond, info) {
    results.push({ ok: !!cond, name, info: info === undefined ? '' : String(info) });
  }

  /* 统一的按键模拟：Node 走桩件监听器，浏览器走真实事件 */
  function press(k) {
    if (typeof __listeners !== 'undefined' && __listeners.keydown) {
      __listeners.keydown.forEach(f => f({ key: k, preventDefault() {} }));
    } else {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    }
  }
  function release(k) {
    if (typeof __listeners !== 'undefined' && __listeners.keyup) {
      __listeners.keyup.forEach(f => f({ key: k, preventDefault() {} }));
    } else {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
    }
  }
  /* 鼠标事件：Node 走桩件监听器，浏览器走真实 MouseEvent */
  function dispatchMouse(cx, cy) {
    if (typeof __listeners !== 'undefined' && __listeners.mousemove) {
      __listeners.mousemove.forEach(f => f({ clientX: cx, clientY: cy, preventDefault() {} }));
    } else {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: cx, clientY: cy, bubbles: true }));
    }
  }
  function dispatchMouseDown(cx, cy) {
    if (typeof __listeners !== 'undefined' && __listeners.mousedown) {
      __listeners.mousedown.forEach(f => f({ clientX: cx, clientY: cy, preventDefault() {} }));
    } else {
      window.dispatchEvent(new MouseEvent('mousedown', { clientX: cx, clientY: cy, bubbles: true }));
    }
  }
  const P = () => SG.player();
  const tp = (x, y) => { const p = P(); p.x = x; p.y = y; };
  const clean = () => { release('ArrowLeft'); release('ArrowRight'); release('ArrowUp'); release('ArrowDown'); };

  /* ---------- T1 加载 ---------- */
  ok('T1 游戏脚本加载成功', typeof SG === 'object' && SG !== null);
  ok('T1b 初始为菜单状态', SG.state() === 'menu', SG.state());
  ok('T1c 加载后场景已就绪（player 不是 null，否则首帧绘制会炸）', !!SG.player());
  /* 逻辑用例统一在「休闲」难度下跑，保证数值稳定；难度本身在 T20~T24 单独测 */
  SG.setDifficulty('easy');

  /* ---------- T2 空格开始 ---------- */
  press(' ');
  release(' ');
  ok('T2 按空格进入游戏中', SG.state() === 'play', SG.state());
  ok('T2b 开局垃圾数 = 8', SG.dirt() === 8, SG.dirt());
  ok('T2c 开局灰色小人 = 3', SG.npcs().filter(n => n.kind === 'gray').length === 3,
    JSON.stringify(SG.npcs().map(n => n.kind)));

  /* ---------- T3 方向键移动 ---------- */
  const x0 = P().x, y0 = P().y;
  press('ArrowRight'); SG.step(60); release('ArrowRight');
  const dx = P().x - x0;
  ok('T3 按右 1 秒向右移动约 240px', dx > 225 && dx < 255, 'dx=' + dx.toFixed(1));

  const y1 = P().y;
  press('ArrowUp'); SG.step(60); release('ArrowUp');
  const dy = P().y - y1;
  ok('T3b 按上 1 秒向上移动约 240px', dy < -225 && dy > -255, 'dy=' + dy.toFixed(1));

  /* 边界夹取 */
  press('ArrowUp'); SG.step(240); release('ArrowUp');
  const F = SG.consts;
  ok('T3c 不会走出场地边界', P().y >= F.FIELD.y && P().x >= F.FIELD.x && P().x <= F.FR,
    'x=' + P().x.toFixed(0) + ' y=' + P().y.toFixed(0));

  /* ---------- T4 捡垃圾 ---------- */
  const bagBefore = SG.bag();
  const g0 = SG.garbageList()[0];
  tp(g0.x, g0.y);
  SG.tick(1 / 60);
  ok('T4 踩到垃圾自动捡起', SG.bag() > bagBefore && SG.bag() <= 5,
    bagBefore + ' -> ' + SG.bag());

  /* 装满 5 件 */
  for (let i = 0; i < 8 && SG.bag() < 5; i++) {
    const list = SG.garbageList();
    let found = false;
    for (const g of list) {
      tp(g.x, g.y);
      SG.tick(1 / 60);
      if (SG.bag() >= 5) { found = true; break; }
    }
    if (found) break;
  }
  ok('T4b 背包最多装 5 件', SG.bag() === 5, 'bag=' + SG.bag());

  /* ---------- T5 满了不能再捡 ---------- */
  const list5 = SG.garbageList();
  const gid = list5[0].id;
  tp(list5[0].x, list5[0].y);
  SG.tick(1 / 60);
  const stillThere = SG.garbageList().some(g => g.id === gid);
  ok('T5 背包满时捡不起来（那件垃圾还在原地）', SG.bag() === 5 && stillThere,
    'bag=' + SG.bag() + ' 垃圾还在=' + stillThere);

  /* ---------- T6 送到垃圾桶得分 ---------- */
  const s0 = SG.score();
  tp(SG.bin.x, SG.bin.y);
  SG.tick(1 / 60);
  ok('T6 走到垃圾桶旁自动倒垃圾，5 件得 5 分', SG.score() - s0 === 5, '+' + (SG.score() - s0) + ' 分');
  ok('T6b 倒完背包清空', SG.bag() === 0, 'bag=' + SG.bag());

  /* ---------- T7 碰到灰人感化 ---------- */
  const gray = SG.npcs().find(n => n.kind === 'gray');
  ok('T7 场上有灰色小人', !!gray);
  tp(gray.x, gray.y);
  SG.tick(1 / 60);
  const greenAfter = SG.npcs().filter(n => n.kind === 'green').length;
  ok('T7b 碰到灰色小人后变成同伴', greenAfter >= 1, '同伴数=' + greenAfter);

  /* ---------- T8 同伴会自动干活 ---------- */
  const s1 = SG.score(), d1 = SG.dirt();
  SG.step(1800);   // 30 秒
  ok('T8 同伴自动捡垃圾并送桶得分', SG.score() > s1, '30 秒 ' + s1 + ' -> ' + SG.score() + ' 分');
  ok('T8b 同伴干活时场上垃圾不会爆掉', SG.state() !== 'lose', 'dirt ' + d1 + ' -> ' + SG.dirt() + ' state=' + SG.state());

  /* ---------- T9 通关判定 ---------- */
  SG.reset();
  let guard = 0;
  while (SG.state() === 'play' && guard++ < 6000) {
    const list = SG.garbageList();
    if (!list.length) { SG.step(30); continue; }
    tp(list[0].x, list[0].y);
    SG.tick(1 / 60);
    if (SG.bag() >= 5) { tp(SG.bin.x, SG.bin.y); SG.tick(1 / 60); }
  }
  ok('T9 分数达到目标分判定通关', SG.state() === 'win' && SG.score() >= SG.target(),
    'state=' + SG.state() + ' score=' + SG.score() + ' / 目标 ' + SG.target());

  /* ---------- T10 失败判定 ---------- */
  SG.reset();
  clean();
  tp(SG.consts.FIELD.x + 22, SG.consts.FIELD.y + 22);   // 小人躲角落摆烂
  let t = 0, maxDirt = 0;
  while (SG.state() === 'play' && t++ < 15000) {
    SG.tick(1 / 60);
    if (SG.dirt() > maxDirt) maxDirt = SG.dirt();
  }
  ok('T10 垃圾堆到 45 件判定失败', SG.state() === 'lose',
    'state=' + SG.state() + ' 最高脏乱度=' + maxDirt + ' 耗时=' + (t / 60).toFixed(0) + 's');

  /* ---------- T11 暂停 ---------- */
  SG.reset();
  press('p'); release('p');
  const pausedState = SG.state();
  press('p'); release('p');
  ok('T11 P 键暂停/继续', pausedState === 'pause' && SG.state() === 'play',
    pausedState + ' -> ' + SG.state());

  /* ---------- T12~T16 鼠标控制 ---------- */
  SG.reset();
  clean();
  SG.clearMouse();
  const pm = P();

  SG.setMouse(900, 120);                       // 指到右上角远处
  const dm0 = Math.hypot(pm.x - 900, pm.y - 120);
  SG.step(60);
  const dm1 = Math.hypot(pm.x - 900, pm.y - 120);
  ok('T12 鼠标指到哪小人就朝哪走（1 秒靠近约 240px）', dm0 - dm1 > 200 && dm0 - dm1 < 260,
    '距离 ' + dm0.toFixed(0) + ' -> ' + dm1.toFixed(0));

  SG.setMouse(400, 300);
  SG.step(600);                                // 10 秒足够走到
  const dm2 = Math.hypot(pm.x - 400, pm.y - 300);
  ok('T13 走到鼠标位置后停下来', dm2 <= 8, '残余距离=' + dm2.toFixed(1));
  const xStill = pm.x, yStill = pm.y;
  SG.step(60);
  ok('T13b 到了之后不会来回抖', Math.hypot(pm.x - xStill, pm.y - yStill) < 2,
    '1 秒漂移=' + Math.hypot(pm.x - xStill, pm.y - yStill).toFixed(2));

  SG.setMouse(940, 300);                       // 鼠标指着右边
  const xKey = pm.x;
  press('ArrowLeft'); SG.step(30); release('ArrowLeft');
  ok('T14 按方向键时以键盘为准，不会被鼠标拽回去', pm.x < xKey - 100,
    xKey.toFixed(0) + ' -> ' + pm.x.toFixed(0));

  SG.clearMouse();
  const cvEl = document.getElementById('cv');
  const rc = (cvEl && cvEl.getBoundingClientRect) ? cvEl.getBoundingClientRect() : null;
  if (rc && rc.width > 0 && rc.height > 0) {
    dispatchMouse(rc.left + rc.width / 2, rc.top + rc.height / 2);
    const mm = SG.mouse();
    ok('T15 鼠标坐标换算正确（画布等比缩放后仍指向画布中心）',
      Math.abs(mm.x - 480) < 2 && Math.abs(mm.y - 320) < 2,
      '换算得到 ' + mm.x.toFixed(1) + ',' + mm.y.toFixed(1));
  } else {
    ok('T15 鼠标坐标换算（拿不到画布尺寸，跳过）', true);
  }

  SG.setState('menu');
  dispatchMouseDown(SG.consts.W / 2, SG.consts.H / 2);
  ok('T16 菜单界面点一下鼠标就能开始', SG.state() === 'play', 'state=' + SG.state());
  SG.clearMouse();

  /* ---------- T20~T24 难度级别 ---------- */
  function toClient(lx, ly) {
    const el = document.getElementById('cv');
    const r = (el && el.getBoundingClientRect) ? el.getBoundingClientRect() : null;
    if (!r || !r.width) return { x: lx, y: ly };
    return { x: r.left + lx * (r.width / SG.consts.W), y: r.top + ly * (r.height / SG.consts.H) };
  }

  SG.setDifficulty('easy'); SG.reset();
  const nEasy = SG.npcs().filter(n => n.kind === 'gray').length;
  const tEasy = SG.target(), dEasy = SG.maxDirt();
  SG.setDifficulty('normal'); SG.reset();
  const nNormal = SG.npcs().filter(n => n.kind === 'gray').length;
  SG.setDifficulty('hard'); SG.reset();
  const nHard = SG.npcs().filter(n => n.kind === 'gray').length;
  const tHard = SG.target(), dHard = SG.maxDirt();
  ok('T20 开局灰色小人数随难度递增（休闲3 / 标准6 / 困难9）',
    nEasy === 3 && nNormal === 6 && nHard === 9, nEasy + ' / ' + nNormal + ' / ' + nHard);
  ok('T20b 目标分数与失败线也随难度变化',
    tEasy === 120 && tHard === 200 && dEasy === 50 && dHard === 40,
    '目标 ' + tEasy + '→' + tHard + ' · 失败线 ' + dEasy + '→' + dHard);

  /* 同样 15 秒不干活，比垃圾长了多少 */
  function idleDirt(id) {
    SG.setDifficulty(id); SG.reset(); SG.clearMouse();
    const pp = SG.player();
    pp.x = SG.consts.FIELD.x + 22; pp.y = SG.consts.FIELD.y + 22;
    SG.step(900);
    return SG.dirt();
  }
  const dirtEasy = idleDirt('easy');
  const dirtNormal = idleDirt('normal');
  ok('T21 标准难度垃圾产生明显快于休闲（同样 15 秒不干活）',
    dirtNormal > dirtEasy + 6, '休闲 ' + dirtEasy + ' 件 vs 标准 ' + dirtNormal + ' 件');

  SG.setDifficulty('normal'); SG.reset(); SG.setState('menu');
  const btns = SG.diffButtons();
  ok('T21b 三个难度按钮齐全', btns.length === 3 && btns[0].id === 'easy' && btns[2].id === 'hard',
    btns.map(b => b.label).join(' '));

  const bHard = btns.find(b => b.id === 'hard');
  const pHard = toClient(bHard.x + bHard.w / 2, bHard.y + bHard.h / 2);
  dispatchMouseDown(pHard.x, pHard.y);
  ok('T22 点「困难」按钮 = 切到困难并直接开局',
    SG.difficulty() === 'hard' && SG.state() === 'play' && SG.startNpc() === 9,
    '难度=' + SG.difficulty() + ' 状态=' + SG.state() + ' 开局灰人=' + SG.startNpc());

  const bEasy = SG.diffButtons().find(b => b.id === 'easy');
  const sBefore = SG.score(), stBefore = SG.state();
  const pEasy = toClient(bEasy.x + 5, bEasy.y + 5);
  dispatchMouseDown(pEasy.x, pEasy.y);
  ok('T23 游戏进行中点难度按钮不会打断当前局',
    SG.state() === stBefore && SG.difficulty() === 'hard' && SG.score() === sBefore,
    '难度=' + SG.difficulty() + ' 状态=' + SG.state());

  SG.setState('pause');
  const pEasy2 = toClient(bEasy.x + bEasy.w / 2, bEasy.y + bEasy.h / 2);
  dispatchMouseDown(pEasy2.x, pEasy2.y);
  ok('T24 暂停界面点难度按钮 = 换难度重开',
    SG.difficulty() === 'easy' && SG.state() === 'play' && SG.startNpc() === 3,
    '难度=' + SG.difficulty() + ' 状态=' + SG.state() + ' 开局灰人=' + SG.startNpc());
  SG.clearMouse();

  /* ---------- T25~T29 操作方式切换（鼠标 / 键盘） ---------- */
  SG.setDifficulty('easy');
  SG.reset();
  SG.setControl('mouse');
  SG.clearMouse();
  const pc = SG.player();
  ok('T25 默认是鼠标控制', SG.control() === 'mouse', SG.control());

  SG.setMouse(900, 120);
  const cm0 = Math.hypot(pc.x - 900, pc.y - 120);
  SG.step(60);
  const cm1 = Math.hypot(pc.x - 900, pc.y - 120);
  ok('T25b 鼠标模式：小人跟着鼠标走', cm0 - cm1 > 200,
    '距离 ' + cm0.toFixed(0) + ' -> ' + cm1.toFixed(0));

  press('m'); release('m');
  ok('T26 M 键切到键盘模式', SG.control() === 'keyboard', SG.control());

  SG.setMouse(200, 560);                      // 鼠标指到左下角
  const kx = pc.x, ky = pc.y;
  SG.step(90);                                // 1.5 秒
  const drift = Math.hypot(pc.x - kx, pc.y - ky);
  ok('T27 键盘模式：鼠标指哪都不影响小人', drift < 2, '位移=' + drift.toFixed(2));

  press('ArrowRight'); SG.step(30); release('ArrowRight');
  ok('T28 键盘模式：方向键照常能走', pc.x > kx + 100, kx.toFixed(0) + ' -> ' + pc.x.toFixed(0));

  const pill = SG.controlPill();
  const pPill = toClient(pill.x + pill.w / 2, pill.y + pill.h / 2);
  dispatchMouseDown(pPill.x, pPill.y);
  ok('T29 点 HUD 上的操作胶囊切回鼠标（不打断当前局）',
    SG.control() === 'mouse' && SG.state() === 'play',
    '模式=' + SG.control() + ' 状态=' + SG.state());

  SG.setState('menu');
  const cbtns = SG.controlButtons();
  ok('T29b 菜单里有「鼠标控制 / 键盘控制」两个按钮',
    cbtns.length === 2 && cbtns[0].id === 'mouse' && cbtns[1].id === 'keyboard',
    cbtns.map(b => b.label).join(' '));

  const kb = cbtns.find(b => b.id === 'keyboard');
  const pKb = toClient(kb.x + kb.w / 2, kb.y + kb.h / 2);
  dispatchMouseDown(pKb.x, pKb.y);
  ok('T29c 点「键盘控制」= 只切模式，不会把游戏开起来（停在菜单）',
    SG.control() === 'keyboard' && SG.state() === 'menu',
    '模式=' + SG.control() + ' 状态=' + SG.state());

  const mbtn = SG.controlButtons().find(b => b.id === 'mouse');
  const pMb = toClient(mbtn.x + mbtn.w / 2, mbtn.y + mbtn.h / 2);
  dispatchMouseDown(pMb.x, pMb.y);
  ok('T29d 再点「鼠标控制」切得回来', SG.control() === 'mouse' && SG.state() === 'menu',
    SG.control());

  SG.setState('play');
  SG.setControl('mouse');
  SG.clearMouse();

  /* 输出 + T17~T19 渲染主循环体检（异步，要等真实帧跑起来） */
  function dump(final) {
    const lines = results.map(r => (r.ok ? '[通过] ' : '[失败] ') + r.name + (r.info ? '   (' + r.info + ')' : ''));
    const fails = results.filter(r => !r.ok).length;
    const text = lines.join('\n') + '\n\n结果: ' + (results.length - fails) + '/' + results.length + ' 通过';
    if (typeof document !== 'undefined' && document.body && document.body.appendChild) {
      let pre = document.getElementById('test-results');
      if (!pre || !pre.textContent) {
        pre = document.createElement('pre');
        pre.id = 'test-results';
        document.body.appendChild(pre);
      }
      pre.textContent = text;
    }
    console.log(text);
    if (final && fails) throw new Error(fails + ' 项测试失败');
  }
  dump(false);

  const rAFStub = typeof requestAnimationFrame === 'function' && requestAnimationFrame.__stub === true;
  const f0 = SG.frames();
  let rafCalls = 0;

  /* 无头浏览器里的合成器不会稳定驱动 rAF，所以把 rAF 换成 setTimeout 驱动：
     只要主循环会自我排程，rafCalls 就会持续上涨；卡死在第一帧的循环只会排程 1 次。 */
  if (!rAFStub && typeof window !== 'undefined' && window.requestAnimationFrame) {
    window.requestAnimationFrame = function (cb) {
      rafCalls++;
      return setTimeout(function () { cb(performance.now()); }, 16);
    };
  }

  setTimeout(function () {
    setTimeout(function () {
      const df = SG.frames() - f0;
      if (rAFStub) ok('T17 渲染主循环持续自我排程（Node 无真实帧循环，跳过）', true, 'rAF 是桩件');
      else ok('T17 渲染主循环持续自我排程（没有卡死在第一帧）', rafCalls > 5 && df > 0,
        '新排程 ' + rafCalls + ' 次 · 新增 ' + df + ' 帧');

      ok('T18 渲染过程零报错', SG.errors() === 0, '错误数=' + SG.errors());

      let colors = -1;
      try {
        const cvEl = document.getElementById('cv');
        const c2 = cvEl.getContext('2d');
        const px = c2.getImageData(0, 0, cvEl.width, cvEl.height).data;
        const uniq = new Set();
        for (let i = 0; i < px.length; i += 4 * 97) uniq.add(px[i] + ',' + px[i + 1] + ',' + px[i + 2]);
        colors = uniq.size;
      } catch (e) { colors = -1; }
      if (rAFStub) ok('T19 画布真的画出了内容（Node 无画布，跳过）', true, '桩件画布');
      else ok('T19 画布真的画出了内容（颜色种类 > 20）', colors > 20, '取样颜色种类=' + colors);

      dump(true);
    }, 600);
  }, 50);
})();
