// 端到端冒烟：用桩件跑通 time.html 的整段脚本，抓「变量提升顺序」这类只在真实加载顺序下才犯的错。
// 用法：node _smoke.js
const fs = require('fs');
// 取主脚本块（页面里还有 head 内的主题预置脚本，不能混进来）
const raw = fs.readFileSync('Time.html', 'utf8');
const s0 = raw.indexOf("<script>") + "<script>".length;
const s1 = raw.lastIndexOf("</script>");
const js = raw.slice(raw.indexOf("'use strict'", s0) - 0, s1).replace(/^[\s\S]*?(?='use strict')/, '');

// 万能桩：任何属性访问 / 调用都返回另一个桩；length=0 让 for 循环空转
const stub = () => new Proxy(function () {}, {
  get(t, p) {
    if (p === 'length' || p === 'nodeType') return 0;
    if (p === 'style') return { setProperty() {}, removeProperty() {}, cssText: '' };
    if (p === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
    if (p === 'dataset' || p === 'value' || p === 'innerHTML' || p === 'textContent') return '';
    if (p === Symbol.toPrimitive || p === 'then' || typeof p === 'symbol') return undefined;
    return stub();
  },
  set() { return true; },
  apply() { return stub(); }
});

const SEED = {
  subs: [{ id: 'javase', name: 'Java 基础', color: '#2b6fe0' }, { id: 'en', name: '英语', color: '#3f3f8f' },
         { id: 'algo', name: '算法', color: '#dfa314' }, { id: 'u1', name: '自定义', color: '#16a45c' }],
  days: { '2026-09-01': { sess: [{ sub: 'javase', from: 0, to: 60000 }, { sub: 'en', from: 0, to: 60000 }], evs: [] } },
  active: { sub: 'en', from: 1 },
  beat: 1
};

function run(script) {
  const ls = new Map();
  const localStorage = {
    getItem: k => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => ls.set(k, String(v)),
    removeItem: k => ls.delete(k)
  };
  ls.set('xilu.studyLog', JSON.stringify(SEED));
  // 把内存里的 store 暴露出来：normalize 只在加载时收敛，不落盘
  const probe = script + '\nreturn {subs:store.subs.map(function(s){return s.id;}),' +
    'days:store.days,active:store.active};';
  const mem = new Function('document', 'window', 'localStorage', 'setInterval', 'setTimeout',
    'confirm', 'alert', 'requestAnimationFrame', 'matchMedia', 'navigator', 'location', probe)
    (stub(), stub(), localStorage, () => 0, () => 0, () => true, () => {}, f => f(),
     () => ({ matches: () => false }), { userAgent: 'node' }, { hash: '' });
  return mem;
}

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ' → ' + JSON.stringify(got) + (ok ? '' : ' (期望 ' + JSON.stringify(want) + ')'));
};

const m = run(js);
eq('科目收敛', m.subs, ['interview', 'proj', 'algo', 'tidy']);
eq('时段收敛', m.days['2026-09-01'].sess.map(s => s.sub), ['interview']);
eq('英语计时已清', m.active, null);

// 反向验证：把 SUBJECT_DEFS / SUBJECT_IDS 声明挪到 store=load() 之后，本测试必须报错
// —— 否则它抓不到「声明顺序」这类只在真实加载顺序下才犯的错
const decl = js.match(/var SUBJECT_DEFS=\[[\s\S]*?var SUBJECT_IDS=\{[^}]*\};SUBJECT_DEFS\.forEach\(function\(s\)\{SUBJECT_IDS\[s\.id\]=1;\}\);/)[0];
const broken = js.replace(decl, '').replace('var store=load();', 'var store=load();\n' + decl);
let caught = false;
try { run(broken); } catch (e) { caught = /undefined/.test(e.message); }
eq('测试有效性（坏顺序应抛错）', caught, true);

console.log(fail ? '\n=== ' + fail + ' 项失败 ===' : '\n=== SMOKE PASS ===');
process.exit(fail ? 1 : 0);
