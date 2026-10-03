"use client";

import { useLayoutEffect, useRef } from "react";
import { useMessageScroller } from "@/components/ui/message-scroller";

/** A sent message resumes following; incoming tokens respect manual scrolling. */
export function AssistantScrollOnSend({
  messageId,
}: {
  messageId: string | undefined;
}) {
  const { scrollToEnd } = useMessageScroller();
  const previousMessageId = useRef(messageId);

  useLayoutEffect(() => {
    const previous = previousMessageId.current;
    previousMessageId.current = messageId;

    if (messageId && messageId !== previous) {
      scrollToEnd({ behavior: "auto" });
    }
  }, [messageId, scrollToEnd]);

  return null;
}
