"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { MAX_KIND, allKinds, kindEmoji, sameKind, tidyKind } from "@/lib/activities";

/**
 * Choose place types ("House", "Park"…): the built-in ones, the person's own,
 * and "+ Other" to type a new one. `multiple` lets several be on at once (an
 * activity can happen at a house or a park); otherwise tapping the chosen one
 * again clears it.
 */
export function KindPicker({
  value,
  onChange,
  own,
  multiple = false,
  label,
}: {
  value: string[];
  onChange: (kinds: string[]) => void;
  /** The person's own types, from their places and activities. */
  own: readonly (string | null | undefined)[];
  multiple?: boolean;
  /** For screen readers. */
  label: string;
}) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState("");
  // Their own types, plus any chosen ones that are not in the list yet.
  const kinds = allKinds([...own, ...value]);

  const toggle = (kind: string) => {
    const on = value.some((k) => sameKind(k, kind));
    if (on) onChange(value.filter((k) => !sameKind(k, kind)));
    else onChange(multiple ? [...value, kind] : [kind]);
  };

  const addTyped = () => {
    const kind = tidyKind(typed);
    setTyped("");
    setAdding(false);
    if (!kind) return;
    if (!value.some((k) => sameKind(k, kind))) onChange(multiple ? [...value, kind] : [kind]);
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault(); // not the form around it
      addTyped();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation(); // not the dialog around it
      setAdding(false);
      setTyped("");
    }
  };

  return (
    <ul className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      {kinds.map((kind) => {
        const on = value.some((k) => sameKind(k, kind));
        return (
          <li key={kind}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => toggle(kind)}
              className={`btn btn-sm tile ${on ? "tile-join" : "tile-dark"}`}
            >
              <span aria-hidden="true">{kindEmoji(kind)}</span>
              {kind}
            </button>
          </li>
        );
      })}
      <li>
        {adding ? (
          <span className="flex items-center gap-1">
            <label className="sr-only" htmlFor={`${id}-other`}>
              Your own type of place
            </label>
            <input
              id={`${id}-other`}
              className="field !min-h-[34px] w-40 !py-0"
              value={typed}
              maxLength={MAX_KIND}
              placeholder="e.g. Rooftop"
              autoFocus
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={onKey}
              onBlur={addTyped}
            />
          </span>
        ) : (
          <button type="button" className="btn btn-sm tile tile-dark" onClick={() => setAdding(true)}>
            <PixelIcon name="plus" size={11} />
            Other
          </button>
        )}
      </li>
    </ul>
  );
}
