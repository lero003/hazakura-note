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

interface XtermTheme {
  background: string;
  black: string;
  blue: string;
  brightBlack: string;
  brightBlue: string;
  brightCyan: string;
  brightGreen: string;
  brightMagenta: string;
  brightRed: string;
  brightWhite: string;
  brightYellow: string;
  cyan: string;
  cursor: string;
  foreground: string;
  green: string;
  magenta: string;
  red: string;
  selectionBackground: string;
  white: string;
  yellow: string;
}

const XTERM_THEMES: Record<string, XtermTheme> = {
  light: {
    background: "#f3f6f4",
    black: "#1d2521",
    blue: "#2f78ad",
    brightBlack: "#627267",
    brightBlue: "#4a92c8",
    brightCyan: "#5fbfc4",
    brightGreen: "#4faf74",
    brightMagenta: "#b595cc",
    brightRed: "#c05a5e",
    brightWhite: "#ecf3ef",
    brightYellow: "#b8a04a",
    cyan: "#47999e",
    cursor: "#2e5c46",
    foreground: "#1d2521",
    green: "#3f8a5e",
    magenta: "#905fa8",
    red: "#9e3f43",
    selectionBackground: "rgba(46, 92, 70, 0.15)",
    white: "#e0e6e2",
    yellow: "#8f7a2f",
  },
  dark: {
    background: "#0a0e0c",
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
  sakura: {
    background: "#30242a",
    black: "#2b2528",
    blue: "#b89fd6",
    brightBlack: "#78666d",
    brightBlue: "#d4beee",
    brightCyan: "#ddbcc9",
    brightGreen: "#c9dbba",
    brightMagenta: "#eac2d5",
    brightRed: "#f2aab0",
    brightWhite: "#fff7f5",
    brightYellow: "#ead3a0",
    cyan: "#c4a2b2",
    cursor: "#9a4057",
    foreground: "#f0e6e8",
    green: "#a3c495",
    magenta: "#d9a9c0",
    red: "#d68288",
    selectionBackground: "rgba(154, 64, 87, 0.25)",
    white: "#ead5db",
    yellow: "#c9ab60",
  },
  yakou: {
    background: "#08080e",
    black: "#18182a",
    blue: "#9db3ff",
    brightBlack: "#8888a8",
    brightBlue: "#c4cfff",
    brightCyan: "#94e6da",
    brightGreen: "#a8e0bc",
    brightMagenta: "#e2bdfc",
    brightRed: "#ffaab4",
    brightWhite: "#e4e4f0",
    brightYellow: "#eee6a4",
    cyan: "#72c8c2",
    cursor: "#8b7cf8",
    foreground: "#d4d4e8",
    green: "#7fc8a0",
    magenta: "#c8a0e0",
    red: "#e87c88",
    selectionBackground: "rgba(139, 124, 248, 0.2)",
    white: "#40406a",
    yellow: "#cfb86c",
  },
  shokou: {
    background: "#142a3d",
    black: "#152638",
    blue: "#6ba8d8",
    brightBlack: "#526a7d",
    brightBlue: "#90c4ee",
    brightCyan: "#9ad8dc",
    brightGreen: "#8dcea0",
    brightMagenta: "#c8b0d8",
    brightRed: "#e8888e",
    brightWhite: "#f5fbff",
    brightYellow: "#e8d082",
    cyan: "#60b0c0",
    cursor: "#2f80c2",
    foreground: "#dce8f0",
    green: "#5ea878",
    magenta: "#a88ac4",
    red: "#cc686e",
    selectionBackground: "rgba(47, 120, 173, 0.2)",
    white: "#b0cce0",
    yellow: "#c8a842",
  },
  kouyou: {
    background: "#1c2118",
    black: "#261f18",
    blue: "#8a9f7c",
    brightBlack: "#665f50",
    brightBlue: "#a8bc98",
    brightCyan: "#b8ccaa",
    brightGreen: "#b6cf9c",
    brightMagenta: "#d4b4a4",
    brightRed: "#e08078",
    brightWhite: "#f8f1e7",
    brightYellow: "#e0c888",
    cyan: "#7da088",
    cursor: "#a84432",
    foreground: "#e0d8c8",
    green: "#7dad68",
    magenta: "#b89480",
    red: "#c86058",
    selectionBackground: "rgba(168, 68, 50, 0.2)",
    white: "#bfae8d",
    yellow: "#bc9640",
  },
};

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
  theme,
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
  theme: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const lastOutputSeqRef = useRef(0);
  const lastTerminalSizeRef = useRef<AgentTerminalSize | null>(null);
  const activeSessionRef = useRef(activeSession);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      theme: XTERM_THEMES[theme] ?? XTERM_THEMES.dark,
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
      // Debounce resize notifications (100ms)
      if (resizeTimerRef.current !== null) {
        clearTimeout(resizeTimerRef.current);
      }
      resizeTimerRef.current = setTimeout(
        () => onResizeRef.current(nextSize),
        100,
      );
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
      if (resizeTimerRef.current !== null) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
      lastOutputSeqRef.current = 0;
      lastTerminalSizeRef.current = null;
    };
  }, []);

  // Update xterm theme when it changes
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const xtermTheme = XTERM_THEMES[theme] ?? XTERM_THEMES.dark;
    terminal.options.theme = xtermTheme;
    // Force a repaint for the cursor color if active
    terminal.refresh(0, terminal.rows - 1);
  }, [theme]);

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
