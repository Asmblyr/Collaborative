"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo,
  Undo,
  Unlink,
} from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Textarea } from "@asmblyr-collaborative/kit/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@asmblyr-collaborative/kit/ui/tabs";
import { ContentValue, contentClass, safeContentHtml } from "./content-value";
import { useUiCopy } from "@/lib/ui-copy";

export function MarkdownEditor({
  id,
  value,
  disabled,
  required,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  disabled: boolean;
  required?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const copy = useUiCopy();

  const [tab, setTab] = useState("write");
  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      className="rounded-lg border p-2 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
    >
      <TabsList className="h-8">
        <TabsTrigger value="write">{copy("Текст")}</TabsTrigger>
        <TabsTrigger value="preview">{copy("Предпросмотр")}</TabsTrigger>
      </TabsList>
      <TabsContent
        forceMount
        hidden={tab !== "write"}
        value="write"
      >
        <Textarea
          id={id}
          value={value}
          disabled={disabled}
          required={required}
          placeholder={placeholder || copy("Текст в формате Markdown")}
          rows={8}
          className="resize-y border-0 font-mono text-sm shadow-none focus-visible:ring-0"
          onInvalid={() => setTab("write")}
          onChange={(e) => onChange(e.target.value)}
        />
      </TabsContent>
      <TabsContent
        value="preview"
        className="min-h-48 px-3"
      >
        <ContentValue
          field={{
            type: "text",
            presentation: {
              label: "",
              description: "",
              placeholder: "",
              interface: "markdown",
              width: "full",
              order: 0,
              group: "",
            },
          }}
          value={value || copy("Пока нет текста")}
        />
      </TabsContent>
    </Tabs>
  );
}

export function RichTextEditor({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label?: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const copy = useUiCopy();
  const [, setTick] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { protocols: ["http", "https"], openOnClick: false },
      }),
    ],
    immediatelyRender: false,
    content: safeContentHtml(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label || copy("Форматированный текст"),
        class: `${contentClass} min-h-48 px-3 py-2 outline-none`,
      },
    },
    onTransaction: () => {
      setTick((current) => current + 1);
    },
    onUpdate: ({ editor: current }) =>
      onChange(current.isEmpty ? "" : current.getHTML()),
  });
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  useEffect(() => {
    if (
      editor &&
      !editor.isFocused &&
      safeContentHtml(value) !== safeContentHtml(editor.getHTML())
    ) {
      editor.commands.setContent(safeContentHtml(value), { emitUpdate: false });
    }
  }, [editor, value]);

  function applyLink() {
    if (!editor) {
      return;
    }
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      setLinkError("");
      return;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("protocol");
      }
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: parsed.toString() })
        .run();
      setLinkOpen(false);
      setLinkError("");
    } catch {
      setLinkError(copy("Укажите ссылку, начинающуюся с https:// или http://"));
    }
  }

  const controls = [
    {
      label: copy("Заголовок 2"),
      icon: Heading2,
      active: Boolean(editor?.isActive("heading", { level: 2 })),
      disabled: false,
      run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: copy("Заголовок 3"),
      icon: Heading3,
      active: Boolean(editor?.isActive("heading", { level: 3 })),
      disabled: false,
      run: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: copy("Жирный"),
      icon: Bold,
      active: Boolean(editor?.isActive("bold")),
      disabled: false,
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: copy("Курсив"),
      icon: Italic,
      active: Boolean(editor?.isActive("italic")),
      disabled: false,
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      label: copy("Ссылка"),
      icon: Link2,
      active: Boolean(editor?.isActive("link")) || linkOpen,
      disabled: false,
      run: () => {
        const currentHref = String(editor?.getAttributes("link").href ?? "");
        setLinkUrl(currentHref);
        setLinkError("");
        setLinkOpen((prev) => !prev);
      },
    },
    {
      label: copy("Список"),
      icon: List,
      active: Boolean(editor?.isActive("bulletList")),
      disabled: false,
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      label: copy("Нумерованный список"),
      icon: ListOrdered,
      active: Boolean(editor?.isActive("orderedList")),
      disabled: false,
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      label: copy("Отменить"),
      icon: Undo,
      active: false,
      disabled: !editor?.can().undo(),
      run: () => editor?.chain().focus().undo().run(),
    },
    {
      label: copy("Повторить"),
      icon: Redo,
      active: false,
      disabled: !editor?.can().redo(),
      run: () => editor?.chain().focus().redo().run(),
    },
  ];
  return (
    <div className="overflow-hidden rounded-lg border transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <div
        role="toolbar"
        aria-label={copy("Форматирование")}
        className="flex flex-wrap gap-1 border-b bg-muted/30 p-1"
      >
        {controls.map((control) => (
          <Button
            key={control.label}
            type="button"
            size="icon"
            variant="ghost"
            aria-pressed={control.active}
            className={`size-8 ${control.active ? "bg-accent text-accent-foreground" : ""}`}
            aria-label={control.label}
            title={control.label}
            disabled={disabled || !editor || control.disabled}
            onClick={control.run}
          >
            <control.icon className="size-4" />
          </Button>
        ))}
      </div>
      {linkOpen && !disabled && (
        <div className="space-y-1.5 border-b bg-muted/20 p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              type="url"
              value={linkUrl}
              aria-label={copy("Адрес ссылки")}
              placeholder="https://example.com"
              className="h-8 min-w-48 flex-1 text-xs"
              onChange={(event) => {
                setLinkUrl(event.target.value);
                setLinkError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setLinkOpen(false);
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              onClick={applyLink}
            >
              {copy("Применить")}
            </Button>
            {editor?.isActive("link") && (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className="size-8"
                aria-label={copy("Убрать ссылку")}
                title={copy("Убрать ссылку")}
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .extendMarkRange("link")
                    .unsetLink()
                    .run();
                  setLinkOpen(false);
                }}
              >
                <Unlink className="size-3.5" />
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => setLinkOpen(false)}
            >
              {copy("Отмена")}
            </Button>
          </div>
          {linkError && <p className="text-xs text-destructive">{linkError}</p>}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
