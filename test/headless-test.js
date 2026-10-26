/* Node 无头测试入口：node test/headless-test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const ctx = vm.createContext({ console, setTimeout, clearTimeout });

try {
  vm.runInContext(read('test/shim.js'), ctx, { filename: 'shim.js' });
  vm.runInContext(read('js/game.js'), ctx, { filename: 'game.js' });
  vm.runInContext(read('test/cases.js'), ctx, { filename: 'cases.js' });
} catch (e) {
  console.error('测试中断: ' + e.message);
  process.exitCode = 1;
}
