/**
 * `package.json` 的静态检查，供 CI 调用。
 *
 * 单独成文件而不是塞进 workflow 的 `node -e '...'`：内联脚本被 bash 的单引号
 * 包着，注释或字符串里出现一个撇号就会提前闭合引号，把后面的内容当命令执行。
 * 这个坑真实踩过——`DSH's gate` 里的撇号让 CI 报 `line 22: //: Is a directory`。
 * 独立文件没有这层引号嵌套。
 *
 * 这里只做**结构**检查（字符串长什么样）。真正的解析由 tests/manifest.test.mjs
 * 负责，真正的安装由 workflow 的 install 作业负责。
 *
 * 用法：node scripts/check-manifest.mjs
 *
 * @module client-resume-button/scripts/check-manifest
 */
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

const pkg = JSON.parse(read('package.json'));

// --- bundle 形状 ---------------------------------------------------------
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') fail('dsh.bundle.patch missing or wrong');
if (!read('cordis.patch.yml')) fail('bundle patch file is empty');
if (pkg.dsh?.client?.platform !== 'web') fail('dsh.client.platform must be web');
if (!Array.isArray(pkg.dsh?.client?.inject) || pkg.dsh.client.inject.length === 0) {
  fail('dsh.client.inject must be a non-empty array');
}

// --- 版本范围 ------------------------------------------------------------
const range = pkg.dsh?.engines?.dsh;
if (typeof range !== 'string') fail('dsh.engines.dsh must be declared');

// 刻意不声明任何 @deepseek-ai/* 的 peerDependencies。
//
// 理由不是风格，是实测出来的：npm 7+ 会为缺失的 peer 自动选包，而插件声明的
// 范围一旦跨版本线，它就挑最新的那一支。实测在装了 0.2.1-rc.2 的环境里装本插件，
// npm 会去取 dsh-client-ui-primitives@0.2.2-rc.3，那个包要求 cordis ~4.1.0，
// 而 0.2.1 线装的是 4.0.5，于是 ERESOLVE。schemastery 也一样（0.2.1 要 ~3.18.5，
// 0.2.2 要 ~3.19.0）。
//
// 这些包在宿主里必然存在——插件本来就跑在 DSH 内部——所以声明 peer 没有增加
// 任何保障，只给了 npm 一个出错的机会。兼容性由 dsh.engines.dsh 承担：
// dsh-app-boot 的 unmetRequirements 一旦看到顶层 engines.dsh 就只看它。
if (pkg.peerDependencies !== undefined && Object.keys(pkg.peerDependencies).length > 0) {
  const dshPeers = Object.keys(pkg.peerDependencies).filter((n) => n.startsWith('@deepseek-ai/'));
  if (dshPeers.length > 0) {
    fail(
      `peerDependencies must not declare @deepseek-ai/* (${dshPeers.join(', ')}): ` +
        'npm auto-installs missing peers and resolves them across version lines, which breaks installs',
    );
  }
}

// 单段式（例如 `>=0.2.0-rc.2 <0.3.0`）会静默排除它没有预发布比较符的那些
// 元组上的预发布版。node-semver 只在某个比较符与目标版本共享完整
// major.minor.patch、且该比较符自带预发布标签时才放行预发布版本，所以
// 0.2.1-rc.2 被排除，`npm install` 直接 ERESOLVE。DSH 的兼容门用
// includePrerelease: true 求值，看不出这个问题。
//
// 每出现一个新的 0.2.X 版本线，就要多一段 `>=0.2.X-rc.1` 分支，否则那条线
// 上的预发布版会在 npm 语义里被悄悄排除。这个错误已经犯过两次（0.2.1、0.2.2），
// 所以这里按「已知版本线」逐条校验，而不是只看有没有 `||`。
const KNOWN_LINES = ['0.2.0', '0.2.1', '0.2.2'];
for (const line of KNOWN_LINES) {
  // 该版本线需要一个能接纳其预发布版的分支：`>=<line>-rc...` 或 `<line>-0` 上界形式。
  const admitsPrerelease =
    range.includes(`>=${line}-rc`) || range.includes(`>=${line}-alpha`);
  if (!admitsPrerelease) {
    fail(
      `engines.dsh has no branch admitting ${line} prereleases; ` +
        'node-semver only matches a prerelease when a comparator shares its exact major.minor.patch',
    );
  }
}
// `<0.3.0-0` 是哨兵，连 0.3.0 的预发布版一起挡住；裸 `<0.3.0` 会放行 0.3.0-rc.1。
if (!/<0\.3\.0-0/.test(range)) {
  fail('engines.dsh upper bound must use the <0.3.0-0 sentinel so 0.3.0 prereleases stay out');
}

// --- 其余身份字段 --------------------------------------------------------
if (pkg.private === true) fail('package must not be private');
if (!pkg.name || !pkg.version) fail('name and version are required');

// bundle patch 插入的条目 id 必须等于包名，商店才能按包身份匹配已安装行。
const patch = read(pkg.dsh.bundle.patch);
if (!patch.includes(`id: ${pkg.name}`)) {
  fail('bundle patch must insert an entry id equal to the package name');
}
if (!patch.includes(`name: ${pkg.name}`)) {
  fail('bundle patch must mount the package by its own name');
}

console.log(`manifest OK: ${pkg.name}@${pkg.version} engines=${range}`);
