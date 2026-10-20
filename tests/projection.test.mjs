/**
 * `resumeButton` 投影的契约测试。
 *
 * 投影把已提交的会话日志折叠成「是否还有一轮可以续跑」这一个布尔判断，
 * 因此测试直接对着真实 `turn/end` 事件形状断言，不需要 mock 运行时。
 *
 * 事件形状取自本机真实会话日志（39 个会话、471 条 turn/end）：
 *   {"kind":"completed"}                        382x
 *   {"kind":"aborted","reason":{"kind":"user"}}  59x
 *   {"kind":"interrupted"}                        2x
 *   {"kind":"error","error":{...}}               20x+
 *
 * 运行：node --test tests/
 *
 * @module client-resume-button/tests/projection
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyResumeButtonProjection,
  InitialResumeButtonProjection,
} from '../lib/projection.js';

/** 折叠一串事件，返回最终投影。 */
function fold(events) {
  return events.reduce(applyResumeButtonProjection, InitialResumeButtonProjection);
}

/** 造一条 turn/end 事件。 */
function turnEnd(turn, reason) {
  return { type: 'turn/end', data: { turn, reason } };
}

/** 造一条 turn/start 事件。 */
function turnStart(turn) {
  return { type: 'turn/start', data: { turn } };
}

/** 用户主动停止。 */
const ABORTED_BY_USER = { kind: 'aborted', reason: { kind: 'user' } };

/** 崩溃修复。 */
const INTERRUPTED = { kind: 'interrupted' };

/** 运行期错误（形状取自真实日志：带 error 明细）。 */
const ERRORED = {
  kind: 'error',
  error: { message: '429: rate limited', code: 'RATE_LIMIT' },
};

test('三种中断各留下待续跑标记', async (t) => {
  await t.test('aborted（用户按停止）', () => {
    const state = fold([turnEnd(3, ABORTED_BY_USER)]);
    assert.deepEqual(state.pending, { turn: 3, kind: 'aborted' });
  });

  await t.test('interrupted（崩溃修复）', () => {
    const state = fold([turnEnd(5, INTERRUPTED)]);
    assert.deepEqual(state.pending, { turn: 5, kind: 'interrupted' });
  });

  await t.test('error（运行期错误）', () => {
    const state = fold([turnEnd(9, ERRORED)]);
    assert.deepEqual(state.pending, { turn: 9, kind: 'error' });
  });
});

test('正常结束不留下标记', async (t) => {
  await t.test('completed', () => {
    const state = fold([turnEnd(1, { kind: 'completed' })]);
    assert.equal(state.pending, null);
  });

  await t.test('completed 后接中断，只留后者', () => {
    const state = fold([
      turnEnd(1, { kind: 'completed' }),
      turnEnd(2, ABORTED_BY_USER),
    ]);
    assert.deepEqual(state.pending, { turn: 2, kind: 'aborted' });
  });
});

test('aborted 只在子原因为 user 时才算可续跑', async (t) => {
  await t.test('子原因不是 user → 不触发', () => {
    const state = fold([turnEnd(4, { kind: 'aborted', reason: { kind: 'timeout' } })]);
    assert.equal(state.pending, null);
  });

  await t.test('无子原因 → 不触发', () => {
    const state = fold([turnEnd(4, { kind: 'aborted' })]);
    assert.equal(state.pending, null);
  });

  await t.test('子原因是裸字符串 user → 触发', () => {
    const state = fold([turnEnd(4, { kind: 'aborted', reason: 'user' })]);
    assert.deepEqual(state.pending, { turn: 4, kind: 'aborted' });
  });
});

test('turn/start 清除标记', async (t) => {
  await t.test('中断后开新一轮 → 标记清除', () => {
    const state = fold([turnEnd(7, ABORTED_BY_USER), turnStart(8)]);
    assert.equal(state.pending, null);
  });

  await t.test('已经是 null 时 turn/start 返回同一引用', () => {
    const state = fold([turnStart(1)]);
    assert.equal(state, InitialResumeButtonProjection);
  });

  await t.test('清除后再中断 → 重新标记', () => {
    const state = fold([
      turnEnd(7, ABORTED_BY_USER),
      turnStart(8),
      turnEnd(8, INTERRUPTED),
    ]);
    assert.deepEqual(state.pending, { turn: 8, kind: 'interrupted' });
  });
});

test('无标记时事件不改变投影引用（避免无谓重渲染）', async (t) => {
  await t.test('completed 不改变引用', () => {
    const state = fold([turnEnd(1, { kind: 'completed' })]);
    assert.equal(state, InitialResumeButtonProjection);
  });

  await t.test('无关事件类型被忽略', () => {
    const state = fold([
      { type: 'message/start', data: {} },
      { type: 'tool/call', data: {} },
    ]);
    assert.equal(state, InitialResumeButtonProjection);
  });
});

test('畸形输入不抛异常', async (t) => {
  await t.test('reason 缺失', () => {
    assert.equal(fold([{ type: 'turn/end', data: {} }]).pending, null);
  });

  await t.test('reason 是 null', () => {
    assert.equal(fold([turnEnd(1, null)]).pending, null);
  });

  await t.test('reason 是字符串', () => {
    assert.equal(fold([turnEnd(1, 'aborted')]).pending, null);
  });

  await t.test('未知 kind', () => {
    assert.equal(fold([turnEnd(1, { kind: 'unknown-kind' })]).pending, null);
  });

  await t.test('data 缺失', () => {
    assert.equal(fold([{ type: 'turn/end' }]).pending, null);
  });

  await t.test('event 是 null', () => {
    assert.throws(() => applyResumeButtonProjection(InitialResumeButtonProjection, null));
  });
});

test('投影状态是纯 JSON（可跨 wire 传输）', () => {
  const state = fold([turnEnd(2, ERRORED)]);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});
