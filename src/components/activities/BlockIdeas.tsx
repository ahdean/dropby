"use client";

import { useState } from "react";
import { IdeaPicker, OptionChip } from "./IdeaPicker";
import { AvatarStack } from "@/components/ui/Avatar";
import { Button, IconButton } from "@/components/ui/Button";
import { EventIcon } from "@/components/ui/EventIcon";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import {
  IDEA_LIBRARY,
  MAX_IDEAS,
  ideaFromOption,
  inSeason,
  optionFromLibrary,
  optionsFromActivities,
  partsOf,
  readIdeas,
  sameIdea,
  type BlockIdea,
  type IdeaOption,
} from "@/lib/activities";
import { useActivities, useIdeaVoteActions, useIdeaVotes } from "@/lib/data/activities";
import { useProfiles } from "@/lib/data/profiles";
import { useSavedPlaces } from "@/lib/data/saved-places";
import { useSession } from "@/lib/data/session";
import { locationLabel } from "@/lib/maps";
import type { DayKey } from "@/lib/time";
import type { CalendarBlock, IdeaVote, Profile } from "@/lib/types";

/** Where an idea happens, in a few words: the place's name, or the kind of place. */
export function ideaWhere(idea: Pick<BlockIdea, "kind" | "place">): string {
  return idea.place ? locationLabel(idea.place) : (idea.kind ?? "");
}

/** Who picked one idea. */
function pickers(votes: readonly IdeaVote[], ideaId: string, people: Map<string, Profile>): (Profile | undefined)[] {
  return votes.filter((v) => v.idea_id === ideaId).map((v) => people.get(v.user_id));
}

function names(people: (Profile | undefined)[]): string {
  return people.map((p) => p?.name?.split(" ")[0] ?? "Someone").join(", ");
}

/** The ideas with the most picks first (ties keep their order). */
function byPicks(ideas: readonly BlockIdea[], votes: readonly IdeaVote[]): BlockIdea[] {
  const count = (idea: BlockIdea) => votes.filter((v) => v.idea_id === idea.id).length;
  return ideas
    .map((idea, index) => ({ idea, index, picks: count(idea) }))
    .sort((a, b) => b.picks - a.picks || a.index - b.index)
    .map(({ idea }) => idea);
}

/**
 * In the editor, for Free time: ideas of what to do (at most six). Add one in
 * a tap from your activities (or, until you have some, ideas that suit the
 * time), or choose from all of them. Once friends have picked, their faces
 * show by each idea, and "Make it the plan" turns the block into an event.
 */
