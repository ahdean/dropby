"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { LocationField } from "@/components/places/LocationField";
import { MaraNudge } from "@/components/mara/MaraNudge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EventIcon } from "@/components/ui/EventIcon";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { Segmented, Switch } from "@/components/ui/Switch";
import { joinLocation, locationLabel, splitLocation } from "@/lib/maps";
import { describeConflict, expandBlocks, findConflict } from "@/lib/calendar/model";
import { MIN_BLOCK_MINUTES, SNAP_MINUTES } from "@/lib/constants";
import { DOOR_ICON, defaultTitleFor, isAutomaticTitle } from "@/lib/event-icon";
import { PlacesDialog } from "@/components/places/PlacesManager";
import { ActivitiesDialog } from "@/components/activities/ActivitiesManager";
import { IdeasField } from "@/components/activities/BlockIdeas";
import { IdeaPicker, OptionChip } from "@/components/activities/IdeaPicker";
import {
  IDEA_LIBRARY,
  inSeason,
  libraryIdeaNamed,
  optionFromLibrary,
  optionsFromActivities,
  partsOf,
  placeForEvent,
  placesFor,
  readIdeas,
  type BlockIdea,
  type IdeaOption,
} from "@/lib/activities";
import { useActivities } from "@/lib/data/activities";
import { draftFromBlock, isIdeasNotSetUp, isPicturesNotSetUp, useBlockActions, useMyPlaces } from "@/lib/data/blocks";
import { removeEventPictureIfUnused, useEventPictureUpload } from "@/lib/data/event-pictures";
import { useSavedPlaces } from "@/lib/data/saved-places";
import { useSession } from "@/lib/data/session";
import { shiftSeries, type Occurrence } from "@/lib/recurrence";
import { addDays, formatDayKey, formatMinutes, minutesFromDay, utcToZoned, zonedToUtc, type DayKey } from "@/lib/time";
import type { BlockDraft, BlockType, CalendarBlock, Group, Profile } from "@/lib/types";
import { EVERYONE } from "@/lib/audience";
import { AudiencePicker, type AudienceValue } from "./AudiencePicker";
import { PictureField } from "./PictureField";
import { ChatBox, ChatList, EVERYONE as CHAT_EVERYONE, useBlockChat, type ChatTarget } from "@/components/event/Chat";
import { AvatarStack } from "@/components/ui/Avatar";
import type { DayRange } from "./useBlockGestures";

