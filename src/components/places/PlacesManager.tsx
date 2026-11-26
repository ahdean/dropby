"use client";

import { useState, type FormEvent } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { useMyPlaces } from "@/lib/data/blocks";
import { useHiddenPlaceActions, useSavedPlaceActions, useSavedPlaces } from "@/lib/data/saved-places";
import { placeKey } from "@/lib/places";
import type { SavedPlace } from "@/lib/types";

const NOT_SET_UP =
  "Saved places are not switched on yet. Site owner: run the newest file in supabase/migrations in Supabase's SQL Editor (README, \"Updating the database\").";

/** The two fields of a place, used both for adding and for editing. */
function PlaceForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  focusName = false,
}: {
  initial?: SavedPlace;
  submitLabel: string;
  /** Put the cursor in the name box straight away (after "Save" on a used place). */
  focusName?: boolean;
  onSubmit: (name: string, address: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [busy, setBusy] = useState(false);
  const { toastError } = useFeedback();
  const key = initial?.id ?? "new";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation(); // this form can sit inside the event editor's form
    if (name.trim() === "" || address.trim() === "") return;
    setBusy(true);
    try {
      await onSubmit(name, address);
      if (!initial) {
        setName("");
        setAddress("");
      }
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
      <div>
        <label htmlFor={`place-name-${key}`} className="sr-only">
          Name
        </label>
        <input
          id={`place-name-${key}`}
          className="field"
          value={name}
          maxLength={40}
          placeholder="Name, e.g. Home"
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus={focusName}
        />
      </div>
      <div>
        <label htmlFor={`place-address-${key}`} className="sr-only">
          Address or description
        </label>
        <input
          id={`place-address-${key}`}
          className="field"
          value={address}
          maxLength={200}
          placeholder="Address, e.g. 12 Elm St, Apt 4"
          onChange={(e) => setAddress(e.target.value)}
          required
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="free" icon={initial ? "check" : "plus"} busy={busy} disabled={name.trim() === "" || address.trim() === ""}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="dark" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * Add, rename, re-address and delete saved places, and tidy the "Used before"
 * suggestions (save one under a name, or cross it out). Used on the profile
 * page and, in a dialog, from the event editor.
 */
export function PlacesManager({ suggestedAddress }: { suggestedAddress?: string }) {
  const { places, isLoading, notSetUp } = useSavedPlaces();
  const actions = useSavedPlaceActions();
  const hiddenActions = useHiddenPlaceActions();
  const used = useMyPlaces();
  const { toast, toastError } = useFeedback();
  const [editing, setEditing] = useState<string | null>(null);
  // The address the "Add a place" form starts from: one passed in, or a used place being saved.
  const [suggestion, setSuggestion] = useState<{ address: string; focus: boolean } | null>(
    suggestedAddress ? { address: suggestedAddress, focus: false } : null,
  );
  const usedNotSaved = used.filter((place) => !places.some((saved) => placeKey(saved.address) === placeKey(place)));

  if (notSetUp) {
    return (
      <p className="text-locked" role="alert">
        {NOT_SET_UP}
      </p>
    );
  }

  const remove = async (place: SavedPlace) => {
    try {
      await actions.remove(place.id);
      // No "are you sure": deleting is instant, and this brings it straight back.
      toast(`"${place.name}" deleted.`, "info", {
        label: "Undo",
        onClick: () => void actions.add(place.name, place.address).catch((error) => toastError(error)),
      });
    } catch (error) {
      toastError(error);
    }
  };

  const hide = async (place: string) => {
    try {
      await hiddenActions.hide(place);
      toast(`"${place}" won't be suggested any more.`, "info", {
        label: "Undo",
        onClick: () => void hiddenActions.unhide(place).catch((error) => toastError(error)),
      });
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-[17px] text-ink-faint">
        Only you can see this list. When you pick a place for an event, guests see its address, not the name you gave it.
      </p>

      {isLoading ? (
        <p className="animate-blink text-ink-dim" role="status">
          Loading…
        </p>
      ) : places.length === 0 ? (
        <p className="slot px-3 py-2 text-ink-dim">No saved places yet. Add the ones you host at most.</p>
      ) : (
        <ul className="slot divide-y-2 divide-black">
          {places.map((place) =>
            editing === place.id ? (
              <li key={place.id} className="p-2">
                <PlaceForm
                  initial={place}
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (name, address) => {
                    await actions.update(place.id, { name, address });
                    setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li key={place.id} className="flex items-center gap-3 px-3 py-2">
                <span className="shrink-0 text-join">
                  <PixelIcon name="pin" size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{place.name}</span>
                  <span className="block truncate text-[17px] text-ink-dim">{place.address}</span>
                </span>
                <IconButton icon="edit" label={`Edit ${place.name}`} onClick={() => setEditing(place.id)} className="!min-h-[38px] !w-10" size={13} />
                <IconButton icon="trash" label={`Delete ${place.name}`} onClick={() => remove(place)} className="!min-h-[38px] !w-10" size={13} />
              </li>
            ),
          )}
        </ul>
      )}

      {usedNotSaved.length > 0 && (
        <div>
          <div className="label">Used before</div>
          <p className="mb-2 text-[17px] text-ink-faint">
            From your past events. Save one under a name, or cross it out to stop it being suggested (your events keep it).
          </p>
          <ul className="slot divide-y-2 divide-black">
            {usedNotSaved.map((place) => (
              <li key={place} className="flex items-center gap-3 px-3 py-1.5">
                <span className="shrink-0 text-ink-faint">
                  <PixelIcon name="clock" size={13} />
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-dim">{place}</span>
                <IconButton
                  icon="plus"
                  label={`Save "${place}" under a name`}
                  onClick={() => setSuggestion({ address: place, focus: true })}
                  className="!min-h-[38px] !w-10"
                  size={13}
                />
                <IconButton icon="x" label={`Stop suggesting "${place}"`} onClick={() => hide(place)} className="!min-h-[38px] !w-10" size={13} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="label">Add a place</div>
        <PlaceForm
          // Re-create the form when a different address is suggested, so it starts from that.
          key={suggestion?.address ?? ""}
          initial={suggestion ? { id: "new", name: "", address: suggestion.address } : undefined}
          focusName={suggestion?.focus}
          submitLabel="Add"
          onSubmit={async (name, address) => {
            await actions.add(name, address);
            toast(`"${name.trim()}" saved.`, "success");
            setSuggestion(null);
          }}
        />
      </div>
    </div>
  );
}

/** The manager in a dialog, for use from the event editor. */
export function PlacesDialog({ open, onClose, suggestedAddress }: { open: boolean; onClose: () => void; suggestedAddress?: string }) {
  if (!open) return null;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Saved places"
      wide
      footer={
        <Button variant="free" onClick={onClose}>
          Done
        </Button>
      }
    >
      <PlacesManager suggestedAddress={suggestedAddress} />
    </Dialog>
  );
}
