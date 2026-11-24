import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createContextTools } from "../src/assistant/context-tools.js";
import { AssistantService } from "../src/assistant/service.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import {
  beginSavedTurn,
  finishSavedTurn,
} from "../src/assistant/history-turn.js";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";
import { authorize, sdk } from "./support/external-mcp-client.js";

test("skills MCP channel gating, resources/prompts, assistant preload, contextualArguments exclusion, and saved-turn requestHash", async (t) => {
  let lastTurnContext: Record<string, unknown> | undefined;
  let lastTurnToolCalls = 0;
  const assistantConfig = assistantConfigFromEnv({
    OPENAI_API_KEY: "test",
    OPENAI_API_MODEL: "test-model",
  })!;
  const assistant = new AssistantService(
    assistantConfig,
    async (_input, _signal, _custom, run) => {
      lastTurnContext = run?.tools?.context as
        | Record<string, unknown>
        | undefined;
      lastTurnToolCalls = 0;
      return { content: "Ок, выполнил по умению", truncated: false };
    },
  );

  const fixture = await mcpFixture(t, assistant);
  const { app, db, names, suffix, access, reload, headers } = fixture;
  const userId = access.principal.id;
  const skillIds: string[] = [];
  const termIds: string[] = [];
  const conversationIds: string[] = [];

  try {
    await db("public.asmblyr_settings").where({ key: "assistant" }).delete();
    // Add a glossary term on names.posts (visible to endUser via "title") and one on hidden "secret"
    for (const [termName, field] of [
      [`Публичный_${suffix}`, "title"],
      [`Скрытый_${suffix}`, "secret"],
    ] as const) {
      const createdTerm = await app.inject({
        method: "POST",
        url: "/settings/terms",
        payload: {
          name: termName,
          description: `Термин ${termName}`,
          aliases: [],
          enabled: true,
        },
      });
      assert.equal(createdTerm.statusCode, 201, createdTerm.body);
      const termId = createdTerm.json().data.id as string;
      termIds.push(termId);
      const bound = await app.inject({
        method: "PUT",
        url: `/collections/${names.posts}/terms/${termId}`,
        payload: {
          filter: { logic: "and", children: [{ field, op: "notEmpty" }] },
        },
      });
      assert.equal(bound.statusCode, 204, bound.body);
    }

    const createSkill = async (payload: object) => {
      const res = await app.inject({
        method: "POST",
        url: "/settings/skills",
        payload,
      });
      assert.equal(res.statusCode, 201, res.body);
      const id = res.json().data.id as string;
      skillIds.push(id);
      return res.json().data as { id: string; slug: string };
    };

    // 1. Active skill bound to posts, exposeToMcp = true
    const mcpPostsSkill = await createSkill({
      slug: `posts_mcp_${suffix}`,
      title: "Аудит публикаций",
      description: "Проверяет публикации по регламенту",
      instructions: "Проверь список публикаций и отчитайся по заголовкам.",
      examples: ["Проведи аудит публикаций"],
      scope: "collections",
      audience: "all",
      status: "active",
      exposeToMcp: true,
      collections: [names.posts],
      policyIds: [],
    });

    // 2. Active skill bound to posts, exposeToMcp = false (visible in assistant, hidden on external MCP!)
    const assistantOnlySkill = await createSkill({
      slug: `posts_internal_${suffix}`,
      title: "Внутренняя сводка",
      description: "Только для встроенного ассистента",
      instructions: "Секретная внутренняя инструкция только для чата на сайте.",
      examples: ["Сделай внутреннюю сводку"],
      scope: "collections",
      audience: "all",
      status: "active",
      exposeToMcp: false,
      collections: [names.posts],
      policyIds: [],
    });

    // 3. Global active skill, exposeToMcp = true (tests list_skills(collection=null) from open table!)
    const globalSkill = await createSkill({
      slug: `global_brief_${suffix}`,
      title: "Общий брифинг",
      description: "Глобальное умение без привязки к коллекции",
      instructions: "Подготовь общий брифинг.",
      examples: [],
      scope: "global",
      audience: "all",
      status: "active",
      exposeToMcp: true,
      collections: [],
      policyIds: [],
    });

    // 4. Draft skill (hidden everywhere)
    const draftSkill = await createSkill({
      slug: `draft_${suffix}`,
      title: "Черновик",
      description: "Неактивное умение",
      instructions: "Не должно показываться.",
      examples: [],
      scope: "global",
      audience: "all",
      status: "draft",
      exposeToMcp: true,
      collections: [],
      policyIds: [],
    });

    // 5. Skill bound to denied collection (hidden by RBAC for fixture user)
    const deniedSkill = await createSkill({
      slug: `denied_${suffix}`,
      title: "Секретный отдел",
      description: "Привязано к недоступной коллекции",
      instructions: "Только для тех, у кого есть доступ к denied.",
      examples: [],
      scope: "collections",
      audience: "all",
      status: "active",
      exposeToMcp: true,
      collections: [names.denied],
      policyIds: [],
    });

    // --- A. External HTTP MCP (channel: "mcp") ---
    const auth = await authorize(fixture, false);
    const external = await sdk(fixture, auth.tokens.access_token);
    t.after(() => external.client.close());

    const mcpListResult = await external.tool("list_skills", {
      collection: null,
      workspace: null,
      q: suffix,
    });
    const mcpSlugs = (mcpListResult.skills as { slug: string }[]).map(
      (s) => s.slug,
    );
    assert.ok(mcpSlugs.includes(mcpPostsSkill.slug));
    assert.ok(mcpSlugs.includes(globalSkill.slug));
    assert.ok(!mcpSlugs.includes(assistantOnlySkill.slug)); // expose_to_mcp=false MUST be hidden on external MCP!
    assert.ok(!mcpSlugs.includes(draftSkill.slug));
    assert.ok(!mcpSlugs.includes(deniedSkill.slug));

    const mcpReadVisible = await external.tool("read_skill", {
      slug: mcpPostsSkill.slug,
    });
    assert.equal(mcpReadVisible.found, true);
    const readSkillObj = mcpReadVisible.skill as {
      slug: string;
      instructions: string;
      relatedTerms: { name: string }[];
    };
    assert.equal(readSkillObj.slug, mcpPostsSkill.slug);
    assert.match(readSkillObj.instructions, /Проверь список публикаций/);
    // Related terms filtered through field RBAC: only Публичный_*, never Скрытый_*
    assert.deepEqual(
      readSkillObj.relatedTerms.map((term) => term.name),
      [`Публичный_${suffix}`],
    );

    // Hidden / exposeToMcp=false / draft skills return found=false identically
    for (const hiddenSlug of [
      assistantOnlySkill.slug,
      draftSkill.slug,
      deniedSkill.slug,
      "nonexistent_skill",
    ]) {
      const res = await external.tool("read_skill", { slug: hiddenSlug });
      assert.deepEqual(res, { found: false, skill: null });
    }

    // describe_collection on external MCP includes mcpPostsSkill, NOT assistantOnlySkill
    const mcpDescribed = await external.tool("describe_collection", {
      collection: names.posts,
    });
    const mcpDescribedSlugs = (mcpDescribed.skills as { slug: string }[]).map(
      (s) => s.slug,
    );
    assert.deepEqual(mcpDescribedSlugs, [mcpPostsSkill.slug]);

    // MCP Resources: resources/list, resources/templates/list, resources/read
    const resources = await external.client.listResources();
    const resourceUris = resources.resources.map((r) => r.uri);
    assert.ok(resourceUris.includes("skill://index"));
    assert.ok(resourceUris.includes(`skill://${mcpPostsSkill.slug}`));
    assert.ok(resourceUris.includes(`skill://${globalSkill.slug}`));
    assert.ok(!resourceUris.includes(`skill://${assistantOnlySkill.slug}`));
    assert.ok(!resourceUris.includes(`skill://${draftSkill.slug}`));
    assert.ok(!resourceUris.includes(`skill://${deniedSkill.slug}`));

    const templates = await external.client.listResourceTemplates();
    assert.ok(
      templates.resourceTemplates.some(
        (tpl) => tpl.uriTemplate === "skill://{slug}",
      ),
    );

    const indexResource = await external.client.readResource({
      uri: "skill://index",
    });
    const indexText =
      "text" in indexResource.contents[0] ? indexResource.contents[0].text : "";
    assert.ok(indexText.includes(mcpPostsSkill.slug));
    assert.ok(!indexText.includes(assistantOnlySkill.slug));

    const skillResource = await external.client.readResource({
      uri: `skill://${mcpPostsSkill.slug}`,
    });
    const skillMd =
      "text" in skillResource.contents[0] ? skillResource.contents[0].text : "";
    assert.match(skillMd, /^---\n/);
    assert.ok(skillMd.includes(mcpPostsSkill.slug));
    assert.ok(skillMd.includes(`Публичный_${suffix}`));
    assert.ok(!skillMd.includes(`Скрытый_${suffix}`));

    for (const hiddenSlug of [
      assistantOnlySkill.slug,
      draftSkill.slug,
      deniedSkill.slug,
      "missing-slug",
    ]) {
      await assert.rejects(
        external.client.readResource({ uri: `skill://${hiddenSlug}` }),
        (error: { code?: number }) => error.code === -32002,
      );
    }

    // MCP Prompts: prompts/list, prompts/get
    const prompts = await external.client.listPrompts();
    const promptNames = prompts.prompts.map((p) => p.name);
    assert.ok(promptNames.includes(`skill:${mcpPostsSkill.slug}`));
    assert.ok(promptNames.includes(`skill:${globalSkill.slug}`));
    assert.ok(!promptNames.includes(`skill:${assistantOnlySkill.slug}`));
    assert.ok(!promptNames.includes(`skill:${draftSkill.slug}`));

    const promptRes = await external.client.getPrompt({
      name: `skill:${mcpPostsSkill.slug}`,
      arguments: { input: "Только за сегодня" },
    });
    assert.equal(promptRes.messages.length, 2);
    assert.ok(
      promptRes.messages[0]?.content.type === "text" &&
        promptRes.messages[0].content.text.includes(mcpPostsSkill.slug),
    );
    assert.equal(
      promptRes.messages[1]?.content.type === "text"
        ? promptRes.messages[1].content.text
        : "",
      "Только за сегодня",
    );

    await assert.rejects(
      external.client.getPrompt({ name: `skill:${assistantOnlySkill.slug}` }),
      (error: { code?: number }) => error.code === -32602,
    );

    // --- B. Assistant context tools (channel: "assistant") ---
    const peopleTableContext = {
      page: "items" as const,
      workspaceId: null,
      collection: names.people,
      table: {
        page: 1,
        size: 25,
        sort: "code",
        direction: "asc" as const,
        q: "",
        filter: "",
        selectedCount: 0,
        editorOpen: false,
      },
    };
    const assistantTools = (await createContextTools(
      db,
      access,
      peopleTableContext,
      reload,
    ))!;
    try {
      // availableSkills is attached to tools.context and includes assistantOnlySkill!
      const ctx = assistantTools.context as {
        availableSkills?: { slug: string }[];
      };
      const availableSlugs = (ctx.availableSkills ?? []).map((s) => s.slug);
      assert.ok(availableSlugs.includes(globalSkill.slug));
      // Note: peopleTableContext filters availableSkills to people + global, so globalSkill is present,
      // while list_skills({ collection: null }) MUST NOT be forced to names.people and MUST return posts skills too!
      const allViaTool = (await assistantTools.execute("list_skills", {
        collection: null,
        workspace: null,
        q: suffix,
      })) as { skills: { slug: string }[] };
      const allToolSlugs = allViaTool.skills.map((s) => s.slug);
      assert.ok(allToolSlugs.includes(mcpPostsSkill.slug));
      assert.ok(allToolSlugs.includes(assistantOnlySkill.slug)); // visible on assistant channel!
      assert.ok(allToolSlugs.includes(globalSkill.slug));
      assert.ok(!allToolSlugs.includes(draftSkill.slug));
      assert.ok(!allToolSlugs.includes(deniedSkill.slug));

      // describe_collection on assistant channel includes BOTH mcpPostsSkill and assistantOnlySkill
      const assistantDescribed = (await assistantTools.execute(
        "describe_collection",
        { collection: names.posts },
      )) as { skills: { slug: string }[] };
      const assistantDescribedSlugs = assistantDescribed.skills
        .map((s) => s.slug)
        .sort();
      assert.deepEqual(
        assistantDescribedSlugs,
        [assistantOnlySkill.slug, mcpPostsSkill.slug].sort(),
      );

      // read_skill on assistant channel can read exposeToMcp=false skill!
      const readInternal = (await assistantTools.execute("read_skill", {
        slug: assistantOnlySkill.slug,
      })) as {
        found: boolean;
        skill: { slug: string; instructions: string } | null;
      };
      assert.equal(readInternal.found, true);
      assert.equal(readInternal.skill?.slug, assistantOnlySkill.slug);
    } finally {
      await assistantTools.close?.();
    }

    // --- C. Deterministic skillSlug turn-1 preload + rejection via POST /assistant/messages ---
    const okTurn = await app.inject({
      method: "POST",
      url: "/assistant/messages",
      headers,
      payload: {
        messages: [{ role: "user", content: "Сделай внутреннюю сводку" }],
        context: { page: "home", workspaceId: null },
        skillSlug: assistantOnlySkill.slug,
      },
    });
    assert.equal(okTurn.statusCode, 200, okTurn.body);
    assert.equal(lastTurnToolCalls, 0);
    const activeSkill = lastTurnContext?.activeSkill as
      | { slug: string; instructions: string; relatedTerms: { name: string }[] }
      | undefined;
    assert.ok(activeSkill);
    assert.equal(activeSkill.slug, assistantOnlySkill.slug);
    assert.match(activeSkill.instructions, /Секретная внутренняя инструкция/);
    assert.deepEqual(
      activeSkill.relatedTerms.map((term) => term.name),
      [`Публичный_${suffix}`],
    );

    // Draft, hidden/denied, or missing skillSlug is rejected with 404 skill_unavailable
    for (const unavailableSlug of [
      draftSkill.slug,
      deniedSkill.slug,
      "missing_skill_slug",
    ]) {
      const failedTurn = await app.inject({
        method: "POST",
        url: "/assistant/messages",
        headers,
        payload: {
          messages: [{ role: "user", content: "Попробуй скрытое умение" }],
          context: { page: "home", workspaceId: null },
          skillSlug: unavailableSlug,
        },
      });
      assert.equal(failedTurn.statusCode, 404, failedTurn.body);
      assert.equal(failedTurn.json().code, "skill_unavailable");
    }

    // --- D. requestHash in beginSavedTurn includes skillSlug ---
    const convRes = await app.inject({
      method: "POST",
      url: "/assistant/conversations",
      headers,
      payload: {},
    });
    assert.equal(convRes.statusCode, 201, convRes.body);
    const conversationId = convRes.json().data.id as string;
    conversationIds.push(conversationId);

    const messageId = randomUUID();
    const baseSubmission = {
      conversationId,
      messageId,
      content: "Проверь публикации",
      context: null,
      settings: undefined,
    };
    const started = await beginSavedTurn(db, userId, {
      ...baseSubmission,
      skillSlug: mcpPostsSkill.slug,
    });
    await finishSavedTurn(db, userId, started, {
      content: "Готово",
      status: "completed",
      summary: {
        turnId: randomUUID(),
        model: "test-model",
        status: "succeeded",
        modelCalls: 1,
        toolCalls: 0,
        durationMs: 10,
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      },
      truncated: false,
    });

    // Same messageId + same skillSlug -> returns cached answer
    const replayed = await beginSavedTurn(db, userId, {
      ...baseSubmission,
      skillSlug: mcpPostsSkill.slug,
    });
    assert.ok(replayed.cached);
    assert.equal(replayed.cached.content, "Готово");

    // Same messageId + DIFFERENT skillSlug -> 409 assistant_message_conflict!
    await assert.rejects(
      beginSavedTurn(db, userId, {
        ...baseSubmission,
        skillSlug: globalSkill.slug,
      }),
      { code: "assistant_message_conflict" },
    );

    // Same messageId + OMITTED skillSlug -> 409 assistant_message_conflict!
    await assert.rejects(beginSavedTurn(db, userId, baseSubmission), {
      code: "assistant_message_conflict",
    });
  } finally {
    if (conversationIds.length) {
      await db("public.asmblyr_assistant_conversations")
        .whereIn("id", conversationIds)
        .delete();
    }
    if (skillIds.length) {
      await db("public.asmblyr_assistant_skills")
        .whereIn("id", skillIds)
        .delete();
    }
    if (termIds.length) {
      await db("public.asmblyr_collection_terms")
        .whereIn("term_id", termIds)
        .delete();
      await db("public.asmblyr_terms").whereIn("id", termIds).delete();
    }
  }
});
