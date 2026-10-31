import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TranslationProvider } from "@asmblyr-collaborative/kit/ui/i18n";
import { Label } from "@asmblyr-collaborative/kit/ui/label";
import { Badge } from "@asmblyr-collaborative/kit/ui/badge";
import { Switch } from "@asmblyr-collaborative/kit/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@asmblyr-collaborative/kit/ui/card";
import { Toaster, dismissToast, showToast } from "../src/components/ui/toast";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  computeScrollerMetrics,
} from "../src/components/ui/message-scroller";

test("showToast coalesces duplicate active notifications and renders overflow-visible manual popover", (t) => {
  const createdIds = new Set<string>();
  t.after(() => {
    for (const id of createdIds) {
      dismissToast(id);
    }
  });

  const firstId = showToast("Сохранено", "success", 0);
  const secondId = showToast("Сохранено", "success", 0);
  const thirdId = showToast("  Сохранено  ", "success", 0);
  createdIds.add(firstId);

  assert.equal(secondId, firstId, "Repeated identical toast must coalesce");
  assert.equal(
    thirdId,
    firstId,
    "Whitespace-trimmed identical toast must coalesce",
  );

  const errorId = showToast("Ошибка сохранения", "error", 0);
  createdIds.add(errorId);
  assert.notEqual(errorId, firstId);

  const markup = renderToStaticMarkup(createElement(Toaster));
  assert.match(markup, /popover="manual"/);
  assert.match(markup, /overflow-visible/);
  assert.equal(
    [...markup.matchAll(/Сохранено/g)].length,
    1,
    "Only one Saved toast entry should render",
  );
  assert.match(markup, /role="alert"/);
  assert.match(markup, /aria-live="assertive"/);

  dismissToast(firstId);
  dismissToast(errorId);
  const emptyMarkup = renderToStaticMarkup(createElement(Toaster));
  assert.match(emptyMarkup, /class="hidden"/);
});

test("MessageScroller computes stick-to-bottom metrics and localizes jump controls", () => {
  assert.deepEqual(computeScrollerMetrics(0, 300, 300), {
    isScrollable: false,
    isAtStart: true,
    isAtEnd: true,
  });
  assert.deepEqual(computeScrollerMetrics(0, 900, 300), {
    isScrollable: true,
    isAtStart: true,
    isAtEnd: false,
  });
  assert.deepEqual(computeScrollerMetrics(300, 900, 300), {
    isScrollable: true,
    isAtStart: false,
    isAtEnd: false,
  });
  assert.deepEqual(computeScrollerMetrics(570, 900, 300), {
    isScrollable: true,
    isAtStart: false,
    isAtEnd: true,
  });

  const markup = renderToStaticMarkup(
    createElement(
      TranslationProvider,
      { locale: "en" },
      createElement(
        MessageScrollerProvider,
        { autoScroll: true },
        createElement(
          MessageScroller,
          null,
          createElement(
            MessageScrollerViewport,
            null,
            createElement(
              MessageScrollerContent,
              null,
              createElement(
                MessageScrollerItem,
                { messageId: "msg-1", scrollAnchor: true },
                "Hello",
              ),
            ),
          ),
          createElement(MessageScrollerButton, { direction: "end" }),
        ),
      ),
    ),
  );
  assert.match(markup, /data-slot="message-scroller"/);
  assert.match(markup, /data-message-id="msg-1"/);
  assert.match(markup, /data-active="false"/);
  assert.match(markup, /Go to latest message/);
});

test("Kit-promoted primitives render accessible attributes and slot hooks", () => {
  const markup = renderToStaticMarkup(
    createElement(
      Card,
      { size: "sm" },
      createElement(
        CardHeader,
        null,
        createElement(CardTitle, null, "Workspace"),
        createElement(CardDescription, null, "Shared settings"),
      ),
      createElement(
        CardContent,
        null,
        createElement(Label, { htmlFor: "active-switch" }, "Active"),
        createElement(Switch, {
          id: "active-switch",
          checked: true,
          "aria-label": "Active",
        }),
        createElement(Badge, { variant: "outline" }, "Ready"),
      ),
      createElement(CardFooter, null, "Updated"),
    ),
  );

  assert.match(markup, /data-slot="card"/);
  assert.match(markup, /data-size="sm"/);
  assert.match(markup, /data-slot="label"/);
  assert.match(markup, /role="switch"/);
  assert.match(markup, /aria-checked="true"/);
  assert.match(markup, /data-slot="badge"/);
  assert.match(markup, /data-variant="outline"/);
});
