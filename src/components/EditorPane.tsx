import { useEffect, useRef } from "react";
import { markdown } from "@codemirror/lang-markdown";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";

type SearchMatch = { from: number; to: number };
type DecoratedSearchMatch = SearchMatch & { active: boolean };

type EditorPaneProps = {
  documentKey: string;
  value: string;
  theme: "light" | "dark";
  activeSearchMatchIndex: number;
  searchMatches: SearchMatch[];
  onChange: (nextValue: string) => void;
};

const setSearchMatchesEffect =
  StateEffect.define<readonly DecoratedSearchMatch[]>();

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

export default function EditorPane({
  activeSearchMatchIndex,
  documentKey,
  searchMatches,
  theme,
  value,
  onChange,
}: EditorPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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
        EditorView.lineWrapping,
        EditorView.theme(
          {
            "&": {
              backgroundColor: theme === "dark" ? "#1d2421" : "#f4f8f5",
              color: theme === "dark" ? "#e7efe9" : "#202824",
              height: "100%",
              fontSize: "14px",
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
          },
          { dark: theme === "dark" },
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });
    viewRef.current = view;

    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [documentKey, theme]);

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
