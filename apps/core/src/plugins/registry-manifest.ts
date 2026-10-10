import { z } from "@asmblyr-collaborative/kit/actions";
import semver from "semver";

const packageName = z
  .string()
  .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/);
const versionRange = z
  .string()
  .max(120)
  .refine(
    (value) => semver.validRange(value) !== null,
    "Invalid semantic version range",
  );
const dependencies = z
  .record(packageName, versionRange)
  .refine(
    (value) => Object.keys(value).length <= 40,
    "Too many plugin dependencies",
  );

const manifestSchema = z.strictObject({
  version: z.literal(1),
  namespace: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,30}$/)
    .optional(),
  capabilities: z.array(z.string()).max(40).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  publisher: z
    .strictObject({
      id: z.string().trim().min(1).max(120),
      name: z.string().trim().min(1).max(120),
    })
    .optional(),
  compatibility: z
    .strictObject({
      collaborative: versionRange,
      node: versionRange.optional(),
    })
    .optional(),
  dependencies: dependencies.optional(),
  optionalDependencies: dependencies.optional(),
});

const packageSchema = z.object({
  name: packageName,
  version: z.string().optional(),
  description: z.string().max(2000).optional(),
  asmblyr: z.object({ manifest: manifestSchema }),
});

export type RegistryManifest = z.infer<typeof manifestSchema>;

export interface RegistryPackage {
  name: string;
  version: string;
  description: string | null;
  manifest: RegistryManifest;
  approvalIssue?: string;
  validationIssue?: string;
}

/** Parse metadata before any plugin module is imported. Versionless v1 fixtures remain compatible. */
export function parseRegistryPackage(
  value: unknown,
  expectedName: string,
): RegistryPackage {
  const parsed = packageSchema.parse(value);
  if (parsed.name !== expectedName) {
    throw new Error(`Plugin ${expectedName}: package name mismatch`);
  }
  const version = parsed.version ?? "0.0.0";
  if (!semver.valid(version)) {
    throw new Error(`Plugin ${expectedName}: invalid semantic version`);
  }
  if (
    parsed.asmblyr.manifest.dependencies?.[expectedName] ||
    parsed.asmblyr.manifest.optionalDependencies?.[expectedName]
  ) {
    throw new Error(`Plugin ${expectedName}: cannot depend on itself`);
  }
  return {
    name: parsed.name,
    version,
    description: parsed.description ?? null,
    manifest: parsed.asmblyr.manifest,
  };
}
