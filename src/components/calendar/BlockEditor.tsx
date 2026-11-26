"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { Segmented, Switch } from "@/components/ui/Switch";
import { expandBlocks, findSameTypeConflict } from "@/lib/calendar/model";
import { MIN_BLOCK_MINUTES, SNAP_MINUTES } from "@/lib/constants";
import { DOOR_ICON, defaultTitleFor, isAutomaticTitle, splitIcons } from "@/lib/event-icon";
import { PlacesDialog } from "@/components/places/PlacesManager";
import { draftFromBlock, isPicturesNotSetUp, useBlockActions, useMyPlaces } from "@/lib/data/blocks";
import { removeEventPictureIfUnused, useEventPictureUpload } from "@/lib/data/event-pictures";
import { useSavedPlaces } from "@/lib/data/saved-places";
import { useSession } from "@/lib/data/session";
import { shiftSeries, type Occurrence } from "@/lib/recurrence";
import { addDays, formatDayKey, formatMinutes, formatSpan, minutesFromDay, utcToZoned, zonedToUtc, type DayKey } from "@/lib/time";
import type { BlockDraft, BlockType, CalendarBlock, Group, Profile } from "@/lib/types";
import { EVERYONE } from "@/lib/audience";
import { AudiencePicker, type AudienceValue } from "./AudiencePicker";
import { PictureField } from "./PictureField";
import type { DayRange } from "./useBlockGestures";

export type EditorState =
  | { mode: "create"; range: DayRange; preset?: { type?: BlockType; emoji?: string; title?: string; audience?: AudienceValue } }
  | { mode: "edit"; block: CalendarBlock; occurrence: Occurrence };

/** The longest a block may be (the database allows up to 24 hours). */
const MAX_BLOCK_MINUTES = 24 * 60;

interface Form {
  type: BlockType;
  dayKey: DayKey;
  /** Minutes after midnight of `dayKey`, any time of day. */
  startMin: number;
  /** Minutes after midnight of `dayKey`: above 1440 when the block ends the next day. */
  endMin: number;
  repeat: boolean;
  title: string;
  emoji: string;
  location: string;
  description: string;
  /** The picture already stored for this event (null: none, or removed). */
  picturePath: string | null;
  /** A newly chosen picture, uploaded when the event is saved. */
  pictureFile: File | null;
  rsvp: boolean;
  audience: AudienceValue;
}


function initialForm(state: EditorState, zone: string): Form {
  if (state.mode === "create") {
    return {
      type: state.preset?.type ?? "free",
      dayKey: state.range.dayKey,
      startMin: state.range.startMin,
      endMin: state.range.endMin,
      repeat: false,
      title: state.preset?.title ?? "",
      emoji: state.preset?.emoji ?? DOOR_ICON,
      location: "",
      description: "",
      picturePath: null,
      pictureFile: null,
      rsvp: true,
      audience: state.preset?.audience ?? EVERYONE,
    };
  }
  const { block, occurrence } = state;
  const start = utcToZoned(occurrence.startIso, zone);
  return {
    type: block.type,
    dayKey: start.dayKey,
    startMin: start.minutes,
    // Counted from the start day's midnight, so a block that runs past midnight keeps its real end.
    endMin: minutesFromDay(occurrence.endIso, start.dayKey, zone),
    repeat: block.repeat_weekly,
    title: block.title ?? "",
    emoji: block.emoji ?? DOOR_ICON,
    location: block.location ?? "",
    description: block.description ?? "",
    picturePath: block.picture_path ?? null,
    pictureFile: null,
    rsvp: block.rsvp_enabled,
    audience: { audience: block.audience, userIds: block.shared_user_ids, groupIds: block.shared_group_ids },
  };
}

/** The same place, give or take capitals and spaces? */
function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** How an end time reads in the list: "1 AM (next day)" once it is past midnight. */
function endLabel(minutes: number): string {
  if (minutes === 1440) return "12 AM (midnight)";
  return minutes > 1440 ? `${formatMinutes(minutes - 1440)} (next day)` : formatMinutes(minutes);
}

