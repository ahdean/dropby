"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { DAY_END_MIN, DEFAULT_BLOCK_MINUTES, SNAP_MINUTES } from "@/lib/constants";
import { moveInterval, rangeFromDrag, resizeInterval, type Interval } from "@/lib/calendar/intervals";
import type { CalendarItem } from "@/lib/calendar/model";
import type { DayKey } from "@/lib/time";

/**
 * Pointer and touch handling for creating, moving and resizing blocks.
 * The same hook drives the week grid and the single-day view; each view only
 * supplies `locate`, which turns a screen position into a day and a time.
 *
 * Mouse / pen:  press and drag straight away.
 * Touch:        press and hold (so a swipe still scrolls), then drag.
 * A press without a drag is a tap: it opens the block, or starts a new one.
 *
 * Elements opt in with data attributes:
 *   data-gesture="empty"                         an empty track
 *   data-gesture="move"   data-item="<key>"      the body of one of my blocks
 *   data-gesture="resize" data-item="<key>" data-edge="start|end"
 */

export interface DayRange extends Interval {
  dayKey: DayKey;
}

export interface Ghost extends DayRange {
  mode: "create" | "move" | "resize";
  /** The block being moved or resized. */
  item?: CalendarItem;
}

type Target =
  | { kind: "empty" }
  | { kind: "move"; item: CalendarItem }
  | { kind: "resize"; item: CalendarItem; edge: "start" | "end" };

interface Point {
  dayKey: DayKey;
  minute: number;
}

interface Options {
  /** The scrolling element that contains the tracks. */
  containerRef: RefObject<HTMLElement | null>;
  locate: (clientX: number, clientY: number) => Point | null;
  /** Look up one of the viewer's own blocks by its item key. */
  itemByKey: (key: string) => CalendarItem | undefined;
  /** May a new block be created on this day? (Past days: no.) */
  canCreateOn: (dayKey: DayKey) => boolean;
  /** A new block was drawn ("drag") or an empty spot was tapped ("tap"). */
  onCreate: (range: DayRange, how: "drag" | "tap") => void;
  onChange: (item: CalendarItem, next: DayRange) => void;
  onOpen: (item: CalendarItem) => void;
}

const MOUSE_DRAG_THRESHOLD = 4;
const TOUCH_SLOP = 10;
const LONG_PRESS_MS = 350;

interface Session {
  target: Target;
  startX: number;
  startY: number;
  startPoint: Point;
  active: boolean;
  touch: boolean;
  timer?: number;
  pointerId?: number;
}

