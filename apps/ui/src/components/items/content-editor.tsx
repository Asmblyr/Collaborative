"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Undo, Redo } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
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
      className="rounded-lg border p-2"
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
          required={required && tab === "write"}
          placeholder={placeholder || copy("Текст в формате Markdown")}
          rows={8}
          className="resize-y border-0 shadow-none font-mono text-sm"
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
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const copy = useUiCopy();

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
        "aria-label": copy("Форматированный текст"),
        class: `${contentClass} min-h-48 px-3 py-2 outline-none`,
      },
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
    )
      editor.commands.setContent(safeContentHtml(value), { emitUpdate: false });
  }, [editor, value]);
  const controls = [
    {
      label: copy("Жирный"),
      icon: Bold,
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: copy("Курсив"),
      icon: Italic,
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      label: copy("Список"),
      icon: List,
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      label: copy("Нумерованный список"),
      icon: ListOrdered,
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      label: copy("Отменить"),
      icon: Undo,
      run: () => editor?.chain().focus().undo().run(),
    },
    {
      label: copy("Повторить"),
      icon: Redo,
      run: () => editor?.chain().focus().redo().run(),
    },
  ];
  return (
    <div className="overflow-hidden rounded-lg border">
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
            className="size-8"
            aria-label={control.label}
            title={control.label}
            disabled={disabled || !editor}
            onClick={control.run}
          >
            <control.icon className="size-4" />
          </Button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
