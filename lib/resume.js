/**
 * 续跑消息的构造。
 *
 * 续跑以两条 plugin 来源的 `notice` 消息投递，不伪装成用户输入：
 * 简短的 lead 点名中断并要求接着做，detail 携带工具重试的安全指引。
 * 两条都对模型可见并写入持久日志；Web 客户端渲染为折叠的 transcript 行。
 *
 * 措辞来源：Codex 二进制的 `generic.turn_aborted` 模板
 *   "The user interrupted the previous turn on purpose. Any running unified exec
 *    processes may still be running in the background. If any tools/commands were
 *    aborted, they may have partially executed."
 * 其中 unified exec 在 DSH 对应的实际工具是 pwsh 命令与后台 job。
 *
 * @module client-resume-button/resume
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm';

/** 每条续跑消息上记录的稳定来源标识。 */
export const resumeProducerName = 'client-resume-button';

/** 模型可见的 lead：点名中断并要求接着做。 */
export const RESUME_LEAD =
  'The previous turn was interrupted. Continue where you left off.';

/** 模型可见的 detail：残留状态警告 + 重试安全 + 防重复。 */
export const RESUME_DETAIL =
  'The user interrupted the previous turn on purpose. Any running pwsh commands ' +
  'or background jobs may still be running. If any tools/commands were aborted, ' +
  'they may have partially executed. For any interrupted tool call, retry it only ' +
  'if it is read-only or idempotent; otherwise verify the external state before ' +
  'proceeding. Do not repeat steps that already completed.';

/** lead 的折叠行摘要。 */
export const RESUME_SUMMARY = 'Interrupted — continue';

/** detail 的折叠行摘要。 */
export const RESUME_DETAIL_SUMMARY = 'Resume guidance';

/**
 * 构造唤醒并指令续跑的 lead 消息。
 * @returns 冻结的 user 角色消息。
 */
export function buildResumeMessage() {
  return createUserMessage({
    content: [{ type: 'text', text: RESUME_LEAD }],
    source: {
      kind: resumeProducerName,
      form: 'notice',
      summary: RESUME_SUMMARY,
    },
  });
}

/**
 * 构造工具重试安全指引的 detail 消息。
 * @returns 冻结的 user 角色消息。
 */
export function buildResumeDetail() {
  return createUserMessage({
    content: [{ type: 'text', text: RESUME_DETAIL }],
    source: {
      kind: resumeProducerName,
      form: 'notice',
      summary: RESUME_DETAIL_SUMMARY,
    },
  });
}
