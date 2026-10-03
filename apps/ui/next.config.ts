import type { NextConfig } from "next";
import { generateUiRegistry } from "@asmblyr/kit/node";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  // Authorization codes must not enter the development access log.
  logging: {
    incomingRequests: { ignore: [/^\/sign\/sso\/[a-z0-9_]+\/callback(?:\?|$)/, /^\/oauth\//] },
  },
  async headers() {
    return [
      {
        source: "/oauth/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default async function config(phase: string): Promise<NextConfig> {
  await generateUiRegistry(
    pathToFileURL(path.resolve(process.cwd(), "../../package.json")),
    path.resolve(process.cwd(), "src/generated/plugin-ui.ts"),
    phase === PHASE_DEVELOPMENT_SERVER,
  );
  return nextConfig;
}
