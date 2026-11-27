"use client";

import { useState, type FormEvent } from "react";
import { LocationField } from "./LocationField";
import { Button, IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { findMapsLink, locationLabel, mapsUrlFor, splitLocation } from "@/lib/maps";
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
  mapsSteps = false,
}: {
  initial?: SavedPlace;
  submitLabel: string;
  /** Put the cursor in the name box straight away (after "Save" on a used place). */
  focusName?: boolean;
  onSubmit: (name: string, address: string) => Promise<void>;
  onCancel?: () => void;
  /** Offer the steps for adding the place from Google Maps (the "Add a place" form). */
  mapsSteps?: boolean;
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

  const nameField = (
    <div className={mapsSteps ? "min-w-0 flex-1" : undefined}>
      <label htmlFor={`place-name-${key}`} className="sr-only">
        Name
      </label>
      <input
        id={`place-name-${key}`}
        className="field"
        value={name}
        maxLength={40}
        placeholder={mapsSteps ? "Name it, e.g. Home" : "Name, e.g. Home"}
        onChange={(e) => setName(e.target.value)}
        required
        autoFocus={focusName}
      />
    </div>
  );
  const addressField = (
    <div>
      <label htmlFor={`place-address-${key}`} className="sr-only">
        Address or description
      </label>
      <LocationField
        id={`place-address-${key}`}
        value={address}
        onChange={(next) => {
          setAddress(next);
          // A place picked in Google Maps: its name becomes the place's name too, unless one was typed.
          const { label, link } = splitLocation(next);
          if (link && label) setName((typed) => (typed.trim() ? typed : label.split(",")[0].trim().slice(0, 40)));
        }}
        mapsSteps={mapsSteps}
        placeholder="Address (12 Elm St), or paste a Google Maps link"
      />
    </div>
  );
  const buttons = (
    <div className="flex shrink-0 gap-2">
      <Button type="submit" variant="free" icon={initial ? "check" : "plus"} busy={busy} disabled={name.trim() === "" || address.trim() === ""}>
        {submitLabel}
      </Button>
      {onCancel && (
        <Button variant="dark" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );

  // Adding: the Google Maps steps and the address first (picking a place there fills in its name), then the name.
  if (mapsSteps) {
    return (
      <form onSubmit={submit} className="space-y-2">
        {addressField}
        <div className="flex items-start gap-2">
          {nameField}
          {buttons}
        </div>
      </form>
    );
  }
  return (
    <form onSubmit={submit} className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
      {nameField}
      {addressField}
      {buttons}
    </form>
  );
}

/** See a place in Google Maps: at its pin if it has one, or searching for its address. */
function MapsLink({ place, name }: { place: string; name: string }) {
  return (
    <a
      href={mapsUrlFor(place)}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-sm tile tile-dark shrink-0"
      aria-label={`See ${name} in Google Maps`}
      title="See it in Google Maps"
    >
      Maps
    </a>
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
                  <span className="block truncate text-[17px] text-ink-dim">
                    {splitLocation(place.address).label}
                    {findMapsLink(place.address) && <span className="text-join">{splitLocation(place.address).label ? " · " : ""}map pin</span>}
                  </span>
                </span>
                <MapsLink place={place.address} name={place.name} />
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
                <span className="min-w-0 flex-1 truncate text-ink-dim">
                  {splitLocation(place).label}
                  {findMapsLink(place) && <span className="text-join">{splitLocation(place).label ? " · " : ""}map pin</span>}
                </span>
                <MapsLink place={place} name={locationLabel(place)} />
                <IconButton
                  icon="plus"
                  label={`Save "${locationLabel(place)}" under a name`}
                  onClick={() => setSuggestion({ address: place, focus: true })}
                  className="!min-h-[38px] !w-10"
                  size={13}
                />
                <IconButton icon="x" label={`Stop suggesting "${locationLabel(place)}"`} onClick={() => hide(place)} className="!min-h-[38px] !w-10" size={13} />
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
          mapsSteps
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
