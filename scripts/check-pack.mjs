/**
 * 核对 `npm pack` 打出来的 tarball 是否带齐插件运行需要的东西。
 *
 * 供 CI 的 pack 作业调用，参数是 `npm pack --dry-run --json` 写出的报告路径。
 *
 * npm 12 把报告按包名做键返回对象，而不是数组——早先按数组解析会得到
 * `Cannot read properties of undefined (reading 'files')`。
 *
 * 用法：node scripts/check-pack.mjs <pack-report.json>
 *
 * @module client-resume-button/scripts/check-pack
 */
import { readFileSync } from 'node:fs';

const reportPath = process.argv[2];
if (reportPath === undefined) {
  console.error('usage: node scripts/check-pack.mjs <pack-report.json>');
  process.exit(1);
}

const doc = JSON.parse(readFileSync(reportPath, 'utf8'));

// npm 12 按包名做键；旧版是数组。两种都接住。
const entry = Array.isArray(doc) ? doc[0] : Object.values(doc)[0];
if (entry === undefined || !Array.isArray(entry.files)) {
  console.error('FAIL: unexpected npm pack report shape');
  process.exit(1);
}

const files = entry.files.map((file) => file.path);

const required = [
  'package.json',
  'cordis.patch.yml',
  'lib/index.js',
  'lib/client.js',
  'lib/projection.js',
  'lib/resume.js',
  'README.md',
  'LICENSE',
];

const missing = required.filter((file) => !files.includes(file));
if (missing.length > 0) {
  console.error(`FAIL: tarball is missing ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`pack OK: ${files.length} files, ${entry.size} bytes packed`);
