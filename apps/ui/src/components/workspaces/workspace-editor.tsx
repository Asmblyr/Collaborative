"use client";

import { useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api-request";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@asmblyr/kit/ui/textarea";
import { Checkbox } from "@asmblyr/kit/ui/checkbox";
import type { Workspace } from "@/lib/workspaces";

export function WorkspaceEditor({ workspace, collections, onClose, onChanged }: {
  workspace: Workspace | null; collections: { name: string; displayName?: string | null }[]; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(workspace?.name ?? ""), [description, setDescription] = useState(workspace?.description ?? "");
  const [selected, setSelected] = useState(new Set(workspace?.collections ?? [])), [query, setQuery] = useState("");
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [confirm, setConfirm] = useState(false);
  const endpoint = `/api/workspaces${workspace ? `/${workspace.id}` : ""}`;
  async function save(event: FormEvent, close: () => void) {
    event.preventDefault(); setPending(true); setError("");
    try { await apiRequest(endpoint, workspace ? "PUT" : "POST", { name, description, collections: [...selected] }); await onChanged(); close(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить workspace"); }
    finally { setPending(false); }
  }
  async function remove(close: () => void) {
    setPending(true); setError("");
    try { await apiRequest(endpoint, "DELETE"); await onChanged(); close(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось удалить workspace"); }
    finally { setPending(false); }
  }
  return <EditorDialog open busy={pending} title={workspace ? "Настройки workspace" : "Новый workspace"} eyebrow="Организация данных" onClose={onClose}>
    {(_, close) => <form onSubmit={(event) => void save(event, close)} className="space-y-5">
      <p className="text-sm text-muted-foreground">Объедините коллекции одного продукта или команды. Пользователи увидят здесь только доступные им коллекции.</p>
      <div className="space-y-2"><Label htmlFor="workspace-name">Название</Label><Input id="workspace-name" value={name} required maxLength={120} disabled={pending}
        placeholder="Например, Каталог" onChange={(event) => setName(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="workspace-description">Описание</Label><Textarea id="workspace-description" value={description} maxLength={500}
        disabled={pending} onChange={(event) => setDescription(event.target.value)} /></div>
      <div className="space-y-3"><Label>Коллекции · {selected.size}</Label><Input value={query} aria-label="Найти коллекцию" placeholder="Найти коллекцию…"
        onChange={(event) => setQuery(event.target.value)} />
        <div className="max-h-80 space-y-1 overflow-auto rounded-lg border p-2">{collections.filter((c) =>
          [c.name, c.displayName ?? ""].some((name) => name.toLowerCase().includes(query.toLowerCase()))).map((c) =>
          <label key={c.name} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"><Checkbox checked={selected.has(c.name)} disabled={pending}
            onCheckedChange={(checked) => setSelected((previous) => { const next = new Set(previous); if (checked) next.add(c.name); else next.delete(c.name); return next; })} />{c.displayName || c.name}</label>)}
          {!collections.length && <p className="p-3 text-sm text-muted-foreground">Сначала создайте коллекции</p>}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={pending || !name.trim()}>{pending ? "Сохраняем…" : "Сохранить"}</Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={close}>Отмена</Button>
        {workspace && <Button type="button" variant="destructive" disabled={pending} onClick={() => confirm ? void remove(close) : setConfirm(true)}>
          {confirm ? "Подтвердить удаление workspace" : "Удалить workspace"}</Button>}
      </div>{confirm && <p className="text-xs text-muted-foreground">Коллекции и записи сохранятся. Удалится только workspace.</p>}
    </form>}
  </EditorDialog>;
}
