/**
 * `resumeButton` 投影在已提交会话日志上的纯折叠。
 *
 * DSH 会在两种情况下关闭一轮：
 *   - 用户按下停止：turn/end { reason: { kind: 'aborted', reason: { kind: 'user' } } }
 *   - 崩溃修复：    turn/end { reason: { kind: 'interrupted' } }
 *   - 运行期错误：  turn/end { reason: { kind: 'error' } }
 * 三者都留下待续跑标记；下一次 turn/start 清除它。
 *
 * @module client-resume-button/projection
 */

/** 视为可续跑的中断种类。 */
const RESUMABLE_KINDS = new Set(['aborted', 'interrupted', 'error']);

/** 投影初始状态：没有待续跑的中断。 */
export const InitialResumeButtonProjection = Object.freeze({ pending: null });

/**
 * 判断 turn/end 的 reason 是否应留下待续跑标记。
 * @param {unknown} reason - turn/end 的 reason。
 * @returns {boolean}
 */
function isResumable(reason) {
  if (!reason || typeof reason !== 'object') return false;
  if (!RESUMABLE_KINDS.has(reason.kind)) return false;
  if (reason.kind === 'aborted') {
    // aborted 只在用户主动停止时才算；其他取消来源不提供「继续」。
    const inner = reason.reason;
    const innerKind = inner && typeof inner === 'object' ? inner.kind : inner;
    return innerKind === 'user' || innerKind === undefined;
  }
  return true;
}

/**
 * 把一条已提交事件折叠进投影。
 * @param {object} state - 覆盖此前所有事件的投影。
 * @param {object} event - 下一条已提交的会话事件。
 * @returns {object} 下一条投影（事件不改变它时返回同一引用）。
 */
export function applyResumeButtonProjection(state, event) {
  switch (event.type) {
    case 'turn/end': {
      const reason = event.data && event.data.reason;
      if (!isResumable(reason)) return state;
      return {
        pending: {
          turn: event.data.turn,
          kind: reason.kind,
          because: reason.kind === 'aborted' ? 'user-stop' : reason.kind,
        },
      };
    }
    case 'turn/start':
      // 任何新轮次都意味着撕开的边界已被接续，标记清除。
      return state.pending === null ? state : { pending: null };
    default:
      return state;
  }
}
