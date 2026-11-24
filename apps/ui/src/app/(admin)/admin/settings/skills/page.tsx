import type {
  AssistantSkillAdminListResult,
  AssistantSkillCollectionRef,
  AssistantSkillPolicyRef,
} from "@asmblyr-collaborative/contracts";
import { SkillsWorkspace } from "@/components/skills/skills-workspace";
import { loadCollections } from "@/lib/collections";
import { readJsonResponse } from "@/lib/http-request";
import { coreAddress } from "@/lib/session";
import { requireSettingsSection } from "@/lib/settings-access";
import { getUiCopy } from "@/lib/ui-copy-server";

interface PolicyOptionsResponse {
  data: AssistantSkillPolicyRef[];
  delegatablePolicyIds: string[] | null;
}

async function fetchCoreJson<T>(token: string, path: string): Promise<T> {
  const response = await fetch(coreAddress(path), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  return readJsonResponse<T>(response);
}

export default async function SkillsSettingsPage() {
  const copy = await getUiCopy();
  const { token, readOnly } = await requireSettingsSection("skills");

  let skillsResult: AssistantSkillAdminListResult;
  let policiesResult: PolicyOptionsResponse;
  let collections: AssistantSkillCollectionRef[];

  try {
    const [skills, policies, collectionsResult] = await Promise.all([
      fetchCoreJson<AssistantSkillAdminListResult>(token, "/settings/skills"),
      fetchCoreJson<PolicyOptionsResponse>(token, "/settings/options/policies"),
      loadCollections(token),
    ]);
    skillsResult = skills;
    policiesResult = policies;
    collections = collectionsResult.data
      .filter(
        (collection) =>
          !collection.system &&
          !collection.name.startsWith("asmblyr_") &&
          Boolean(collection.access.read),
      )
      .map((collection) => ({
        name: collection.name,
        displayName: collection.displayName ?? collection.name,
        mcpEnabled: Boolean(collection.mcp?.enabled),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));
  } catch {
    return (
      <p
        role="alert"
        className="text-sm text-destructive"
      >
        {copy("Не удалось загрузить умения ассистента. Обновите страницу.")}
      </p>
    );
  }

  return (
    <SkillsWorkspace
      readOnly={readOnly}
      initialSkills={skillsResult.data}
      meta={skillsResult.meta}
      policies={policiesResult.data}
      collections={collections}
    />
  );
}
