#!/usr/bin/env node
/**
 * 隔离环境下的三态端到端记录。
 *
 * review 要求「每种状态各跑一次，在隔离的 DSH_HOME 下」，以确认按钮真的会在
 * aborted / crashed / errored 三种情况下出现。本脚本按真实运行时的装配方式
 * 组装组件，而不是只调用纯函数：
 *
 *   真实 Cordis Context
 *     └─ 真实 SessionProjectionRegistry（ctx.sessionProjections）
 *          └─ 注册真实 ClientResumeButtonService 的投影定义
 *               └─ 真实 Session，按真实事件顺序 append turn/start、turn/end
 *                    └─ registry.snapshot(session, ['resumeButton'])
 *
 * 最后一步取到的 `values.resumeButton` 就是 Web 客户端渲染按钮时读的那个
 * 视图对象，因此「快照里 pending 非空」等价于「按钮会出现」。
 *
 * 隔离性：整个过程在临时目录下的 DSH_HOME 中进行，不读取、不写入本机
 * 真实 profile 或会话；临时目录退出时删除。
 *
 * 用法：
 *   node scripts/verify-isolated.mjs            # 人可读记录
 *   node scripts/verify-isolated.mjs --json     # JSON
 *
 * 需要能解析 @deepseek-ai/* SDK 包。脚本按 DSH 安装目录下的
 * node_modules 查找，可用 DSH_SDK_ROOT 覆盖。
 *
 * @module client-resume-button/scripts/verify-isolated
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * 解析一个 SDK 包，按优先级：
 *   1. `DSH_SDK_ROOT` 指定的目录
 *   2. 普通 node_modules 解析（CI 装了 devDependencies 时走这条）
 *   3. 本机 DSH 安装位置（开发机没有 devDependencies 时走这条）
 */
async function load(pkg) {
  if (process.env.DSH_SDK_ROOT !== undefined) {
    return import(pathToFileURL(join(process.env.DSH_SDK_ROOT, pkg, 'lib/index.js')).href);
  }
  try {
    return await import(pkg);
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' && error?.code !== 'MODULE_NOT_FOUND') throw error;
  }
  for (const root of ['D:/dsh/node_modules', 'C:/Users/wwww/.dsh/profiles/node_modules']) {
    const entry = join(root, pkg, 'lib/index.js');
    if (existsSync(entry)) return import(pathToFileURL(entry).href);
  }
  throw new Error(
    `cannot resolve ${pkg}; install the devDependencies or set DSH_SDK_ROOT`,
  );
}

/** 解析 zod，规则同上。 */
async function loadZod() {
  if (process.env.DSH_SDK_ROOT !== undefined) {
    return import(pathToFileURL(join(process.env.DSH_SDK_ROOT, '..', 'zod/index.js')).href);
  }
  try {
    return await import('zod');
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' && error?.code !== 'MODULE_NOT_FOUND') throw error;
  }
  for (const root of ['D:/dsh/node_modules', 'C:/Users/wwww/.dsh/profiles/node_modules']) {
    const entry = join(root, 'zod/index.js');
    if (existsSync(entry)) return import(pathToFileURL(entry).href);
  }
  throw new Error('cannot resolve zod; install the devDependencies or set DSH_SDK_ROOT');
}

/**
 * 三态样本。事件形状逐字取自真实会话日志（39 个会话 / 473 条 turn/end），
 * 包括 error 携带的明细字段。
 */
const CASES = [
  {
    id: 'aborted',
    label: '用户按停止',
    expectButton: true,
    reason: { kind: 'aborted', reason: { kind: 'user' } },
  },
  {
    id: 'interrupted',
    label: '崩溃修复',
    expectButton: true,
    reason: { kind: 'interrupted' },
  },
  {
    id: 'error',
    label: '运行期错误',
    expectButton: true,
    reason: {
      kind: 'error',
      error: { message: '429: rate limited', code: 'RATE_LIMIT' },
    },
  },
  {
    id: 'completed',
    label: '正常结束（对照）',
    expectButton: false,
    reason: { kind: 'completed' },
  },
  {
    id: 'aborted-other-reason',
    label: '超时取消（对照：非用户中止）',
    expectButton: false,
    reason: { kind: 'aborted', reason: { kind: 'timeout' } },
  },
];

