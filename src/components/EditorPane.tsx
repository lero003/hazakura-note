import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { markdown } from "@codemirror/lang-markdown";
import {
  selectCharLeft,
  selectCharRight,
  selectLineDown,
  selectLineUp,
} from "@codemirror/commands";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  type Range,
  StateEffect,
  StateField,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
} from "@codemirror/view";
import { basicSetup } from "codemirror";

type SearchMatch = { from: number; to: number };
type DecoratedSearchMatch = SearchMatch & { active: boolean };
export type EditorSelectionInfo = {
  line: number;
  column: number;
  selectedCharacters: number;
  selectedLines: number;
};

type EditorPaneProps = {
  documentKey: string;
  value: string;
  theme: "light" | "dark";
  fontSize: number;
  showInvisibles: boolean;
  tabSize: number;
  wrapLines: boolean;
  activeSearchMatchIndex: number;
  searchMatches: SearchMatch[];
  onChange: (nextValue: string) => void;
  onSelectionChange: (selection: EditorSelectionInfo) => void;
};

export type EditorPaneHandle = {
  focus: () => void;
  goToLine: (line: number) => void;
};

const setSearchMatchesEffect =
  StateEffect.define<readonly DecoratedSearchMatch[]>();

const editorKeyboardShortcuts = Prec.highest(keymap.of([
  { key: "Shift-ArrowLeft", run: selectCharLeft },
  { key: "Shift-ArrowRight", run: selectCharRight },
  { key: "Shift-ArrowUp", run: selectLineUp },
  { key: "Shift-ArrowDown", run: selectLineDown },
]));

const editorTabIndentation = Prec.highest(
  EditorView.domEventHandlers({
    keydown(event, view) {
      if (
        event.key !== "Tab" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return false;
      }

      event.preventDefault();

      if (event.shiftKey) {
        outdentSelectedLines(view);
      } else {
        indentSelection(view);
      }

      return true;
    },
  }),
);

const invisibleCharactersField = StateField.define<DecorationSet>({
  create(state) {
    return buildInvisibleDecorations(state.doc);
  },
  update(decorations, transaction) {
    if (transaction.docChanged) {
      return buildInvisibleDecorations(transaction.state.doc);
    }

    return decorations.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const searchHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(highlights, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSearchMatchesEffect)) {
        return buildSearchDecorations(effect.value);
      }
    }

    if (transaction.docChanged) {
      return highlights.map(transaction.changes);
    }

    return highlights;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(
  function EditorPane(
    {
      activeSearchMatchIndex,
      documentKey,
      fontSize,
      searchMatches,
      showInvisibles,
      tabSize,
      theme,
      value,
      wrapLines,
      onChange,
      onSelectionChange,
    },
    ref,
  ) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const themeCompartmentRef = useRef(new Compartment());
  const wrappingCompartmentRef = useRef(new Compartment());
  const invisiblesCompartmentRef = useRef(new Compartment());
  const tabSizeCompartmentRef = useRef(new Compartment());

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        viewRef.current?.focus();
      },
      goToLine(line) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        const safeLine = Math.min(
          Math.max(Math.trunc(line), 1),
          view.state.doc.lines,
        );
        const lineInfo = view.state.doc.line(safeLine);

        view.dispatch({
          selection: { anchor: lineInfo.from },
          effects: EditorView.scrollIntoView(lineInfo.from, { y: "center" }),
        });
        view.focus();
      },
    }),
    [],
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const view = new EditorView({
      doc: value,
      parent: hostRef.current,
      extensions: [
        basicSetup,
        editorKeyboardShortcuts,
        editorTabIndentation,
        markdown(),
        searchHighlightField,
        wrappingCompartmentRef.current.of(
          wrapLines ? EditorView.lineWrapping : [],
        ),
        invisiblesCompartmentRef.current.of(
          showInvisibles ? invisibleCharactersField : [],
        ),
        tabSizeCompartmentRef.current.of(EditorState.tabSize.of(tabSize)),
        themeCompartmentRef.current.of(editorTheme(theme, fontSize)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }

          if (update.docChanged || update.selectionSet) {
            onSelectionChangeRef.current(readSelectionInfo(update.state));
          }
        }),
      ],
    });
    viewRef.current = view;
    onSelectionChangeRef.current(readSelectionInfo(view.state));

    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [documentKey]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(
        editorTheme(theme, fontSize),
      ),
    });
  }, [fontSize, theme]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: wrappingCompartmentRef.current.reconfigure(
        wrapLines ? EditorView.lineWrapping : [],
      ),
    });
  }, [wrapLines]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: invisiblesCompartmentRef.current.reconfigure(
        showInvisibles ? invisibleCharactersField : [],
      ),
    });
  }, [showInvisibles]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: tabSizeCompartmentRef.current.reconfigure(
        EditorState.tabSize.of(tabSize),
      ),
    });
  }, [tabSize]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    const currentValue = view.state.doc.toString();
    if (currentValue === value) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value,
      },
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: setSearchMatchesEffect.of(
        searchMatches.map((match, index) => ({
          ...match,
          active: index === activeSearchMatchIndex,
        })),
      ),
    });
  }, [activeSearchMatchIndex, searchMatches]);

  useEffect(() => {
    const view = viewRef.current;
    const activeSearchMatch = searchMatches[activeSearchMatchIndex] ?? null;

    if (!view || !activeSearchMatch) {
      return;
    }

    view.dispatch({
      selection: {
        anchor: activeSearchMatch.from,
        head: activeSearchMatch.to,
      },
      effects: EditorView.scrollIntoView(activeSearchMatch.from, {
        y: "center",
      }),
    });
  }, [activeSearchMatchIndex, searchMatches]);

  return <div className="editor-host" ref={hostRef} />;
  },
);

