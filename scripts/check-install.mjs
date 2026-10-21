/**
 * 核对 tarball 装进真实项目后的结果，供 CI 的 install 作业调用。
 *
 * 检查的是「装完还在不在」，不是「装的过程中 npm 说了什么」：
 * `dsh.bundle` 声明和 `cordis.patch.yml` 必须一起活下来，否则插件在客户端里
 * 根本不会被挂载。
 *
 * 用法：node scripts/check-install.mjs <项目目录>
 *
 * @module client-resume-button/scripts/check-install
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (dir === undefined) {
  console.error('usage: node scripts/check-install.mjs <project-dir>');
  process.exit(1);
}

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

const pluginDir = join(dir, 'node_modules', 'client-resume-button');

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'));
} catch (error) {
  fail(`plugin not installed at ${pluginDir}: ${error.message}`);
}

if (manifest.version === undefined) fail('installed manifest has no version');
if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
  fail('dsh.bundle.patch lost or changed on install');
}

const patch = readFileSync(join(pluginDir, 'cordis.patch.yml'), 'utf8');
if (!patch.includes(manifest.name)) {
  fail('bundle patch does not reference the package name');
}

console.log(`    installed ${manifest.name}@${manifest.version} with bundle intact`);