export function useBlockGestures(options: Options) {
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const session = useRef<Session | null>(null);
  const ghostRef = useRef<Ghost | null>(null);
  // Keep the latest callbacks without re-binding the native listeners.
  const opts = useRef(options);
  useLayoutEffect(() => {
    opts.current = options;
  });

  const updateGhost = useCallback((next: Ghost | null) => {
    ghostRef.current = next;
    setGhost(next);
  }, []);

  const resolveTarget = useCallback((element: Element | null): Target | null => {
    // The nearest gesture element, unless something clickable (a friend's
    // event, a stack of avatars) sits between it and the pointer: those handle
    // their own clicks and must not also count as a tap on the track behind.
    const el = element?.closest<HTMLElement>("[data-gesture], button, a, input, select, textarea");
    if (!el || !el.dataset.gesture) return null;
    const kind = el.dataset.gesture;
    if (kind === "empty") return { kind: "empty" };
    const item = el.dataset.item ? opts.current.itemByKey(el.dataset.item) : undefined;
    if (!item || !item.whole) return null;
    if (kind === "resize") return { kind: "resize", item, edge: el.dataset.edge === "start" ? "start" : "end" };
    if (kind === "move") return { kind: "move", item };
    return null;
  }, []);

  const computeGhost = useCallback((s: Session, clientX: number, clientY: number): Ghost | null => {
    const here = opts.current.locate(clientX, clientY);
    if (s.target.kind === "empty") {
      const range = rangeFromDrag(s.startPoint.minute, here?.minute ?? s.startPoint.minute);
      return { mode: "create", dayKey: s.startPoint.dayKey, ...range };
    }
    const { item } = s.target;
    if (s.target.kind === "resize") {
      const range = resizeInterval(item, s.target.edge, here?.minute ?? (s.target.edge === "start" ? item.startMin : item.endMin));
      return { mode: "resize", dayKey: item.dayKey, item, ...range };
    }
    const delta = (here?.minute ?? s.startPoint.minute) - s.startPoint.minute;
    return { mode: "move", dayKey: here?.dayKey ?? item.dayKey, item, ...moveInterval(item, delta) };
  }, []);

  const activate = useCallback(
    (s: Session, clientX: number, clientY: number) => {
      s.active = true;
      document.body.classList.add("dragging");
      updateGhost(computeGhost(s, clientX, clientY));
    },
    [computeGhost, updateGhost],
  );

  const finish = useCallback(
    (commit: boolean) => {
      const s = session.current;
      const g = ghostRef.current;
      session.current = null;
      if (s?.timer) window.clearTimeout(s.timer);
      document.body.classList.remove("dragging");
      updateGhost(null);
      if (!s || !commit) return;

      if (s.active && g) {
        if (g.mode === "create") {
          opts.current.onCreate({ dayKey: g.dayKey, startMin: g.startMin, endMin: g.endMin }, "drag");
        } else if (g.item) {
          const unchanged = g.dayKey === g.item.dayKey && g.startMin === g.item.startMin && g.endMin === g.item.endMin;
          if (!unchanged) opts.current.onChange(g.item, { dayKey: g.dayKey, startMin: g.startMin, endMin: g.endMin });
        }
        return;
      }

      // No drag happened: it was a tap.
      if (s.target.kind === "empty") {
        const startMin = Math.min(
          Math.floor(s.startPoint.minute / SNAP_MINUTES) * SNAP_MINUTES,
          DAY_END_MIN - DEFAULT_BLOCK_MINUTES,
        );
        opts.current.onCreate({ dayKey: s.startPoint.dayKey, startMin, endMin: startMin + DEFAULT_BLOCK_MINUTES }, "tap");
      } else {
        opts.current.onOpen(s.target.item);
      }
    },
    [updateGhost],
  );

  const begin = useCallback(
    (element: Element | null, clientX: number, clientY: number, touch: boolean): Session | null => {
      const target = resolveTarget(element);
      if (!target) return null;
      const startPoint = opts.current.locate(clientX, clientY);
      if (!startPoint) return null;
      if (target.kind === "empty" && !opts.current.canCreateOn(startPoint.dayKey)) return null;
      const s: Session = { target, startX: clientX, startY: clientY, startPoint, active: false, touch };
      session.current = s;
      return s;
    },
    [resolveTarget],
  );

  // --- mouse and pen -------------------------------------------------------
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === "touch" || event.button !== 0 || session.current) return;
      const s = begin(event.target as Element, event.clientX, event.clientY, false);
      if (!s) return;
      s.pointerId = event.pointerId;
      event.preventDefault(); // no text selection, no native drag
    },
    [begin],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const s = session.current;
      if (!s || s.touch || event.pointerId !== s.pointerId) return;
      if (!s.active) {
        const moved = Math.hypot(event.clientX - s.startX, event.clientY - s.startY);
        if (moved < MOUSE_DRAG_THRESHOLD) return;
        activate(s, event.clientX, event.clientY);
        return;
      }
      updateGhost(computeGhost(s, event.clientX, event.clientY));
    };
    const onUp = (event: PointerEvent) => {
      const s = session.current;
      if (!s || s.touch || event.pointerId !== s.pointerId) return;
      finish(event.type === "pointerup");
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && session.current) finish(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [activate, computeGhost, finish, updateGhost]);

  // --- touch ---------------------------------------------------------------
  // Native listeners, because React's are passive and cannot stop scrolling.
  useEffect(() => {
    const container = opts.current.containerRef.current;
    if (!container) return;

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || session.current) return;
      const touch = event.touches[0];
      const s = begin(event.target as Element, touch.clientX, touch.clientY, true);
      if (!s) return;
      s.timer = window.setTimeout(() => {
        if (session.current !== s) return;
        s.timer = undefined;
        navigator.vibrate?.(10);
        activate(s, s.startX, s.startY);
      }, LONG_PRESS_MS);
    };

    const onMove = (event: TouchEvent) => {
      const s = session.current;
      if (!s || !s.touch) return;
      const touch = event.touches[0];
      if (!s.active) {
        // Moved before the hold completed: the person is scrolling. Let them.
        if (Math.hypot(touch.clientX - s.startX, touch.clientY - s.startY) > TOUCH_SLOP) finish(false);
        return;
      }
      event.preventDefault(); // we are dragging a block: keep the page still
      updateGhost(computeGhost(s, touch.clientX, touch.clientY));
    };

    const onEnd = (event: TouchEvent) => {
      const s = session.current;
      if (!s || !s.touch) return;
      // Handled here, so stop the browser from also sending a simulated click.
      if (event.cancelable) event.preventDefault();
      finish(true);
    };

    const onCancel = () => {
      if (session.current?.touch) finish(false);
    };

    const onContextMenu = (event: Event) => {
      // Long-press must not open the browser's context menu mid-gesture.
      if (session.current?.touch) event.preventDefault();
    };

    container.addEventListener("touchstart", onStart, { passive: true });
    container.addEventListener("touchmove", onMove, { passive: false });
    container.addEventListener("touchend", onEnd, { passive: false });
    container.addEventListener("touchcancel", onCancel);
    container.addEventListener("contextmenu", onContextMenu);
    return () => {
      container.removeEventListener("touchstart", onStart);
      container.removeEventListener("touchmove", onMove);
      container.removeEventListener("touchend", onEnd);
      container.removeEventListener("touchcancel", onCancel);
      container.removeEventListener("contextmenu", onContextMenu);
    };
  }, [activate, begin, computeGhost, finish, updateGhost]);

  useEffect(() => () => document.body.classList.remove("dragging"), []);

  return { ghost, onPointerDown };
}
