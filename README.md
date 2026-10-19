# client-resume-button

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.0--rc.2%20%7C%200.2.1--rc.2-blue)](https://github.com/deepseek-ai/deepseek-harness)

给 DeepSeek Harness 的输入框加一个「继续」按钮：上一轮被中断后，点一下就能让模型接着把那一轮做完。

[English](./README.en.md) | 中文

---

## 效果

![preview](./docs/screenshot.png)

红圈处即「继续」按钮，位于模型选择器左侧。开始输入或添加附件时它收窄消失，清空后展开回来。

## 功能

按钮出现条件（需全部满足）：

- 上一轮以 `aborted`（用户按停止）、`interrupted`（崩溃）或 `error` 结束
- 输入框为空（无文字、无附件）
- 当前无轮次运行

点击后发送两条 plugin 来源的提示给模型：一条要求继续，一条提醒检查残留进程、不重做已完成步骤。

## 安装

从 GitHub 安装：

```sh
dsh plugin --profile web add github:ddy-007/dsh-client-resume-button
```

装完**重启 DSH**。浏览器端代码在启动时加载，热重载不生效。

**如果上面报错**（旧版 CLI 可能不支持 `github:` 前缀），改用 pnpm 的 git 语法：

```sh
dsh plugin --profile web add https://github.com/ddy-007/dsh-client-resume-button.git
```

**手动安装**：克隆到本地，把包名 `client-resume-button` 加进 profile 的 `dsh.profile.bundles`，并在 `node_modules` 下建目录链接指向它。

改 `package.json` 时注意不要引入 BOM，否则启动报 `Unexpected token '\ufeff'`。用 Node 写入最稳妥：

```sh
node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));if(!j.dsh.profile.bundles.includes('client-resume-button'))j.dsh.profile.bundles.push('client-resume-button');fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n','utf8')" "$DSH_PROFILE/package.json"
```

## 卸载

```sh
dsh plugin --profile web remove client-resume-button
```

再从 `dsh.profile.bundles` 删掉 `client-resume-button`，重启。

## 限制

- **按钮位于模型选择器左侧**，不在主提交按钮旁。更近的 `conversation.input.activity` 槽位是 `single` 类型，已被语音输入插件占用，抢占会导致应用无法启动。
- **不能恢复中断时的半截输出**。那部分内容从未写入日志，插件是新开一轮 turn 重做，而非续写原流。

## 兼容性

实测 DSH `0.2.0-rc.2`、`0.2.1-rc.2`。

依赖以下内部约定，DSH 升级后可能失效：

| 约定 | 用途 |
|---|---|
| `turn/end` reason 枚举 | 判断中断类型 |
| `conversation.input.right` 槽位 | 按钮挂载位置 |
| `<hash>_primary` 类名 | 判断草稿是否为空 |
| `agent.inbox.prepend` / `agent.steer` | 投递续跑消息 |
| `window.__ModuleLoader__.load` | 客户端入口格式 |

## 许可

MIT