export type EditorState =
  | {
      mode: "create";
      range: DayRange;
      preset?: { type?: BlockType; emoji?: string; title?: string; location?: string; audience?: AudienceValue; ideas?: BlockIdea[] };
    }
  | {
      mode: "edit";
      block: CalendarBlock;
      occurrence: Occurrence;
      /** Start the chat's message box on a private message to this person. */
      chatTo?: string | null;
      /** Scroll down to the chat when opening (from a chat notification). */
      focusChat?: boolean;
    };

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
  /** Ideas of what to do (Free time only). */
  ideas: BlockIdea[];
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
      location: state.preset?.location ?? "",
      description: "",
      picturePath: null,
      pictureFile: null,
      rsvp: true,
      audience: state.preset?.audience ?? EVERYONE,
      ideas: state.preset?.ideas ?? [],
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
    ideas: readIdeas(block.ideas),
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
  onSaved: (result: { blockId: string; occurrence: number; invite: boolean; type: BlockType }) => void;
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
  const { activities } = useActivities();
  const [placesOpen, setPlacesOpen] = useState<"save" | "manage" | null>(null);
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const { toast, toastError, choose } = useFeedback();
  const ids = useId();

  const [form, setForm] = useState<Form>(() => initialForm(state, zone));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  /**
   * A saved place: its address (and map pin, if it has one) goes into "Where".
   * A place saved as only a map pin has no words to show, so its name does.
   */
  const choosePlace = (place: { name: string; address: string }) => {
    const { label, link } = splitLocation(place.address);
    set("location", label ? place.address : joinLocation(place.name, link));
  };
  /** Is this saved place the one in "Where" (same words, or the same pin)? */
  const isChosen = (place: { address: string }) => {
    const chosen = splitLocation(form.location);
    const saved = splitLocation(place.address);
    return sameText(form.location, place.address) || (saved.link !== null && saved.link === chosen.link);
  };

  const editing = state.mode === "edit" ? state : null;
  const isJoin = form.type === "join";

  /** A title that was filled in for you (empty, the usual one, or an activity's name), so a new pick may replace it. */
  const filledIn = (title: string) =>
    isAutomaticTitle(title) || Boolean(libraryIdeaNamed(title)) || activities.some((a) => sameText(a.name, title));
  /**
   * An activity picked as the plan: the event gets its icon, and its name as
   * the title (unless you typed your own), and for a pair its place. Tapping
   * the chosen one again takes it off: back to the open door.
   */
  const [picked, setPicked] = useState<IdeaOption | "none" | null>(null);
  const choosePlan = (option: IdeaOption, toggle = true) => {
    if (toggle && option.key === planKey) {
      setPicked("none");
      setForm((f) => ({
        ...f,
        emoji: DOOR_ICON,
        title: sameText(f.title, option.title) ? defaultTitleFor(DOOR_ICON) : f.title,
        location: option.place && sameText(f.location, placeForEvent(option.place)) ? "" : f.location,
      }));
      return;
    }
    setPicked(option);
    setForm((f) => ({
      ...f,
      emoji: option.emoji || DOOR_ICON,
      title: filledIn(f.title) ? option.title : f.title,
      location: option.place ? placeForEvent(option.place) : f.location,
    }));
  };
  const isPlan = (option: IdeaOption) =>
    sameText(form.title, option.title) && (!option.place || isChosen({ address: option.place.address }));
  // Your activities and pairs; until you have some, ideas that suit the time of day.
  const yourOptions = optionsFromActivities(activities, savedPlaces);
  const timeParts = partsOf(form.startMin, form.endMin);
  const suggestedOptions =
    yourOptions.length > 0
      ? yourOptions
      : IDEA_LIBRARY.filter((item) => inSeason(item, form.dayKey) && item.times.some((t) => timeParts.includes(t)))
          .slice(0, 6)
          .map(optionFromLibrary);
  // The one chosen: the one just picked; otherwise the one named in the title
  // (a pair, listed before its activity, when its place is the one in "Where").
  const planKey = picked === "none" ? undefined : picked ? picked.key : suggestedOptions.find(isPlan)?.key;
  // One picked from the full list shows in the row too.
  const planOptions =
    picked && picked !== "none" && !suggestedOptions.some((o) => o.key === picked.key) ? [picked, ...suggestedOptions] : suggestedOptions;
  // With an idea from the list as the plan, saved places of the sort it usually happens in come first (Brunch: restaurants, cafés).
  const planKinds = libraryIdeaNamed(form.title)?.kinds ?? [];
  const orderedPlaces = planKinds.length > 0 ? (({ suited, others }) => [...suited, ...others])(placesFor(planKinds, savedPlaces)) : savedPlaces;

  /** Free time → an event, with one of its ideas as the plan. */
  const makePlan = (idea: BlockIdea) =>
    setForm((f) => ({
      ...f,
      type: "join",
      emoji: idea.emoji?.trim() || f.emoji || DOOR_ICON,
      title: idea.title,
      location: idea.place ?? f.location,
    }));
  const originalIdeas = JSON.stringify(editing ? readIdeas(editing.block.ideas) : []);

  // Any time of day, not only the hours the week grid draws; the end may be on the next day.
  const startOptions = useMemo(() => timeOptions(0, 1440 - SNAP_MINUTES, form.startMin), [form.startMin]);
  const endOptions = useMemo(
    () => timeOptions(form.startMin + MIN_BLOCK_MINUTES, form.startMin + MAX_BLOCK_MINUTES, form.endMin),
    [form.startMin, form.endMin],
  );

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

  /** Where a block was, on its first day and the next one (for a block running past midnight). */
  const wasAt = (startIso: string, endIso: string) => {
    const start = utcToZoned(startIso, zone);
    const end = utcToZoned(endIso, zone);
    const endMin = start.dayKey === end.dayKey ? end.minutes : end.minutes + 1440;
    return [
      { dayKey: start.dayKey, startMin: start.minutes, endMin: Math.min(endMin, 1440) },
      { dayKey: addDays(start.dayKey, 1), startMin: 0, endMin: Math.max(0, endMin - 1440) },
    ] as const;
  };

  const validate = (f: Form): string | null => {
    if (f.endMin <= f.startMin) return "The end time must be after the start time.";
    if (f.endMin - f.startMin > MAX_BLOCK_MINUTES) return "A block can be at most 24 hours long.";
    // This day, and the next one for a block that runs past midnight.
    const mine = expandBlocks(blocks.filter((b) => b.owner_id === userId), userId, zone, f.dayKey, 2);
    // Where it was before this edit (Free time that already covered one of your events may keep doing so).
    const was = editing && editing.block.type === f.type ? wasAt(editing.occurrence.startIso, editing.occurrence.endIso) : undefined;
    const conflict =
      findConflict({ dayKey: f.dayKey, type: f.type, startMin: f.startMin, endMin: f.endMin }, mine, editing?.block.id, was?.[0]) ??
      (f.endMin > 1440
        ? findConflict(
            { dayKey: addDays(f.dayKey, 1), type: f.type, startMin: 0, endMin: f.endMin - 1440 },
            mine,
            editing?.block.id,
            was?.[1],
          )
        : undefined);
    if (conflict) {
      return `${formatDayKey(conflict.dayKey)}: ${describeConflict(f.type, conflict)}`;
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
    // The icon comes from the activity picked; without one, wheet's open door.
    emoji: f.emoji.trim() || DOOR_ICON,
    location: f.location,
    description: f.description,
    rsvp_enabled: f.rsvp,
    audience: f.audience.audience,
    shared_user_ids: f.audience.userIds,
    shared_group_ids: f.audience.groupIds,
    // Only sent when they changed, so this works before the ideas column exists.
    ideas: f.type === "free" && JSON.stringify(f.ideas) !== originalIdeas ? f.ideas : undefined,
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
      onSaved({ blockId, occurrence, invite, type: form.type });
    } catch (failure) {
      toastError(
        isPicturesNotSetUp(failure)
          ? "Event pictures are not switched on yet: the newest database file has to be run in Supabase (see README)."
          : isIdeasNotSetUp(failure)
            ? "Ideas are not switched on yet: the newest database file has to be run in Supabase (see README)."
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

  const footer = (
    <>
      {editing && (
        <Button variant="danger" icon="trash" onClick={remove} disabled={busy} className="mr-auto">
          Delete
        </Button>
      )}
      {/* a mara pops up behind it after a few seconds, to point it out */}
      <MaraNudge
        message={
          <>
            Psst!
            <br />
            Invite friends
          </>
        }
      >
        <Button variant="dark" icon="send" onClick={() => save(true)} disabled={busy}>
          {editing ? "Save & invite by text" : "Save & invite"}
        </Button>
      </MaraNudge>
      <Button type="submit" form={`${ids}-form`} variant={isJoin ? "join" : "free"} icon="check" busy={busy}>
        Save
      </Button>
    </>
  );

  const details = (
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

        {/* second: what it's called */}
        {isJoin ? (
          <div>
            <label htmlFor={`${ids}-title`} className="label">Title</label>
            <div className="flex items-stretch gap-2">
              {/* the event's icon, as friends will see it (it comes from the activity, further down) */}
              <span className="tile flex w-12 shrink-0 items-center justify-center" title="The icon comes from the activity you pick">
                <EventIcon value={form.emoji || DOOR_ICON} size={22} max={2} />
              </span>
              <input id={`${ids}-title`} className="field min-w-0 flex-1" value={form.title} maxLength={80} placeholder="wheet" onChange={(e) => set("title", e.target.value)} />
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor={`${ids}-note`} className="label">Note (optional)</label>
            <input id={`${ids}-note`} className="field" value={form.title} maxLength={80} placeholder="Down for anything" onChange={(e) => set("title", e.target.value)} />
          </div>
        )}

        {/* when: the day, from, to and "Weekly" on one line (on a phone: the day and Weekly, then the times) */}
        <fieldset>
          <legend className="label">When</legend>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${ids}-day`} className="sr-only">Date</label>
            <input
              id={`${ids}-day`}
              type="date"
              className="field order-1 w-auto min-w-0 flex-1 !text-[20px] sm:w-[9.75rem] sm:flex-none"
              value={form.dayKey}
              min={minDay}
              max={maxDay}
              required
              onChange={(e) => e.target.value && set("dayKey", e.target.value)}
            />
            <span className="order-3 flex min-w-0 basis-full items-center gap-1 sm:order-2 sm:basis-auto">
              <label htmlFor={`${ids}-start`} className="sr-only">From</label>
              <select id={`${ids}-start`} className="field w-auto min-w-0 flex-1 !px-2 !text-[20px] sm:w-[6rem] sm:flex-none" value={form.startMin} onChange={(e) => changeStart(Number(e.target.value))}>
                {startOptions.map((m) => (
                  <option key={m} value={m}>{formatMinutes(m)}</option>
                ))}
              </select>
              <span className="text-ink-dim" aria-hidden="true">–</span>
              <label htmlFor={`${ids}-end`} className="sr-only">To</label>
              <select id={`${ids}-end`} className="field w-auto min-w-0 flex-1 !px-2 !text-[20px] sm:w-[6rem] sm:flex-none" value={form.endMin} onChange={(e) => set("endMin", Number(e.target.value))}>
                {endOptions.map((m) => (
                  <option key={m} value={m}>{endLabel(m)}</option>
                ))}
              </select>
            </span>
            <button
              type="button"
              role="checkbox"
              aria-checked={form.repeat}
              onClick={() => set("repeat", !form.repeat)}
              title={form.repeat ? `Every ${formatDayKey(form.dayKey, "long").split(",")[0]} at this time` : "Repeat every week at this time"}
              className="order-2 flex shrink-0 items-center gap-2 py-1 pr-1 text-ink sm:order-3"
            >
              <span className={`tile flex h-8 w-8 shrink-0 items-center justify-center ${form.repeat ? "tile-join" : "tile-dark"}`} aria-hidden="true">
                {form.repeat && <PixelIcon name="check" size={14} />}
              </span>
              Weekly
            </button>
          </div>
        </fieldset>

        {isJoin ? (
          <>
            <div>
              <label htmlFor={`${ids}-location`} className="label">Where</label>
              <LocationField id={`${ids}-location`} value={form.location} onChange={(location) => set("location", location)} list={`${ids}-places`} />
              {/* Typing also suggests from the same list. */}
              <datalist id={`${ids}-places`}>
                {places.map((place) => (
                  <option key={place} value={place} label={locationLabel(place)} />
                ))}
              </datalist>
              {/* Your own saved places, by nickname. Tapping one fills in its address. */}
              <div className="mt-2">
                <div className="label !mb-1">Saved places</div>
                <ul className="flex flex-wrap items-center gap-2">
                  {orderedPlaces.map((place) => {
                    const chosen = isChosen(place);
                    return (
                      <li key={place.id} className="max-w-full">
                        <button
                          type="button"
                          onClick={() => choosePlace(place)}
                          aria-pressed={chosen}
                          title={locationLabel(place.address) || place.name}
                          className={`btn btn-sm tile max-w-full ${chosen ? "tile-join" : "tile-dark"}`}
                        >
                          <PixelIcon name="pin" size={11} className="shrink-0" />
                          <span className="truncate">{place.name}</span>
                        </button>
                      </li>
                    );
                  })}
                  {form.location.trim() !== "" && !savedPlaces.some(isChosen) && (
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
            {/* After the details: one tap gives the event an activity's icon and name (and the place, for a pair). */}
            <div>
              <div className="label">Activity</div>
              <ul className="flex flex-wrap items-center gap-2">
                {planOptions.map((option) => (
                  <li key={option.key} className="max-w-full">
                    <OptionChip option={option} onPick={choosePlan} pressed={option.key === planKey} />
                  </li>
                ))}
                <li>
                  <button type="button" className="btn btn-sm tile tile-dark" onClick={() => setPlanPickerOpen(true)}>
                    <PixelIcon name="bulb" size={11} />
                    More ideas
                  </button>
                </li>
                <li>
                  <button type="button" className="btn-ghost" onClick={() => setActivitiesOpen(true)}>
                    Manage
                  </button>
                </li>
              </ul>
            </div>
            <Switch
              checked={form.rsvp}
              onChange={(rsvp) => set("rsvp", rsvp)}
              label="Ask for RSVPs"
              hint={`Guests answer "I'm in" or "Can't make it".`}
            />
          </>
        ) : (
          <div>
            <div className="label flex items-center gap-2">
              <PixelIcon name="bulb" size={12} />
              Ideas
            </div>
            <IdeasField
              ideas={form.ideas}
              onChange={(next) => set("ideas", next)}
              block={editing?.block ?? null}
              occurrence={editing?.occurrence.index ?? 0}
              dayKey={form.dayKey}
              startMin={form.startMin}
              endMin={form.endMin}
              onMakePlan={makePlan}
            />
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
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? "Edit block" : "New block"}
      footer={footer}
    >
      {details}
      {/* The block's chat, at the bottom (outside the form: it has its own message box). */}
      {editing && (
        <EditorChat block={editing.block} occurrence={editing.occurrence} chatTo={editing.chatTo ?? null} focus={Boolean(editing.focusChat)} zone={zone} />
      )}
      <ActivitiesDialog open={activitiesOpen} onClose={() => setActivitiesOpen(false)} />
      {planPickerOpen && (
        <IdeaPicker
          title="Pick an activity"
          chosen={planKey ? [form.title] : []}
          isChosen={(option) => option.key === planKey || (Boolean(planKey) && isPlan(option))}
          onPick={(option) => choosePlan(isPlan(option) && planKey ? { ...option, key: planKey } : option)}
          onClose={() => setPlanPickerOpen(false)}
        />
      )}
      <PlacesDialog
        open={placesOpen !== null}
        onClose={() => setPlacesOpen(null)}
        suggestedAddress={placesOpen === "save" ? form.location.trim() : undefined}
      />
    </Dialog>
  );
}

/**
 * The bottom of the editor: for an event, who's in; then the block's chat,
 * so it can be read and answered right where the block is edited.
 */
function EditorChat({
  block,
  occurrence,
  chatTo,
  focus,
  zone,
}: {
  block: CalendarBlock;
  occurrence: Occurrence;
  chatTo: string | null;
  focus: boolean;
  zone: string;
}) {
  const chat = useBlockChat(block, occurrence.index);
  const [to, setTo] = useState<ChatTarget>(chatTo ?? CHAT_EVERYONE);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focus) section.current?.scrollIntoView({ block: "start" });
  }, [focus]);

  const answers = block.rsvps.filter((r) => r.occurrence === occurrence.index);
  const going = answers.filter((r) => r.status === "in").map((r) => chat.people.get(r.user_id));
  const notGoing = answers.filter((r) => r.status === "out").length;

  return (
    <section ref={section} aria-label="Chat" className="mt-5 space-y-3 border-t-2 border-black pt-4">
      {block.type === "join" && block.rsvp_enabled && (
        <div className="flex flex-wrap items-center gap-2 text-[18px] text-ink-dim">
          <span className="label !mb-0">Who&apos;s in</span>
          {going.length === 0 ? (
            <span>Nobody yet.</span>
          ) : (
            <>
              <AvatarStack people={going} size={24} max={6} />
              <span title={going.map((p) => p?.name ?? "Someone").join(", ")}>
                {going.length} in{notGoing > 0 ? ` · ${notGoing} can't` : ""}
              </span>
            </>
          )}
        </div>
      )}
      <div className="label !mb-0">Chat</div>
      <ChatList chat={chat} block={block} zone={zone} />
      <ChatBox chat={chat} block={block} to={to} onTo={setTo} autoFocus={focus} />
    </section>
  );
}
