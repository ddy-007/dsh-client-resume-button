/**
 * 在 Node 里装载 `lib/client.js`，取得它导出的纯逻辑，供测试调用。
 *
 * `lib/client.js` 是浏览器侧的模块：整个文件包在
 * `window.__ModuleLoader__.load({ id, factory })` 里，DSH 的客户端加载器
 * 用一组运行时依赖（react、jsx-runtime、primitives……）去调 factory。
 * 这里提供一个最小替身：装出 `window`，用桩函数顶替那些依赖，
 * 再取 factory 的返回值。
 *
 * 之所以只取 `shouldShowButton` 这类不碰 React 的导出：
 * 真正的组件渲染需要真实 react + react-dom + DOM 环境，本地没有
 * （宿主把 React 打包在 app.asar 内，不以独立包存在）。所以本文件
 * 能覆盖的是判断逻辑，不是渲染结果——这个边界必须说清楚，
 * 不能让测试通过看起来像渲染也验证过了。
 *
 * @module client-resume-button/tests/support/load-client
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

/** 满足 `client.js` 顶层 `require(...)` 的最小桩集合。 */
function makeStubs() {
  const noop = () => {};
  const stubComponent = () => null;

  const reactStub = {
    useCallback: (fn) => fn,
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, noop],
    useEffect: noop,
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
  };

  const jsxRuntimeStub = {
    jsx: stubComponent,
    jsxs: stubComponent,
    jsxDEV: stubComponent,
  };

  const primitivesStub = {
    IconPlayOutlineRegular: stubComponent,
  };

  return new Map([
    ['react', reactStub],
    ['react/jsx-runtime', jsxRuntimeStub],
    ['@deepseek-ai/dsh-client-ui-primitives', primitivesStub],
  ]);
}

/**
 * 装载 client.js 并返回它的 exports。
 * @param {string} clientPath - `lib/client.js` 的绝对路径。
 * @param {{ document?: object, console?: object }} [options]
 *   `document` 不传则模拟非浏览器环境；传入一个桩即可驱动 DOM 相关逻辑。
 *   `console` 不传则用真实 console，传桩可捕获警告。
 * @returns {object} factory 返回的模块对象。
 */
export function loadClient(clientPath, options = {}) {
  const source = readFileSync(clientPath, 'utf8');
  const stubs = makeStubs();

  let captured;
  const windowStub = {
    __ModuleLoader__: {
      load(definition) {
        if (definition.id !== 'client-resume-button') {
          throw new Error(`unexpected plugin id: ${definition.id}`);
        }
        captured = definition.factory((name) => {
          if (!stubs.has(name)) {
            throw new Error(`client.js required an unstubbed module: ${name}`);
          }
          return stubs.get(name);
        });
      },
    },
  };

  // client.js 在模块作用域里直接读 `document`，所以要么不给（模拟非浏览器环境），
  // 要么给一个调用方提供的桩。上下文里显式传入，避免它摸到真实 DOM。
  const context = { window: windowStub, console: options.console ?? console, setTimeout, clearTimeout, setInterval, clearInterval };
  if (options.document !== undefined) context.document = options.document;

  runInNewContext(source, context);

  if (captured === undefined) {
    throw new Error('client.js did not call window.__ModuleLoader__.load');
  }
  return captured;
}
