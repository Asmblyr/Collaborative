import { createClient } from "@asmblyr/sdk";

/** Same-origin requests use the UI's HttpOnly session cookies and refresh proxy. */
export const asmblyr = createClient({ baseUrl: "/api" });