export default EditorPane;

function indentSelection(view: EditorView) {
  const indent = " ".repeat(view.state.tabSize);

  if (view.state.selection.ranges.every((range) => range.empty)) {
    view.dispatch(
      view.state.changeByRange((range) => ({
        changes: { from: range.from, insert: indent },
        range: EditorSelection.cursor(range.from + indent.length),
      })),
    );
    return;
  }

  const changes = selectedLineNumbers(view.state).map((lineNumber) => ({
    from: view.state.doc.line(lineNumber).from,
    insert: indent,
  }));

  if (changes.length > 0) {
    view.dispatch({ changes });
  }
}

function outdentSelectedLines(view: EditorView) {
  const changes = selectedLineNumbers(view.state)
    .map((lineNumber) => {
      const line = view.state.doc.line(lineNumber);

      if (line.text.startsWith("\t")) {
        return { from: line.from, to: line.from + 1 };
      }

      const leadingSpaces = line.text.match(/^ +/)?.[0].length ?? 0;
      const removableSpaces = Math.min(leadingSpaces, view.state.tabSize);

      return removableSpaces > 0
        ? { from: line.from, to: line.from + removableSpaces }
        : null;
    })
    .filter((change): change is { from: number; to: number } => change !== null);

  if (changes.length > 0) {
    view.dispatch({ changes });
  }
}

function selectedLineNumbers(state: EditorState) {
  const lineNumbers = new Set<number>();

  for (const range of state.selection.ranges) {
    const inclusiveTo = range.empty
      ? range.to
      : Math.max(range.from, range.to - 1);
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(inclusiveTo);

    for (
      let lineNumber = startLine.number;
      lineNumber <= endLine.number;
      lineNumber += 1
    ) {
      lineNumbers.add(lineNumber);
    }
  }

  return Array.from(lineNumbers).sort((a, b) => a - b);
}

