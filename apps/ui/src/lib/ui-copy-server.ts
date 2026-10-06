import { cookies } from "next/headers";
import { translateCopy } from "@asmblyr-collaborative/contracts/translations";

/** Read per-request locale; never use mutable global state during SSR. */
export async function getUiCopy() {
  const jar = await cookies();
  const locale = jar.get("asmblyr-locale")?.value === "en" ? "en" : "ru";
  return Object.assign(
    (source: string, values?: Record<string, unknown>) =>
      translateCopy(source, locale, values),
    { locale },
  );
}