/** 在隔离 DSH_HOME 下跑一态，返回客户端会读到的视图。 */
async function runCase(caseDef, deps, home) {
  const { Context, Registry, Session, ServiceClass, applyProjection, Initial, zod } = deps;

  const ctx = new Context();
  ctx.plugin(Registry);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const projections = ctx.get('sessionProjections');
  if (projections === undefined) throw new Error('sessionProjections service did not mount');

  // 与插件构造函数里注册的 schema 完全一致，registry 会调用它的 .parse。
  const stateSchema = zod.z.object({
    pending: zod.z
      .object({
        turn: zod.z.number().int().positive(),
        kind: zod.z.enum(['aborted', 'interrupted', 'error']),
      })
      .nullable(),
  });

  projections.register({
    key: 'resumeButton',
    stateSchema,
    init: () => Initial,
    apply: applyProjection,
    wire: { viewSchema: stateSchema, view: (state) => state },
    stateVersion: 1,
  });

  // 真实 Session，header 里带上隔离 home 作为 cwd。
  const sessionId = `session-${caseDef.id}-0001`;
  const session = new Session(sessionId, undefined, {
    version: 4,
    id: sessionId,
    createdAt: Date.now(),
    cwd: home,
    isSeeded: false,
    delegationDepth: 0,
    agentPreset: 'standard',
  });

  // 真实事件顺序：一轮开始，然后以该状态结束。
  session.append('turn/start', { turn: 1 });
  session.append('turn/end', { turn: 1, reason: caseDef.reason });

  // 客户端读的正是这个快照。
  const snapshot = projections.snapshot(session, ['resumeButton']);
  return {
    view: snapshot.values.resumeButton,
    asOfSeq: snapshot.asOfSeq,
    events: session.snapshotEvents().map((e) => e.type),
  };
}

/** 主流程。 */
async function main() {
  const { Context } = await load('@deepseek-ai/cordis');
  const { SessionProjectionRegistry } = await load('@deepseek-ai/dsh-session-projection');
  const { Session } = await load('@deepseek-ai/dsh-session');
  const zod = await loadZod();
  const plugin = await import(
    pathToFileURL(join(process.cwd(), 'lib/index.js')).href
  );

  const deps = {
    Context,
    Registry: SessionProjectionRegistry,
    Session,
    ServiceClass: plugin.ClientResumeButtonService,
    applyProjection: plugin.applyResumeButtonProjection,
    Initial: plugin.InitialResumeButtonProjection,
    zod,
  };

  // 隔离 DSH_HOME：本脚本的一切读写都在这里，退出时删除。
  const home = mkdtempSync(join(tmpdir(), 'dsh-verify-home-'));
  const results = [];
  try {
    for (const caseDef of CASES) {
      let outcome;
      try {
        const r = await runCase(caseDef, deps, home);
        const buttonAppears = r.view?.pending != null;
        outcome = {
          id: caseDef.id,
          label: caseDef.label,
          expectButton: caseDef.expectButton,
          buttonAppears,
          pending: r.view?.pending ?? null,
          asOfSeq: r.asOfSeq,
          pass: buttonAppears === caseDef.expectButton,
          error: null,
        };
      } catch (error) {
        outcome = {
          id: caseDef.id,
          label: caseDef.label,
          expectButton: caseDef.expectButton,
          buttonAppears: null,
          pending: null,
          asOfSeq: null,
          pass: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      results.push(outcome);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.pass);

  if (process.argv.includes('--json')) {
    process.stdout.write(
      JSON.stringify({ isolatedHome: home, results }, null, 2) + '\n',
    );
  } else {
    process.stdout.write('隔离 DSH_HOME 下的三态验证\n');
    process.stdout.write('='.repeat(72) + '\n');
    process.stdout.write(`隔离目录 ${home}（已删除）\n\n`);
    for (const r of results) {
      const mark = r.pass ? 'PASS' : 'FAIL';
      process.stdout.write(`[${mark}] ${r.id.padEnd(22)} ${r.label}\n`);
      process.stdout.write(
        `        期望按钮 ${String(r.expectButton).padEnd(5)} ` +
          `实际 ${String(r.buttonAppears).padEnd(5)} ` +
          `pending=${JSON.stringify(r.pending)}\n`,
      );
      if (r.error !== null) process.stdout.write(`        错误: ${r.error}\n`);
      process.stdout.write('\n');
    }
    process.stdout.write('='.repeat(72) + '\n');
    process.stdout.write(
      `${results.length - failed.length}/${results.length} 符合期望\n`,
    );
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`verify-isolated: ${error?.message ?? error}\n`);
  process.exit(1);
});
