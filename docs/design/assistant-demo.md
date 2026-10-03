# Floating assistant, discussion and notifications: UI demo

> Update: the Assistant tab now uses the optional Core AI integration described
> in [assistant-core.md](assistant-core.md). Canned replies, demo cards inside AI
> chat and the artificial six-second delay were removed. Discussion and
> notifications are still local demos. The sections below record the original
> mock iteration and its visual verification.

The administration shell includes a floating launcher at the bottom right,
16px above the safe-area boundary. The nonmodal popover stays open while using
the page. It closes through the launcher, close button or Escape. The table
footer reserves room so pagination is not obscured.

## Current behavior

- **Ассистент**: text conversation, starter prompts, delayed canned replies,
  typing indicator, example event card and a new-conversation action. The mock
  response takes six seconds so the pending animation can be inspected.
- **Обсуждение**: a separate comment feed with author and time, topic selector
  and its own composer. The general topic and each demo event keep independent
  comments and drafts. Posting here never invokes AI. The empty state introduces
  future team discussion; the footer makes the current local-only scope explicit.
- **Уведомления**: two clearly labelled demo events, unread count, mark-read
  actions and an option to open that event's discussion. The AI example card
  opens the same publication discussion through “Оставить комментарий”.
- Enter sends; Shift+Enter inserts a newline; IME composition does not submit.
  Empty/duplicate pending submissions are rejected and input is bounded to
  4,000 characters. Drafts, messages and read state survive closing the panel
  and client-side navigation in the same authenticated administration layout.
- The launcher is a neutral rounded square with a compact, masked 2px spectrum
  outline while AI is responding. The AI panel retains its soft moving halo,
  inspired by Apple Intelligence. The panel halo is limited to the AI tab;
  the launcher and AI tab indicator show activity while another tab is open.
  These indicators stop after the response; reduced-motion mode is static.
- State is memory-only and resets on reload/logout/user change. Mock requests
  have no network activity; no AI provider, Core route, shared comment or
  notification storage is connected. Timers are cancelled on restart and
  component unmount. Restarting AI leaves discussion state intact.
- The widget is on the regular authenticated admin shell. The existing
  no-access layout and authentication pages retain their separate experience.

## Components and future boundary

Uses official shadcn `Message`, `MessageScroller`, `InputGroup`, `Card`,
`ScrollArea`, `Popover`, `Tabs`, `Button`, `Badge`, `Tooltip`, `Avatar` and `Select`
components.
The scroller uses `@shadcn/react`; no AI SDK was added.

References:

- [Official CardsChat example](https://github.com/shadcn-ui/ui/blob/main/apps/v4/components/cards/chat.tsx)
- [Official SimpleChat example](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/radix/blocks/preview-03/cards/simple-chat.tsx)

Mock data/replies, conversation state, chat UI, notification/card UI and the
floating shell are separate focused modules under `components/assistant`.
Discussion state and rendering also have separate modules. Demo topics are
fixed; real collection/item/workspace context, persistence, participants and
permissions remain future product contracts.
The example event card is a shadcn component, not an Adaptive Cards renderer.
Adaptive Cards integration can follow when real event/action contracts exist;
server actions will still need normal identity and permission checks.

## Verification (2026-09-30)

UI typecheck and lint passed. Browser checks covered sending, delayed responses,
the event card, mark-all-read, panel reopen, draft preservation across navigation,
Shift+Enter, and cancellation on starting a new conversation. Pending state
activates/deactivates the glow. At 390×844 the panel fits without horizontal
overflow; the temporary viewport override was reset. The final tooltip uses
controlled state throughout to avoid Radix controlled/uncontrolled warnings.
No automated tests were added for this reversible UI mock.

Discussion update: UI typecheck/lint and browser console are clean. Verified
comment submission by button/Enter, separate AI/topic drafts, notification and
AI-card routing into the correct thread, Shift+Enter and close/reopen retention.
The AI response and revised launcher outline were verified together. At 390×844
all three tabs fit without overflow; the viewport override was reset afterward.

Discussion (локальный артефакт, не публикуется)
Assistant while responding (локальный артефакт, не публикуется)
