"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { DayRange } from "@/components/calendar/useBlockGestures";
import { MaraPeek, PEEK_MS, findPeekSpot, type PeekSpot } from "./MaraPeek";
import { MaraWalk, type WalkSpot } from "./MaraWalk";

/**
 * The maras that visit the week calendar now and then (in every design):
 *
 *   - a curious one peeks over a block (MaraPeek), most of the time;
 *   - sometimes, when a day on screen has a long empty stretch, one walks
 *     along it and suggests a block there (MaraWalk), at most every few minutes.
 *
 * Only one at a time, about once a minute. None while a block is being
 * dragged, a window or chat box is open, or the page is in the background,
 * and none at all with "reduce motion" switched on.
 */

const FIRST_MS: [number, number] = [15_000, 30_000];
const NEXT_MS: [number, number] = [45_000, 90_000];
const RETRY_MS: [number, number] = [10_000, 20_000];
/** A walk at most this often, and then only some of the time. */
const WALK_EVERY_MS = 3 * 60_000;
const WALK_CHANCE = 0.45;

type Visit = { id: number; peek: PeekSpot } | { id: number; walk: WalkSpot };

function between([low, high]: [number, number]): number {
  return low + Math.random() * (high - low);
}

export function CalendarMaras({
  scroller,
  headerHeight,
  findWalkSpot,
  onSuggest,
}: {
  scroller: RefObject<HTMLElement | null>;
  headerHeight: number;
  /** An empty stretch on screen with a block to suggest in it, or null. */
  findWalkSpot: () => WalkSpot | null;
  onSuggest: (range: DayRange) => void;
}) {
  const [visit, setVisit] = useState<Visit | null>(null);
  const busyVisiting = useRef(false);
  const finder = useRef(findWalkSpot);
  useEffect(() => {
    finder.current = findWalkSpot;
  });

  const done = useCallback(() => {
    busyVisiting.current = false;
    setVisit(null);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    let peekEnd = 0;
    let lastWalk = Date.now() - WALK_EVERY_MS / 2;
    const later = (range: [number, number]) => {
      timer = window.setTimeout(visitNow, between(range));
    };
    function visitNow() {
      const root = scroller.current;
      const busy =
        !root ||
        busyVisiting.current ||
        document.hidden ||
        document.body.classList.contains("dragging") ||
        document.querySelector("dialog[open], .chat-popover") !== null;
      if (busy || !root) {
        later(RETRY_MS);
        return;
      }
      const now = Date.now();
      const walk = now - lastWalk >= WALK_EVERY_MS && Math.random() < WALK_CHANCE ? finder.current() : null;
      if (walk) {
        lastWalk = now;
        busyVisiting.current = true;
        setVisit({ id: now, walk });
      } else {
        const peek = findPeekSpot(root, headerHeight);
        if (!peek) {
          later(RETRY_MS);
          return;
        }
        busyVisiting.current = true;
        setVisit({ id: now, peek });
        peekEnd = window.setTimeout(done, PEEK_MS + 100);
      }
      later(NEXT_MS);
    }
    later(FIRST_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(peekEnd);
      busyVisiting.current = false;
    };
  }, [done, headerHeight, scroller]);

  if (!visit) return null;
  return "peek" in visit ? (
    <MaraPeek key={visit.id} spot={visit.peek} />
  ) : (
    <MaraWalk key={visit.id} spot={visit.walk} onSuggest={onSuggest} onDone={done} />
  );
}
