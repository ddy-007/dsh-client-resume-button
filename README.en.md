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

The button appears when all of these hold:

- The previous turn ended with `aborted` (user pressed stop), `interrupted` (crash), or `error`
- The composer is empty (no text, no attachments)
- No turn is running

On click it sends two plugin-origin notices to the model: one asking it to continue, one reminding it to check for leftover processes and not repeat completed steps.

## Install

Put the profile you actually run after `--profile`: `desktop` for the desktop client, `web` for `dsh web`.

From GitHub:

```sh
dsh plugin --profile desktop add github:ddy-007/dsh-client-resume-button
```

**Mainland China networks**: the git protocol to `github.com` is frequently blocked. Use the `ghproxy.net` mirror (read-only, enough to install):

```sh
dsh plugin --profile desktop add https://ghproxy.net/https://github.com/ddy-007/dsh-client-resume-button.git
```

**If that errors** (older CLIs may not accept the `github:` prefix), use the plain git URL form:

```sh
dsh plugin --profile desktop add https://github.com/ddy-007/dsh-client-resume-button.git
```

Restart DSH afterwards — the browser half loads at startup, hot reload does not pick it up.

### Local development

Use `link:` so you do not reinstall on every edit. `dsh` records the dependency in `package.json` and appends the package to `dsh.profile.bundles` for you:

```sh
dsh plugin --profile desktop add "link:<absolute path to the repo>"
```

Edits under `lib/*.js` then take effect on the next restart.

### Manual install

Add `client-resume-button` to the profile's `dsh.profile.bundles`, and create a directory link to it under `node_modules`.

Never let a BOM into `package.json`, or startup fails with `Unexpected token '\ufeff'`. Writing it through Node is safest:

```sh
node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));if(!j.dsh.profile.bundles.includes('client-resume-button'))j.dsh.profile.bundles.push('client-resume-button');fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n','utf8')" "$DSH_PROFILE/package.json"
```

## Uninstall

```sh
dsh plugin --profile desktop remove client-resume-button
```

## Limitations

- **The button sits left of the model selector**, not next to the primary submit button. The closer `conversation.input.activity` slot is a `single` slot already taken by the voice-input plugin; claiming it prevents the app from starting.
- **Starting a new turn dismisses it.** The interruption mark is cleared on the next `turn/start` — once you send anything after interrupting, the chance to continue that turn is gone.
- **It cannot restore the interrupted output.** That partial content was never persisted. The plugin starts a new turn; it does not resume a token stream.

## Compatibility

Verified on DSH `0.2.0-rc.2` and `0.2.1-rc.2`. The manifest declares `dsh.engines.dsh: ">=0.2.0-rc.2"`, so the plugin manager refuses to install on an older DSH (or asks for an explicit exemption) and allows newer ones.

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
