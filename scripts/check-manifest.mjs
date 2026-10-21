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
if (typeof pkg.peerDependencies?.['@deepseek-ai/dsh'] !== 'string') {
  fail('@deepseek-ai/dsh peer must be declared');
}
if (pkg.peerDependencies['@deepseek-ai/dsh'] !== range) {
  fail('engines.dsh and the @deepseek-ai/dsh peer must state the same range');
}

// 单段式（例如 `>=0.2.0-rc.2 <0.3.0`）会静默排除它没有预发布比较符的那些
// 元组上的预发布版。node-semver 只在某个比较符与目标版本共享完整
// major.minor.patch、且该比较符自带预发布标签时才放行预发布版本，所以
// 0.2.1-rc.2 被排除，`npm install` 直接 ERESOLVE。DSH 的兼容门用
// includePrerelease: true 求值，看不出这个问题。
if (!range.includes('||')) {
  fail('engines.dsh needs an explicit prerelease branch (a bare range drops 0.2.1-rc.* and breaks npm install)');
}
// `<0.3.0-0` 是哨兵，连 0.3.0 的预发布版一起挡住；裸 `<0.3.0` 会放行 0.3.0-rc.1。
if (!/<0\.3\.0-0/.test(range)) {
  fail('engines.dsh upper bound must use the <0.3.0-0 sentinel so 0.3.0 prereleases stay out');
}

// --- peer 范围 -----------------------------------------------------------
// `"*"` 对 @deepseek-ai 的包是陷阱：它们的 npm `latest` 标签停在很旧的版本
// （配套 harness 的线在 `next` 上），通配符会让 npm 挑 `latest`，展开出一份
// 0.0.x 旧依赖图，其中包含从未发布到 npm 的包，安装当场失败。
for (const [name, dep] of Object.entries(pkg.peerDependencies ?? {})) {
  if (!name.startsWith('@deepseek-ai/')) continue;
  if (dep.trim() === '*') {
    fail(`${name} peer must not be a bare wildcard (npm resolves it to the stale latest tag)`);
  }
}
for (const [name, dep] of Object.entries(pkg.peerDependencies ?? {})) {
  if (name === '@deepseek-ai/dsh' || !name.startsWith('@deepseek-ai/dsh-')) continue;
  if (dep !== range) fail(`${name} peer must use the same range as engines.dsh`);
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
