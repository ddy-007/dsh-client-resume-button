# client-resume-button

Adds a **Continue** button to the DeepSeek Harness composer. When the previous turn was interrupted, one click asks the model to pick that turn back up.

[中文](./README.md) | English

---

## What it solves

Interrupting a turn in DSH is easy — press stop, hit `Esc Esc`, or the process crashes. But picking the work back up means retyping context so the model can re-orient.

This plugin turns "continue" into a button:

```
composer:  [+] [workspace] [1,949]    [▶] Deepseek-V4.1-Flash ▾ 🎤 [↑]
                                       ↑
                              appears only after an interruption
```

Clicking it tells the model:

> The previous turn was interrupted. Continue where you left off. Do not repeat steps that already completed.

## When the button appears

All of the following must hold:

1. The previous turn ended with one of:
   - `aborted` whose sub-reason is `user` — **you pressed stop**
   - `interrupted` — crash or restart
   - `error` — runtime failure
2. The composer is empty (no text, no attachments)
3. No turn is currently running

Start typing or attach an image and the button collapses away; clear the composer and it expands back.

## Difference from `@mill413/dsh-session-resume`

That plugin only handles `interrupted` (crash recovery) and **ignores user-initiated stops**.

In DSH these are distinct events:

| `turn/end` reason | Cause | This plugin | session-resume |
|---|---|---|---|
| `aborted` + `reason.kind: "user"` | **user pressed stop** | ✅ | ❌ |
| `interrupted` | written by the crash-repair path | ✅ | ✅ |
| `error` | runtime failure | ✅ | ❌ |
| `completed` | normal finish | ❌ | ❌ |

They can coexist and cover different scenarios.

## Install

```sh
dsh plugin --profile web add client-resume-button
```

Restart DSH afterwards so the browser half loads.

## How it works

### Host half

Registers a session projection `resumeButton` that folds over the committed log:

```js
turn/end { reason.kind: 'aborted', reason: { kind: 'user' } }  →  pending = { turn, kind }
turn/start                                                     →  pending = null
```

Any new turn clears the mark — once you resume the conversation, "continue the previous turn" no longer applies.

While the projection is non-empty, a Remote method `resumeButton.resume(sessionId)` is available:

```js
agent.inbox.prepend('next-turn', detailMessage);  // safety guidance first in queue
agent.steer(leadMessage);                          // wake the idle agent
```

Both messages are delivered as **plugin-origin** (`source.kind = 'client-resume-button'`, `form: 'notice'`), never disguised as user input, and render as collapsed notice rows.

### Browser half

Registers a button in the `conversation.input.right` slot.

Draft emptiness **cannot be read from slot props** — DSH's internal check is `draft.trim() === "" && attachments.length === 0` and both live inside the shell. Instead the plugin reads the primary submit button's `disabled` state:

```js
// class name looks like "<hash>_primary"
button.disabled !== true   // there is submittable content
```

This mirrors DSH's own `primaryDisabled` computation and also covers attachment-only drafts.

## Prompt text

Wake-up + instruction:

```
The previous turn was interrupted. Continue where you left off.
```

State warning (follows Codex's `generic.turn_aborted` semantics, with `unified exec` replaced by the tools that actually exist in DSH):

```
The user interrupted the previous turn on purpose. Any running pwsh commands
or background jobs may still be running. If any tools/commands were aborted,
they may have partially executed. For any interrupted tool call, retry it only
if it is read-only or idempotent; otherwise verify the external state before
proceeding. Do not repeat steps that already completed.
```

## Important limitations

### Button position

It sits **left of the model selector**, not next to the primary submit button.

The closer `conversation.input.activity` slot is unavailable: it is a `single` slot and, in the desktop build, it is taken by the voice-input plugin
(`@deepseek-ai/dsh-experimental-client-ui-voice-input`). Claiming it makes that plugin fail to activate and prevents the whole app from starting.

Do **not** try to work around this by probing for a free slot and registering at a lower priority — that is a race: the other plugin may not have registered yet when you probe, and it will then fail on the priority you already hold.

### It does not restore the interrupted reasoning

Assistant output that was still streaming at the moment of interruption is never persisted, so it cannot be recovered. The button starts a fresh turn with full context rather than continuing a token stream.

Codex behaves the same way.

## Compatibility

Verified on DSH `0.2.0-rc.2` and `0.2.1-rc.2` (desktop).

The plugin relies on these internal contracts; re-verify after a DSH upgrade:

| Contract | Used for |
|---|---|
| `turn/end` reason enum | classifying the interruption |
| `ctx.slots.register` + `conversation.input.right` | where the button mounts |
| `<hash>_primary` class name | empty-draft detection |
| `agent.inbox.prepend` / `agent.steer` | delivering the continuation |
| `window.__ModuleLoader__.load` | client entry format |

## License

MIT
