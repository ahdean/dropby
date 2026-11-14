"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BlockEditor, type EditorState } from "@/components/calendar/BlockEditor";
import { InviteDialog } from "@/components/calendar/InviteDialog";
import { Avatar } from "@/components/ui/Avatar";
import { Button, IconButton } from "@/components/ui/Button";
import { EventIcon } from "@/components/ui/EventIcon";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { statusOf } from "@/lib/calendar/model";
import { useBlock, useBlockActions, useCalendarBlocks } from "@/lib/data/blocks";
import { useBlockPeople } from "@/lib/data/events";
import { useProfiles } from "@/lib/data/profiles";
import { useSession } from "@/lib/data/session";
import { useConnections, useGroups } from "@/lib/data/social";
import { eventPath } from "@/lib/navigation";
import { nextOccurrence, occurrenceAt, occurrenceExists } from "@/lib/recurrence";
import { addDays, formatRange, utcToZoned, weekdayName, zoneAbbreviation } from "@/lib/time";
import type { Profile, RsvpStatus } from "@/lib/types";
import { useZone } from "@/lib/zone";
import { Chat } from "./Chat";

function PersonChip({ person, note }: { person: Profile | undefined; note?: string }) {
  return (
    <li className="flex items-center gap-2 border-2 border-line bg-panel-2 py-1 pl-1 pr-3">
      <Avatar person={person} size={26} />
      <span className="truncate">{person?.name ?? "Someone"}</span>
      {note && <span className="text-[16px] text-ink-faint">{note}</span>}
    </li>
  );
}

function Unavailable() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <span className="text-[56px] leading-none" aria-hidden="true">🚪</span>
      <h1 className="text-[13px] text-ink">This event isn&apos;t available</h1>
      <p className="text-ink-dim">It may have been deleted, or it is no longer shared with you.</p>
      <Link href="/" className="btn tile tile-free">Back to calendar</Link>
    </main>
  );
}

/**
 * The page for one hosted event, in the spirit of a party invite: what, when,
 * where, who is hosting, who is in, and a chat.
 */
