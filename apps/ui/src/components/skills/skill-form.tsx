"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Eye,
  Globe,
  Lock,
  Plus,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type {
  AssistantSkill,
  AssistantSkillAdminMeta,
  AssistantSkillCollectionRef,
  AssistantSkillPolicyRef,
} from "@asmblyr-collaborative/contracts";
import { Badge } from "@asmblyr-collaborative/kit/ui/badge";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@asmblyr-collaborative/kit/ui/label";
import { Switch } from "@asmblyr-collaborative/kit/ui/switch";
import { Textarea } from "@asmblyr-collaborative/kit/ui/textarea";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { apiRequest } from "@/lib/api-request";
import { localizedRequestError } from "@/lib/http-request";
import { useUiCopy } from "@/lib/ui-copy";
import { SkillDeleteDialog } from "./skill-delete-dialog";
import {
  canSubmitSkillValues,
  createInitialSkillValues,
  isValidSkillSlug,
  MAX_SKILL_DESCRIPTION_LENGTH,
  MAX_SKILL_EXAMPLE_LENGTH,
  MAX_SKILL_EXAMPLES,
  MAX_SKILL_INSTRUCTIONS_LENGTH,
  MAX_SKILL_TITLE_LENGTH,
  normalizeSkillSearch,
  suggestSkillSlug,
  toSkillInput,
  type SkillFormValues,
} from "./skill-utils";

