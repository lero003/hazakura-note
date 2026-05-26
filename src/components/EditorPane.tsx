import { useEffect, useRef } from "react";
import { markdown } from "@codemirror/lang-markdown";
import { basicSetup, EditorView } from "codemirror";

type EditorPaneProps = {
  documentKey: string;
  value: string;
  theme: "light" | "dark";
  onChange: (nextValue: string) => void;
};

export default function EditorPane({
  documentKey,
  theme,
  value,
  onChange,
}: EditorPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
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

    return () => {
      view.destroy();
    };
  }, [documentKey, theme]);

  return <div className="editor-host" ref={hostRef} />;
}
