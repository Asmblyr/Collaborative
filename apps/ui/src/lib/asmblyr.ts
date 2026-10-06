import { createClient } from "@asmblyr-collaborative/sdk";

/** Same-origin requests use the UI's HttpOnly session cookies and refresh proxy. */
export const asmblyr = createClient({ baseUrl: "/api" });
