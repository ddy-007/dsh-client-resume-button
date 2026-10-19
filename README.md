# client-resume-button

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.0--rc.2%20%7C%200.2.1--rc.2-blue)](https://github.com/deepseek-ai/deepseek-harness)
[![Platform](https://img.shields.io/badge/platform-web-lightgrey)]()

给 DeepSeek Harness 的输入框加一个「继续」按钮：上一轮被中断时，点一下就能让模型接着把那一轮做完。

[English](./README.en.md) | 中文

---

## 它解决什么问题

在 DSH 里中断一轮对话很容易——点停止、按 `Esc Esc`、或者进程崩了。但中断之后想接着做，你得重新打一段话解释上下文，模型还得重新理解一遍。

这个插件把「继续」变成一个按钮：

```
输入框底部：[+] [工作区内修改] [1,949]    [▶] Deepseek-V4.1-Flash ▾ 🎤 [↑]
                                          ↑
                                    上一轮被中断时才出现
```

点它就相当于告诉模型：

> 上一轮被打断了，从停下的地方接着做。已完成的步骤不要重做。

## 触发条件

按钮出现在以下**全部满足**时：

1. 上一轮以以下任一方式结束：
   - `aborted` 且子原因是 `user`——**你按了停止**
   - `interrupted`——进程崩溃、重启
   - `error`——运行期错误
2. 当前输入框为空（没有文字、没有附件）
3. 当前没有轮次在跑

一旦你开始输入文字或加图片，按钮就收窄消失；清空后又展开回来。

## 与 `@mill413/dsh-session-resume` 的差别

那个插件只处理 `interrupted`（崩溃恢复），**不处理用户主动中断**。

DSH 里两者是完全不同的事件：

| `turn/end` reason | 产生原因 | 本插件 | session-resume |
|---|---|---|---|
| `aborted` + `reason.kind: "user"` | **用户按停止** | ✅ | ❌ |
| `interrupted` | 崩溃修复器写入 | ✅ | ✅ |
| `error` | 运行期错误 | ✅ | ❌ |
| `completed` | 正常结束 | ❌ | ❌ |

两者可以共存，处理不同场景。

## 安装

### 方式一：从 GitHub 安装（当前）

```sh
dsh plugin --profile web add github:ddy-007/dsh-client-resume-button
```

### 方式二：手动链接（开发调试）

如果本机已有源码，直接建链接后把包名加进 profile 的 `dsh.profile.bundles`：

```powershell
# 1. 链接进 profile 的 node_modules
$profile = "$env:USERPROFILE\.dsh\profiles\desktop"
cmd /c mklink /J "$profile\node_modules\client-resume-button" "C:\path\to\dsh-client-resume-button"

# 2. 在 $profile\package.json 的 dsh.profile.bundles 末尾加一项
#    "client-resume-button"
```

编辑 `package.json` 时**务必不要引入 BOM**，否则 DSH 启动会报
`Unexpected token '\ufeff'`。用 Node 写入最稳妥：

```powershell
node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));if(!j.dsh.profile.bundles.includes('client-resume-button'))j.dsh.profile.bundles.push('client-resume-button');fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n','utf8')" "$profile\package.json"
```

### 装完必须重启

浏览器半边的代码在启动时加载，热重载不会生效。

### 卸载

```sh
dsh plugin --profile web remove client-resume-button
```

然后从 `dsh.profile.bundles` 里删掉 `client-resume-button` 并重启。

## 工作原理

### 宿主半边

注册一个会话投影 `resumeButton`，在已提交的日志上做纯折叠：

```js
turn/end { reason.kind: 'aborted', reason: { kind: 'user' } }  →  pending = { turn, kind }
turn/start                                                     →  pending = null
```

任何新轮次都会清除标记——因为一旦你重新开始对话，就不需要「继续上一轮」了。

投影非空时暴露一个 Remote 动作 `resumeButton.resume(sessionId)`，它做两件事：

```js
agent.inbox.prepend('next-turn', detailMessage);  // 安全指引排到队首
agent.steer(leadMessage);                          // 唤醒空闲的 agent
```

两条消息都以 **plugin 来源**投递（`source.kind = 'client-resume-button'`，`form: 'notice'`），不伪装成用户输入，界面上渲染为可折叠的提示行。

### 浏览器半边

在 `conversation.input.right` 槽位注册一个按钮。

草稿是否为空**无法从插槽 props 拿到**——DSH 内部的条件等价于 `draft.trim() === "" && attachments.length === 0`，两者都在 shell 内部。因此改为读主提交按钮的 `disabled` 状态：

```js
// 类名形如 "<hash>_primary"
button.disabled !== true   // 有可提交内容
```

这与 DSH 自己的 `primaryDisabled` 判断一致，且对纯附件草稿同样成立。

## 提示词

唤醒 + 指令：

```
The previous turn was interrupted. Continue where you left off.
```

状态警告（沿用 Codex `generic.turn_aborted` 模板的语义，把 `unified exec` 换成 DSH 的实际工具）：

```
The user interrupted the previous turn on purpose. Any running pwsh commands
or background jobs may still be running. If any tools/commands were aborted,
they may have partially executed. For any interrupted tool call, retry it only
if it is read-only or idempotent; otherwise verify the external state before
proceeding. Do not repeat steps that already completed.
```

## 重要限制

### 按钮位置

位于**模型选择器左侧**，不在主提交按钮旁边。

更贴近主按钮的 `conversation.input.activity` 槽位不可用：它是 `single` 槽位，在桌面版被语音输入插件
（`@deepseek-ai/dsh-experimental-client-ui-voice-input`）占用。抢占会导致那个插件激活失败、整个应用起不来。

**不要**试图用「探测槽位空闲 + 更低 priority」来绕过——那是时序竞争：探测时对方可能尚未注册，等它注册时该 priority 已被占，照样崩溃。

### 不会恢复「被打断的思考」

中断那一刻正在生成的助手输出**从未落盘**，因此不可能恢复。按钮做的是「带着完整上下文重新开始」，而不是从某个 token 接着生成。

这也和 Codex 的行为一致：它同样是新开一个 turn，而不是续写原来的流。

## 兼容性

实测于 DSH `0.2.0-rc.2` 与 `0.2.1-rc.2`（桌面版）。

插件用到的是以下内部约定，DSH 升级后可能需要重新验证：

| 约定 | 用途 |
|---|---|
| `turn/end` 的 reason 枚举 | 判断中断类型 |
| `ctx.slots.register` + `conversation.input.right` | 按钮挂载点 |
| `<hash>_primary` 类名 | 草稿判空 |
| `agent.inbox.prepend` / `agent.steer` | 投递续跑消息 |
| `window.__ModuleLoader__.load` | 客户端入口格式 |

## 许可

MIT
