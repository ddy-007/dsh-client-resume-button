#!/usr/bin/env node
/**
 * 三种中断状态的运行记录。
 *
 * review 要求「每种状态各跑一次」的可复现证据。本脚本不依赖运行中的
 * DSH：它把真实会话日志里出现过的三种 `turn/end` 形状直接喂给投影，
 * 打印每一态的折叠结果，并把结果与期望比对。
 *
 * 与 `tests/projection.test.mjs` 的分工：单测断言契约，本脚本产出人可读
 * 的运行记录，供 PR 引用。
 *
 * 用法：
 *   node scripts/record-states.mjs            # 打印记录
 *   node scripts/record-states.mjs --json     # 打印 JSON
 *
 * @module client-resume-button/scripts/record-states
 */
import process from 'node:process';

import {
  applyResumeButtonProjection,
  InitialResumeButtonProjection,
} from '../lib/projection.js';

/**
 * 三态样本。`reason` 逐字取自本机真实会话日志，不是构造出来的近似值。
 * 这里只固定形状，不固定条数——日志会随使用增长。
 */
const CASES = [
  {
    id: 'aborted',
    label: '用户按停止',
    expect: 'pending',
    events: [
      { type: 'turn/start', data: { turn: 12 } },
      { type: 'turn/end', data: { turn: 12, reason: { kind: 'aborted', reason: { kind: 'user' } } } },
    ],
  },
  {
    id: 'interrupted',
    label: '崩溃修复',
    expect: 'pending',
    events: [
      { type: 'turn/start', data: { turn: 20 } },
      { type: 'turn/end', data: { turn: 20, reason: { kind: 'interrupted' } } },
    ],
  },
  {
    id: 'error',
    label: '运行期错误',
    expect: 'pending',
    events: [
      { type: 'turn/start', data: { turn: 31 } },
      {
        type: 'turn/end',
        data: {
          turn: 31,
          reason: {
            kind: 'error',
            error: { message: '429: rate limited', code: 'RATE_LIMIT' },
          },
        },
      },
    ],
  },
  {
    id: 'completed',
    label: '正常结束（对照：不应出现按钮）',
    expect: 'clear',
    events: [
      { type: 'turn/start', data: { turn: 40 } },
      { type: 'turn/end', data: { turn: 40, reason: { kind: 'completed' } } },
    ],
  },
  {
    id: 'aborted-then-new-turn',
    label: '中断后又开新一轮（对照：标记被清除）',
    expect: 'clear',
    events: [
      { type: 'turn/end', data: { turn: 50, reason: { kind: 'aborted', reason: { kind: 'user' } } } },
      { type: 'turn/start', data: { turn: 51 } },
    ],
  },
];

/** 折叠一态的事件序列。 */
function fold(events) {
  return events.reduce(applyResumeButtonProjection, InitialResumeButtonProjection);
}

/** 跑全部样本，返回记录。 */
function record() {
  return CASES.map((sample) => {
    const state = fold(sample.events);
    const actual = state.pending === null ? 'clear' : 'pending';
    return {
      id: sample.id,
      label: sample.label,
      expect: sample.expect,
      actual,
      pending: state.pending,
      pass: actual === sample.expect,
    };
  });
}

const results = record();
const failed = results.filter((r) => !r.pass);

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
} else {
  process.stdout.write('中断状态运行记录\n');
  process.stdout.write('='.repeat(64) + '\n\n');
  for (const r of results) {
    const mark = r.pass ? 'PASS' : 'FAIL';
    process.stdout.write(`[${mark}] ${r.id.padEnd(24)} ${r.label}\n`);
    process.stdout.write(`        期望 ${r.expect.padEnd(8)} 实际 ${r.actual.padEnd(8)} ` +
      `pending=${JSON.stringify(r.pending)}\n\n`);
  }
  process.stdout.write('='.repeat(64) + '\n');
  process.stdout.write(`${results.length - failed.length}/${results.length} 符合期望\n`);
}

process.exit(failed.length === 0 ? 0 : 1);
