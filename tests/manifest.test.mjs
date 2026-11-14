/**
 * `package.json` 里 DSH 版本范围的契约测试。
 *
 * 这里守的是一个容易被改回去的缺陷：`>=0.2.0-rc.2 <0.3.0` 这种「看起来足够宽」
 * 的范围会静默排除所有 `0.2.1-*` 预发布版。node-semver 只在**某个比较符本身**
 * 与目标版本共享完整的 `major.minor.patch` 元组、且那个比较符自带预发布标签时，
 * 才放行该预发布版本；否则一律排除，与范围看起来有多宽无关。
 *
 * 后果分两层：
 *
 * 1. `dsh.engines.dsh` —— DSH 自己的兼容门（`unmetRequirements`）。它用
 *    `includePrerelease: true` 求值，所以旧的单区间恰好放行 `0.2.1-rc.2`，
 *    装得上、不报错，缺陷在这一层不可见。
 * 2. `@deepseek-ai/dsh` peer —— npm 用默认语义求值，旧的单区间拒绝
 *    `0.2.1-rc.2`，`npm install` 直接 ERESOLVE。这一层用户看得到。
 *
 * 两处求值语义不同，所以范围必须在**两种语义下对已发布版本给出同一答案**，
 * 否则「DSH 装得上」与「npm 装得上」就会分叉。本测试钉住这个一致性。
 *
 * 解析器是手写的，只实现本文件用到的 semver 子集（`||`、AND 比较符、`-0` 哨兵）
 * 连同那条预发布元组规则。不引入 semver 依赖——`node --test` 要在没装
 * node_modules 的机器上也能跑。
 *
 * 运行：node --test
 *
 * @module client-resume-button/tests/manifest
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/** 拆成元组与预发布标识数组；无预发布标签时后者为空。 */
function parse(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  assert.ok(match, `无法解析的版本：${version}`);
  const [, major, minor, patch, prerelease] = match;
  return {
    tuple: [Number(major), Number(minor), Number(patch)],
    prerelease: prerelease === undefined ? [] : prerelease.split('.'),
  };
}

/**
 * semver 的预发布比较：逐段比，两端都是数字时按数值比，
 * 数字段低于非数字段，前缀相同时较短者更小，且带预发布标签的整体低于同名正式版。
 */
function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return Number(a) < Number(b) ? -1 : 1;
    if (aNumeric) return -1;
    if (bNumeric) return 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

/** 完整版本比较。 */
function compareVersions(left, right) {
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.tuple[index] !== b.tuple[index]) return a.tuple[index] < b.tuple[index] ? -1 : 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

/** 把一个比较符拆成操作符与目标版本。 */
function comparatorParts(comparator) {
  const match = /^(>=|<=|>|<|=)?\s*(.+)$/.exec(comparator.trim());
  assert.ok(match, `无法解析的比较符：${comparator}`);
  return { operator: match[1] ?? '=', target: match[2] };
}

/** 单个比较符的纯大小判断，不含预发布规则。 */
function compareWith(version, comparator) {
  const { operator, target } = comparatorParts(comparator);
  const order = compareVersions(version, target);
  switch (operator) {
    case '>=': return order >= 0;
    case '<=': return order <= 0;
    case '>': return order > 0;
    case '<': return order < 0;
    case '=': return order === 0;
    default: throw new Error(`未知操作符：${operator}`);
  }
}

/**
 * 一组 AND 比较符的求值，含 semver 的预发布规则：
 * 带预发布标签的版本，只有当某个比较符的目标版本与它共享同一
 * `major.minor.patch` 元组、且该目标本身也带预发布标签时才可能通过。
 */
function testComparatorSet(version, comparators, { includePrerelease = false } = {}) {
  if (!comparators.every((comparator) => compareWith(version, comparator))) return false;
  const { tuple, prerelease } = parse(version);
  if (prerelease.length === 0 || includePrerelease) return true;
  return comparators.some((comparator) => {
    const target = parse(comparatorParts(comparator).target);
    if (target.prerelease.length === 0) return false;
    return target.tuple[0] === tuple[0]
      && target.tuple[1] === tuple[1]
      && target.tuple[2] === tuple[2];
  });
}

/** 完整范围：按 `||` 分组，任一区间通过即可。 */
function satisfies(version, fullRange, options = {}) {
  return fullRange.split('||').some((range) => testComparatorSet(
    version,
    range.trim().split(/\s+/),
    options,
  ));
}

/** registry 上 `@deepseek-ai/dsh` 已发布的全部版本。 */
const PUBLISHED = [
  '0.1.7-alpha.2',
  '0.1.7-rc.1',
  '0.1.7-rc.2',
  '0.2.0-rc.1',
  '0.2.0-rc.2',
  '0.2.1-alpha.1',
  '0.2.1-alpha.2',
  '0.2.1-alpha.3',
  '0.2.1-alpha.4',
  '0.2.1-alpha.5',
  '0.2.1-rc.1',
  '0.2.1-rc.2',
  '0.2.1-rc.3',
  '0.2.1-rc.4',
  '0.2.1-rc.5',
  '0.2.2-alpha.2',
  '0.2.2-alpha.3',
  '0.2.2-rc.1',
  '0.2.2-rc.2',
  '0.2.2-rc.3',
];

const enginesRange = pkg.dsh.engines.dsh;
const compatibilityRange = pkg.dsh.compatibility.dsh;

test('engines.dsh 与 dsh.compatibility.dsh 声明同一个范围', () => {
  assert.equal(enginesRange, compatibilityRange);
});

