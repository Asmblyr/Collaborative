import { readFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./route-inventory.mjs";

export const guides = {
  "sdk-guide": "packages/sdk/README.md",
  "cli-guide": "packages/cli/README.md",
  "kit-guide": "packages/kit/README.md",
  "kit-hooks": "packages/kit/HOOKS.md",
  "kit-fields": "packages/kit/FIELDS.md",
  "kit-lifecycle": "packages/kit/LIFECYCLE.md",
  "kit-capabilities": "packages/kit/CAPABILITIES.md",
  "kit-ui": "packages/kit/UI.md",
  "plugin-color": "examples/plugins/color/README.md",
};

export function guideLinks(content, source, locale) {
  const prefix = locale === "ru" ? "docs/ru" : "docs";
  return content.replace(
    /(\[[^\]\n]+\]\()([^\s)]+)(\))/g,
    (all, start, href, end) => {
      if (/^(?:[a-z]+:|\/|#)/i.test(href)) return all;
      const [address, fragment] = href.split("#");
      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(source), address),
      );
      const canonical = resolved
        .replace("/ru/", "/")
        .replace(/\.ru\.md$/, ".md");
      const guide = Object.entries(guides).find(
        ([, file]) => file === canonical,
      );
      let target;
      if (guide) target = prefix + "/reference/" + guide[0] + ".md";
      else if (canonical.startsWith("docs/"))
        target = prefix + canonical.slice(4);
      else
        return (
          start +
          "https://github.com/Asmblyr/Collaborative/blob/main/" +
          resolved +
          (fragment ? "#" + fragment : "") +
          end
        );
      const relative = path.posix.relative(prefix + "/reference", target);
      return start + relative + (fragment ? "#" + fragment : "") + end;
    },
  );
}

export async function generateGuides(output) {
  for (const locale of ["en", "ru"]) {
    for (const [name, original] of Object.entries(guides)) {
      const source =
        locale === "ru" ? original.replace(/\.md$/, ".ru.md") : original;
      const raw = await readFile(path.join(root, source), "utf8");
      const content = guideLinks(
        raw
          .replaceAll("\r\n", "\n")
          .replace(/<!-- languages -->[\s\S]*?<!-- \/languages -->\n*/g, ""),
        source,
        locale,
      );
      await output(
        "docs/" + (locale === "ru" ? "ru/" : "") + "reference/" + name + ".md",
        "<!-- Generated from " +
          source +
          "; edit the source. -->\n\n" +
          content.trimEnd() +
          "\n",
      );
    }
  }
}
