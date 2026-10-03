import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { InvalidCredentialsError } from "../auth/validation.js";

const gitlabKeys = createRemoteJWKSet(new URL("https://gitlab.com/oauth/discovery/keys"), {
  timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 600000,
});

export interface FederationBinding {
  id: string; service_id: string; project_id: string; project_path: string;
  ref: string; audience: string;
}

export async function verifyGitlabAssertion(assertion: string, binding: FederationBinding,
  keys: JWTVerifyGetKey = gitlabKeys) {
  try {
    const { payload: p } = await jwtVerify(assertion, keys, {
      issuer: "https://gitlab.com", audience: binding.audience, algorithms: ["RS256"],
      subject: `project_path:${binding.project_path}:ref_type:branch:ref:${binding.ref}`,
      requiredClaims: ["exp", "iat", "nbf", "jti", "sub"], maxTokenAge: "1h", clockTolerance: 0,
    });
    // Pin both the source and execution project: fork/MR pipelines must not cross this boundary.
    if (p.project_id !== binding.project_id || p.job_project_id !== binding.project_id ||
      p.project_path !== binding.project_path || p.job_project_path !== binding.project_path ||
      p.ref !== binding.ref || p.ref_type !== "branch" || p.ref_protected !== "true" ||
      p.pipeline_source === "merge_request_event" ||
      typeof p.jti !== "string" || p.jti.length < 1 || p.jti.length > 255 ||
      typeof p.exp !== "number" || !Number.isSafeInteger(p.exp) ||
      typeof p.iat !== "number" || p.exp <= p.iat) throw new InvalidCredentialsError();
    return { jti: p.jti, expiresAt: p.exp * 1000 };
  } catch { throw new InvalidCredentialsError(); }
}
