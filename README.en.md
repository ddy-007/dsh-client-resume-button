# client-resume-button

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.0--rc.2%20%7C%200.2.1--rc.2-blue)](https://github.com/deepseek-ai/deepseek-harness)

Adds a **Continue** button to the DeepSeek Harness composer. When the previous turn was interrupted, one click asks the model to pick that turn back up.

[中文](./README.md) | English

---

## Preview

```
composer:  [+] [workspace] [1,949]    [▶] Deepseek-V4.1-Flash ▾ 🎤 [↑]
                                       ↑
                              appears only after an interruption
```

## What it does

The button appears when all of these hold:

- The previous turn ended with `aborted` (user pressed stop), `interrupted` (crash), or `error`
- The composer is empty (no text, no attachments)
- No turn is running

On click it sends two plugin-origin notices to the model: one asking it to continue, one reminding it to check for leftover processes and not repeat completed steps.

The button collapses when you start typing or attach a file, and expands back when the composer is cleared.

## Install

```sh
dsh plugin --profile web add github:ddy-007/dsh-client-resume-button
```

Restart DSH afterwards — the browser half loads at startup, hot reload does not pick it up.

Manual install: add the package name to the profile's `dsh.profile.bundles` and link it into `node_modules`. Never let a BOM into `package.json`, or startup fails with `Unexpected token '\ufeff'`.

## Uninstall

```sh
dsh plugin --profile web remove client-resume-button
```

Then remove `client-resume-button` from `dsh.profile.bundles` and restart.

## Limitations

- **The button sits left of the model selector**, not next to the primary submit button. The closer `conversation.input.activity` slot is a `single` slot already taken by the voice-input plugin; claiming it prevents the app from starting.
- **It cannot restore the interrupted output.** That partial content was never persisted. The plugin starts a new turn; it does not resume a token stream.

## Compatibility

Verified on DSH `0.2.0-rc.2` and `0.2.1-rc.2`.

Relies on these internal contracts, which may change across DSH releases:

| Contract | Used for |
|---|---|
| `turn/end` reason enum | classifying the interruption |
| `conversation.input.right` slot | where the button mounts |
| `<hash>_primary` class name | empty-draft detection |
| `agent.inbox.prepend` / `agent.steer` | delivering the continuation |
| `window.__ModuleLoader__.load` | client entry format |

## License

MIT
