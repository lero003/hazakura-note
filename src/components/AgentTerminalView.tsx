import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { AgentTerminalSize } from "../types";
import type { AgentWorkbenchOutputChunk } from "../tauri";
import { AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS } from "../types";

function normalizeTerminalLineEndings(text: string): string {
  return text.replace(/\r?\n/g, "\r\n");
}

export function AgentTerminalView({
  activeSession,
  outputLabel,
  onData,
  onEngage,
  onRelease,
  onResize,
  output,
  placeholder,
  terminalLabel,
}: {
  activeSession: boolean;
  outputLabel: string;
  onData: (data: string) => void;
  onEngage: () => void;
  onRelease: () => void;
  onResize: (size: AgentTerminalSize) => void;
  output: AgentWorkbenchOutputChunk[];
  placeholder: string;
  terminalLabel: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const lastOutputSeqRef = useRef(0);
  const lastTerminalSizeRef = useRef<AgentTerminalSize | null>(null);
  const activeSessionRef = useRef(activeSession);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const showInactivePlaceholder = !activeSession && output.length === 0;

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const terminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      disableStdin: !activeSessionRef.current,
      fontFamily:
        '"SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 2000,
      theme: {
        background: "#101512",
        black: "#101512",
        blue: "#8db3ff",
        brightBlack: "#758176",
        brightBlue: "#b5ccff",
        brightCyan: "#9ad8dc",
        brightGreen: "#a8ddb4",
        brightMagenta: "#d9b7ee",
        brightRed: "#ffb5ac",
        brightWhite: "#f2f5ef",
        brightYellow: "#eee6a4",
        cyan: "#80c4c8",
        cursor: "#e5ece5",
        foreground: "#dce6dd",
        green: "#8bc89a",
        magenta: "#cfa4df",
        red: "#f29a91",
        selectionBackground: "#345345",
        white: "#dce6dd",
        yellow: "#ddd27f",
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    const fitAndNotify = () => {
      fitAddon.fit();
      const dimensions = fitAddon.proposeDimensions();
      if (!dimensions) {
        return;
      }

      const nextSize = {
        columns: Math.max(1, Math.min(500, dimensions.cols)),
        rows: Math.max(1, Math.min(200, dimensions.rows)),
      };
      const previousSize = lastTerminalSizeRef.current;
      if (
        previousSize?.columns === nextSize.columns &&
        previousSize.rows === nextSize.rows
      ) {
        return;
      }

      lastTerminalSizeRef.current = nextSize;
      onResizeRef.current(nextSize);
    };
    fitAndNotify();

    const dataDisposable = terminal.onData((data) => {
      if (activeSessionRef.current) {
        onDataRef.current(data);
      }
    });
    const resizeObserver = new ResizeObserver(() => {
      fitAndNotify();
    });
    resizeObserver.observe(host);
    const focusTerminal = () => {
      onEngage();
      if (activeSessionRef.current) {
        terminal.focus();
      }
    };
    const blurTerminal = () => {
      onRelease();
      terminal.blur();
    };
    const blurTerminalWhenHidden = () => {
      if (document.visibilityState !== "visible") {
        blurTerminal();
      }
    };
    host.addEventListener("pointerenter", onEngage);
    host.addEventListener("pointerdown", focusTerminal);
    host.addEventListener("mouseleave", blurTerminal);
    window.addEventListener("blur", blurTerminal);
    document.addEventListener("visibilitychange", blurTerminalWhenHidden);

    terminalRef.current = terminal;

    return () => {
      document.removeEventListener("visibilitychange", blurTerminalWhenHidden);
      window.removeEventListener("blur", blurTerminal);
      host.removeEventListener("mouseleave", blurTerminal);
      host.removeEventListener("pointerdown", focusTerminal);
      host.removeEventListener("pointerenter", onEngage);
      resizeObserver.disconnect();
      dataDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      lastOutputSeqRef.current = 0;
      lastTerminalSizeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    if (output.length === 0) {
      terminal.clear();
      lastOutputSeqRef.current = 0;
      return;
    }

    for (const chunk of output) {
      if (chunk.seq <= lastOutputSeqRef.current) {
        continue;
      }

      if (chunk.stream === "system") {
        terminal.write(`\r\n${normalizeTerminalLineEndings(chunk.text)}`);
      } else {
        terminal.write(chunk.text);
      }
      lastOutputSeqRef.current = chunk.seq;
    }
  }, [output]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.disableStdin = !activeSession;
    }

    if (!activeSession) {
      terminalRef.current?.blur();
    }
  }, [activeSession]);

  return (
    <div
      className={`agent-terminal-shell ${activeSession ? "active" : "inactive"}`}
    >
      <div className="agent-terminal-meta">
        {outputLabel}: {output.length} / {AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS}
      </div>
      <div
        aria-label={terminalLabel}
        className="agent-terminal-host"
        ref={hostRef}
      />
      {showInactivePlaceholder ? (
        <div className="agent-terminal-placeholder">{placeholder}</div>
      ) : null}
    </div>
  );
}
