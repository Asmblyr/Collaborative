"use client";

import { useMemo, useState } from "react";
import {
  Database,
  Globe,
  Info,
  Lock,
  Plus,
  Search,
  Shield,
  Users,
  Wand2,
} from "lucide-react";
import type {
  AssistantSkill,
  AssistantSkillAdminMeta,
  AssistantSkillCollectionRef,
  AssistantSkillPolicyRef,
} from "@asmblyr-collaborative/contracts";
import { Badge } from "@asmblyr-collaborative/kit/ui/badge";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import { SettingsReadOnlyNotice } from "@/components/admin/settings/read-only-notice";
import { useUiCopy } from "@/lib/ui-copy";
import { SkillForm } from "./skill-form";
import {
  filterSkills,
  MAX_SKILLS,
  sortSkills,
  type SkillMcpFilter,
  type SkillStatusFilter,
} from "./skill-utils";

export function SkillsWorkspace({
  readOnly = false,
  initialSkills,
  meta,
  policies,
  collections,
}: {
  readOnly?: boolean;
  initialSkills: AssistantSkill[];
  meta: AssistantSkillAdminMeta;
  policies: AssistantSkillPolicyRef[];
  collections: AssistantSkillCollectionRef[];
}) {
  const copy = useUiCopy();
  const { t } = useTranslations();

  const [skills, setSkills] = useState<AssistantSkill[]>(() =>
    sortSkills(initialSkills),
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SkillStatusFilter>("all");
  const [mcpFilter, setMcpFilter] = useState<SkillMcpFilter>("all");
  const [editor, setEditor] = useState<{ skill: AssistantSkill | null } | null>(
    null,
  );

  const visible = useMemo(
    () =>
      filterSkills(skills, {
        query,
        status: statusFilter,
        mcp: mcpFilter,
      }),
    [skills, query, statusFilter, mcpFilter],
  );

  const hasActiveFilters =
    query.trim().length > 0 || statusFilter !== "all" || mcpFilter !== "all";

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(copy.locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [copy.locale],
  );

  const createDisabledReason =
    !readOnly && !meta.canCreate
      ? meta.delegatablePolicyIds.length === 0
        ? copy(
            "Чтобы создавать умения, вам должна быть делегирована хотя бы одна политика доступа.",
          )
        : copy(
            "Чтобы создавать умения, необходим доступ на чтение хотя бы к одной коллекции.",
          )
      : null;

  function resetFilters() {
    setQuery("");
    setStatusFilter("all");
    setMcpFilter("all");
  }

  return (
    <section
      className="min-w-0 space-y-6"
      aria-labelledby="skills-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <h1
            id="skills-title"
            className="text-xl font-semibold tracking-tight"
          >
            {t("admin.skills")}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {copy(
              "Повторяемые сценарии и инструкции для встроенного ассистента и внешних MCP-клиентов. Доступ регулируется коллекциями и политиками.",
            )}
          </p>
        </div>
        {!readOnly && (
          <Button
            disabled={!meta.canCreate}
            title={createDisabledReason ?? undefined}
            onClick={() => setEditor({ skill: null })}
          >
            <Plus className="size-4" />
            {copy("Добавить умение")}
          </Button>
        )}
      </div>

      <SettingsReadOnlyNotice readOnly={readOnly} />

      {createDisabledReason && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-800 dark:text-amber-200">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p className="leading-5">{createDisabledReason}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        {/* Search & Filter Toolbar */}
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 lg:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              aria-label={copy("Поиск умений")}
              placeholder={copy("Поиск по названию, /slug, коллекциям…")}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label={copy("Фильтр по статусу")}
              className="inline-flex rounded-lg border bg-muted/40 p-0.5"
            >
              {(
                [
                  { id: "all", label: copy("Все") },
                  { id: "active", label: copy("Активные") },
                  { id: "draft", label: copy("Черновики") },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={statusFilter === option.id}
                  onClick={() => setStatusFilter(option.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusFilter === option.id
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div
              role="group"
              aria-label={copy("Фильтр по MCP")}
              className="inline-flex rounded-lg border bg-muted/40 p-0.5"
            >
              {(
                [
                  { id: "all", label: copy("Все каналы") },
                  { id: "mcp", label: copy("В MCP") },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={mcpFilter === option.id}
                  onClick={() => setMcpFilter(option.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    mcpFilter === option.id
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <span className="ml-auto text-xs tabular-nums text-muted-foreground lg:ml-1">
              {skills.length} / {MAX_SKILLS}
            </span>
          </div>
        </div>

        {/* Skills List */}
        {visible.length > 0 ? (
          <div className="divide-y">
            {visible.map((skill) => {
              const author = skill.updatedByName ?? skill.createdByName;
              const updatedLabel = dateFormatter.format(
                new Date(skill.updatedAt),
              );
              const outsideScope =
                !readOnly && !meta.superuser && !skill.manageable;

              return (
                <article
                  key={skill.id}
                  onClick={() => setEditor({ skill })}
                  className="group cursor-pointer p-4 transition-colors hover:bg-accent/35"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto whitespace-normal p-0 text-left text-base font-medium text-foreground"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditor({ skill });
                          }}
                        >
                          {skill.title}
                        </Button>
                        <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          /{skill.slug}
                        </code>
                        <Badge
                          variant={
                            skill.status === "active" ? "secondary" : "outline"
                          }
                          className={
                            skill.status === "active"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : undefined
                          }
                        >
                          {skill.status === "active"
                            ? copy("Активно")
                            : copy("Черновик")}
                        </Badge>
                        {skill.exposeToMcp && (
                          <Badge
                            variant="outline"
                            className={
                              skill.coverage.mcpReady
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            }
                            title={
                              skill.coverage.mcpReady
                                ? copy("Доступно внешним MCP-клиентам")
                                : copy(
                                    "Включено для MCP, но ещё не активно или не у всех коллекций включён MCP",
                                  )
                            }
                          >
                            MCP
                          </Badge>
                        )}
                        {outsideScope && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          >
                            <Lock className="size-3" />
                            {copy("Только просмотр · вне вашей области")}
                          </Badge>
                        )}
                      </div>

                      <p className="line-clamp-2 max-w-3xl text-sm leading-5 text-muted-foreground">
                        {skill.description}
                      </p>

                      {/* Scope + Audience + Coverage pills */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-muted-foreground">
                        {/* Scope */}
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {skill.scope === "global" ? (
                            <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-foreground/80">
                              <Globe className="size-3 text-muted-foreground" />
                              {copy("Глобально")}
                            </span>
                          ) : skill.collectionDetails.length > 0 ? (
                            <>
                              {skill.collectionDetails
                                .slice(0, 3)
                                .map((collection) => (
                                  <span
                                    key={collection.name}
                                    className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-foreground/80"
                                  >
                                    <Database className="size-3 text-muted-foreground" />
                                    {collection.displayName}
                                  </span>
                                ))}
                              {skill.collectionDetails.length > 3 && (
                                <span className="rounded-md border bg-muted/40 px-2 py-0.5">
                                  +{skill.collectionDetails.length - 3}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                              <Database className="size-3" />
                              {copy("Коллекции удалены · скрыто")}
                            </span>
                          )}
                        </span>

                        {/* Audience */}
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {skill.audience === "all" ? (
                            <span className="inline-flex items-center gap-1">
                              <Users className="size-3.5" />
                              {copy("Все политики")}
                            </span>
                          ) : skill.policies.length > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Shield className="size-3.5" />
                              {skill.policies
                                .slice(0, 2)
                                .map((policy) => policy.name)
                                .join(", ")}
                              {skill.policies.length > 2 &&
                                ` +${skill.policies.length - 2}`}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                              <Shield className="size-3.5" />
                              {copy("Политики удалены · скрыто")}
                            </span>
                          )}
                          <span aria-hidden>·</span>
                          <span>
                            {copy.plural(skill.coverage.audienceUsersCount, {
                              one: "{{count}} пользователь",
                              few: "{{count}} пользователя",
                              many: "{{count}} пользователей",
                            })}
                          </span>
                        </span>

                        {/* Author & Updated */}
                        <span className="inline-flex items-center gap-1.5 sm:ml-auto">
                          {author && (
                            <>
                              <span>{author}</span>
                              <span aria-hidden>·</span>
                            </>
                          )}
                          <time dateTime={skill.updatedAt}>{updatedLabel}</time>
                        </span>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-3 rounded-xl bg-muted p-3">
              <Wand2 className="size-6 text-muted-foreground" />
            </div>
            <h2 className="font-semibold">
              {copy("Создайте первое умение ассистента")}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {copy(
                "Опишите корпоративный сценарий в Markdown, привяжите нужные коллекции и политики — сотрудники смогут вызывать его через /slug в чате или по MCP.",
              )}
            </p>
            {!readOnly && meta.canCreate && (
              <Button
                variant="outline"
                className="mt-5"
                onClick={() => setEditor({ skill: null })}
              >
                <Plus className="size-4" />
                {copy("Добавить умение")}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3 p-10 text-center text-sm text-muted-foreground">
            <Wand2 className="mx-auto size-6" />
            <p>{copy("Умения не найдены")}</p>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetFilters}
              >
                {copy("Сбросить фильтры")}
              </Button>
            )}
          </div>
        )}
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        {copy(
          "Умения задают сценарий и порядок действий, но никогда не расширяют права доступа к коллекциям, записям или полям.",
        )}
      </p>

      {editor && (
        <SkillForm
          key={editor.skill ? editor.skill.id : "new"}
          open
          pageReadOnly={readOnly}
          skill={editor.skill}
          meta={meta}
          policies={policies}
          collections={collections}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            setSkills((current) =>
              sortSkills([
                ...current.filter((item) => item.id !== saved.id),
                saved,
              ]),
            );
          }}
          onDeleted={(skillId) => {
            setSkills((current) =>
              current.filter((item) => item.id !== skillId),
            );
          }}
        />
      )}
    </section>
  );
}
