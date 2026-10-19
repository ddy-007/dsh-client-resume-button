/**
 * client-resume-button 的 Host typert manifest。
 *
 * 由 package.json 的 exports["./typert"] 指向本文件；dsh-typert-loader 会把
 * 这里导出的 TYPERT 注册进 ctx.typert，从而让客户端能调用 resume 动作。
 *
 * 格式依据 DSH 0.2.0-rc.2 的 dsh-typert-loader#validateTypertManifest：
 *   package / face / schemas / model{services,events,objects} / invocations
 *
 * @module client-resume-button/typert
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

/** Host 面 typert 清单。 */
export const TYPERT = {
  package: 'client-resume-button',
  face: 'host',
  schemas: [
    { name: 'ResumeButtonSessionId', create: () => z.string() },
    {
      name: 'ResumeButtonSuccess',
      create: () =>
        z.object({
          resumedTurn: z.number().int().positive(),
          kind: z.string(),
        }),
    },
  ],
  model: {
    services: [
      {
        key: 'resumeButton',
        exportName: 'resumeButton',
        summary: 'Projection and resume verb for interrupted turns.',
        description:
          'Reads the resumeButton session projection and exposes one user-triggered ' +
          'resume verb that asks a live agent to continue the turn it stopped on.',
        tags: [],
        members: [
          {
            kind: 'method',
            name: 'resume',
            signature:
              'resume(sessionId: ResumeButtonSessionId): { resumedTurn: number; kind: string }',
          },
        ],
        types: [
          {
            name: 'ResumeButtonSessionId',
            declaration:
              "export type ResumeButtonSessionId = import('@deepseek-ai/dsh-session/types').SessionId;",
          },
          {
            name: 'ResumeButtonSuccess',
            declaration:
              'export interface ResumeButtonSuccess {\n    readonly resumedTurn: number;\n    readonly kind: string;\n}',
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: [
    {
      id: 'resumeButton/resume',
      service: 'resumeButton',
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

export default TYPERT;
