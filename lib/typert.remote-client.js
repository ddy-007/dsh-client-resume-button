/**
 * client-resume-button 的 Client 侧 Remote 贡献。
 *
 * 由客户端通过 ctx.typert.remotes.register() 挂载；结构依据
 * dsh-api-gateway/lib/client.js#validateContribution：
 *   { descriptors: [{ namespace, method, invocation, parameters, result, ... }] }
 *
 * @module client-resume-button/remote
 */
import { z } from 'zod';

/** 会话 id 的严格编解码器。 */
const sessionIdCodec = {
  mode: 'strict',
  typeSymbol: 'client-resume-button/types#ResumeButtonSessionId',
  create: () => z.string(),
  jsonSchema: { type: 'string' },
};

/** resume 结果的严格编解码器。 */
const resumeResultCodec = {
  mode: 'strict',
  typeSymbol: 'client-resume-button/types#ResumeButtonSuccess',
  create: () =>
    z.object({
      resumedTurn: z.number().int().positive(),
      kind: z.string(),
    }),
  jsonSchema: {
    type: 'object',
    properties: {
      resumedTurn: { type: 'number' },
      kind: { type: 'string' },
    },
    required: ['resumedTurn', 'kind'],
    additionalProperties: false,
  },
};

/** Client 侧可挂载的 Remote 贡献。 */
export const TYPERT_REMOTE = {
  package: 'client-resume-button',
  descriptors: [
    {
      id: 'resumeButton/resume',
      namespace: 'resumeButton',
      method: 'resume',
      summary: 'Continue the interrupted turn.',
      description:
        'Ask the live agent for one session to continue the turn it stopped on, ' +
        'including a turn the user aborted on purpose.',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'sessionId',
          wire: 'sessionId',
          source: 'json',
          codec: sessionIdCodec,
        },
      ],
      result: resumeResultCodec,
    },
  ],
};

export default TYPERT_REMOTE;
