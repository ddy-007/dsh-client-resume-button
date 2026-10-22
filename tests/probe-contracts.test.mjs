/**
 * `probeContracts` 的契约测试。
 *
 * 自检的作用是：DSH 内部实现改名时，在控制台留一条明确的话，说清是哪条约定变了。
 * 它本身也该被测——否则「有自检」只是说法，没人知道它到底会不会触发、会不会乱刷。
 *
 * 覆盖四件事：
 *   1. 两条约定都在时，不产生任何警告
 *   2. 缺输入框时，警告一次且点名 editor
 *   3. 缺 _primary 按钮时，警告一次且点名 primary
 *   4. 只在文档反复探测时，同一问题不重复警告
 *
 * 边界：这里用桩 DOM，验证的是**探测与警告逻辑**，
 * 不是 DSH 真实 DOM 结构。真实结构只能由运行时确认。
 *
 * 运行：node --test
 *
 * @module client-resume-button/tests/probe-contracts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { loadClient } from './support/load-client.mjs';

const clientPath = fileURLToPath(new URL('../lib/client.js', import.meta.url));

/**
 * 造一个能驱动 probeContracts 的 DOM 桩。
 *
 * probeContracts 现在的读取路径是：
 *   document.querySelector('[contenteditable="true"]')  → editor
 *   沿 editor.parentElement 逐层向上，找 className 含 _card
 *   且其内部含 _primary 按钮的那一层                      → scope
 *   scope.querySelectorAll('button')                    → 确认 _primary
 *
 * 注意这里刻意**不提供 closest**：生产代码不再用它，
 * 如果哪天有人改回去，这些测试会因为桩缺方法而立刻暴露。
 *
 * @param {{ hasEditor?: boolean, hasCard?: boolean, hasPrimary?: boolean }} shape
 */
function makeDocument({ hasEditor = true, hasCard = true, hasPrimary = true } = {}) {
  const buttons = hasPrimary
    ? [{ className: 'abc123_primary', disabled: false }]
    : [{ className: 'abc123_secondary', disabled: false }];

  const scope = {
    className: hasCard ? 'abc123_card' : 'abc123_root',
    querySelectorAll(selector) {
      return selector === 'button' ? buttons : [];
    },
    parentElement: null,
  };

  const editor = {
    className: 'abc123_input',
    querySelectorAll: () => [],
    parentElement: scope,
  };

  return {
    querySelector(selector) {
      if (selector.includes('contenteditable')) return hasEditor ? editor : null;
      return null;
    },
  };
}

/** 装载 client.js，捕获 console.warn 输出。 */
function loadWithDocument(documentStub) {
  const warnings = [];
  const consoleStub = {
    warn: (...args) => warnings.push(args.join(' ')),
    log: () => {},
    error: (...args) => warnings.push(args.join(' ')),
  };
  const client = loadClient(clientPath, { document: documentStub, console: consoleStub });
  return { client, warnings };
}

test('两条约定都在时不产生警告', () => {
  const { client, warnings } = loadWithDocument(makeDocument());
  const ok = client.probeContracts();
  assert.equal(ok, true);
  assert.deepEqual(warnings, [], '结构正常时不应有任何输出');
});

test('缺少输入框时警告一次，并点名 editor', () => {
  const { client, warnings } = loadWithDocument(makeDocument({ hasEditor: false }));
  const ok = client.probeContracts();
  assert.equal(ok, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /contenteditable/);
  assert.match(warnings[0], /client-resume-button/);
});

test('缺少 _primary 按钮时警告一次，并点名 primary', () => {
  const { client, warnings } = loadWithDocument(makeDocument({ hasPrimary: false }));
  const ok = client.probeContracts();
  assert.equal(ok, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /_primary/);
});

test('祖先链上没有 _card 时退回最外层候选并提示', () => {
  // 没有 _card 类 → findComposerScope 找不到候选，返回 null →
  // probeContracts 退回 editor.parentElement 再找 _primary。
  const { client, warnings } = loadWithDocument(
    makeDocument({ hasCard: false, hasPrimary: true }),
  );
  const ok = client.probeContracts();
  assert.equal(ok, true, '父元素里有 _primary 就算通过');
  assert.equal(warnings.length, 1, '只应提示卡片层级退化');
  assert.match(warnings[0], /_card/);
});

test('反复探测同一问题只警告一次', () => {
  const { client, warnings } = loadWithDocument(makeDocument({ hasPrimary: false }));
  for (let i = 0; i < 10; i += 1) client.probeContracts();
  assert.equal(warnings.length, 1, '定时器每 500ms 调一次，不能每次都刷屏');
});

test('两种问题同时存在时分别警告，互不吞掉', () => {
  const { client, warnings } = loadWithDocument(
    makeDocument({ hasEditor: false, hasPrimary: false }),
  );
  client.probeContracts();
  assert.equal(warnings.length, 1, '没有输入框时无法继续检查按钮，只报第一条');
  assert.match(warnings[0], /contenteditable/);
});

test('没有 document 时不抛异常（非浏览器环境）', () => {
  const client = loadClient(clientPath);
  assert.doesNotThrow(() => client.probeContracts());
  assert.equal(client.probeContracts(), false);
});

/**
 * 这是从真实 DSH 结构里查出来的问题，不是假想。
 *
 * composer 的 CSS module 里除了 `card` 还有 `cardWorkspaceTrigger`，两者都含
 * 子串 `_card`，而 `cardWorkspaceTrigger` 也在输入框的祖先链上。用
 * `closest('[class*="_card"]')` 会命中更近的那一层——那里没有主提交按钮，
 * 于是草稿检测静默失效：按钮不再跟随输入内容收起。
 *
 * 修复后的做法是逐层向上找，只接受同时含 `_primary` 的那一层。
 */
test('祖先链上有 cardWorkspaceTrigger 时仍能找到真正的卡片', () => {
  const primaryButton = { className: 'RlGAzG_primary', disabled: true };
  const realCard = {
    className: 'RlGAzG_card',
    querySelectorAll: (sel) => (sel === 'button' ? [primaryButton] : []),
    querySelector: () => primaryButton,
    parentElement: null,
  };
  // 更近的错误层：名字也含 _card，但没有主按钮
  const wrongLayer = {
    className: 'RlGAzG_cardWorkspaceTrigger',
    querySelectorAll: () => [],
    parentElement: realCard,
  };
  const editor = {
    className: '',
    querySelectorAll: () => [],
    parentElement: wrongLayer,
    // 若代码回退到 closest，就会命中 wrongLayer
    closest: () => wrongLayer,
  };

  const doc = { querySelector: () => editor };
  const { client, warnings } = loadWithDocument(doc);

  assert.equal(client.probeContracts(), true, '应透过错误层找到真卡片');
  assert.deepEqual(warnings, [], '这种情况不应报警');
});
