import { richTextSanitizerOptions } from "@asmblyr/contracts";
import Markdown from "react-markdown";
import sanitizeHtml from "sanitize-html";
import type { CollectionField, ItemValue } from "./types";
import { displayValue } from "./item-display";
import { PresentedValue } from "./presented-value";
import { PluginFieldDisplay } from "@/components/plugins/field-display";

export function safeContentHtml(value: string) {
  return sanitizeHtml(value, richTextSanitizerOptions);
}
export function safeContentUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !/\s/.test(value)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
export const contentClass =
  "break-words text-sm leading-relaxed [&_p]:my-2 [&_h2]:my-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:my-3 [&_h3]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 [&_a]:text-primary [&_a]:underline [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3";

export function ContentValue({
  field,
  value,
}: {
  field: Pick<CollectionField, "type" | "presentation">;
  value: ItemValue;
}) {
  const text = displayValue(value, field.type);
  if (field.presentation?.extension) {
    return (
      <PluginFieldDisplay
        extension={field.presentation.extension}
        type={field.type}
        value={value}
        fallback={
          <p className="whitespace-pre-wrap break-words text-sm">{text}</p>
        }
      />
    );
  }
  if (field.presentation?.display)
    return (
      <PresentedValue
        value={value}
        display={field.presentation.display}
      />
    );
  const repeater =
    field.presentation?.interface === "repeater"
      ? field.presentation.repeater
      : undefined;
  if (
    repeater &&
    Array.isArray(value) &&
    value.every((v) => v && typeof v === "object" && !Array.isArray(v))
  )
    return (
      <div className="space-y-3">
        {!value.length && (
          <p className="text-sm text-muted-foreground">Нет элементов</p>
        )}
        {value.map((row, index) => (
          <dl
            key={index}
            className="space-y-3 rounded-xl border p-4"
          >
            <div className="text-xs text-muted-foreground">
              Элемент {index + 1}
            </div>
            {repeater.fields.map((child) => (
              <div key={child.name}>
                <dt className="text-xs text-muted-foreground">
                  {child.label || child.name}
                </dt>
                <dd>
                  <ContentValue
                    field={{
                      type: child.type,
                      presentation: {
                        ...field.presentation!,
                        interface: child.interface,
                        repeater: undefined,
                        display: undefined,
                        options: child.options,
                      },
                    }}
                    value={(row as Record<string, ItemValue>)[child.name]}
                  />
                </dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
    );
  if (field.presentation?.options) {
    const options = field.presentation.options;
    return (
      <p className="text-sm">
        {Array.isArray(value)
          ? value
              .map(
                (v) => options.find((o) => o.value === v)?.label ?? String(v),
              )
              .join(", ")
          : (options.find((o) => o.value === value)?.label ?? text)}
      </p>
    );
  }
  if (typeof value !== "string")
    return <p className="whitespace-pre-wrap break-words text-sm">{text}</p>;
  if (field.presentation?.interface === "markdown")
    return (
      <div className={contentClass}>
        <Markdown
          skipHtml
          components={{
            a: ({ children, href }) => (
              <a
                href={href && safeContentUrl(href)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ),
          }}
        >
          {value}
        </Markdown>
      </div>
    );
  if (field.presentation?.interface === "richtext")
    return (
      <div
        className={contentClass}
        dangerouslySetInnerHTML={{ __html: safeContentHtml(value) }}
      />
    );
  if (field.presentation?.interface === "url" && safeContentUrl(value))
    return (
      <a
        className="break-all text-sm text-primary underline"
        href={value}
        target="_blank"
        rel="noopener noreferrer"
      >
        {value}
      </a>
    );
  return <p className="whitespace-pre-wrap break-words text-sm">{text}</p>;
}
