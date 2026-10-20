# client-resume-button

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-%3E%3D0.2.0--rc.2-blue)](https://github.com/deepseek-ai/deepseek-harness)

Adds a **Continue** button to the DeepSeek Harness composer. When the previous turn was interrupted, one click asks the model to pick that turn back up.

[中文](./README.md) | English

---

## Preview

![preview](./docs/screenshot.png)

The circled button is **Continue**, sitting left of the model selector. It collapses when you start typing or attach a file, and expands back when the composer is cleared.

## What it does

The button is visible when both hold:

- The previous turn ended with `aborted` (user pressed stop), `interrupted` (crash), or `error`
- The primary submit button is disabled — meaning the composer is empty, no attachment is pending upload, and no turn is running

`aborted` only counts when the sub-reason is the user pressing stop; a timeout or policy cancel does not.

On click it sends two plugin-origin notices to the model: one asking it to continue, one reminding it to check for leftover processes and not repeat completed steps.

## Install

```
Plugins → Add plugin → enter client-resume-button → install → restart DSH
```

Command-line equivalent (`--profile` is the profile you actually run: `desktop` for the desktop client, `web` for `dsh web`):

```sh
dsh plugin --profile desktop add client-resume-button
```

**Restart DSH afterwards** — the browser half loads at startup only.

<details>
<summary>Other install methods</summary>

From the Git repository (requires reaching `github.com`):

```sh
dsh plugin --profile desktop add github:ddy-007/dsh-client-resume-button
```

If `github.com` is unreachable, a third-party mirror such as `ghproxy.net` can relay the clone. A mirror is a convenience for working around network restrictions, not a recommended path — it routes your install through a third party whose supply-chain trust this project has not assessed. Prefer the npm package or a direct GitHub connection.

```sh
dsh plugin --profile desktop add https://ghproxy.net/https://github.com/ddy-007/dsh-client-resume-button.git
```

While editing the source, use `link:` so you do not reinstall on every change:

```sh
dsh plugin --profile desktop add "link:<absolute path to the repo>"
```

</details>

## Uninstall

```sh
dsh plugin --profile desktop remove client-resume-button
```

## Verification

```sh
npm test         # 26 assertions: each interruption leaves a mark, completed and timeout do not
npm run record   # one printed fold per state
npm run verify   # mounts the real projection registry in a throwaway DSH_HOME
```

`npm test` and `npm run record` touch only `lib/projection.js`, which has no imports, so they need no installed dependencies and no network. `npm run verify` needs the SDK (`pnpm install`): it mounts a real Cordis context and the real projection registry, appends real events to a real `Session`, then reads the snapshot the client renders from.

The event shapes in the suite come from real session logs rather than invented approximations.

## Limitations

- **The button sits left of the model selector**, not next to the primary submit button. The closer `conversation.input.activity` slot is a `single` slot already taken by the voice-input plugin; claiming it prevents the app from starting.
- **Starting a new turn dismisses it.** The interruption mark is cleared on the next `turn/start` — once you send anything after interrupting, the chance to continue that turn is gone.
- **It cannot restore the interrupted output.** That partial content was never persisted. The plugin starts a new turn; it does not resume a token stream.

## Compatibility

Verified on DSH `0.2.0-rc.2` and `0.2.1-rc.2`. `dsh.engines.dsh` declares `>=0.2.0-rc.2 <0.3.0`; below that floor or at `0.3.0` the install is refused.

Relies on these internal contracts, which may change across DSH releases: the `turn/end` reason enum, the `conversation.input.right` slot, the `<hash>_primary` class name, `agent.inbox.prepend` / `agent.steer`, and `window.__ModuleLoader__.load`.

## License

MIT
