import type {
  AgentLaunchGateState,
  AgentTerminalSize,
  MenuLanguage,
} from "../types";
import type {
  AgentWorkbenchOutputChunk,
  AgentWorkbenchProvider,
  AgentWorkbenchSession,
} from "../tauri";
import {
  agentCompactSessionStateLabel,
  isActiveAgentSession,
  localizeAgentGateMessage,
  providerLabel,
} from "../utils";
import { AgentTerminalView } from "./AgentTerminalView";

export function AgentPaneShell({
  gate,
  menuLanguage,
  onCheckGate,
  onStopSession,
  onTerminalData,
  onTerminalEngage,
  onTerminalRelease,
  onTerminalResize,
  output,
  provider,
  session,
  stopPending,
  workspaceRootPath,
}: {
  gate: AgentLaunchGateState;
  menuLanguage: MenuLanguage;
  onCheckGate: () => void;
  onStopSession: () => void;
  onTerminalData: (data: string) => void;
  onTerminalEngage: () => void;
  onTerminalRelease: () => void;
  onTerminalResize: (size: AgentTerminalSize) => void;
  output: AgentWorkbenchOutputChunk[];
  provider: AgentWorkbenchProvider;
  session: AgentWorkbenchSession | null;
  stopPending: boolean;
  workspaceRootPath: string | null;
}) {
  const workspaceAvailable = workspaceRootPath !== null;
  const activeSession = isActiveAgentSession(session);
  const copy =
    menuLanguage === "ja"
      ? {
          noWorkspace: "ワークスペース未選択",
          unavailable:
            "起動できません: 先にワークスペースフォルダを開いてください。",
          placeholderReady:
            "選択中の Agent プロバイダーに接続するにはセッションを開始してください。",
          placeholderNoWorkspace:
            "Agent セッションを開始する前にワークスペースフォルダを開いてください。",
          alreadyActive: "Agent セッションはすでに実行中です。",
          openWorkspaceFirst: "先にワークスペースフォルダを開いてください。",
          noRunningSession: "実行中の Agent セッションはありません。",
          outputChunks: "出力チャンク",
          start: "セッション開始",
          starting: "開始中...",
          stop: "セッション停止",
          stopping: "停止中...",
          terminal: "Agent ターミナル",
          running: "Agent は実行中",
          inactive: "Agent は停止中",
        }
      : {
          noWorkspace: "No workspace selected",
          unavailable:
            "Launch unavailable: open a workspace folder first.",
          placeholderReady:
            "Start session to connect the selected Agent provider.",
          placeholderNoWorkspace:
            "Open a workspace folder before starting an Agent session.",
          alreadyActive: "One Agent session is already active.",
          openWorkspaceFirst: "Open a workspace folder first.",
          noRunningSession: "No running Agent session.",
          outputChunks: "Output chunks",
          start: "Start session",
          starting: "Starting...",
          stop: "Stop session",
          stopping: "Stopping...",
          terminal: "Agent terminal",
          running: "Agent running",
          inactive: "Agent inactive",
        };
  const gateMessage = workspaceAvailable
    ? localizeAgentGateMessage(gate.message, menuLanguage)
    : copy.unavailable;
  const terminalPlaceholder = workspaceAvailable
    ? copy.placeholderReady
    : copy.placeholderNoWorkspace;
  const showGateMessage =
    !activeSession || gate.kind === "checking" || gate.kind === "rejected";

  return (
    <section className="agent-pane" aria-label="Agent Workbench pane">
      <div className="agent-compact-header">
        <div className="agent-compact-title">
          <strong>{providerLabel(provider)}</strong>
          <span>
            {agentCompactSessionStateLabel(session, menuLanguage)}
          </span>
        </div>
        <div className="agent-actions">
          <button
            disabled={
              !workspaceAvailable ||
              gate.kind === "checking" ||
              activeSession
            }
            onClick={onCheckGate}
            title={
              activeSession
                ? copy.alreadyActive
                : workspaceAvailable
                  ? undefined
                  : copy.openWorkspaceFirst
            }
            type="button"
          >
            {gate.kind === "checking" ? copy.starting : copy.start}
          </button>
          <button
            disabled={!activeSession || stopPending}
            onClick={onStopSession}
            title={
              activeSession ? undefined : copy.noRunningSession
            }
            type="button"
          >
            {stopPending ? copy.stopping : copy.stop}
          </button>
        </div>
      </div>
      <div className="agent-compact-meta">
        <span title={workspaceRootPath ?? undefined}>
          {workspaceRootPath ?? copy.noWorkspace}
        </span>
        <span>{activeSession ? copy.running : copy.inactive}</span>
      </div>
      {showGateMessage ? (
        <p
          className={`agent-gate-message ${workspaceAvailable ? gate.kind : "rejected"}`}
        >
          {gateMessage}
        </p>
      ) : null}
      <AgentTerminalView
        activeSession={activeSession}
        outputLabel={copy.outputChunks}
        onData={onTerminalData}
        onEngage={onTerminalEngage}
        onRelease={onTerminalRelease}
        onResize={onTerminalResize}
        output={output}
        placeholder={terminalPlaceholder}
        terminalLabel={copy.terminal}
      />
    </section>
  );
}
