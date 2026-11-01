import { useEffect, useRef, useState } from "react";
import EditorJS, {
  type OutputData,
  type ToolConstructable,
} from "@editorjs/editorjs";
import Delimiter from "@editorjs/delimiter";
import Header from "@editorjs/header";
import EditorjsList from "@editorjs/list";
import Quote from "@editorjs/quote";
import Table from "@editorjs/table";
import DragDrop from "editorjs-drag-drop";
import { Button } from "./ui/button";

export const EMPTY_DOCUMENT_DATA: OutputData = {
  blocks: [{ type: "paragraph", data: { text: "" } }],
};

export function DocumentBlockEditor({
  initialData,
  onChange,
  onReady,
  onError,
}: {
  initialData?: OutputData;
  onChange: (data: OutputData) => void;
  onReady: (editor: EditorJS | null) => void;
  onError: (message: string) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const editorInstance = useRef<EditorJS | null>(null);
  const initialDataRef = useRef(initialData || EMPTY_DOCUMENT_DATA);
  const callbacks = useRef({ onChange, onReady, onError });
  const [editorReady, setEditorReady] = useState(false);
  callbacks.current = { onChange, onReady, onError };

  useEffect(() => {
    if (!holder.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const editor = new EditorJS({
      holder: holder.current,
      minHeight: 120,
      placeholder: "Add custom terms, delivery details, or notes…",
      data: initialDataRef.current,
      tools: {
        header: {
          class: Header,
          inlineToolbar: true,
          config: { levels: [2, 3, 4], defaultLevel: 3 },
        },
        list: {
          class: EditorjsList,
          inlineToolbar: true,
          config: { defaultStyle: "unordered" },
        },
        table: {
          class: Table as unknown as ToolConstructable,
          inlineToolbar: true,
          config: { rows: 2, cols: 3, maxRows: 12, maxCols: 6 },
        },
        quote: {
          class: Quote,
          inlineToolbar: true,
          config: {
            quotePlaceholder: "Enter a quote",
            captionPlaceholder: "Attribution",
          },
        },
        delimiter: Delimiter,
      },
      onReady: () => {
        new DragDrop(editor, "2px solid #45d6af");
        editorInstance.current = editor;
        setEditorReady(true);
        callbacks.current.onReady(editor);
      },
      onChange: () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          void editor
            .save()
            .then((data) => callbacks.current.onChange(data))
            .catch((reason: unknown) =>
              callbacks.current.onError(
                reason instanceof Error
                  ? reason.message
                  : "The document editor could not save its current content.",
              ),
            );
        }, 250);
      },
    });

    return () => {
      if (timer) clearTimeout(timer);
      editorInstance.current = null;
      setEditorReady(false);
      callbacks.current.onReady(null);
      void editor.isReady
        .then(() => editor.destroy())
        .catch((reason: unknown) => {
          callbacks.current.onError(
            reason instanceof Error
              ? reason.message
              : "The document editor could not be closed cleanly.",
          );
        });
    };
  }, []);

  function insertBlock(type: string, data: Record<string, unknown> = {}) {
    void editorInstance.current?.blocks.insert(type, data);
  }

  return (
    <div className="document-block-editor">
      <div className="document-editor-hint">
        Build this document from blocks. Drag a block handle to reorder it.
      </div>
      <div className="document-block-toolbar" role="toolbar" aria-label="Insert content block">
        <span>Insert block</span>
        <Button size="sm" variant="ghost" disabled={!editorReady} onClick={() => insertBlock("paragraph", { text: "" })}>Text</Button>
        <Button size="sm" variant="ghost" disabled={!editorReady} onClick={() => insertBlock("header", { text: "Section heading", level: 3 })}>Heading</Button>
        <Button size="sm" variant="ghost" disabled={!editorReady} onClick={() => insertBlock("list", { style: "unordered", items: [{ content: "List item", items: [] }] })}>List</Button>
        <Button size="sm" variant="ghost" disabled={!editorReady} onClick={() => insertBlock("table", { withHeadings: true, content: [["Heading", "Value"], ["", ""]] })}>Table</Button>
        <Button size="sm" variant="ghost" disabled={!editorReady} onClick={() => insertBlock("quote", { text: "Quote", caption: "" })}>Quote</Button>
        <Button size="sm" variant="ghost" disabled={!editorReady} onClick={() => insertBlock("delimiter")}>Divider</Button>
      </div>
      <div ref={holder} />
    </div>
  );
}
