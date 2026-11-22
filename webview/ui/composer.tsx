// Composer 等价迁移（TASK-009 §10.14 D3 逐能力表）：
//   Enter 发送 / Shift+Enter 换行 / isComposing 防误发（React 接线，语义同构）；
//   ComposerPrimitive.Send 图标化（aria-label「发送」，D6③）/ ComposerPrimitive.Cancel → post abort，
//   运行中显示 Stop、隐藏发送（ThreadPrimitive.If running 同构）；
//   @ 文件选择器（fileRefTrigger 纯谓词 + insert_file_ref → hostActions QuickPick → file_ref 插入）；
//   / 命令菜单（render/commandMenu.ts 纯逻辑零改动复用）；
//   底部模型选择器（request_models/models_list/set_model 协议）+ 上下文用量行（format.ts 复用）；
//   steer/followUp 模式切换（运行中 mode=select 值、否则 auto）；
//   input_prefill 预填（FR-FILE-03）。
// ComposerRuntime.setText 光标插入契约锚点：§11 #22。

import { ComposerPrimitive, ThreadPrimitive, useAui } from "@assistant-ui/react";
import { useEffect, useRef, useState } from "react";
import type { SlashCommandInfo, WebviewToHost } from "../../src/panel/messages";
import { CommandMenuState } from "../render/commandMenu";
import { formatContextUsage } from "../render/format";
import { FileRefTriggerState } from "./fileRefTrigger";
import type { UiState } from "./store";

const SEND_SVG_PATH = "M8 13.2V3.6M8 3.6 4.3 7.3M8 3.6l3.7 3.7";

export interface ComposerProps {
  state: UiState;
  post: (message: WebviewToHost) => void;
}

