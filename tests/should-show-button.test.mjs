/**
 * `shouldShowButton` 的契约测试。
 *
 * 这个函数决定「继续」按钮显示还是收起，是插件里最容易被写错、也最容易被
 * 忽略的一处判断。它原本直接写在 React 组件里，而本地没有 React 与 DOM 环境
 * （宿主把 React 打包在 app.asar 内，不以独立包存在），所以那段表达式从来没被
 * 自动测过——只能靠人肉点一遍。
 *
 * 抽成纯函数后，这里覆盖它的全部分支，包括畸形输入必须不抛异常。
 *
 * 边界：本文件验证的是**判断**，不是**渲染**。按钮的位置、宽度动画、
 * 点击后调用 remote 的链路，都不在这里的覆盖范围内。
 *
 * 运行：node --test
 *
 * @module client-resume-button/tests/should-show-button
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { loadClient } from './support/load-client.mjs';

const clientPath = fileURLToPath(new URL('../lib/client.js', import.meta.url));
const client = loadClient(clientPath);
const { shouldShowButton } = client;

test('客户端模块导出了判断函数', () => {
  assert.equal(typeof shouldShowButton, 'function');
});

test('没有中断标记时不显示', () => {
  for (const pending of [null, undefined]) {
    assert.equal(shouldShowButton({ pending, hasDraft: false }), false);
    assert.equal(shouldShowButton({ pending, hasDraft: true }), false);
  }
});

test('三种可续跑的中断都显示（草稿为空时）', () => {
  for (const kind of ['aborted', 'interrupted', 'error']) {
    assert.equal(
      shouldShowButton({ pending: { turn: 1, kind }, hasDraft: false }),
      true,
      `${kind} 空草稿时应显示`,
    );
  }
});

test('不在可续跑集合里的 kind 不显示', () => {
  for (const kind of ['completed', 'cancelled', 'aborted_by_timeout', '']) {
    assert.equal(
      shouldShowButton({ pending: { turn: 1, kind }, hasDraft: false }),
      false,
      `${kind} 不应显示`,
    );
  }
});

test('有草稿时不显示，即使中断可续跑', () => {
  for (const kind of ['aborted', 'interrupted', 'error']) {
    assert.equal(
      shouldShowButton({ pending: { turn: 1, kind }, hasDraft: true }),
      false,
      `${kind} 有草稿时应收起`,
    );
  }
});

test('hasDraft 只认 true，其他真值不当作有草稿', () => {
  const pending = { turn: 1, kind: 'aborted' };
  // hasDraft 来自 useState(false)，正常只会是布尔。但若哪天误传了别的东西，
  // 宁可当作"没草稿"让按钮出现，也不要因为一个 truthy 值把入口藏起来。
  for (const hasDraft of ['false', 'yes', 1, {}, []]) {
    assert.equal(
      shouldShowButton({ pending, hasDraft }),
      true,
      `hasDraft=${JSON.stringify(hasDraft)} 不应被当成 true`,
    );
  }
  assert.equal(shouldShowButton({ pending, hasDraft: true }), false);
});

test('畸形 pending 不抛异常，一律不显示', () => {
  const cases = [
    { pending: undefined },
    { pending: null },
    { pending: 'aborted' },
    { pending: 42 },
    { pending: true },
    { pending: {} },
    { pending: { kind: null } },
    { pending: { kind: 42 } },
    { pending: { kind: undefined } },
    { pending: [] },
  ];
  for (const input of cases) {
    assert.doesNotThrow(() => shouldShowButton(input), `输入 ${JSON.stringify(input)} 不应抛异常`);
    assert.equal(
      shouldShowButton({ ...input, hasDraft: false }),
      false,
      `输入 ${JSON.stringify(input)} 应判定为不显示`,
    );
  }
});

test('input 本身缺失也不抛异常', () => {
  for (const input of [undefined, null]) {
    assert.doesNotThrow(() => shouldShowButton(input));
    assert.equal(shouldShowButton(input), false);
  }
});

/**
 * 这条钉住的是一处真实的错误写法：`pending.kind && !hasDraft`。
 * 那样写时，任何 truthy 的 kind 都会让按钮出现，包括 'completed'。
 */
test('未完成的轮次不会被误判为可续跑（反例自检）', () => {
  const completed = { pending: { turn: 3, kind: 'completed' }, hasDraft: false };
  assert.equal(shouldShowButton(completed), false);

  // 而一个裸 truthy 判断会认为它可显示——确认本测试确实在区分两者。
  const naive = completed.pending != null && completed.pending.kind && !completed.hasDraft;
  assert.equal(naive, true, '朴素写法确实会误判，说明这条断言有意义');
});
