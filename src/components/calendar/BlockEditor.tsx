"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { useFeedback } from "@/components/ui/Feedback";
import { Segmented, Switch } from "@/components/ui/Switch";
import { expandBlocks, findSameTypeConflict } from "@/lib/calendar/model";
import { DAY_END_MIN, DAY_START_MIN, MIN_BLOCK_MINUTES, SNAP_MINUTES } from "@/lib/constants";
import { useBlockActions } from "@/lib/data/blocks";
import { useSession } from "@/lib/data/session";
import { shiftSeries, type Occurrence } from "@/lib/recurrence";
import { formatDayKey, formatMinuteRange, formatMinutes, utcToZoned, zonedToUtc, type DayKey } from "@/lib/time";
import type { BlockDraft, BlockType, CalendarBlock, Group, Profile } from "@/lib/types";
import { AudiencePicker, type AudienceValue } from "./AudiencePicker";
import type { DayRange } from "./useBlockGestures";

export type EditorState =
  | { mode: "create"; range: DayRange; preset?: { type?: BlockType; audience?: AudienceValue } }
  | { mode: "edit"; block: CalendarBlock; occurrence: Occurrence };

interface Form {
  type: BlockType;
  dayKey: DayKey;
  startMin: number;
  endMin: number;
  repeat: boolean;
  title: string;
  emoji: string;
  location: string;
  description: string;
  rsvp: boolean;
  audience: AudienceValue;
}

const EVERYONE: AudienceValue = { audience: "all_connections", userIds: [], groupIds: [] };

function initialForm(state: EditorState, zone: string): Form {
  if (state.mode === "create") {
    return {
      type: state.preset?.type ?? "free",
      dayKey: state.range.dayKey,
      startMin: state.range.startMin,
      endMin: state.range.endMin,
      repeat: false,
      title: "",
      emoji: "",
      location: "",
      description: "",
      rsvp: true,
      audience: state.preset?.audience ?? EVERYONE,
    };
  }
  const { block, occurrence } = state;
  const start = utcToZoned(occurrence.startIso, zone);
  const end = utcToZoned(occurrence.endIso, zone);
  return {
    type: block.type,
    dayKey: start.dayKey,
    startMin: start.minutes,
    // The form edits one day; a block running past midnight is shown to the end of the day.
    endMin: end.dayKey === start.dayKey ? end.minutes : DAY_END_MIN,
    repeat: block.repeat_weekly,
    title: block.title ?? "",
    emoji: block.emoji ?? "",
    location: block.location ?? "",
    description: block.description ?? "",
    rsvp: block.rsvp_enabled,
    audience: { audience: block.audience, userIds: block.shared_user_ids, groupIds: block.shared_group_ids },
  };
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
  const { toast, toastError, confirm, choose } = useFeedback();
  const ids = useId();

  const [form, setForm] = useState<Form>(() => initialForm(state, zone));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const editing = state.mode === "edit" ? state : null;
  const isJoin = form.type === "join";

  const startOptions = useMemo(
    () => timeOptions(DAY_START_MIN, DAY_END_MIN - MIN_BLOCK_MINUTES, form.startMin),
    [form.startMin],
  );
  const endOptions = useMemo(
    () => timeOptions(form.startMin + MIN_BLOCK_MINUTES, DAY_END_MIN, form.endMin),
    [form.startMin, form.endMin],
  );

  const changeStart = (startMin: number) =>
    setForm((f) => {
      const length = Math.max(MIN_BLOCK_MINUTES, f.endMin - f.startMin);
      return { ...f, startMin, endMin: Math.min(DAY_END_MIN, startMin + length) };
    });

  const validate = (f: Form): string | null => {
    if (f.endMin <= f.startMin) return "The end time must be after the start time.";
    if (f.type === "join" && f.emoji.trim() === "") return "Pick an emoji for your event: it's what friends see on their calendar.";
    const mine = expandBlocks(blocks.filter((b) => b.owner_id === userId), userId, zone, f.dayKey, 1);
    const conflict = findSameTypeConflict(
      { dayKey: f.dayKey, type: f.type, startMin: f.startMin, endMin: f.endMin },
      mine,
      editing?.block.id,
    );
    if (conflict) {
      return `That overlaps your other ${f.type === "free" ? "Free" : "Join me"} block (${formatMinuteRange(conflict.startMin, conflict.endMin)}). Move one of them, or stretch the existing one instead.`;
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

    const draft = toDraft(form);
    setBusy(true);
    try {
      let blockId: string;
      let occurrence = 0;

      if (state.mode === "create") {
        blockId = await actions.create(draft);
      } else if (!state.block.repeat_weekly || !form.repeat) {
        // A one-off block, or a weekly one being turned into a one-off.
        await actions.update(state.block, draft);
        blockId = state.block.id;
      } else {
        const scope = await choose({
          title: "This repeats weekly",
          body: "Apply your changes to just this one, or to every week?",
          choices: [
            { value: "one", label: "Just this one", variant: "stone" },
            { value: "all", label: "Every week", variant: "free" },
          ],
        });
        if (!scope) return;
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
      onSaved({ blockId, occurrence, invite });
    } catch (failure) {
      toastError(failure, "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    const { block, occurrence } = editing;
    try {
      if (!block.repeat_weekly) {
        const ok = await confirm({
          title: "Delete this block?",
          body: block.type === "join" ? "Its RSVPs and chat go with it." : undefined,
          confirmLabel: "Delete",
          danger: true,
        });
        if (!ok) return;
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
        else await actions.remove(block);
      }
      toast("Deleted");
      onClose();
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
            onChange={(type) => set("type", type)}
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
                  <option key={m} value={m}>{formatMinutes(m)}</option>
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
            {form.repeat ? `Every ${formatDayKey(form.dayKey, "long").split(",")[0]} at this time.` : formatDayKey(form.dayKey, "long")}
          </p>
        </fieldset>

        {isJoin ? (
          <fieldset className="space-y-3">
            <legend className="label">The plan</legend>
            <div>
              <div className="label">Emoji (required)</div>
              <EmojiPicker value={form.emoji} onChange={(emoji) => set("emoji", emoji)} />
            </div>
            <div>
              <label htmlFor={`${ids}-title`} className="label">Title</label>
              <input id={`${ids}-title`} className="field" value={form.title} maxLength={80} placeholder="Pizza night" onChange={(e) => set("title", e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${ids}-location`} className="label">Where</label>
              <input id={`${ids}-location`} className="field" value={form.location} maxLength={200} placeholder="My place, 12 Elm St" onChange={(e) => set("location", e.target.value)} />
            </div>
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
    </Dialog>
  );
}