/**
 * 不声明任何 @deepseek-ai/* 的 peerDependencies。
 *
 * npm 7+ 会为缺失的 peer 自动选包，而插件的范围一旦跨版本线，它就挑最新的
 * 那一支。实测在装了 0.2.1-rc.2 的环境里装本插件，npm 会取
 * `dsh-client-ui-primitives@0.2.2-rc.3`，那个包要求 `cordis ~4.1.0`，
 * 而 0.2.1 线装的是 4.0.5 —— ERESOLVE。`schemastery` 同样跨线
 * （0.2.1 要 ~3.18.5，0.2.2 要 ~3.19.0）。
 *
 * 这些包在宿主里必然存在，声明 peer 不增加保障，只给 npm 一个出错的机会。
 * 兼容性由 engines.dsh 承担，DSH 的 unmetRequirements 只看它。
 */
test('不声明 @deepseek-ai/* 的 peerDependencies', () => {
  const peers = pkg.peerDependencies ?? {};
  const dshPeers = Object.keys(peers).filter((name) => name.startsWith('@deepseek-ai/'));
  assert.deepEqual(
    dshPeers,
    [],
    `${dshPeers.join(', ')} 会让 npm 跨版本线自动解析 peer，破坏安装`,
  );
});

test('实测过的版本都被接受', () => {
  for (const version of ['0.2.0-rc.2', '0.2.1-rc.2', '0.2.2-rc.1']) {
    assert.ok(satisfies(version, enginesRange), `DSH ${version} 应被 npm 默认语义接受`);
    assert.ok(
      satisfies(version, enginesRange, { includePrerelease: true }),
      `DSH ${version} 应被兼容门接受`,
    );
  }
});

/**
 * 真正的回归点：旧的单区间在 npm 默认语义下拒绝所有 `0.2.1-rc.*`。
 */
test('每个 0.2.1-rc 版本都被 npm 默认语义接受', () => {
  for (const version of PUBLISHED.filter((v) => /^0\.2\.1-rc\./.test(v))) {
    assert.ok(
      satisfies(version, enginesRange),
      `${version} 被范围排除——必须用显式预发布分支`,
    );
  }
});

/**
 * 同一类缺陷的第二例：`<0.3.0-0` 那一段里没有 `0.2.2` 元组的预发布比较符。
 */
test('每个 0.2.2-rc 版本都被 npm 默认语义接受', () => {
  for (const version of PUBLISHED.filter((v) => /^0\.2\.2-rc\./.test(v))) {
    assert.ok(
      satisfies(version, enginesRange),
      `${version} 被范围排除——` +
        '`<0.3.0-0` 没有 0.2.2 元组的预发布比较符，需要独立的 || 分支',
    );
  }
});

test('两种求值语义对每个已发布版本结论一致', () => {
  for (const version of PUBLISHED) {
    assert.equal(
      satisfies(version, enginesRange),
      satisfies(version, enginesRange, { includePrerelease: true }),
      `${version} 在两种语义下结论不同：DSH 装得上与 npm 装得上会分叉`,
    );
  }
});

/**
 * 历史上还踩过一个 `"*"` 的坑：这些包的 npm `latest` 标签停在很旧的版本
 * （例如 `dsh-client-ui-conversation` 的 `latest` 是 `0.0.1-rc.1`），
 * 通配符让 npm 挑 `latest`，展开出一份 0.0.x 旧依赖图，其中包含从未发布到
 * npm 的 `dsh-compact`，安装当场失败。现在整类 peer 都删掉了，这条作为
 * 兜底：万一有人把 `@deepseek-ai/*` 加回 peer，范围不能是通配符。
 */
test('若存在 @deepseek-ai/* peer，其范围不得为通配符', () => {
  const peers = pkg.peerDependencies ?? {};
  for (const [name, range] of Object.entries(peers)) {
    if (!name.startsWith('@deepseek-ai/')) continue;
    assert.notEqual(
      range.trim(),
      '*',
      `${name} 用了 "*"：npm 会解析到过时的 latest 标签，拉出一份不存在的依赖图`,
    );
  }
});

test('下界之下被拒绝', () => {
  for (const version of ['0.1.7-rc.1', '0.1.7-rc.2', '0.2.0-rc.1']) {
    assert.ok(!satisfies(version, enginesRange), `${version} 低于下界，应被拒绝`);
  }
});

test('0.3.0 及其预发布版被拒绝', () => {
  for (const version of ['0.3.0', '0.3.0-rc.1']) {
    assert.ok(!satisfies(version, enginesRange), `${version} 达到上界，应被拒绝`);
  }
});

test('尚未发布的正式版 0.2.1 与 0.2.9 仍被接受', () => {
  for (const version of ['0.2.1', '0.2.9']) {
    assert.ok(satisfies(version, enginesRange), `${version} 在 0.2 线上，应被接受`);
  }
});

/**
 * 反例自检：确认上面那套解析器真的会拒绝旧的单区间。
 * 少了这条，整个文件可能在「解析器永远返回 true」的情况下悄悄全绿。
 */
test('旧的单区间写法确实漏掉 0.2.1-rc.2（反例自检）', () => {
  const legacy = '>=0.2.0-rc.2 <0.3.0';
  assert.ok(!satisfies('0.2.1-rc.2', legacy), '旧范围应当排除 0.2.1-rc.2');
  assert.ok(satisfies('0.2.0-rc.2', legacy), '旧范围应当接受 0.2.0-rc.2');
  assert.ok(
    satisfies('0.2.1-rc.2', legacy, { includePrerelease: true }),
    '旧范围在兼容门语义下放行 0.2.1-rc.2——缺陷之所以不可见',
  );
});
