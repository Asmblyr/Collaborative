import type { NextConfig } from "next";
import { generateUiRegistry } from "@asmblyr-collaborative/kit/node";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  distDir: process.env.ASMBLYR_VISUAL_TEST === "1" ? ".next-visual" : ".next",
  async redirects() {
    return [
      {
        source: "/system-settings/:path*",
        destination: "/admin/settings/:path*",
        permanent: true,
      },
    ];
  },
  // Authorization codes must not enter the development access log.
  logging: {
    incomingRequests: {
      ignore: [
        /^\/sign\/sso\/[a-z0-9_]+\/callback(?:\?|$)/,
        /^\/connections\/google\/callback(?:\?|$)/,
        /^\/oauth\//,
      ],
    },
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
