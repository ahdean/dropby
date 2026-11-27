"use client";

import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { lookUpMapsPlace } from "@/app/(app)/maps-actions";
import { PixelIcon } from "@/components/ui/PixelIcon";
import {
  findMapsLink,
  isShortMapsLink,
  joinLocation,
  linkForDisplay,
  mapsUrlFor,
  placeNameFromMapsUrl,
  readPastedLocation,
  shortPlaceName,
  splitLocation,
} from "@/lib/maps";

/**
 * A place: the words people see ("Joe's Pizza, 7 Carmine St") and, if one
 * was pasted, a Google Maps pin, shown separately underneath as a "Map pin"
 * card (Open, ✕). The two are stored together in one piece of text (see
 * lib/maps.ts); `value` and `onChange` deal in that text.
 *
 * Pasting a Google Maps link (on its own, or the name-address-link text the
 * Maps app copies) pins the place and fills in its name: from the pasted
 * words, from the link itself, or by asking Google (short links). If no name
 * can be found, the box asks for one. Without a pin, the Maps button next to
 * the box looks up what is typed (or opens Google Maps to find a place).
 */
export function LocationField({
  id,
  value,
  onChange,
  placeholder = "Name or address, or paste a Google Maps link",
  list,
  required = false,
  autoFocus = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Id of a <datalist> of suggestions. */
  list?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const { label, link } = splitLocation(value);
  const [lookingUp, setLookingUp] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // The latest text, for a name that arrives after a lookup.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });

  const needsName = Boolean(link) && label === "" && !lookingUp;

  /** A name was filled in for you: the box glows for a moment, so you notice. */
  const flash = () =>
    input.current?.animate(
      [{ boxShadow: "0 0 0 3px var(--color-join)" }, { boxShadow: "0 0 0 3px var(--color-join)", offset: 0.6 }, { boxShadow: "0 0 0 0 transparent" }],
      { duration: 1200 },
    );
  /** No name could be found: put the cursor in the box to type one. */
  const askForName = () => input.current?.focus();

  /** A new pin, with the words that came with it (if any). */
  const pin = (newLink: string, words: string) => {
    const keepTyped = label !== "" && !link; // a name typed before the link was pasted stays
    const name = words || (keepTyped ? label : "") || shortPlaceName(placeNameFromMapsUrl(newLink) ?? "");
    onChange(joinLocation(name, newLink));
    if (name) {
      if (!keepTyped || words) flash();
      return;
    }
    if (!isShortMapsLink(newLink)) {
      askForName();
      return;
    }
    setLookingUp(true);
    lookUpMapsPlace(newLink)
      .then(({ name: found }) => {
        const now = splitLocation(latest.current);
        if (now.link !== newLink || now.label !== "") return; // changed meanwhile
        if (found) {
          onChange(joinLocation(shortPlaceName(found), newLink));
          flash();
        } else {
          askForName();
        }
      })
      .catch(askForName)
      .finally(() => setLookingUp(false));
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    const pasted = readPastedLocation(text);
    if (!pasted.link) return; // ordinary text: the box takes it as usual
    event.preventDefault();
    // Several lines (name, then full address, then link) is what the Maps app copies: keep the name and street.
    pin(pasted.link, /\n/.test(text.trim()) ? shortPlaceName(pasted.words) : pasted.words);
  };

  const onType = (text: string) => {
    // A link that arrives without a paste (dragged in, or a suggestion picked from the list).
    if (findMapsLink(text)) {
      const pasted = readPastedLocation(text);
      if (pasted.link) {
        pin(pasted.link, pasted.words);
        return;
      }
    }
    onChange(joinLocation(text, link));
  };

  const removePin = () => onChange(joinLocation(label, null));

  return (
    <div>
      <div className="flex items-stretch gap-2">
        <input
          ref={input}
          id={id}
          className={`field min-w-0 flex-1 ${needsName ? "!border-locked" : ""}`}
          value={label}
          placeholder={lookingUp ? "Finding the place's name…" : needsName ? "Type a name for this place" : placeholder}
          list={list}
          autoComplete="off"
          required={required}
          autoFocus={autoFocus}
          onPaste={onPaste}
          onChange={(e) => onType(e.target.value)}
        />
        {!link && (
          // Opens Google Maps (the app, on a phone that has it): searching for what is typed, or to find a place.
          <a
            href={mapsUrlFor(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn tile tile-dark shrink-0 !px-3"
            title={label ? "Look this up in Google Maps" : "Find a place in Google Maps"}
          >
            <PixelIcon name="pin" size={13} />
            Maps
          </a>
        )}
      </div>

      {link ? (
        <div className="mt-2 flex items-center gap-2 border-2 border-black bg-panel-2 py-1 pl-2 pr-1" role="group" aria-label="Map pin">
          <PixelIcon name="pin" size={15} className="shrink-0 text-join" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-ink">
              {lookingUp ? <span className="animate-blink">Map pin · finding the place…</span> : "Map pin"}
            </div>
            <div className="truncate text-[15px] text-ink-faint" title={link}>
              {linkForDisplay(link)}
            </div>
          </div>
          <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-sm tile tile-dark shrink-0" title="Check the pin in Google Maps">
            Open
          </a>
          <button
            type="button"
            className="btn tile tile-dark !min-h-[32px] !w-8 shrink-0 !p-0"
            onClick={removePin}
            aria-label="Remove the map pin"
            title="Remove the map pin"
          >
            <PixelIcon name="x" size={11} />
          </button>
        </div>
      ) : null}

      <p className="mt-1 text-[16px] text-ink-faint" role="status">
        {lookingUp
          ? "Pinned. Getting the place's name from Google Maps…"
          : needsName
            ? "Pinned. Google didn't say what it's called: type a name above, so friends know where it is."
            : link
              ? "Guests see the name above; tapping it takes them to the pin."
              : "To pin the exact spot: in Google Maps, tap the place, then Share, Copy link, and paste it here."}
      </p>
    </div>
  );
}