export function SkillForm({
  open,
  pageReadOnly,
  skill,
  meta,
  policies,
  collections,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  pageReadOnly: boolean;
  skill: AssistantSkill | null;
  meta: AssistantSkillAdminMeta;
  policies: AssistantSkillPolicyRef[];
  collections: AssistantSkillCollectionRef[];
  onClose: () => void;
  onSaved: (saved: AssistantSkill) => void;
  onDeleted: (skillId: string) => void;
}) {
  const copy = useUiCopy();
  const formId = useId();
  const closeRef = useRef<(() => void) | null>(null);

  const outsideDelegation = Boolean(
    skill && !pageReadOnly && !meta.superuser && !skill.manageable,
  );
  const readOnly = pageReadOnly || Boolean(skill && !skill.manageable);

  const initialValues = useMemo(
    () => createInitialSkillValues(skill, meta),
    [skill, meta],
  );
  const [values, setValues] = useState<SkillFormValues>(initialValues);
  const [slugTouched, setSlugTouched] = useState(Boolean(skill));
  const [collectionFilter, setCollectionFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(initialValues),
    [values, initialValues],
  );

  const delegatableSet = useMemo(
    () => new Set(meta.delegatablePolicyIds.map((id) => id.toLowerCase())),
    [meta.delegatablePolicyIds],
  );

  const availableCollections = useMemo(() => {
    const byName = new Map<string, AssistantSkillCollectionRef>();
    for (const item of collections) {
      byName.set(item.name, item);
    }
    if (skill) {
      for (const item of skill.collectionDetails) {
        if (!byName.has(item.name)) {
          byName.set(item.name, item);
        }
      }
    }
    return [...byName.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "ru"),
    );
  }, [collections, skill]);

  const readableCollectionNames = useMemo(
    () => new Set(collections.map((item) => item.name)),
    [collections],
  );

  const filteredCollections = useMemo(() => {
    const needle = normalizeSkillSearch(collectionFilter);
    if (!needle) {
      return availableCollections;
    }
    return availableCollections.filter((item) =>
      normalizeSkillSearch(`${item.displayName} ${item.name}`).includes(needle),
    );
  }, [availableCollections, collectionFilter]);

  const availablePolicies = useMemo(() => {
    if (meta.superuser || readOnly) {
      const byId = new Map<string, AssistantSkillPolicyRef>();
      for (const policy of policies) {
        byId.set(policy.id.toLowerCase(), policy);
      }
      if (skill) {
        for (const policy of skill.policies) {
          if (!byId.has(policy.id.toLowerCase())) {
            byId.set(policy.id.toLowerCase(), policy);
          }
        }
      }
      return [...byId.values()].sort((a, b) =>
        a.name.localeCompare(b.name, "ru"),
      );
    }
    return policies
      .filter((policy) => delegatableSet.has(policy.id.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [meta.superuser, readOnly, policies, skill, delegatableSet]);

  const selectedCollectionDetails = useMemo(() => {
    const byName = new Map(availableCollections.map((c) => [c.name, c]));
    return values.collections
      .map((name) => byName.get(name))
      .filter((item): item is AssistantSkillCollectionRef => Boolean(item));
  }, [availableCollections, values.collections]);

  const collectionsWithoutMcp = useMemo(
    () =>
      values.scope === "collections"
        ? selectedCollectionDetails.filter((item) => !item.mcpEnabled)
        : [],
    [values.scope, selectedCollectionDetails],
  );

  const mcpReadyPreview =
    values.status === "active" &&
    values.exposeToMcp &&
    (values.scope === "global" ||
      (values.collections.length > 0 && collectionsWithoutMcp.length === 0));

  const slugInvalid =
    values.slug.trim().length > 0 && !isValidSkillSlug(values.slug);
  const canSubmit = !readOnly && !busy && canSubmitSkillValues(values);

  function updateTitle(nextTitle: string) {
    setValues((current) => ({
      ...current,
      title: nextTitle,
      slug: !skill && !slugTouched ? suggestSkillSlug(nextTitle) : current.slug,
    }));
  }

  function toggleCollection(name: string, checked: boolean) {
    setValues((current) => ({
      ...current,
      collections: checked
        ? [...new Set([...current.collections, name])]
        : current.collections.filter((item) => item !== name),
    }));
  }

  function togglePolicy(id: string, checked: boolean) {
    setValues((current) => ({
      ...current,
      policyIds: checked
        ? [...new Set([...current.policyIds, id])]
        : current.policyIds.filter(
            (item) => item.toLowerCase() !== id.toLowerCase(),
          ),
    }));
  }

  function updateExample(index: number, nextValue: string) {
    setValues((current) => {
      const next = [...current.examples];
      next[index] = nextValue;
      return { ...current, examples: next };
    });
  }

  function addExample() {
    setValues((current) => {
      if (current.examples.length >= MAX_SKILL_EXAMPLES) {
        return current;
      }
      return { ...current, examples: [...current.examples, ""] };
    });
  }

  function removeExample(index: number) {
    setValues((current) => ({
      ...current,
      examples: current.examples.filter((_, idx) => idx !== index),
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
    close: () => void,
  ) {
    event.preventDefault();
    if (readOnly || busy || !canSubmitSkillValues(values)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = toSkillInput(values);
      const saved = await apiRequest<AssistantSkill>(
        skill ? `/api/settings/skills/${skill.id}` : "/api/settings/skills",
        skill ? "PUT" : "POST",
        payload,
      );
      onSaved(saved);
      close();
    } catch (cause) {
      setError(
        localizedRequestError(cause, copy, "Не удалось сохранить умение"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!skill || readOnly || busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiRequest<void>(`/api/settings/skills/${skill.id}`, "DELETE");
      setConfirmDeleteOpen(false);
      onDeleted(skill.id);
      closeRef.current?.();
    } catch (cause) {
      setConfirmDeleteOpen(false);
      setError(localizedRequestError(cause, copy, "Не удалось удалить умение"));
    } finally {
      setBusy(false);
    }
  }

  const unchangedAudienceForCoverage =
    skill &&
    values.audience === skill.audience &&
    JSON.stringify([...values.policyIds].sort()) ===
      JSON.stringify([...skill.policyIds].sort());

  return (
    <EditorDialog
      open={open}
      size="wide"
      title={skill ? skill.title : copy("Новое умение")}
      eyebrow={
        readOnly
          ? copy("Умения ассистента · просмотр")
          : copy("Умения ассистента")
      }
      busy={busy}
      hasUnsavedChanges={!readOnly && dirty}
      onClose={onClose}
      footer={(requestClose, close) => {
        closeRef.current = close;
        return (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {skill && !readOnly ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
                {copy("Удалить умение")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={requestClose}
              >
                {readOnly ? copy("Закрыть") : copy("Отмена")}
              </Button>
              {!readOnly && (
                <Button
                  type="submit"
                  form={formId}
                  disabled={!canSubmit || (Boolean(skill) && !dirty)}
                >
                  {busy
                    ? copy("Сохранение…")
                    : skill
                      ? copy("Сохранить")
                      : copy("Создать умение")}
                </Button>
              )}
            </div>
          </div>
        );
      }}
    >
      {(_container, close) => (
        <>
          <form
            id={formId}
            onSubmit={(event) => void handleSubmit(event, close)}
            className="space-y-6 pb-2"
          >
            {outsideDelegation && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-800 dark:text-amber-200">
                <Lock className="mt-0.5 size-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">
                    {copy("Только просмотр · вне вашей области")}
                  </p>
                  <p className="text-xs leading-5 opacity-90">
                    {copy(
                      "Умение использует глобальную область, доступ для всех политик либо коллекции и политики вне вашего набора делегирования.",
                    )}
                  </p>
                </div>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <fieldset
              disabled={busy || readOnly}
              className="space-y-6"
            >
              {/* Title + Slug */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="skill-title">
                      {copy("Название")}{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {values.title.length} / {MAX_SKILL_TITLE_LENGTH}
                    </span>
                  </div>
                  <Input
                    id="skill-title"
                    required
                    maxLength={MAX_SKILL_TITLE_LENGTH}
                    value={values.title}
                    placeholder={copy("Например, Разбор просроченных сделок")}
                    onChange={(event) => updateTitle(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="skill-slug">
                    {copy("Команда (slug)")}{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex items-center">
                    <span className="flex h-9 items-center rounded-l-md border border-r-0 bg-muted px-2.5 font-mono text-sm text-muted-foreground">
                      /
                    </span>
                    <Input
                      id="skill-slug"
                      required
                      maxLength={64}
                      value={values.slug}
                      aria-invalid={slugInvalid || undefined}
                      placeholder="overdue-deals"
                      className="rounded-l-none font-mono text-sm"
                      onChange={(event) => {
                        setSlugTouched(true);
                        setValues((current) => ({
                          ...current,
                          slug: event.target.value.toLowerCase(),
                        }));
                      }}
                    />
                  </div>
                  {slugInvalid ? (
                    <p className="text-xs text-destructive">
                      {copy(
                        "Используйте строчные латинские буквы, цифры, дефис или подчёркивание (1–64 символа).",
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {copy(
                        "Используется в чате (/slug) и в MCP (skill://slug).",
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="skill-description">
                    {copy("Когда применять")}{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {values.description.length} / {MAX_SKILL_DESCRIPTION_LENGTH}
                  </span>
                </div>
                <Textarea
                  id="skill-description"
                  required
                  rows={3}
                  maxLength={MAX_SKILL_DESCRIPTION_LENGTH}
                  value={values.description}
                  placeholder={copy(
                    "Кратко опишите задачу, чтобы сотрудники и ассистент понимали, когда выбирать это умение.",
                  )}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </div>

              {/* Instructions (Markdown) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="skill-instructions">
                    {copy("Инструкции (Markdown)")}{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {values.instructions.length.toLocaleString(copy.locale)} /{" "}
                    {MAX_SKILL_INSTRUCTIONS_LENGTH.toLocaleString(copy.locale)}
                  </span>
                </div>
                <Textarea
                  id="skill-instructions"
                  required
                  rows={10}
                  maxLength={MAX_SKILL_INSTRUCTIONS_LENGTH}
                  value={values.instructions}
                  className="min-h-48 font-mono text-[13px] leading-relaxed"
                  placeholder={copy(
                    "Опишите шаги, критерии анализа, формат ответа и важные оговорки в Markdown…",
                  )}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      instructions: event.target.value,
                    }))
                  }
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  {copy(
                    "Можно ссылаться на термины словаря — для привязанных коллекций ассистент и MCP автоматически получат их точные условия с учётом прав пользователя.",
                  )}
                </p>
              </div>

              {/* Starter Examples */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label>{copy("Примеры стартовых запросов")}</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {copy(
                        "До 5 коротких подсказок — появятся в чате ассистента для быстрого запуска умения.",
                      )}
                    </p>
                  </div>
                  {!readOnly && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        busy || values.examples.length >= MAX_SKILL_EXAMPLES
                      }
                      onClick={addExample}
                    >
                      <Plus className="size-3.5" />
                      {copy("Добавить пример")}
                    </Button>
                  )}
                </div>
                {values.examples.length > 0 ? (
                  <div className="space-y-2">
                    {values.examples.map((example, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2"
                      >
                        <Input
                          value={example}
                          maxLength={MAX_SKILL_EXAMPLE_LENGTH}
                          aria-label={copy("Пример запроса {{value0}}", {
                            value0: index + 1,
                          })}
                          placeholder={copy(
                            "Например, Покажи просроченные сделки за последние 14 дней",
                          )}
                          onChange={(event) =>
                            updateExample(index, event.target.value)
                          }
                        />
                        {!readOnly && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            aria-label={copy("Удалить пример")}
                            onClick={() => removeExample(index)}
                          >
                            <X className="size-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
                    {copy("Примеры не добавлены.")}
                  </p>
                )}
              </div>

              {/* Scope (Layer 1: Collections) */}
              <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {copy("Область коллекций")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {copy(
                      "Слой 1 видимости: для привязанных коллекций пользователь увидит умение только при наличии права чтения на все выбранные коллекции.",
                    )}
                  </p>
                </div>

                <div
                  role="radiogroup"
                  aria-label={copy("Область коллекций")}
                  className="grid gap-2.5 sm:grid-cols-2"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={values.scope === "global"}
                    disabled={busy || readOnly || !meta.canUseGlobalScope}
                    onClick={() =>
                      setValues((current) => ({ ...current, scope: "global" }))
                    }
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      values.scope === "global"
                        ? "border-primary bg-primary/5"
                        : "bg-card hover:bg-accent/40"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{copy("Глобально")}</p>
                      <p className="text-xs text-muted-foreground">
                        {copy("Работает без привязки к конкретным коллекциям.")}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={values.scope === "collections"}
                    disabled={busy || readOnly}
                    onClick={() =>
                      setValues((current) => ({
                        ...current,
                        scope: "collections",
                      }))
                    }
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      values.scope === "collections"
                        ? "border-primary bg-primary/5"
                        : "bg-card hover:bg-accent/40"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {copy("Выбранные коллекции")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {copy(
                          "Приоритетно в контексте этих коллекций и подключает их словарь.",
                        )}
                      </p>
                    </div>
                  </button>
                </div>

                {!meta.canUseGlobalScope && !readOnly && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="size-3.5 shrink-0" />
                    {copy(
                      "Глобальная область доступна только суперпользователю — выберите доступные вам коллекции.",
                    )}
                  </p>
                )}

                {values.scope === "collections" && (
                  <div className="space-y-2.5 pt-1">
                    {availableCollections.length > 6 && (
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                        <Input
                          value={collectionFilter}
                          onChange={(event) =>
                            setCollectionFilter(event.target.value)
                          }
                          placeholder={copy("Фильтр коллекций…")}
                          className="h-8 bg-card pl-8 text-xs"
                        />
                      </div>
                    )}
                    {filteredCollections.length > 0 ? (
                      <div className="max-h-48 divide-y overflow-y-auto rounded-lg border bg-card">
                        {filteredCollections.map((collection) => {
                          const checked = values.collections.includes(
                            collection.name,
                          );
                          const lockedOutside =
                            !meta.superuser &&
                            !readableCollectionNames.has(collection.name);
                          return (
                            <label
                              key={collection.name}
                              className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-accent/40"
                            >
                              <span className="flex min-w-0 items-center gap-2.5">
                                <Checkbox
                                  checked={checked}
                                  disabled={busy || readOnly || lockedOutside}
                                  onCheckedChange={(state) =>
                                    toggleCollection(
                                      collection.name,
                                      state === true,
                                    )
                                  }
                                />
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">
                                    {collection.displayName}
                                  </span>
                                  {collection.displayName !==
                                    collection.name && (
                                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                                      {collection.name}
                                    </span>
                                  )}
                                </span>
                              </span>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {collection.mcpEnabled ? (
                                  <Badge
                                    variant="secondary"
                                    className="text-[11px]"
                                  >
                                    MCP
                                  </Badge>
                                ) : (
                                  values.exposeToMcp &&
                                  checked && (
                                    <Badge
                                      variant="outline"
                                      className="border-amber-500/40 text-[11px] text-amber-700 dark:text-amber-300"
                                    >
                                      {copy("MCP выкл.")}
                                    </Badge>
                                  )
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed bg-card px-3 py-3 text-center text-xs text-muted-foreground">
                        {copy("Нет доступных коллекций")}
                      </p>
                    )}
                    {values.collections.length === 0 && !readOnly && (
                      <p className="text-xs text-destructive">
                        {copy("Выберите хотя бы одну коллекцию.")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Audience (Layer 2: Policies) */}
              <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {copy("Аудитория и политики")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {copy(
                      "Слой 2 видимости: ограничьте умение определёнными ролями или откройте всем, у кого есть доступ к коллекциям.",
                    )}
                  </p>
                </div>

                <div
                  role="radiogroup"
                  aria-label={copy("Аудитория и политики")}
                  className="grid gap-2.5 sm:grid-cols-2"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={values.audience === "all"}
                    disabled={busy || readOnly || !meta.canUseAllAudience}
                    onClick={() =>
                      setValues((current) => ({ ...current, audience: "all" }))
                    }
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      values.audience === "all"
                        ? "border-primary bg-primary/5"
                        : "bg-card hover:bg-accent/40"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {copy("Всем с доступом к коллекциям")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {copy("Без дополнительного ограничения по политикам.")}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={values.audience === "policies"}
                    disabled={busy || readOnly}
                    onClick={() =>
                      setValues((current) => ({
                        ...current,
                        audience: "policies",
                      }))
                    }
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      values.audience === "policies"
                        ? "border-primary bg-primary/5"
                        : "bg-card hover:bg-accent/40"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <Shield className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {copy("Только выбранным политикам")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {copy(
                          "Умение увидят только участники указанных политик.",
                        )}
                      </p>
                    </div>
                  </button>
                </div>

                {!meta.canUseAllAudience && !readOnly && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="size-3.5 shrink-0" />
                    {copy(
                      "Вы можете ограничивать доступ только политиками из вашего набора делегирования.",
                    )}
                  </p>
                )}

                {values.audience === "policies" && (
                  <div className="space-y-2 pt-1">
                    {availablePolicies.length > 0 ? (
                      <div className="max-h-48 divide-y overflow-y-auto rounded-lg border bg-card">
                        {availablePolicies.map((policy) => {
                          const checked = values.policyIds.some(
                            (id) =>
                              id.toLowerCase() === policy.id.toLowerCase(),
                          );
                          return (
                            <label
                              key={policy.id}
                              className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent/40"
                            >
                              <Checkbox
                                checked={checked}
                                disabled={busy || readOnly}
                                onCheckedChange={(state) =>
                                  togglePolicy(policy.id, state === true)
                                }
                              />
                              <span className="truncate font-medium">
                                {policy.name}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed bg-card px-3 py-3 text-center text-xs text-muted-foreground">
                        {copy("Нет доступных политик для выбора")}
                      </p>
                    )}
                    {values.policyIds.length === 0 && !readOnly && (
                      <p className="text-xs text-destructive">
                        {copy("Выберите хотя бы одну политику доступа.")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Status + MCP Toggle */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2.5 rounded-xl border p-4">
                  <Label>{copy("Статус публикации")}</Label>
                  <div
                    role="radiogroup"
                    aria-label={copy("Статус публикации")}
                    className="grid grid-cols-2 gap-2"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={values.status === "draft"}
                      disabled={busy || readOnly}
                      onClick={() =>
                        setValues((current) => ({
                          ...current,
                          status: "draft",
                        }))
                      }
                      className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                        values.status === "draft"
                          ? "border-primary bg-primary/5 text-foreground"
                          : "bg-card text-muted-foreground hover:bg-accent/40"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {copy("Черновик")}
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={values.status === "active"}
                      disabled={busy || readOnly}
                      onClick={() =>
                        setValues((current) => ({
                          ...current,
                          status: "active",
                        }))
                      }
                      className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                        values.status === "active"
                          ? "border-primary bg-primary/5 text-foreground"
                          : "bg-card text-muted-foreground hover:bg-accent/40"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {copy("Активно")}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {values.status === "active"
                      ? copy(
                          "Активное умение отображается пользователям с учётом области и политик.",
                        )
                      : copy(
                          "Черновик скрыт от ассистента и MCP, пока вы его не опубликуете.",
                        )}
                  </p>
                </div>

                <div className="flex flex-col justify-between gap-3 rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="skill-expose-mcp">
                        {copy("Доступно внешним MCP-клиентам")}
                      </Label>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {copy(
                          "Откроет умение через инструменты list_skills / read_skill, ресурс skill://<slug> и промпт skill:<slug>.",
                        )}
                      </p>
                    </div>
                    <Switch
                      id="skill-expose-mcp"
                      checked={values.exposeToMcp}
                      onCheckedChange={(exposeToMcp) =>
                        setValues((current) => ({ ...current, exposeToMcp }))
                      }
                    />
                  </div>
                  {values.exposeToMcp && collectionsWithoutMcp.length > 0 && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {copy(
                        "У некоторых выбранных коллекций выключен MCP — для внешнего MCP умение не откроется, пока MCP не включён на всех его коллекциях.",
                      )}
                    </p>
                  )}
                </div>
              </div>
            </fieldset>

            {/* Live Coverage Summary */}
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="size-3.5" />
                  {copy("Сводка охвата")}
                </p>
                {mcpReadyPreview ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  >
                    <CheckCircle2 className="size-3" />
                    {copy("MCP готов")}
                  </Badge>
                ) : values.exposeToMcp ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  >
                    <AlertTriangle className="size-3" />
                    {values.status === "draft"
                      ? copy("Черновик · скрыто в MCP")
                      : copy("Ожидает MCP на коллекциях")}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="gap-1 text-muted-foreground"
                  >
                    <Eye className="size-3" />
                    {copy("Только встроенный ассистент")}
                  </Badge>
                )}
              </div>

              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  <span className="font-medium text-foreground">
                    {copy("Область:")}{" "}
                  </span>
                  {values.scope === "global"
                    ? copy("Глобально")
                    : copy.plural(values.collections.length, {
                        one: "{{count}} коллекция",
                        few: "{{count}} коллекции",
                        many: "{{count}} коллекций",
                      })}
                </div>
                <div>
                  <span className="font-medium text-foreground">
                    {copy("Аудитория:")}{" "}
                  </span>
                  {values.audience === "all"
                    ? copy("Все политики")
                    : copy.plural(values.policyIds.length, {
                        one: "{{count}} политика",
                        few: "{{count}} политики",
                        many: "{{count}} политик",
                      })}
                  {unchangedAudienceForCoverage && (
                    <span>
                      {" · "}
                      {copy.plural(skill.coverage.audienceUsersCount, {
                        one: "{{count}} пользователь",
                        few: "{{count}} пользователя",
                        many: "{{count}} пользователей",
                      })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </form>

          {skill && (
            <SkillDeleteDialog
              open={confirmDeleteOpen}
              skillTitle={skill.title}
              skillSlug={skill.slug}
              busy={busy}
              onConfirm={() => void handleDelete()}
              onCancel={() => setConfirmDeleteOpen(false)}
            />
          )}
        </>
      )}
    </EditorDialog>
  );
}
