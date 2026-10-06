// Kept dependency-free so the API and browser use exactly the same HTML policy.
export { settingsSections } from "./settings-access.js";
export {
  columnWidthLimits,
  isColumnWidth,
  reconcileColumnWidths,
} from "./table-columns.js";
export { parseTags, tagLimits, TagValueError } from "./tags.js";
export { presencePages } from "./presence.js";
export { parseCalendarDate, parseBigintString } from "./scalar-values.js";
export {
  fieldConditionMatches,
  relationFilterDependencies,
  resolveRelationChoiceFilter,
} from "./field-rules.js";

export const richTextSanitizerOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "s",
    "code",
    "pre",
    "blockquote",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "a",
    "hr",
  ],
  allowedAttributes: { a: ["href", "title"] },
  allowedSchemes: ["http", "https"],
  allowProtocolRelative: false,
};

export function defaultCollectionState() {
  return {
    field: "status",
    defaultValue: "published",
    statuses: [
      {
        value: "published",
        label: "Опубликовано",
        color: "green",
        hidden: false,
      },
      { value: "draft", label: "Черновик", color: "gray", hidden: true },
      {
        value: "archived",
        label: "Архивировано",
        color: "amber",
        hidden: true,
      },
    ],
  };
}
export { permissionContextParameters } from "./permission-filter.js";

export {
  uiLocales,
  themeStyles,
  resolveLocalizedText,
} from "./localization.js";
export {
  monitoringBrowserRoute,
  sanitizeMonitoringEvent,
} from "./monitoring.js";