export function Composer({ state, post }: ComposerProps): React.ReactElement {
  const aui = useAui();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const [sendMode, setSendMode] = useState<"steer" | "followUp">("steer");
  const [cmdTick, setCmdTick] = useState(0);
  const cmdMenuRef = useRef(new CommandMenuState());
  const fileTriggerRef = useRef(new FileRefTriggerState());
  const slashRequestedRef = useRef(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const cmdMenu = cmdMenuRef.current;

  // config 事件 → 插话模式默认值（旧实现 sendModeEl.value = msg.sendMode 同语义）
  useEffect(() => {
    setSendMode(state.sendMode);
  }, [state.sendMode]);

  // 命令全集同步（commands 事件）；会话切换/历史重建后缓存失效重取（旧 invalidateSlashCommands 同语义）
  useEffect(() => {
    cmdMenu.setCommands(state.commands);
    setCmdTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.commands]);

  useEffect(() => {
    if (state.sessionEpoch === 0) return;
    slashRequestedRef.current = false;
    cmdMenu.setCommands([]);
    setCmdTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessionEpoch]);

  // file_ref / input_prefill 文本插入（ComposerRuntime.setText 全文重写，§11 #22）
  useEffect(() => {
    const insertion = state.insertion;
    if (!insertion) return;
    const input = inputRef.current;
    if (insertion.replaceAt && input) {
      // 旧 insertAtCursor(text, replaceAt)：光标前为 `@` 时替换之
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const value = input.value;
      if (start > 0 && value[start - 1] === "@") {
        const next = value.slice(0, start - 1) + insertion.text + value.slice(end);
        aui.composer.setText(next);
        requestAnimationFrame(() => {
          input.setSelectionRange(start - 1 + insertion.text.length, start - 1 + insertion.text.length);
        });
      } else {
        const next = value.slice(0, start) + insertion.text + value.slice(end);
        aui.composer.setText(next);
        requestAnimationFrame(() => {
          input.setSelectionRange(start + insertion.text.length, start + insertion.text.length);
        });
      }
    } else {
      aui.composer.setText(insertion.text);
    }
    input?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.insertion?.seq]);

  const running = state.isRunning;

  /** 发送（Enter 路径，与旧 sendInput 同语义：空文本不发；运行中按插话模式、否则 auto）。 */
  const sendNow = (): void => {
    const text = (inputRef.current?.value ?? "").trim();
    if (text.length === 0) return;
    post({ kind: "prompt", text, mode: running ? sendMode : "auto" });
    aui.composer.setText("");
  };

  const selectCommand = (item: SlashCommandInfo): void => {
    aui.composer.setText(`/${item.name}`);
    cmdMenu.close();
    setCmdTick((t) => t + 1);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // FR-CMD-03 ③：菜单打开时 ↑/↓ 导航、Enter 选中插入、Esc 关闭，均不触发发送
    if (cmdMenu.isOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        cmdMenu.moveDown();
        setCmdTick((t) => t + 1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        cmdMenu.moveUp();
        setCmdTick((t) => t + 1);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cmdMenu.close();
        setCmdTick((t) => t + 1);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        const item = cmdMenu.highlightedItem;
        if (item) selectCommand(item);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendNow();
    }
  };

  const onInput = (event: React.FormEvent<HTMLTextAreaElement>): void => {
    const input = event.currentTarget;
    const value = input.value;
    // `/` 命令补全菜单（FR-CMD-03 ②）：随输入实时过滤；首次 `/` 拉取命令全集
    if (value.startsWith("/") && !slashRequestedRef.current) {
      slashRequestedRef.current = true;
      post({ kind: "request_commands" });
    }
    cmdMenu.onInput(value);
    setCmdTick((t) => t + 1);
    // @ 文件选择器（FR-FILE-02，唯一文件引用入口）：1s 防抖触发
    if (fileTriggerRef.current.check(value, input.selectionStart, Date.now())) {
      post({ kind: "insert_file_ref" });
    }
  };

  const usageTitle =
    state.totalTokens === null
      ? "当前会话尚无助手消息"
      : `最近一条助手消息 ${state.totalTokens.toLocaleString()} tokens${state.contextWindow ? ` / 窗口 ${state.contextWindow.toLocaleString()}` : ""}`;

  return (
    <div className="content-col" id="input-col">
      <div className="input-toolbar">
        <label className="mode-label">
          插话模式
          <select
            id="send-mode"
            title="运行中插话模式（FR-CHAT-06）"
            value={sendMode}
            onChange={(e) => setSendMode(e.target.value as "steer" | "followUp")}
          >
            <option value="steer">steer（运行中插话）</option>
            <option value="followUp">follow-up（本轮后处理）</option>
          </select>
        </label>
      </div>
      <div className="composer-shell input-shell" id="input-shell">
        {cmdMenu.isOpen ? (
          <div className="cmd-menu" id="cmd-menu" role="listbox" aria-label="命令补全">
            {cmdMenu.items.map((item) => {
              const active = cmdMenu.highlightedItem === item;
              return (
                <button
                  key={item.name}
                  type="button"
                  className={active ? "cmd-item cmd-item-active" : "cmd-item"}
                  role="option"
                  aria-selected={active || undefined}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectCommand(item);
                  }}
                >
                  <span className="cmd-name">/{item.name}</span>
                  {item.description ? <span className="cmd-desc">{item.description}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        <ComposerPrimitive.Input
          ref={inputRef}
          id="input"
          rows={3}
          className="composer-input"
          aria-label="输入消息"
          placeholder={
            running
              ? `运行中：输入消息以 ${sendMode === "followUp" ? "follow-up" : "steer"} 方式插话…（Enter 发送）`
              : "输入消息…（Enter 发送 / Shift+Enter 换行；@ 引用文件、/ 呼出命令）"
          }
          onKeyDown={onKeyDown}
          onInput={onInput}
        />
        <ThreadPrimitive.If running={false}>
          <ComposerPrimitive.Send ref={sendBtnRef} id="btn-send" className="send-btn" aria-label="发送" title="发送">
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
              <path d={SEND_SVG_PATH} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ComposerPrimitive.Send>
        </ThreadPrimitive.If>
      </div>
      <div className="input-bottom" id="input-bottom">
        <button
          id="model-selector"
          type="button"
          className="model-selector"
          title="切换模型（底部内联选择器）"
          onClick={() => {
            if (modelMenuOpen) {
              setModelMenuOpen(false);
              return;
            }
            setModelMenuOpen(true);
            post({ kind: "request_models" }); // 每次打开刷新列表（与状态栏/命令面板入口同源）
          }}
        >
          <span id="model-selector-name">{state.model || "(未设置模型)"}</span>
          <span className="model-caret" aria-hidden="true">
            ▾
          </span>
        </button>
        <span id="usage-line" className="usage-line" title={`上下文用量：${usageTitle}`}>
          {formatContextUsage(state.totalTokens, state.contextWindow)}
        </span>
        <span className="input-bottom-spacer" />
        <ThreadPrimitive.If running>
          <ComposerPrimitive.Cancel id="btn-stop" className="btn-stop" aria-label="中止">
            ■ Stop
          </ComposerPrimitive.Cancel>
        </ThreadPrimitive.If>
        {modelMenuOpen ? (
          <div className="model-menu" id="model-menu" role="listbox" aria-label="可用模型">
            {state.models === null ? (
              <div className="model-note">加载可用模型…</div>
            ) : state.models.length === 0 ? (
              <div className="model-note">没有可用模型（先运行 pi auth / pi config）</div>
            ) : (
              state.models.map((model) => {
                const label = `${model.provider}/${model.id}`;
                const current = label === state.model;
                return (
                  <button
                    key={label}
                    type="button"
                    className={`model-item${current ? " model-item-current" : ""}`}
                    role="option"
                    aria-selected={current || undefined}
                    onClick={() => {
                      post({ kind: "set_model", provider: model.provider, modelId: model.id });
                      setModelMenuOpen(false);
                    }}
                  >
                    <span className="model-item-name">{`${current ? "✓ " : ""}${label}`}</span>
                    <span className="model-item-desc">{[model.name, model.reasoning ? "reasoning" : ""].filter(Boolean).join(" · ")}</span>
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
