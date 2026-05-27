import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { markdown } from "@codemirror/lang-markdown";
import {
  Compartment,
  EditorState,
  type Range,
  StateEffect,
  StateField,
  type Text,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
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

function editorTheme(theme: "light" | "dark", fontSize: number) {
  const safeFontSize = Math.min(Math.max(fontSize, 12), 22);

  return EditorView.theme(
    {
      "&": {
        backgroundColor: theme === "dark" ? "#1d2421" : "#f4f8f5",
        color: theme === "dark" ? "#e7efe9" : "#202824",
        height: "100%",
        fontSize: `${safeFontSize}px`,
      },
      ".cm-scroller": {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      ".cm-content": {
        caretColor: theme === "dark" ? "#d6e9dd" : "#2f5f49",
        padding: "18px 0",
      },
      ".cm-line": {
        padding: "0 22px",
      },
      ".cm-gutters": {
        backgroundColor: theme === "dark" ? "#17201c" : "#eef4f0",
        borderRight:
          theme === "dark" ? "1px solid #303d37" : "1px solid #d5dfda",
        color: theme === "dark" ? "#9ba9a1" : "#68786f",
      },
      ".cm-activeLine": {
        backgroundColor: theme === "dark" ? "#243029" : "#eaf2ed",
      },
      ".cm-activeLineGutter": {
        backgroundColor: theme === "dark" ? "#243029" : "#eaf2ed",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: theme === "dark" ? "#355543" : "#c6ddcf",
      },
      ".cm-searchMatch": {
        backgroundColor: theme === "dark" ? "#5f5a2e" : "#f0df90",
        borderRadius: "3px",
      },
      ".cm-searchMatch-active": {
        backgroundColor: theme === "dark" ? "#7a6a2f" : "#f5cc52",
        boxShadow:
          theme === "dark"
            ? "0 0 0 1px #d8bd5b"
            : "0 0 0 1px #8b6b16",
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
          theme === "dark" ? "rgba(155, 194, 170, 0.12)" : "#dbe8df",
        borderRadius: "3px",
      },
      ".cm-trailing-space": {
        backgroundColor:
          theme === "dark" ? "rgba(124, 63, 67, 0.38)" : "#f3d4d6",
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
