"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChatBox, ChatList, EVERYONE, useBlockChat, type ChatTarget } from "@/components/event/Chat";
import { Avatar } from "@/components/ui/Avatar";
import { EventIcon } from "@/components/ui/EventIcon";
import { PixelIcon } from "@/components/ui/PixelIcon";
import type { CalendarItem } from "@/lib/calendar/model";
import { useProfiles } from "@/lib/data/profiles";
import { formatRange } from "@/lib/time";

/** Which block's chat box is open, and the block on the calendar it hangs from. */
export interface ChatPopoverRequest {
  item: CalendarItem;
  anchor: HTMLElement;
}

const WIDTH = 360;
const GAP = 4;
const MARGIN = 8;

/**
 * A small chat box that drops down from a block on the calendar (from the
 * chat button that appears on hover, on a computer): the block's messages and
 * a message box, without leaving the calendar. It follows the block when the
 * calendar scrolls, and closes with Esc, the ✕, or a click anywhere else.
 * "Open" opens the block's full window (the editor for your own blocks).
 */
export function ChatPopover({
  request,
  zone,
  onClose,
  onOpen,
}: {
  request: ChatPopoverRequest | null;
  zone: string;
  onClose: () => void;
  onOpen: (item: CalendarItem) => void;
}) {
  if (!request) return null;
  return createPortal(
    <Popover
      // A fresh box (message, recipient) for each block and week.
      key={`${request.item.block.id}:${request.item.occurrence.index}`}
      request={request}
      zone={zone}
      onClose={onClose}
      onOpen={onOpen}
    />,
    document.body,
  );
}

function Popover({
  request,
  zone,
  onClose,
  onOpen,
}: {
  request: ChatPopoverRequest;
  zone: string;
  onClose: () => void;
  onOpen: (item: CalendarItem) => void;
}) {
  const { item, anchor } = request;
  const { block, occurrence } = item;
  const box = useRef<HTMLDivElement>(null);
  const [to, setTo] = useState<ChatTarget>(EVERYONE);
  const chat = useBlockChat(block, occurrence.index);
  const { byId: profiles } = useProfiles();
  const host = chat.people.get(block.owner_id) ?? profiles.get(block.owner_id);

  // Under the block (or above it, if there is no room below), kept on screen.
  // Written straight onto the element, so following a scroll costs no re-render.
  const place = useCallback(() => {
    const element = box.current;
    if (!element) return;
    if (!anchor.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      onClose(); // scrolled out of sight
      return;
    }
    const width = Math.min(WIDTH, window.innerWidth - 2 * MARGIN);
    const height = element.offsetHeight;
    let top = rect.bottom + GAP;
    if (top + height > window.innerHeight - MARGIN) {
      const above = rect.top - GAP - height;
      top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - MARGIN - height);
    }
    const left = Math.min(Math.max(MARGIN, rect.left), window.innerWidth - MARGIN - width);
    element.style.width = `${width}px`;
    element.style.top = `${Math.round(top)}px`;
    element.style.left = `${Math.round(left)}px`;
    element.style.visibility = "visible";
  }, [anchor, onClose]);

  useLayoutEffect(() => {
    place();
    const element = box.current;
    let frame = 0;
    const later = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    };
    // Grows as messages arrive; moves when the calendar scrolls or the window changes size.
    const observer = new ResizeObserver(later);
    if (element) observer.observe(element);
    window.addEventListener("scroll", later, true);
    window.addEventListener("resize", later);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", later, true);
      window.removeEventListener("resize", later);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [place]);

  // Esc, or a click anywhere else, closes it (not while a window such as
  // "Delete this message?" is open over the page).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) onClose();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || box.current?.contains(target) || target.closest("dialog")) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [onClose]);

  const isEvent = block.type === "join";
  const name = item.mine ? "You" : (host?.name?.split(" ")[0] ?? "A friend");
  const title = isEvent ? block.title || "Join me" : item.mine ? "You're free" : `${name} is free`;

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={`Chat: ${title}`}
      className="chat-popover fixed z-[60] flex max-h-[min(70dvh,30rem)] flex-col border-2 border-black bg-panel shadow-[4px_4px_0_0_rgba(0,0,0,0.6)]"
      // Placed by `place` once it has been measured.
      style={{ visibility: "hidden", top: 0, left: 0, width: WIDTH }}
    >
      <div className="flex items-center gap-2 border-b-2 border-black bg-panel-2 px-2 py-1">
        {isEvent ? <EventIcon value={block.emoji} size={16} max={1} /> : <Avatar person={host} size={18} />}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-ink">{title}</div>
          <div className="truncate text-[15px] text-ink-faint">{formatRange(occurrence.startIso, occurrence.endIso, zone)}</div>
        </div>
        <button
          type="button"
          className="btn btn-sm tile tile-dark shrink-0"
          onClick={() => {
            onClose();
            onOpen(item);
          }}
          title={item.mine ? "Open the editor" : "Open the details"}
        >
          Open
        </button>
        <button type="button" className="btn tile tile-dark !min-h-[30px] !w-8 shrink-0 !p-0" onClick={onClose} aria-label="Close the chat" title="Close">
          <PixelIcon name="x" size={11} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-3 py-2">
        <ChatList chat={chat} block={block} zone={zone} className="max-h-[min(40dvh,16rem)]" />
      </div>
      <div className="border-t-2 border-black bg-panel-2 p-2">
        <ChatBox chat={chat} block={block} to={to} onTo={setTo} autoFocus />
      </div>
    </div>
  );
}
