import { useCallback, useEffect, useRef } from "react";
import { Bold, Italic, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  normalizeAnnouncementContent,
  type AnnouncementContent,
  type AnnouncementTextSegment,
} from "@/lib/announcement";

function resolveContentEditableHtml(content: AnnouncementContent | null): string {
  return (content?.segments ?? [])
    .map((segment) => {
      const text = segment.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
      const boldText = segment.bold ? `<strong>${text}</strong>` : text;
      const italicText = segment.italic ? `<em>${boldText}</em>` : boldText;

      return segment.underline ? `<u>${italicText}</u>` : italicText;
    })
    .join("");
}

function resolveAnnouncementSegmentsFromNode(
  node: Node,
  marks: Omit<AnnouncementTextSegment, "text">,
): AnnouncementTextSegment[] {
  if (node.nodeType == Node.TEXT_NODE) {
    return node.textContent
      ? [{ text: node.textContent, ...marks }]
      : [];
  }

  if (node.nodeType != Node.ELEMENT_NODE) {
    return [];
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();
  const nextMarks = {
    ...marks,
    ...(tagName == "b" || tagName == "strong" ? { bold: true } : {}),
    ...(tagName == "i" || tagName == "em" ? { italic: true } : {}),
    ...(tagName == "u" ? { underline: true } : {}),
  };

  if (tagName == "br") {
    return [{ text: " ", ...marks }];
  }

  return Array.from(element.childNodes).flatMap((childNode) =>
    resolveAnnouncementSegmentsFromNode(childNode, nextMarks),
  );
}

function resolveEditorContent(editor: HTMLElement): AnnouncementContent | null {
  return normalizeAnnouncementContent({
    version: 1,
    segments: Array.from(editor.childNodes).flatMap((childNode) =>
      resolveAnnouncementSegmentsFromNode(childNode, {}),
    ),
  });
}

export function AnnouncementRichTextEditor({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: AnnouncementContent | null;
  onChange: (value: AnnouncementContent | null) => void;
  disabled?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastRenderedHtmlRef = useRef<string | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    const nextHtml = resolveContentEditableHtml(value);

    if (!editor || lastRenderedHtmlRef.current == nextHtml) {
      return;
    }

    editor.innerHTML = nextHtml;
    lastRenderedHtmlRef.current = nextHtml;
  }, [value]);

  const emitContent = useCallback(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const content = resolveEditorContent(editor);
    lastRenderedHtmlRef.current = resolveContentEditableHtml(content);
    onChange(content);
  }, [onChange]);

  const applyFormat = useCallback(
    (command: "bold" | "italic" | "underline") => {
      editorRef.current?.focus();
      document.execCommand(command);
      emitContent();
    },
    [emitContent],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <div className="flex items-center gap-1 border-b border-border bg-muted/40 p-1.5" role="toolbar" aria-label="Formatação do aviso">
        <Button type="button" variant="ghost" size="icon" aria-label="Negrito" title="Negrito" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat("bold")}>
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Itálico" title="Itálico" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat("italic")}>
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Sublinhado" title="Sublinhado" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat("underline")}>
          <Underline className="h-4 w-4" />
        </Button>
      </div>
      <div
        id={id}
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="false"
        aria-label="Aviso no app (opcional)"
        data-placeholder="Ex.: Novo regulamento disponível na aba Links."
        className="app-input-field min-h-24 cursor-text rounded-none border-0 bg-transparent px-3 py-2.5 outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] disabled:cursor-not-allowed disabled:opacity-50"
        onInput={emitContent}
        onKeyDown={(event) => {
          if (event.key == "Enter") {
            event.preventDefault();
          }
        }}
        onPaste={(event) => {
          event.preventDefault();
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain").replace(/\s+/g, " "));
          emitContent();
        }}
      />
    </div>
  );
}