/** Half-hour choices between two times, plus the current value if it is off the grid. */
function timeOptions(from: number, to: number, current: number): number[] {
  const options = new Set<number>([current]);
  for (let minutes = from; minutes <= to; minutes += SNAP_MINUTES) options.add(minutes);
  return [...options].filter((m) => m >= Math.min(from, current) && m <= Math.max(to, current)).sort((a, b) => a - b);
}

interface EditorProps {
  state: EditorState | null;
  zone: string;
  /** Every block on the calendar; the viewer's own are used to detect overlaps. */
  blocks: CalendarBlock[];
  connections: Profile[];
  groups: Group[];
  minDay: DayKey;
  maxDay: DayKey;
  onClose: () => void;
  /** Called after a successful save. `invite` asks the parent to open "Invite by text". */
  onSaved: (result: { blockId: string; occurrence: number; invite: boolean }) => void;
}

/**
 * The form for creating or editing a block. It is mounted fresh each time it
 * opens, so it always starts from the block (or the dragged range) it was
 * opened for.
 */
export function BlockEditor(props: EditorProps) {
  if (!props.state) return null;
  return <EditorDialog {...props} state={props.state} />;
}

function EditorDialog({
  state,
  zone,
  blocks,
  connections,
  groups,
  minDay,
  maxDay,
  onClose,
  onSaved,
}: EditorProps & { state: EditorState }) {
  const { userId } = useSession();
  const actions = useBlockActions();
  const uploadPicture = useEventPictureUpload();
  const places = useMyPlaces();
  const { places: savedPlaces } = useSavedPlaces();
  // Places typed on earlier events that have not been saved under a nickname.
  const usedPlaces = places.filter((place) => !savedPlaces.some((saved) => sameText(saved.address, place)));
  const [placesOpen, setPlacesOpen] = useState<"save" | "manage" | null>(null);
  const { toast, toastError, choose } = useFeedback();
  const ids = useId();

  const [form, setForm] = useState<Form>(() => initialForm(state, zone));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const editing = state.mode === "edit" ? state : null;
  const isJoin = form.type === "join";

  // Any time of day, not only the hours the week grid draws; the end may be on the next day.
  const startOptions = useMemo(() => timeOptions(0, 1440 - SNAP_MINUTES, form.startMin), [form.startMin]);
  const endOptions = useMemo(
    () => timeOptions(form.startMin + MIN_BLOCK_MINUTES, form.startMin + MAX_BLOCK_MINUTES, form.endMin),
    [form.startMin, form.endMin],
  );

  /**
   * Icons were added or removed. If the main (first) icon changed, fill in its
   * usual title, unless the person has typed their own.
   */
  const changeIcon = (emoji: string) =>
    setForm((f) => {
      const mainChanged = splitIcons(emoji)[0] !== splitIcons(f.emoji)[0];
      return { ...f, emoji, title: mainChanged && isAutomaticTitle(f.title) ? defaultTitleFor(emoji) : f.title };
    });

  /** Free → Join me: start from the door and its title. A note typed on the Free block is kept as the title. */
  const changeType = (type: BlockType) =>
    setForm((f) => {
      if (type === f.type) return f;
      if (type === "join") {
        const emoji = f.emoji || DOOR_ICON;
        return { ...f, type, emoji, title: f.title.trim() === "" ? defaultTitleFor(emoji) : f.title };
      }
      // Join me → Free: an automatic event title makes no sense as a note.
      return { ...f, type, title: isAutomaticTitle(f.title) ? "" : f.title };
    });

  const changeStart = (startMin: number) =>
    setForm((f) => {
      // Keep the length; that may now carry it past midnight, which is fine.
      const length = Math.min(MAX_BLOCK_MINUTES, Math.max(MIN_BLOCK_MINUTES, f.endMin - f.startMin));
      return { ...f, startMin, endMin: startMin + length };
    });

  const validate = (f: Form): string | null => {
    if (f.endMin <= f.startMin) return "The end time must be after the start time.";
    if (f.endMin - f.startMin > MAX_BLOCK_MINUTES) return "A block can be at most 24 hours long.";
    if (f.type === "join" && f.emoji.trim() === "") return "Pick an icon for your event: it's what friends see on their calendar.";
    // This day, and the next one for a block that runs past midnight.
    const mine = expandBlocks(blocks.filter((b) => b.owner_id === userId), userId, zone, f.dayKey, 2);
    const conflict =
      findSameTypeConflict({ dayKey: f.dayKey, type: f.type, startMin: f.startMin, endMin: f.endMin }, mine, editing?.block.id) ??
      (f.endMin > 1440
        ? findSameTypeConflict(
            { dayKey: addDays(f.dayKey, 1), type: f.type, startMin: 0, endMin: f.endMin - 1440 },
            mine,
            editing?.block.id,
          )
        : undefined);
    if (conflict) {
      return `That overlaps your other ${f.type === "free" ? "Free" : "Join me"} block (${formatDayKey(conflict.dayKey)}, ${formatSpan(conflict.dayKey, conflict.fullStartMin, conflict.fullEndMin)}). Move one of them, or stretch the existing one instead.`;
    }
    return null;
  };

  const toDraft = (f: Form): BlockDraft => ({
    type: f.type,
    start_at: zonedToUtc(f.dayKey, f.startMin, zone),
    end_at: zonedToUtc(f.dayKey, f.endMin, zone),
    tz: zone,
    repeat_weekly: f.repeat,
    title: f.title,
    emoji: f.emoji,
    location: f.location,
    description: f.description,
    rsvp_enabled: f.rsvp,
    audience: f.audience.audience,
    shared_user_ids: f.audience.userIds,
    shared_group_ids: f.audience.groupIds,
  });

  const save = async (invite: boolean) => {
    const problem = validate(form);
    setError(problem);
    if (problem) return;

    const originalPicture = editing?.block.picture_path ?? null;
    setBusy(true);
    try {
      let blockId: string;
      let occurrence = 0;

      // A weekly event: ask first, so nothing is uploaded if the person backs out.
      const repeating = state.mode === "edit" && state.block.repeat_weekly && form.repeat;
      const scope = repeating
        ? await choose({
            title: "This repeats weekly",
            body: "Apply your changes to just this one, or to every week?",
            choices: [
              { value: "one", label: "Just this one", variant: "stone" },
              { value: "all", label: "Every week", variant: "free" },
            ],
          })
        : null;
      if (repeating && !scope) return;

      // The picture: upload a new one; otherwise only mention it if it was removed.
      const nextPicture = form.type !== "join" ? null : form.pictureFile ? await uploadPicture(form.pictureFile) : form.picturePath;
      const draft: BlockDraft = { ...toDraft(form), picture_path: nextPicture !== originalPicture ? nextPicture : undefined };

      if (state.mode === "create") {
        blockId = await actions.create(draft);
      } else if (!repeating) {
        // A one-off block, or a weekly one being turned into a one-off.
        await actions.update(state.block, draft);
        blockId = state.block.id;
      } else {
        if (scope === "one") {
          blockId = await actions.detachOccurrence(state.block, state.occurrence.index, { ...draft, repeat_weekly: false });
        } else {
          // The form shows one week; shift the whole series by the same amount.
          const times = shiftSeries({ ...state.block, tz: zone }, state.occurrence.index, draft.start_at, draft.end_at);
          await actions.update(state.block, { ...draft, ...times });
          blockId = state.block.id;
          occurrence = state.occurrence.index;
        }
      }
      toast("Saved", "success");
      if (draft.picture_path !== undefined) void removeEventPictureIfUnused(originalPicture);
      onSaved({ blockId, occurrence, invite });
    } catch (failure) {
      toastError(
        isPicturesNotSetUp(failure)
          ? "Event pictures are not switched on yet: the newest database file has to be run in Supabase (see README)."
          : failure,
        "Could not save. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    const { block, occurrence } = editing;
    try {
      let deletedBlock = !block.repeat_weekly;
      if (!block.repeat_weekly) {
        await actions.remove(block);
      } else {
        const scope = await choose({
          title: "Delete which ones?",
          body: "This block repeats weekly.",
          choices: [
            { value: "one", label: "Just this one", variant: "stone" },
            { value: "following", label: "This and later", variant: "stone" },
            { value: "all", label: "Every week", variant: "danger" },
          ],
        });
        if (!scope) return;
        if (scope === "one") await actions.skipOccurrence(block, occurrence.index);
        else if (scope === "following") await actions.endSeriesAt(block, occurrence.index);
        else {
          await actions.remove(block);
          deletedBlock = true;
        }
      }
      onClose();
      // The whole event is gone: its picture file can go too (unless a split-off week still uses it).
      if (deletedBlock) void removeEventPictureIfUnused(block.picture_path);
      if (block.type === "free" && !block.repeat_weekly) {
        // Free time is cheap to restore exactly; an event's answers and chat would be lost, so no Undo there.
        toast("Deleted.", "info", {
          label: "Undo",
          onClick: () => void actions.create(draftFromBlock(block)).catch((failure) => toastError(failure)),
        });
      } else {
        toast("Deleted.");
      }
    } catch (failure) {
      toastError(failure, "Could not delete. Please try again.");
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? "Edit block" : "New block"}
      footer={
        <>
          {editing && (
            <Button variant="danger" icon="trash" onClick={remove} disabled={busy} className="mr-auto">
              Delete
            </Button>
          )}
          <Button variant="dark" icon="send" onClick={() => save(true)} disabled={busy}>
            {editing ? "Save & invite by text" : "Save & invite"}
          </Button>
          <Button type="submit" form={`${ids}-form`} variant={isJoin ? "join" : "free"} icon="check" busy={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id={`${ids}-form`} onSubmit={submit} className="space-y-5">
        <div>
          <div className="label">What is it?</div>
          <Segmented
            label="Block type"
            value={form.type}
            onChange={changeType}
            options={[
              { value: "free", label: "Free", activeClass: "tile-free" },
              { value: "join", label: "Join me", activeClass: "tile-join" },
            ]}
          />
          <p className="mt-2 text-[17px] text-ink-faint">
            {isJoin ? "You're hosting something and friends can join." : "You're available. Friends see your face over this time."}
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="label">When</legend>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor={`${ids}-day`} className="sr-only">Date</label>
              <input
                id={`${ids}-day`}
                type="date"
                className="field"
                value={form.dayKey}
                min={minDay}
                max={maxDay}
                required
                onChange={(e) => e.target.value && set("dayKey", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`${ids}-start`} className="label">From</label>
              <select id={`${ids}-start`} className="field" value={form.startMin} onChange={(e) => changeStart(Number(e.target.value))}>
                {startOptions.map((m) => (
                  <option key={m} value={m}>{formatMinutes(m)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${ids}-end`} className="label">To</label>
              <select id={`${ids}-end`} className="field" value={form.endMin} onChange={(e) => set("endMin", Number(e.target.value))}>
                {endOptions.map((m) => (
                  <option key={m} value={m}>{endLabel(m)}</option>
                ))}
              </select>
            </div>
          </div>
          <Segmented
            label="Repeat"
            value={form.repeat ? "weekly" : "once"}
            onChange={(v) => set("repeat", v === "weekly")}
            options={[
              { value: "once", label: "One-off" },
              { value: "weekly", label: "Repeat weekly" },
            ]}
          />
          <p className="text-[17px] text-ink-faint">
            {form.repeat ? `Every ${formatDayKey(form.dayKey, "long").split(",")[0]} at this time` : formatDayKey(form.dayKey, "long")}
            {form.endMin > 1440 ? `, ending ${formatDayKey(addDays(form.dayKey, 1), "long").split(",")[0]} at ${formatMinutes(form.endMin - 1440)}.` : "."}
          </p>
        </fieldset>

        {isJoin ? (
          <fieldset className="space-y-3">
            <legend className="label">The plan</legend>
            <div>
              <div className="label">Icons</div>
              <EmojiPicker value={form.emoji} onChange={changeIcon} />
            </div>
            <div>
              <label htmlFor={`${ids}-title`} className="label">Title</label>
              <input id={`${ids}-title`} className="field" value={form.title} maxLength={80} placeholder="wheet" onChange={(e) => set("title", e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${ids}-location`} className="label">Where</label>
              <input
                id={`${ids}-location`}
                className="field"
                value={form.location}
                maxLength={200}
                placeholder="My place, 12 Elm St"
                list={`${ids}-places`}
                autoComplete="off"
                onChange={(e) => set("location", e.target.value)}
              />
              {/* Typing also suggests from the same list. */}
              <datalist id={`${ids}-places`}>
                {places.map((place) => (
                  <option key={place} value={place} />
                ))}
              </datalist>
              {/* Your own saved places, by nickname. Tapping one fills in its address. */}
              <div className="mt-2">
                <div className="label !mb-1">Saved places</div>
                <ul className="flex flex-wrap items-center gap-2">
                  {savedPlaces.map((place) => {
                    const chosen = sameText(form.location, place.address);
                    return (
                      <li key={place.id} className="max-w-full">
                        <button
                          type="button"
                          onClick={() => set("location", place.address)}
                          aria-pressed={chosen}
                          title={place.address}
                          className={`btn btn-sm tile max-w-full ${chosen ? "tile-join" : "tile-dark"}`}
                        >
                          <PixelIcon name="pin" size={11} className="shrink-0" />
                          <span className="truncate">{place.name}</span>
                        </button>
                      </li>
                    );
                  })}
                  {form.location.trim() !== "" && !savedPlaces.some((place) => sameText(form.location, place.address)) && (
                    <li>
                      <button type="button" className="btn btn-sm tile tile-dark" onClick={() => setPlacesOpen("save")}>
                        <PixelIcon name="plus" size={11} />
                        Save this place
                      </button>
                    </li>
                  )}
                  <li>
                    <button type="button" className="btn-ghost" onClick={() => setPlacesOpen("manage")}>
                      Manage
                    </button>
                  </li>
                </ul>
              </div>
              {usedPlaces.length > 0 && (
                <div className="mt-2">
                  <div className="label !mb-1">Used before</div>
                  <ul className="flex flex-wrap gap-2">
                    {usedPlaces.slice(0, 5).map((place) => (
                      <li key={place} className="max-w-full">
                        <button
                          type="button"
                          onClick={() => set("location", place)}
                          aria-pressed={sameText(form.location, place)}
                          className={`btn btn-sm tile max-w-full ${sameText(form.location, place) ? "tile-join" : "tile-dark"}`}
                        >
                          <span className="truncate">{place}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <PictureField
              id={`${ids}-picture`}
              path={form.picturePath}
              file={form.pictureFile}
              onPick={(file) => setForm((f) => ({ ...f, pictureFile: file }))}
              onRemove={() => setForm((f) => ({ ...f, pictureFile: null, picturePath: null }))}
            />
            <div>
              <label htmlFor={`${ids}-description`} className="label">Details</label>
              <textarea id={`${ids}-description`} className="field" rows={3} value={form.description} maxLength={2000} placeholder="Bring a topping!" onChange={(e) => set("description", e.target.value)} />
            </div>
            <Switch
              checked={form.rsvp}
              onChange={(rsvp) => set("rsvp", rsvp)}
              label="Ask for RSVPs"
              hint={`Guests answer "I'm in" or "Can't make it".`}
            />
          </fieldset>
        ) : (
          <div>
            <label htmlFor={`${ids}-note`} className="label">Note (optional)</label>
            <input id={`${ids}-note`} className="field" value={form.title} maxLength={80} placeholder="Down for anything" onChange={(e) => set("title", e.target.value)} />
          </div>
        )}

        <fieldset>
          <legend className="label">Shared with</legend>
          <AudiencePicker value={form.audience} onChange={(audience) => set("audience", audience)} connections={connections} groups={groups} />
        </fieldset>

        {error && (
          <p className="text-danger" role="alert">
            {error}
          </p>
        )}
      </form>
      <PlacesDialog
        open={placesOpen !== null}
        onClose={() => setPlacesOpen(null)}
        suggestedAddress={placesOpen === "save" ? form.location.trim() : undefined}
      />
    </Dialog>
  );
}
