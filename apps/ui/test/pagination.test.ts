import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TranslationProvider } from "@asmblyr-collaborative/kit/ui/i18n";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../src/components/ui/pagination";
import {
  ItemPagination,
  visiblePages,
} from "../src/components/items/item-pagination";
import { resolveCanonicalTableHref } from "../src/components/items/use-table-query-preferences";
import { filesPageHref } from "../src/components/files/types";

function slots(values: (number | null)[]): (bigint | null)[] {
  return values.map((value) => (value === null ? null : BigInt(value)));
}

test("visiblePages renders all pages up to 7 and keeps a fixed 7-slot window above 7", () => {
  assert.deepEqual(visiblePages(BigInt(1), BigInt(1)), slots([1]));
  assert.deepEqual(
    visiblePages(BigInt(3), BigInt(7)),
    slots([1, 2, 3, 4, 5, 6, 7]),
  );

  assert.deepEqual(
    visiblePages(BigInt(1), BigInt(8)),
    slots([1, 2, 3, 4, 5, null, 8]),
  );
  assert.deepEqual(
    visiblePages(BigInt(4), BigInt(8)),
    slots([1, 2, 3, 4, 5, null, 8]),
  );
  assert.deepEqual(
    visiblePages(BigInt(5), BigInt(8)),
    slots([1, null, 4, 5, 6, 7, 8]),
  );
  assert.deepEqual(
    visiblePages(BigInt(8), BigInt(8)),
    slots([1, null, 4, 5, 6, 7, 8]),
  );

  assert.deepEqual(
    visiblePages(BigInt(5), BigInt(9)),
    slots([1, null, 4, 5, 6, null, 9]),
  );
  assert.deepEqual(
    visiblePages(BigInt(500), BigInt(100000)),
    slots([1, null, 499, 500, 501, null, 100000]),
  );

  assert.deepEqual(
    visiblePages(BigInt(0), BigInt(20)),
    slots([1, 2, 3, 4, 5, null, 20]),
  );
  assert.deepEqual(
    visiblePages(BigInt(99), BigInt(20)),
    slots([1, null, 16, 17, 18, 19, 20]),
  );

  for (const page of [1, 2, 4, 5, 10, 16, 17, 20]) {
    const current = BigInt(page);
    const windowSlots = visiblePages(current, BigInt(20));
    assert.equal(windowSlots.length, 7);
    assert.equal(windowSlots[0], BigInt(1));
    assert.equal(windowSlots.at(-1), BigInt(20));
    assert.ok(windowSlots.includes(current));

    for (let index = 0; index < windowSlots.length; index += 1) {
      if (windowSlots[index] === null) {
        const left = windowSlots[index - 1];
        const right = windowSlots[index + 1];
        assert.ok(left !== null && right !== null);
        assert.ok(
          right - left >= BigInt(3),
          "Ellipsis must replace at least 2 hidden pages",
        );
      }
    }
  }
});

test("PaginationLink and ItemPagination avoid inner scrollbars, active shift, and fixed-width overflow", () => {
  const markup = renderToStaticMarkup(
    createElement(
      TranslationProvider,
      { locale: "ru" },
      createElement(ItemPagination, {
        page: {
          number: 10000,
          size: 10,
          total: "100000",
          sort: "created_at",
          direction: "desc",
        },
        pathname: "/items/tasks",
        q: "",
        filter: "",
        onPage: () => {},
        onSize: () => {},
      }),
    ),
  );

  assert.doesNotMatch(markup, /overflow-x-auto/);
  assert.doesNotMatch(markup, /overflow-y-auto/);
  assert.match(markup, /flex-wrap/);
  assert.match(markup, /shrink-0/);
  assert.match(markup, /size-auto/);
  assert.match(markup, /min-w-8/);
  assert.match(markup, /tabular-nums/);
  assert.match(markup, /draggable="false"/);

  const activeLinkMatch = markup.match(
    /<a[^>]*aria-current="page"[^>]*class="([^"]*)"/,
  );
  assert.ok(activeLinkMatch);
  const activeClasses = activeLinkMatch[1]!.split(/\s+/);
  assert.ok(
    !activeClasses.includes("size-8"),
    "size-8 must be stripped so multi-digit numbers do not overflow fixed 32px width",
  );
  assert.ok(
    !activeClasses.includes("active:not-aria-[haspopup]:translate-y-px"),
    "active 1px vertical translation must be stripped so top-edge clicks never miss and scrollHeight never grows",
  );
  assert.ok(activeClasses.includes("active:not-aria-[haspopup]:translate-y-0"));
});

test("PaginationLink supports explicit icon-sm sizing when requested", () => {
  const markup = renderToStaticMarkup(
    createElement(
      TranslationProvider,
      { locale: "ru" },
      createElement(
        Pagination,
        null,
        createElement(
          PaginationContent,
          null,
          createElement(
            PaginationItem,
            null,
            createElement(PaginationPrevious, { href: "/items/tasks?page=99" }),
          ),
          createElement(
            PaginationItem,
            null,
            createElement(
              PaginationLink,
              {
                href: "/items/tasks?page=100",
                isActive: true,
                size: "icon-sm",
              },
              "100",
            ),
          ),
          createElement(
            PaginationItem,
            null,
            createElement(PaginationNext, { href: "/items/tasks?page=101" }),
          ),
        ),
      ),
    ),
  );

  assert.match(markup, /min-w-7/);
  assert.doesNotMatch(markup, /\bsize-7\b/);
});

test("filesPageHref and resolveCanonicalTableHref preserve clean query contracts", () => {
  assert.equal(filesPageHref(BigInt(2), 25, ""), "/files?page=2&limit=25");
  assert.equal(
    filesPageHref(3, 50, "договор"),
    "/files?page=3&limit=50&q=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80",
  );

  assert.equal(
    resolveCanonicalTableHref(
      "/items/requests",
      "?workspace=ws-1",
      "#top",
      "limit=50&sort=title&direction=asc",
    ),
    "/items/requests?limit=50&sort=title&direction=asc&workspace=ws-1#top",
  );
  assert.equal(
    resolveCanonicalTableHref(
      "/items/requests",
      "?page=2&workspace=ws-1",
      "",
      "limit=50&sort=title&direction=asc",
    ),
    null,
  );
  assert.equal(
    resolveCanonicalTableHref("/items/requests", "", "", null),
    null,
  );
});