function editorTheme(theme: "light" | "dark", fontSize: number) {
  const safeFontSize = Math.min(Math.max(fontSize, 12), 22);

  return EditorView.theme(
    {
      "&": {
        backgroundColor: theme === "dark" ? "#151b18" : "#ffffff",
        color: theme === "dark" ? "#ecf3ef" : "#1d2521",
        height: "100%",
        fontSize: `${safeFontSize}px`,
      },
      ".cm-scroller": {
        fontFamily:
          "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      ".cm-content": {
        caretColor: theme === "dark" ? "#7fbfa1" : "#2e5c46",
        padding: "18px 0",
      },
      ".cm-line": {
        padding: "0 22px",
      },
      ".cm-gutters": {
        backgroundColor: theme === "dark" ? "#111714" : "#e9f0eb",
        borderRight:
          theme === "dark" ? "1px solid #232c28" : "1px solid #e0e6e2",
        color: theme === "dark" ? "#8ca094" : "#627267",
      },
      ".cm-activeLine": {
        backgroundColor: theme === "dark" ? "rgba(127, 191, 161, 0.08)" : "rgba(46, 92, 70, 0.05)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: theme === "dark" ? "rgba(127, 191, 161, 0.08)" : "rgba(46, 92, 70, 0.05)",
      },
      ".cm-selectionLayer .cm-selectionBackground": {
        backgroundColor: theme === "dark" ? "rgba(127, 191, 161, 0.3)" : "rgba(46, 92, 70, 0.18)",
        opacity: "1",
      },
      "&.cm-focused .cm-selectionLayer .cm-selectionBackground": {
        backgroundColor: theme === "dark" ? "rgba(127, 191, 161, 0.3)" : "rgba(46, 92, 70, 0.18)",
      },
      ".cm-content ::selection": {
        backgroundColor: theme === "dark" ? "rgba(127, 191, 161, 0.3)" : "rgba(46, 92, 70, 0.18)",
      },
      ".cm-searchMatch": {
        backgroundColor: theme === "dark" ? "rgba(181, 144, 69, 0.3)" : "rgba(153, 120, 56, 0.2)",
        borderRadius: "3px",
      },
      ".cm-searchMatch-active": {
        backgroundColor: theme === "dark" ? "rgba(181, 144, 69, 0.7)" : "rgba(153, 120, 56, 0.5)",
        boxShadow:
          theme === "dark"
            ? "0 0 0 1px #b59045"
            : "0 0 0 1px #997838",
      },
      ".cm-invisible-space": {
        backgroundImage:
          theme === "dark"
            ? "radial-gradient(circle, #75847b 1px, transparent 1px)"
            : "radial-gradient(circle, #7a8a81 1px, transparent 1px)",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      },
      ".cm-invisible-tab": {
        backgroundColor:
          theme === "dark" ? "rgba(127, 191, 161, 0.12)" : "rgba(46, 92, 70, 0.12)",
        borderRadius: "3px",
      },
      ".cm-trailing-space": {
        backgroundColor:
          theme === "dark" ? "rgba(178, 77, 82, 0.3)" : "rgba(158, 63, 67, 0.2)",
      },
    },
    { dark: theme === "dark" },
  );
}

function readSelectionInfo(state: EditorState): EditorSelectionInfo {
  const selection = state.selection.main;
  const cursorLine = state.doc.lineAt(selection.head);
  const selectionStart = Math.min(selection.from, selection.to);
  const selectionEnd = Math.max(selection.from, selection.to);
  const selectedCharacters = Math.max(selectionEnd - selectionStart, 0);

  if (selectedCharacters === 0) {
    return {
      line: cursorLine.number,
      column: selection.head - cursorLine.from + 1,
      selectedCharacters: 0,
      selectedLines: 0,
    };
  }

  const startLine = state.doc.lineAt(selectionStart);
  const inclusiveEnd = Math.max(selectionEnd - 1, selectionStart);
  const endLine = state.doc.lineAt(inclusiveEnd);

  return {
    line: cursorLine.number,
    column: selection.head - cursorLine.from + 1,
    selectedCharacters,
    selectedLines: endLine.number - startLine.number + 1,
  };
}

function buildInvisibleDecorations(doc: Text): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const maxDecorations = 20000;

  for (
    let lineNumber = 1;
    lineNumber <= doc.lines && decorations.length < maxDecorations;
    lineNumber += 1
  ) {
    const line = doc.line(lineNumber);
    const trailingWhitespaceStart = line.text.search(/[ \t]+$/);

    for (
      let index = 0;
      index < line.text.length && decorations.length < maxDecorations;
      index += 1
    ) {
      const char = line.text[index];

      if (char !== " " && char !== "\t") {
        continue;
      }

      const isTrailing =
        trailingWhitespaceStart !== -1 && index >= trailingWhitespaceStart;
      const className = [
        char === "\t" ? "cm-invisible-tab" : "cm-invisible-space",
        isTrailing ? "cm-trailing-space" : "",
      ]
        .filter(Boolean)
        .join(" ");

      decorations.push(
        Decoration.mark({ class: className }).range(
          line.from + index,
          line.from + index + 1,
        ),
      );
    }
  }

  return Decoration.set(decorations, true);
}

function buildSearchDecorations(
  matches: readonly DecoratedSearchMatch[],
): DecorationSet {
  return Decoration.set(
    matches
      .filter((match) => match.from >= 0 && match.to > match.from)
      .map((match) =>
        Decoration.mark({
          class: match.active
            ? "cm-searchMatch cm-searchMatch-active"
            : "cm-searchMatch",
        }).range(match.from, match.to),
      ),
    true,
  );
}