export function IdeasField({
  ideas,
  onChange,
  block,
  occurrence,
  dayKey,
  startMin,
  endMin,
  onMakePlan,
}: {
  ideas: BlockIdea[];
  onChange: (ideas: BlockIdea[]) => void;
  /** The block being edited (to show who picked what), or null when creating one. */
  block: CalendarBlock | null;
  occurrence: number;
  dayKey: DayKey;
  startMin: number;
  endMin: number;
  onMakePlan: (idea: BlockIdea) => void;
}) {
  const { activities } = useActivities();
  const { places } = useSavedPlaces();
  const { byId: people } = useProfiles();
  // Picks are only looked up for a saved block that already had ideas.
  const { votes } = useIdeaVotes(block?.id ?? "", occurrence, Boolean(block) && readIdeas(block?.ideas).length > 0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const full = ideas.length >= MAX_IDEAS;

  const add = (option: IdeaOption) => {
    if (full) return;
    const idea = ideaFromOption(option);
    if (ideas.some((existing) => sameIdea(existing, idea))) return;
    onChange([...ideas, idea]);
  };
  const remove = (idea: BlockIdea) => onChange(ideas.filter((i) => i.id !== idea.id));

  // One-tap ideas: your own, or (until you have some) ones that suit this time of day.
  const parts = partsOf(startMin, endMin);
  const yours = optionsFromActivities(activities, places);
  const quick = (
    yours.length > 0
      ? yours
      : IDEA_LIBRARY.filter((item) => inSeason(item, dayKey) && item.times.some((t) => parts.includes(t)))
          .slice(0, 6)
          .map(optionFromLibrary)
  ).filter((option) => !ideas.some((idea) => sameIdea(idea, { title: option.title, place: option.place?.address ?? null })));

  return (
    <div className="space-y-2">
      {ideas.length > 0 && (
        <ul className="slot divide-y-2 divide-black">
          {byPicks(ideas, votes).map((idea) => {
            const who = pickers(votes, idea.id, people);
            const where = ideaWhere(idea);
            return (
              <li key={idea.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="flex w-6 shrink-0 justify-center">
                  {idea.emoji ? <EventIcon value={idea.emoji} size={18} max={1} /> : <PixelIcon name="bulb" size={13} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{idea.title}</span>
                  {(where || who.length > 0) && (
                    <span className="block truncate text-[16px] text-ink-faint">
                      {where}
                      {who.length > 0 && (
                        <span className="text-locked">
                          {where ? " · " : ""}
                          {names(who)} {who.length === 1 ? "is" : "are"} up for it
                        </span>
                      )}
                    </span>
                  )}
                </span>
                {who.length > 0 && <AvatarStack people={who} size={20} max={4} />}
                <Button size="sm" variant={who.length > 0 ? "join" : "dark"} onClick={() => onMakePlan(idea)} title="Turn this Free time into an event with this plan">
                  <span className="sm:hidden">Plan it</span>
                  <span className="hidden sm:inline">Make it the plan</span>
                </Button>
                <IconButton icon="x" label={`Take off "${idea.title}"`} onClick={() => remove(idea)} className="!min-h-[32px] !w-8" size={11} />
              </li>
            );
          })}
        </ul>
      )}

      {!full && (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Add an idea">
          {quick.slice(0, 8).map((option) => (
            <li key={option.key} className="max-w-full">
              <OptionChip option={option} onPick={add} />
            </li>
          ))}
          <li>
            <button type="button" className="btn btn-sm tile tile-dark" onClick={() => setPickerOpen(true)}>
              <PixelIcon name="plus" size={11} />
              {quick.length > 0 ? "More" : "Add an idea"}
            </button>
          </li>
        </ul>
      )}
      <p className="text-[16px] text-ink-faint">
        {full
          ? `That's ${MAX_IDEAS}, the most one block can have.`
          : ideas.length === 0
            ? "Optional. Friends tap the ones they're up for, and you see who picked what."
            : "Friends tap the ones they're up for."}
      </p>

      {pickerOpen && (
        <IdeaPicker title="Add an idea" chosen={ideas.map((i) => i.title)} onPick={add} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}

/**
 * In a friend's Free time window: their ideas, each with "I'm up for it" and
 * the faces of who else is. The owner (seeing it as friends do) gets the
 * faces only.
 */
export function IdeasVoting({ block, occurrence }: { block: CalendarBlock; occurrence: number }) {
  const ideas = readIdeas(block.ideas);
  const { userId } = useSession();
  const { byId: people } = useProfiles();
  const { votes } = useIdeaVotes(block.id, occurrence, ideas.length > 0);
  const actions = useIdeaVoteActions();
  const { toastError } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  if (ideas.length === 0) return null;
  const isOwner = block.owner_id === userId;
  const host = people.get(block.owner_id)?.name?.split(" ")[0] ?? "They";

  const toggle = async (idea: BlockIdea, on: boolean) => {
    setBusy(idea.id);
    try {
      await actions.set(block.id, occurrence, idea.id, on);
    } catch (error) {
      toastError(error, "Could not save that.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Ideas" className="space-y-2">
      <div className="label !mb-0 flex items-center gap-2">
        <PixelIcon name="bulb" size={12} className="text-locked" />
        {isOwner ? "Your ideas" : `${host}'s ideas`}
      </div>
      {!isOwner && <p className="text-[16px] text-ink-faint">Tap the ones you&apos;re up for. {host} sees who picked what.</p>}
      <ul className="slot divide-y-2 divide-black">
        {ideas.map((idea) => {
          const who = pickers(votes, idea.id, people);
          const mine = votes.some((v) => v.idea_id === idea.id && v.user_id === userId);
          const others = who.filter((p) => p?.id !== userId);
          const where = ideaWhere(idea);
          return (
            <li key={idea.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex w-6 shrink-0 justify-center">
                {idea.emoji ? <EventIcon value={idea.emoji} size={18} max={1} /> : <PixelIcon name="bulb" size={13} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">{idea.title}</span>
                {(where || others.length > 0) && (
                  <span className="block truncate text-[16px] text-ink-faint">
                    {where}
                    {others.length > 0 && (
                      <span className="text-locked">
                        {where ? " · " : ""}
                        {names(others)} {others.length === 1 ? "is" : "are"} up for it
                      </span>
                    )}
                  </span>
                )}
              </span>
              {who.length > 0 && <AvatarStack people={who} size={20} max={4} />}
              {!isOwner && (
                <Button
                  size="sm"
                  variant={mine ? "locked" : "dark"}
                  icon={mine ? "check" : undefined}
                  aria-pressed={mine}
                  busy={busy === idea.id}
                  onClick={() => toggle(idea, !mine)}
                >
                  {mine ? "I'm up for it" : "Up for it?"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
