"use client";

import { SettingsReadOnlyNotice } from "@/components/system-settings/read-only-notice";

import { useState } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import type { TermDefinition } from "@asmblyr/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { TermForm } from "./term-form";

export function TermsWorkspace({
  readOnly = false,
  initial,
}: {
  readOnly?: boolean;
  initial: TermDefinition[];
}) {
  const [terms, setTerms] = useState(initial);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ term: TermDefinition | null } | null>(
    null,
  );
  const search = query.trim().toLocaleLowerCase("ru");
  const visible = terms.filter((term) =>
    [term.name, term.description, ...term.aliases]
      .join(" ")
      .toLocaleLowerCase("ru")
      .includes(search),
  );
  return (
    <section
      className="min-w-0 space-y-6"
      aria-labelledby="terms-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <h1
            id="terms-title"
            className="text-xl font-semibold tracking-tight"
          >
            Термины
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Общий словарь для работы с данными. Объясните понятия вашей команды,
            а в настройках коллекций свяжите их с точными условиями.
          </p>
        </div>
        {!readOnly && (
          <Button onClick={() => setEditor({ term: null })}>
            <Plus />
            Добавить термин
          </Button>
        )}
      </div>
      <SettingsReadOnlyNotice readOnly={readOnly} />
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-4 border-b p-4">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              aria-label="Поиск терминов"
              placeholder="Найти термин или синоним…"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {terms.length} / 100
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-56 pl-4">Термин</TableHead>
              <TableHead>Определение</TableHead>
              <TableHead className="w-28">Состояние</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((term) => (
              <TableRow
                key={term.id}
                className="cursor-pointer"
                onClick={() => setEditor({ term })}
              >
                <TableCell className="align-top pl-4">
                  <Button
                    variant="link"
                    className="h-auto whitespace-normal p-0 text-left text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditor({ term });
                    }}
                  >
                    {term.name}
                  </Button>
                  {term.builtin && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Базовый
                    </p>
                  )}
                </TableCell>
                <TableCell className="max-w-xl whitespace-normal py-4">
                  <p className="text-sm leading-5">{term.description}</p>
                  {term.aliases.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {term.aliases.join(" · ")}
                    </p>
                  )}
                </TableCell>
                <TableCell className="align-top py-4">
                  <Badge variant={term.enabled ? "secondary" : "outline"}>
                    {term.enabled ? "Включён" : "Выключен"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!visible.length && (
          <div className="space-y-2 p-10 text-center text-sm text-muted-foreground">
            <BookOpen className="mx-auto size-6" />
            <p>Термины не найдены</p>
          </div>
        )}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Базовые определения можно менять. Термин начинает работать с данными
        после настройки условия в коллекции.
      </p>
      {editor && (
        <EditorDialog
          open
          title={editor.term ? "Настройка термина" : "Новый термин"}
          eyebrow={readOnly ? "Справочник · просмотр" : "Справочник"}
          onClose={() => setEditor(null)}
        >
          {(_container, close) => (
            <TermForm
              readOnly={readOnly}
              term={editor.term}
              onSaved={(saved) => {
                setTerms((current) =>
                  [
                    ...current.filter((term) => term.id !== saved.id),
                    saved,
                  ].sort((a, b) => a.name.localeCompare(b.name, "ru")),
                );
                close();
              }}
            />
          )}
        </EditorDialog>
      )}
    </section>
  );
}
