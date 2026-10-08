import { createClient } from "@asmblyr-collaborative/sdk";

/** Same-origin requests use HttpOnly session cookies handled by Core. */
export const asmblyr = createClient({ baseUrl: "/api" });
