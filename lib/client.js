window.__ModuleLoader__.load({
	id: "client-resume-button",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// ---- 宿主提供的依赖（不内联） ----
		var react = require("react");
		var jsxRuntime = require("react/jsx-runtime");
		var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		var _jsx = jsxRuntime.jsx;
		var _jsxs = jsxRuntime.jsxs;
		var useCallback = react.useCallback;
		var useState = react.useState;
		var IconPlayOutlineRegular = primitives.IconPlayOutlineRegular;

		// ---- 文案命名空间 ----
		var NS = "client-resume-button";

		// ---- 可续跑的中断种类（与宿主投影一致） ----
		var RESUMABLE = new Set(["aborted", "interrupted", "error"]);

		/**
		 * 按钮是否应当可见：有可续跑的中断，且草稿为空。
		 *
		 * 单独成函数而不是写在组件里，是为了能不装 React 就测到它。
		 * 组件里那条表达式此前没有任何自动测试——本地没有 React 与 DOM 环境
		 * （宿主把 React 打包在 app.asar 内，不以独立包存在），只能靠人肉点一遍。
		 * 而这里恰恰最容易写错：漏掉 null 判断、把 pending.kind 直接当布尔用、
		 * 忘了看 hasDraft。
		 *
		 * @param {{ pending?: unknown, hasDraft?: unknown }} input
		 * @returns {boolean}
		 */
		function shouldShowButton(input) {
			var source = input === null || input === undefined ? null : input;
			var pending = source === null ? undefined : source.pending;
			if (pending === null || pending === undefined) return false;
			if (typeof pending !== "object") return false;
			if (!RESUMABLE.has(pending.kind)) return false;
			return source.hasDraft !== true;
		}

		// ---- 文案 ----
		var STRINGS = {
			zh: {
				"pending.label": "上一轮被中断",
				"action.resume": "继续",
				"action.resume.aria": "继续上一轮未完成的任务"
			},
			en: {
				"pending.label": "Previous turn interrupted",
				"action.resume": "Continue",
				"action.resume.aria": "Continue the interrupted turn"
			}
		};

		// ---- Remote 贡献（Client 侧） ----
		// 会话 id 严格编解码器：create 由网关调用，返回可解析该值的 schema。
		function stringSchema() {
			return { parse: (v) => v, safeParse: (v) => ({ success: true, data: v }) };
		}
		function resultSchema() {
			return {
				parse: (v) => v,
				safeParse: (v) => ({ success: true, data: v })
			};
		}

		var TYPERT_REMOTE = {
			package: "client-resume-button",
			descriptors: [
				{
					id: "client-resume-button#resumeButton/resume",
					service: "resumeButton",
					namespace: "resumeButton",
					method: "resume",
					summary: "Continue the interrupted turn.",
					description:
						"Ask the live agent for one session to continue the turn it stopped on, " +
						"including a turn the user aborted on purpose.",
					invocation: { kind: "direct" },
					parameters: [
						{
							name: "sessionId",
							wire: "sessionId",
							source: "json",
							codec: {
								mode: "strict",
								typeSymbol:
									"client-resume-button/types#ResumeButtonSessionId",
								create: stringSchema,
								jsonSchema: { type: "string" }
							}
						}
					],
					result: {
						mode: "strict",
						typeSymbol: "client-resume-button/types#ResumeButtonSuccess",
						create: resultSchema,
						jsonSchema: {
							type: "object",
							properties: {
								resumedTurn: { type: "number" },
								kind: { type: "string" }
							},
							required: ["resumedTurn", "kind"],
							additionalProperties: false
						}
					}
				}
			]
		};

		// ---- 草稿检测 ----
		// DSH 内部判空条件等价于
		//   draft.trim() === "" && attachments.length === 0
		// 两者都在 shell 内部，插槽拿不到。
		//
		// 实测（DSH 0.2.1-rc.2）：主提交按钮类名形如 "<hash>_primary"，
		// 其 disabled 正是 primaryDisabled = empty || disabled || machineBusy || uploadsPending。
		// 因此「主按钮可点」即表示草稿非空（含纯附件），这是最贴近内部语义的信号。
		//
		// 查找必须限定在当前输入卡片内：页面同时可能存在子代理输入框、弹窗表单等
		// 其它带 "_primary" 的按钮，全局取第一个会读错对象。
		//
		// ---- 契约自检 ----
		// 下面这些选择器、槽位名、事件形状都是 DSH 的内部实现，没有对外承诺。
		// 官方改名时不会报错，只会静默失效——按钮该收起时不收起，或者干脆不出现，
		// 而使用者无从知道是插件坏了还是 DSH 变了。
		//
		// 因此做一次轻量探测：认不出来就在控制台留一条明确的话，说清是哪条契约变了。
		// 只警告一次，不弹窗、不阻断启动、不重复刷屏。
		var warnedContracts = Object.create(null);

		function warnOnce(key, message) {
			if (warnedContracts[key] === true) return;
			warnedContracts[key] = true;
			if (typeof console !== "undefined" && typeof console.warn === "function") {
				console.warn("[client-resume-button] " + message);
			}
		}

		/**
		 * 探测草稿检测依赖的两条契约，缺失时各警告一次。
		 * 只在确实读到 DOM 之后才判断，避免启动早期误报。
		 * @returns {boolean} 两条契约是否都在
		 */
		function probeContracts() {
			if (typeof document === "undefined") return false;

			var editor = document.querySelector('[contenteditable="true"]');
			if (editor === null) {
				warnOnce(
					"editor",
					'找不到 [contenteditable="true"] 输入框：草稿检测将始终认为输入框为空，' +
						"按钮可能在该收起时仍然显示。DSH 可能改了这个选择器。"
				);
				return false;
			}

			var scope = editor.closest('[class*="_card"]');
			if (scope === null) {
				warnOnce(
					"card",
					'输入框外层找不到 [class*="_card"]，退化为父元素范围，主按钮可能定位不准。'
				);
				scope = editor.parentElement;
			}
			if (scope === null) return false;

			var buttons = scope.querySelectorAll("button");
			for (var i = 0; i < buttons.length; i += 1) {
				var cls = typeof buttons[i].className === "string" ? buttons[i].className : "";
				if (cls.indexOf("_primary") !== -1) return true;
			}
			warnOnce(
				"primary",
				'输入卡片里找不到类名含 "_primary" 的提交按钮：草稿检测失效，' +
					"按钮的显示/收起将不再跟随输入内容。DSH 可能改了这个类名。"
			);
			return false;
		}

		function primaryIntentPresent() {
			if (typeof document === "undefined") return false;

			var editor = document.querySelector('[contenteditable="true"]');
			if (editor === null) return false;

			// 从编辑器向上找到输入卡片，主按钮是卡片内的兄弟分支。
			var scope = editor.closest('[class*="_card"]');
			if (scope === null) scope = editor.parentElement;
			if (scope === null) return false;

			var buttons = scope.querySelectorAll("button");
			for (var i = 0; i < buttons.length; i += 1) {
				var button = buttons[i];
				var cls = typeof button.className === "string" ? button.className : "";
				if (cls.indexOf("_primary") === -1) continue;
				// 主按钮可点 = 有可提交内容。
				return button.disabled !== true;
			}
			return false;
		}

		function useHasDraft() {
			var state = useState(false);
			var hasDraft = state[0];
			var setHasDraft = state[1];

			react.useEffect(function () {
				if (typeof document === "undefined") return undefined;

				var observer = null;
				var observed = null;
				var last = null;
				var scheduled = false;

				// 读一次主按钮状态；只在结果变化时才写 state，
				// 避免 MutationObserver -> setState -> 重渲染 -> MutationObserver 的死循环。
				var read = function () {
					var next = primaryIntentPresent();
					if (next === last) return;
					last = next;
					setHasDraft(next);
				};

				// 合并同一帧内的多次 mutation，避免频繁读取 DOM。
				var schedule = function () {
					if (scheduled) return;
					scheduled = true;
					var raf =
						typeof requestAnimationFrame === "function"
							? requestAnimationFrame
							: function (fn) {
									return setTimeout(fn, 16);
								};
					raf(function () {
						scheduled = false;
						read();
					});
				};

				var attach = function () {
					// 观察范围取输入卡片（含编辑器与主按钮），
					// 这样主按钮 disabled 变化也能触发重算。
					var editor = document.querySelector('[contenteditable="true"]');
					var target = editor;
					if (editor !== null) {
						var card = editor.closest('[class*="_card"]');
						if (card !== null) target = card;
					}
					if (target === observed) return;
					if (observer !== null) observer.disconnect();
					observed = target;
					if (target !== null) {
						observer = new MutationObserver(schedule);
						observer.observe(target, {
							subtree: true,
							childList: true,
							characterData: true,
							attributes: true,
							attributeFilter: ["disabled", "class"]
						});
					}
					read();
				};

				attach();
				probeContracts();

				var onInput = function () {
					attach();
					schedule();
				};
				document.addEventListener("input", onInput, true);

				// 编辑器/按钮可能后挂载（空白会话 → 绑定会话），低频兜底刷新。
				// 自检也在这里重试：启动瞬间 DOM 可能还没渲染出来，此时报警是误报。
				var timer = setInterval(function () {
					attach();
					probeContracts();
					read();
				}, 500);

				return function () {
					if (observer !== null) observer.disconnect();
					document.removeEventListener("input", onInput, true);
					clearInterval(timer);
				};
			}, []);

			return hasDraft;
		}

		// ---- 续跑按钮视图 ----
		function ResumeButtonView(props) {
			var pending = props.pending;
			var onResume = props.onResume;
			var t = props.t;

			var busyState = useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];
			var errorState = useState(null);
			var error = errorState[0];
			var setError = errorState[1];
			var hasDraft = useHasDraft();

			var run = useCallback(
				async function () {
					if (busy) return;
					setBusy(true);
					setError(null);
					var result;
					try {
						result = await onResume();
					} catch (caught) {
						setBusy(false);
						setError(String(caught));
						return;
					}
					setBusy(false);
					if (!result || result.ok === false) {
						var message =
							result && result.error ? result.error.message : "unknown error";
						setError(message);
					}
				},
				[busy, onResume]
			);

			// 是否应当可见：有可续跑中断且草稿为空。
			// 判断本身在 shouldShowButton 里，见该函数的注释。
			var visible = shouldShowButton({ pending: pending, hasDraft: hasDraft });

			// 首次挂载时若已经是可见态，浏览器会直接以最终样式绘制，
			// transition 不会触发。因此先以隐藏态挂载，下一帧再切换。
			var mountedState = useState(false);
			var mounted = mountedState[0];
			var setMounted = mountedState[1];
			react.useEffect(function () {
				var raf =
					typeof requestAnimationFrame === "function"
						? requestAnimationFrame
						: function (fn) {
								return setTimeout(fn, 16);
							};
				var id = raf(function () {
					setMounted(true);
				});
				return function () {
					if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
					else clearTimeout(id);
				};
			}, []);

			// 挂载完成前一律按隐藏绘制，让宽度从 0 过渡到 28px。
			var shown = mounted && visible;

			// 宽度收放动效：隐藏时宽度归零、淡出、缩小，
			// 而不是直接卸载，这样按钮出现/收回是连续的。
			//
			// 视觉：位于 conversation.input.right（模型选择器左侧），
			// 采用与周围控件一致的透明底 + 细边框。
			// 注：更贴近主按钮的 activity 槽位不可用，原因见 applySurface。
			return _jsx("button", {
				type: "button",
				disabled: busy,
				title: error !== null ? error : t("action.resume.aria"),
				"aria-label": t("action.resume.aria"),
				"data-client-resume-button": true,
				"data-visible": shown ? "true" : "false",
				style: {
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					boxSizing: "border-box",
					height: "28px",
					padding: "0",
					borderRadius: "999px",
					border: shown
						? "1px solid var(--dsh-border, rgba(255,255,255,0.18))"
						: "1px solid transparent",
					background: "transparent",
					color: "inherit",
					overflow: "hidden",
					flex: "none",
					cursor: busy ? "default" : "pointer",
					width: shown ? "28px" : "0px",
					marginLeft: shown ? "2px" : "0px",
					marginRight: shown ? "6px" : "0px",
					opacity: shown ? (busy ? "0.5" : "1") : "0",
					transform: shown ? "scale(1)" : "scale(0.6)",
					pointerEvents: shown ? "auto" : "none",
					transition:
						"width 200ms cubic-bezier(.4,0,.2,1)," +
						"margin 200ms cubic-bezier(.4,0,.2,1)," +
						"opacity 160ms ease," +
						"transform 200ms cubic-bezier(.4,0,.2,1)," +
						"border-color 160ms ease"
				},
				onClick: function () {
					if (!shown) return;
					void run();
				},
				children: _jsx(IconPlayOutlineRegular, { size: 14 })
			});
		}

		// ---- 读取宿主投影 ----
		function ResumeButtonBar(props) {
			var useProjection = props.useProjection;
			var projection = useProjection("resumeButton");
			var pending =
				projection === undefined || projection === null
					? null
					: projection.pending;

			return _jsx(ResumeButtonView, {
				pending: pending,
				onResume: props.onResume,
				t: props.t
			});
		}

		// ---- 面板依赖 ----
		var SURFACE_INJECT = [
			"slots",
			"locale",
			"remote",
			"remote.resumeButton",
			"uiConversation"
		];

		// ---- 注册文案与输入区按钮 ----
		function applySurface(ctx) {
			ctx.effect(function () {
				return ctx.locale.register(NS, STRINGS);
			}, "client-resume-button: dictionaries");

			// 槽位选择：固定使用 conversation.input.right（list 槽位，可安全共存）。
			//
			// 为什么不用 conversation.input.activity：
			//   它是 single 槽位，桌面版被语音输入插件
			//   (@deepseek-ai/dsh-experimental-client-ui-voice-input) 占用。
			//   抢占会让那个插件激活失败，整个应用起不来。
			//   曾用「试注册探测 + priority: -1」规避，但那是时序竞争：
			//   探测时对方可能尚未注册，等它注册时 -1 已被占，照样抛错崩溃。
			//   因此这里彻底放弃 activity，只用 list 槽位。
			ctx.slots.inject("conversation.input.right", function () {
				return ctx.slots.register(
					{
						name: "conversation.input.right",
						id: "client-resume-button",
						priority: 5,
						locale: NS,
						inject: function (sessionId) {
							return {
								onResume: async function () {
									return await ctx.remote.resumeButton.resume(sessionId);
								}
							};
						}
					},
					ResumeButtonBar
				);
			});
		}

		// ---- 入口 ----
		async function apply(ctx) {
			var disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE);
			var surface;
			try {
				surface = ctx.inject(SURFACE_INJECT, applySurface);
				await surface;
			} catch (error) {
				await disposeRemote();
				throw error;
			}
			return async function () {
				await surface.dispose();
				await disposeRemote();
			};
		}

		// ---- 导出 ----
		exports.inject = ["remote"];
		exports.apply = apply;
		exports.ResumeButtonBar = ResumeButtonBar;
		// 暴露给测试。生产环境没有调用者，导出本身无副作用。
		exports.shouldShowButton = shouldShowButton;
		return module.exports;
	}
});
