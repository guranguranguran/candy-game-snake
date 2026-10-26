/* 无头测试用的最小 DOM / Canvas 桩件（只在 Node 里加载） */
globalThis.window = globalThis;
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.requestAnimationFrame = function () { return 0; };
globalThis.requestAnimationFrame.__stub = true;   // 标记：Node 里没有真实帧循环

const __listeners = {};
globalThis.__listeners = __listeners;
globalThis.addEventListener = function (type, fn) {
  (__listeners[type] = __listeners[type] || []).push(fn);
};

function makeCtx() {
  const noop = function () {};
  const store = {
    canvas: { width: 960, height: 640 },
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 10 })
  };
  return new Proxy(store, {
    get(t, k) { return k in t ? t[k] : noop; },
    set(t, k, v) { t[k] = v; return true; }
  });
}

const __ctx = makeCtx();
globalThis.document = {
  getElementById: (id) => ({
    id, width: 960, height: 640,
    getContext: () => __ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 640 })
  }),
  createElement: () => ({ style: {}, appendChild() {} }),
  body: { appendChild() {} }
};
