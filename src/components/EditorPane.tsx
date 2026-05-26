import { useEffect, useRef } from "react";
import { markdown } from "@codemirror/lang-markdown";
import { basicSetup, EditorView } from "codemirror";

type EditorPaneProps = {
  documentKey: string;
  value: string;
  onChange: (nextValue: string) => void;
};

export default function EditorPane({
  documentKey,
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
        EditorView.theme({
          "&": {
            height: "100%",
            fontSize: "14px",
          },
          ".cm-scroller": {
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          },
          ".cm-content": {
            padding: "18px 0",
          },
          ".cm-line": {
            padding: "0 22px",
          },
          ".cm-gutters": {
            backgroundColor: "#eef4f0",
            borderRight: "1px solid #d5dfda",
            color: "#68786f",
          },
        }),
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
  }, [documentKey]);

  return <div className="editor-host" ref={hostRef} />;
}