export function EventScreen() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { userId } = useSession();
  const zone = useZone();
  const { toast, toastError, confirm } = useFeedback();
  const actions = useBlockActions();

  const { data: block, isLoading } = useBlock(id);
  const { data: people = [] } = useBlockPeople(id);
  const { byId: profiles } = useProfiles();
  const { blocks, window: calendar } = useCalendarBlocks(zone);
  const { connectionIds } = useConnections();
  const { groups } = useGroups();

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [saving, setSaving] = useState<RsvpStatus | "clear" | null>(null);

  // Names for everyone involved: the event's own people list first, then anyone else the viewer knows.
  const names = useMemo(() => {
    const map = new Map<string, Profile>(profiles);
    for (const person of people) map.set(person.id, person);
    return map;
  }, [people, profiles]);

  // Which week of a weekly repeat is shown: the one in the link, else the next one coming up.
  const requested = Number(searchParams.get("o"));
  const occurrence = useMemo(() => {
    if (!block) return null;
    if (searchParams.has("o") && occurrenceExists(block, requested)) return occurrenceAt(block, requested);
    return nextOccurrence(block);
  }, [block, requested, searchParams]);

  // Free time has no event page: show it on the calendar instead.
  useEffect(() => {
    if (block && block.type === "free" && occurrence) {
      router.replace(`/?day=${utcToZoned(occurrence.startIso, zone).dayKey}`);
    }
  }, [block, occurrence, router, zone]);

  if (isLoading && !block) {
    return (
      <main className="flex flex-1 items-center justify-center p-10" role="status">
        <span className="animate-blink font-display text-[11px] text-ink-dim">Loading…</span>
      </main>
    );
  }
  if (!block || !occurrence) return <Unavailable />;
  if (block.type === "free") return null;

  const isHost = block.owner_id === userId;
  const host = names.get(block.owner_id);
  const { status, inCount } = statusOf(block, occurrence.index, userId);
  const answers = block.rsvps.filter((r) => r.occurrence === occurrence.index);
  const going = answers.filter((r) => r.status === "in");
  const notGoing = answers.filter((r) => r.status === "out");
  const myAnswer = answers.find((r) => r.user_id === userId)?.status ?? null;
  const locked = status === "locked" || (isHost && inCount > 0);

  const invited = people.filter((p) => !p.is_host && (p.shared_directly || p.via_groups.length > 0));
  const groupNames = [...new Set(people.flatMap((p) => p.via_groups))];
  const connections = connectionIds
    .map((cid) => profiles.get(cid))
    .filter((p): p is Profile => Boolean(p))
    .sort((a, b) => a.name.localeCompare(b.name));

  const answer = async (next: RsvpStatus) => {
    const value = myAnswer === next ? null : next; // tapping your answer again clears it
    setSaving(value ?? "clear");
    try {
      await actions.setRsvp(block, occurrence.index, value);
      if (value === "in") toast("You're in! It's locked in.", "success");
    } catch (error) {
      toastError(error, "Could not save your answer.");
    } finally {
      setSaving(null);
    }
  };

  const leave = async () => {
    const ok = await confirm({
      title: "Remove this from your calendar?",
      body: `${host?.name ?? "The host"} won't be notified. You can be invited again later.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await actions.leave(block);
      router.push("/");
    } catch (error) {
      toastError(error);
    }
  };

  const stepWeek = (delta: number) => {
    let index = occurrence.index + delta;
    // Skip weeks that were deleted individually.
    while (index >= 0 && !occurrenceExists(block, index) && (block.repeat_count === null || index < block.repeat_count)) index += delta;
    if (occurrenceExists(block, index)) router.replace(eventPath(block.id, index), { scroll: false });
  };
  const hasPrevious = block.repeat_weekly && occurrence.index > 0;
  const hasNext = block.repeat_weekly && (block.repeat_count === null || occurrence.index < block.repeat_count - 1);

  const when = formatRange(occurrence.startIso, occurrence.endIso, zone, "long");
  const mapsUrl = block.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(block.location)}` : null;
  const directlyShared = block.shared_user_ids.includes(userId);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-3 py-4 sm:px-5 sm:py-6">
      <Link href={`/?day=${utcToZoned(occurrence.startIso, zone).dayKey}`} className="btn-ghost">
        <PixelIcon name="left" size={12} />
        Calendar
      </Link>

      {/* the invite card */}
      <article className={`panel overflow-hidden ${locked ? "!border-locked" : "!border-join"}`}>
        <div className="relative h-3" aria-hidden="true">
          <span className={`beam ${locked ? "beam-locked" : "beam-join"} inset-0`} />
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <span className="tile flex h-20 w-20 shrink-0 items-center justify-center text-[48px] leading-none sm:h-24 sm:w-24 sm:text-[58px]" aria-hidden="true">
              <EventIcon value={block.emoji} size={52} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={`mb-2 inline-flex items-center gap-2 font-display text-[9px] uppercase ${locked ? "text-locked" : "text-join"}`}>
                {locked && <PixelIcon name="lock" size={11} />}
                {locked ? "Locked in" : "Join me"}
              </p>
              <h1 className="break-words text-[15px] leading-relaxed text-ink sm:text-[18px]">
                {block.title || "Join me"}
              </h1>
            </div>
          </div>

          <dl className="space-y-3">
            <div className="flex items-start gap-3">
              <dt className="mt-1 text-join"><PixelIcon name="clock" size={16} title="When" /></dt>
              <dd className="min-w-0">
                <div className="text-[22px] leading-tight text-ink">{when}</div>
                <div className="text-[17px] text-ink-faint">
                  {zoneAbbreviation(occurrence.startIso, zone)} · shown in your time zone
                </div>
                {block.repeat_weekly && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-ink-dim">
                    <PixelIcon name="repeat" size={12} />
                    Every {weekdayName(occurrence.startIso, zone)}
                    <span className="ml-1 inline-flex gap-1">
                      <IconButton icon="left" label="Previous week" onClick={() => stepWeek(-1)} disabled={!hasPrevious} className="!min-h-[30px] !w-8" size={11} />
                      <IconButton icon="right" label="Next week" onClick={() => stepWeek(1)} disabled={!hasNext} className="!min-h-[30px] !w-8" size={11} />
                    </span>
                  </div>
                )}
              </dd>
            </div>

            {block.location && (
              <div className="flex items-start gap-3">
                <dt className="mt-1 text-join"><PixelIcon name="pin" size={16} title="Where" /></dt>
                <dd className="min-w-0 break-words">
                  <a href={mapsUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="link">
                    {block.location}
                  </a>
                </dd>
              </div>
            )}

            <div className="flex items-center gap-3">
              <dt className="text-join"><PixelIcon name="star" size={16} title="Host" /></dt>
              <dd className="flex items-center gap-2">
                <Avatar person={host} size={28} />
                <span>{isHost ? "You're hosting" : `Hosted by ${host?.name ?? "a friend"}`}</span>
              </dd>
            </div>
          </dl>

          {block.description && <p className="slot whitespace-pre-wrap break-words px-3 py-2 text-ink">{block.description}</p>}

          {isHost && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="stone" icon="edit" onClick={() => setEditor({ mode: "edit", block, occurrence })}>
                Edit
              </Button>
              <Button variant="join" icon="send" onClick={() => setInviteOpen(true)}>
                Invite by text
              </Button>
            </div>
          )}
        </div>
      </article>

      {/* RSVP */}
      <section aria-labelledby="rsvp-heading" className="panel p-4">
        <h2 id="rsvp-heading" className="mb-3 text-[11px] text-ink">
          {isHost ? "Who's coming" : "Are you in?"}
        </h2>

        {!block.rsvp_enabled ? (
          <p className="text-ink-dim">No RSVP needed. Just drop by.</p>
        ) : (
          <>
            {!isHost && (
              <div className="mb-4 grid grid-cols-2 gap-3" role="group" aria-label="Your answer">
                <Button
                  variant={myAnswer === "in" ? "locked" : "dark"}
                  icon="check"
                  aria-pressed={myAnswer === "in"}
                  busy={saving === "in"}
                  onClick={() => answer("in")}
                  className="!min-h-[56px]"
                >
                  I&apos;m in
                </Button>
                <Button
                  variant={myAnswer === "out" ? "stone" : "dark"}
                  icon="x"
                  aria-pressed={myAnswer === "out"}
                  busy={saving === "out"}
                  onClick={() => answer("out")}
                  className="!min-h-[56px]"
                >
                  Can&apos;t make it
                </Button>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <div className="label !text-locked">In ({going.length})</div>
                {going.length === 0 ? (
                  <p className="text-ink-dim">{isHost ? "Nobody yet. Friends will see this on their calendar." : "Be the first!"}</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {going.map((r) => (
                      <PersonChip key={r.user_id} person={names.get(r.user_id)} note={r.user_id === userId ? "(you)" : undefined} />
                    ))}
                  </ul>
                )}
              </div>
              {notGoing.length > 0 && (
                <div>
                  <div className="label">Can&apos;t make it ({notGoing.length})</div>
                  <ul className="flex flex-wrap gap-2 opacity-70">
                    {notGoing.map((r) => (
                      <PersonChip key={r.user_id} person={names.get(r.user_id)} note={r.user_id === userId ? "(you)" : undefined} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* audience */}
      <section aria-labelledby="shared-heading" className="panel p-4">
        <h2 id="shared-heading" className="mb-3 text-[11px] text-ink">Shared with</h2>
        <ul className="flex flex-wrap gap-2">
          {block.audience === "all_connections" && (
            <li className="flex items-center gap-2 border-2 border-line bg-panel-2 px-3 py-1">
              <PixelIcon name="users" size={14} />
              {isHost ? `All your connections (${connectionIds.length})` : `All of ${host?.name ?? "the host"}'s connections`}
            </li>
          )}
          {groupNames.map((name) => (
            <li key={name} className="flex items-center gap-2 border-2 border-join/60 bg-panel-2 px-3 py-1">
              <PixelIcon name="users" size={14} className="text-join" />
              {name}
            </li>
          ))}
          {invited.map((person) => (
            <PersonChip key={person.id} person={person} note={person.id === userId ? "(you)" : undefined} />
          ))}
        </ul>
        {block.audience === "custom" && invited.length === 0 && (
          <p className="text-ink-dim">Nobody yet. {isHost ? "Edit the event to pick people, or invite someone by text." : ""}</p>
        )}
        {!isHost && directlyShared && (
          <button type="button" className="btn-ghost mt-3" onClick={leave}>
            Remove this from my calendar
          </button>
        )}
      </section>

      <Chat blockId={block.id} userId={userId} hostId={block.owner_id} people={names} zone={zone} />

      {isHost && (
        <>
          <BlockEditor
            state={editor}
            zone={zone}
            blocks={blocks}
            connections={connections}
            groups={groups}
            minDay={calendar.firstDay}
            maxDay={addDays(calendar.endDay, -1)}
            onClose={() => {
              setEditor(null);
              // The editor can delete the event; if it is gone, leave the page.
              void actions.refresh(block.id);
            }}
            onSaved={({ blockId, occurrence: savedIndex, invite }) => {
              setEditor(null);
              if (blockId !== block.id || savedIndex !== occurrence.index) router.replace(eventPath(blockId, savedIndex));
              if (invite) setInviteOpen(true);
            }}
          />
          <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} block={block} occurrence={occurrence.index} />
        </>
      )}
    </main>
  );
}
