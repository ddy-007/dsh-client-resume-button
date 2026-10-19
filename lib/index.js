/**
 * client-resume-button — 宿主半边。
 *
 * 注册 `resumeButton` 会话投影，并暴露一个 Remote 动作 `resume`，
 * 让停在被中断轮次上的 agent 继续完成该轮。
 *
 * 与 @mill413/dsh-session-resume 的差别：可续跑的种类不只有崩溃产生的
 * `interrupted`，还包括用户按停止产生的
 *   turn/end { reason: { kind: 'aborted', reason: { kind: 'user' } } }
 * 以及运行期错误 `error`。
 *
 * @module client-resume-button
 */
import { HarnessError } from '@deepseek-ai/dsh-llm';
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import sz from '@deepseek-ai/schemastery';
import { z as zod } from 'zod';
import {
  applyResumeButtonProjection,
  InitialResumeButtonProjection,
} from './projection.js';
import { buildResumeDetail, buildResumeMessage } from './resume.js';

/** Cordis 要求 Service 插件声明配置 schema。 */
export const Config = sz.object({});

/** 投影的 wire/state schema：纯 JSON。 */
const resumeButtonProjectionSchema = zod.object({
  pending: zod
    .object({
      turn: zod.number().int().positive(),
      kind: zod.enum(['aborted', 'interrupted', 'error']),
    })
    .nullable(),
});

export {
  applyResumeButtonProjection,
  InitialResumeButtonProjection,
} from './projection.js';
export { buildResumeDetail, buildResumeMessage } from './resume.js';

/** `resumeButton` 投影与 resume 动作的服务。 */
export class ClientResumeButtonService extends TypertRemoteService {
  static inject = ['agents'];

  static Config = Config;

  constructor(ctx) {
    super(ctx, 'resumeButton');

    // 投影单元：仅在组合了 projection registry 时激活。
    ctx.inject(['sessionProjections'], (projectionCtx) => {
      projectionCtx.sessionProjections.register({
        key: 'resumeButton',
        stateSchema: resumeButtonProjectionSchema,
        init: () => InitialResumeButtonProjection,
        apply: applyResumeButtonProjection,
        wire: {
          viewSchema: resumeButtonProjectionSchema,
          view: (state) => state,
        },
        stateVersion: 1,
      });
    });
  }

  /**
   * 请求某个会话的 live agent 继续它停下的那一轮。
   *
   * 续跑消息排在已排队轮次之前：较密集的 detail 前插到 `next-turn` 队首，
   * 让被中断的工作先完成；简短的 lead 通过 steer 唤醒空闲 agent。
   *
   * @param sessionId - wire 层会话标识。
   * @returns 被续跑的轮次号与中断种类。
   * @throws {HarnessError} agent 不在线，或没有待续跑的中断。
   */
  resume(sessionId) {
    const agent = this.ctx.agents.get(sessionId);
    if (agent === undefined) {
      throw new HarnessError('no live agent for the session', 'AGENT_NOT_LIVE');
    }

    const pending = pendingOf(agent.session);
    if (pending === null) {
      throw new HarnessError(
        'session has no interruptible turn to resume',
        'NOT_RESUMABLE',
      );
    }

    agent.inbox.prepend('next-turn', buildResumeDetail());
    agent.steer(buildResumeMessage());
    return { resumedTurn: pending.turn, kind: pending.kind };
  }
}

/** 把 live 会话日志折叠成当前的待续跑标记。 */
function pendingOf(session) {
  let state = InitialResumeButtonProjection;
  for (const event of session.snapshotEvents()) {
    state = applyResumeButtonProjection(state, event);
  }
  return state.pending;
}

// 用 TC39 装饰器协议在运行时标记 Remote 方法（源码无法直接写装饰器语法）。
applyRemoteDecorator(ClientResumeButtonService, 'resume');

export default ClientResumeButtonService;

/**
 * 按 TC39 装饰器协议把 Remote 应用到原型方法上。
 *
 * 库的实现在 context.addInitializer 里通过 Object.getPrototypeOf(this) 写入
 * 原型描述符，因此必须真的执行这个回调（this 绑定到实例），只传空函数会丢标记。
 *
 * @param {Function} ServiceClass - 服务类。
 * @param {string} methodName - 要标记的方法名。
 */
function applyRemoteDecorator(ServiceClass, methodName) {
  const method = ServiceClass.prototype[methodName];
  if (typeof method !== 'function') {
    throw new TypeError(`Remote target ${methodName} is not a method`);
  }
  /** 收集装饰器登记的 initializer。 */
  const initializers = [];
  Remote(methodName)(method, {
    kind: 'method',
    name: methodName,
    static: false,
    private: false,
    addInitializer: (fn) => {
      initializers.push(fn);
    },
    access: {
      has: (obj) => methodName in obj,
      get: (obj) => obj[methodName],
    },
  });
  // initializer 的 this 必须是实例，才能取到原型；用轻量对象模拟。
  const probe = Object.create(ServiceClass.prototype);
  for (const initializer of initializers) {
    initializer.call(probe);
  }
}
