import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { root } from "./route-inventory.mjs";

const catalogs = {};
for (const [name, file] of Object.entries({
  en: "http.en.json",
  types: "typedoc.ru.json",
})) {
  catalogs[name] = JSON.parse(
    await readFile(new URL("./locales/" + file, import.meta.url), "utf8"),
  );
}

const russianHttp = {
  "Public CLI discovery; configured admin consent URL only. No credential.":
    "Публичное обнаружение CLI; только настроенный URL согласия, без credentials.",
  "Active human session approves a 60-second one-use PKCE S256 code for an exact loopback callback.":
    "Активная человеческая сессия подтверждает одноразовый код PKCE S256 на 60 секунд для точного loopback callback.",
  "One-use code + PKCE verifier + exact callback. Issues 10-minute schema:read access only; rate-limited.":
    "Одноразовый код, PKCE verifier и точный callback. Только schema:read на 10 минут; действует лимит запросов.",
};

export function httpText(value, locale) {
  if (locale === "ru") {
    if (russianHttp[value]) return russianHttp[value];
    const prefix = Object.keys(russianHttp).find((text) =>
      value.startsWith(text + ". "),
    );
    return prefix ? russianHttp[prefix] + value.slice(prefix.length) : value;
  }
  if (!/[А-Яа-яЁё]/.test(value)) return value;
  if (catalogs.en[value]) return catalogs.en[value];
  const source = value.match(/^(.*?)\. (Схемы тела.*? )?Источник: (.+)$/s);
  if (source) {
    const [, access, incomplete, file] = source;
    return (
      httpText(access, locale) +
      ". " +
      (incomplete
        ? "Body/response schemas are not yet detailed; see the handler. "
        : "") +
      "Source: " +
      file
    );
  }
  throw new Error("Missing English HTTP translation: " + value);
}

// Translate prose only. Identifiers, schemas, examples, and security values stay intact.
export function localizeSpec(value, locale) {
  if (Array.isArray(value))
    return value.map((item) => localizeSpec(item, locale));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      ["example", "examples", "default", "enum", "const"].includes(key)
        ? item
        : ["description", "summary", "title", "access"].includes(key) &&
            typeof item === "string"
          ? httpText(item, locale)
          : localizeSpec(item, locale),
    ]),
  );
}

const headings = {
  Classes: "Классы",
  Interfaces: "Интерфейсы",
  "Type Aliases": "Псевдонимы типов",
  Functions: "Функции",
  Variables: "Переменные",
  "Type Parameters": "Параметры типов",
  Parameters: "Параметры",
  Returns: "Результат",
  "Type Declaration": "Объявление типа",
  Extends: "Наследует",
  Constructors: "Конструкторы",
  Constructor: "Конструктор",
  Properties: "Свойства",
  Methods: "Методы",
  "Inherited from": "Унаследовано от",
  Overrides: "Переопределяет",
  See: "См. также",
  Deprecated: "Устарело",
  "Call Signature": "Сигнатура вызова",
  "Index Signature": "Индексная сигнатура",
  "Index Signatures": "Индексные сигнатуры",
  Example: "Пример",
};
const kinds = {
  "Type Alias": "Псевдоним типа",
  Function: "Функция",
  Interface: "Интерфейс",
  Class: "Класс",
  Variable: "Переменная",
};
const columns = {
  Name: "Имя",
  Type: "Тип",
  Description: "Описание",
  "Type Parameter": "Параметр типа",
  "Default type": "Тип по умолчанию",
  "Default value": "Значение по умолчанию",
  Parameter: "Параметр",
  Function: "Функция",
  Interface: "Интерфейс",
  Class: "Класс",
  "Type Alias": "Псевдоним типа",
  Variable: "Переменная",
};

export function localizeTypeDoc(content) {
  let fenced = false;
  const anchors = new Map();
  return content
    .split("\n")
    .map((line) => {
      if (line.startsWith("```")) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      if (catalogs.types[line]) return catalogs.types[line];
      const heading = line.match(/^(#+) (.+)$/);
      if (heading) {
        const [, level, title] = heading;
        const base = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        const occurrence = anchors.get(base) ?? 0;
        anchors.set(base, occurrence + 1);
        const id = base + (occurrence ? "-" + occurrence : "");
        const anchor = " {#" + id + "}";
        if (headings[title]) return level + " " + headings[title] + anchor;
        for (const [from, to] of Object.entries(kinds)) {
          if (title.startsWith(from + ": "))
            return level + " " + to + title.slice(from.length) + anchor;
        }
      }
      if (line.startsWith("|")) {
        return line
          .split("|")
          .map((cell) => {
            const text = cell.trim();
            const translation = columns[text] ?? catalogs.types[text];
            if (translation) return " " + translation + " ";
            if (/^[A-Za-z]+\s+[A-Za-z]/.test(text)) {
              throw new Error("Missing Russian TypeDoc translation: " + text);
            }
            return cell;
          })
          .join("|");
      }
      if (/^[A-Za-z]/.test(line) && !line.startsWith("https://")) {
        throw new Error("Missing Russian TypeDoc translation: " + line);
      }
      return line;
    })
    .join("\n");
}

export async function markdownFiles(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if ([".vitepress", "public"].includes(item.name)) continue;
    const target = path.join(directory, item.name);
    if (item.isDirectory()) result.push(...(await markdownFiles(target)));
    else if (item.name.endsWith(".md")) result.push(target);
  }
  return result.sort();
}

export function assertPairs(english, russian) {
  const missing = english.filter((name) => !russian.includes(name));
  const orphaned = russian.filter((name) => !english.includes(name));
  if (missing.length || orphaned.length) {
    throw new Error(
      "Documentation locale coverage: missing RU " +
        missing.join(", ") +
        "; missing EN " +
        orphaned.join(", "),
    );
  }
}

export async function checkPageCoverage() {
  const directory = path.join(root, "docs");
  const files = (await markdownFiles(directory)).map((file) =>
    path.relative(directory, file).replaceAll("\\", "/"),
  );
  assertPairs(
    files.filter((file) => !file.startsWith("ru/")),
    files.filter((file) => file.startsWith("ru/")).map((file) => file.slice(3)),
  );
}
