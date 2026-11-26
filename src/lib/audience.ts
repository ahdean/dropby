/**
 * Who a block is shared with, as the picker shows it: a set of ticked people.
 *
 * Everyone starts ticked. "Everyone" ticks or unticks all connections at once;
 * a group ticks or unticks all of its members; a person can be ticked on their
 * own. Groups are shortcuts for ticking people, not something the block is
 * shared with by itself.
 *
 * Saved as:
 *   - every connection ticked → "all_connections" (which also covers people you
 *     connect with later, like any new block)
 *   - otherwise → "custom" with exactly the ticked people.
 *
 * Blocks saved before this picker may also be shared with groups; their members
 * show as ticked, and the block keeps that until the picker is changed.
 */
import type { AudienceMode, Group } from "./types";

export interface AudienceValue {
  audience: AudienceMode;
  userIds: string[];
  groupIds: string[];
}

export const EVERYONE: AudienceValue = { audience: "all_connections", userIds: [], groupIds: [] };

/** The members of a group who are among your connections (only they can be ticked). */
export function groupMembers(group: Group, connectionIds: readonly string[]): string[] {
  return group.member_ids.filter((id) => connectionIds.includes(id));
}

/** The people ticked for this value. */
export function selectedPeople(value: AudienceValue, connectionIds: readonly string[], groups: readonly Group[]): Set<string> {
  if (value.audience === "all_connections") return new Set(connectionIds);
  const viaGroups = groups.filter((g) => value.groupIds.includes(g.id)).flatMap((g) => groupMembers(g, connectionIds));
  return new Set([...value.userIds, ...viaGroups].filter((id) => connectionIds.includes(id)));
}

/** What to save for a set of ticked people. */
export function audienceFor(selected: ReadonlySet<string>, connectionIds: readonly string[]): AudienceValue {
  if (connectionIds.length > 0 && connectionIds.every((id) => selected.has(id))) return EVERYONE;
  return { audience: "custom", userIds: connectionIds.filter((id) => selected.has(id)), groupIds: [] };
}

export function isEveryone(value: AudienceValue, connectionIds: readonly string[], groups: readonly Group[]): boolean {
  if (value.audience === "all_connections") return true;
  const selected = selectedPeople(value, connectionIds, groups);
  return connectionIds.length > 0 && connectionIds.every((id) => selected.has(id));
}

/** "Everyone": on → nobody; off (or only some) → everyone. */
export function toggleEveryone(value: AudienceValue, connectionIds: readonly string[], groups: readonly Group[]): AudienceValue {
  return isEveryone(value, connectionIds, groups) ? { audience: "custom", userIds: [], groupIds: [] } : EVERYONE;
}

export type GroupState = "all" | "some" | "none";

export function groupState(group: Group, selected: ReadonlySet<string>, connectionIds: readonly string[]): GroupState {
  const members = groupMembers(group, connectionIds);
  const ticked = members.filter((id) => selected.has(id)).length;
  if (members.length > 0 && ticked === members.length) return "all";
  return ticked > 0 ? "some" : "none";
}

/** A group: all of its members ticked → untick them all; otherwise tick them all. */
export function toggleGroup(value: AudienceValue, group: Group, connectionIds: readonly string[], groups: readonly Group[]): AudienceValue {
  const selected = selectedPeople(value, connectionIds, groups);
  const members = groupMembers(group, connectionIds);
  const allOn = groupState(group, selected, connectionIds) === "all";
  for (const id of members) {
    if (allOn) selected.delete(id);
    else selected.add(id);
  }
  return audienceFor(selected, connectionIds);
}

export function togglePerson(value: AudienceValue, personId: string, connectionIds: readonly string[], groups: readonly Group[]): AudienceValue {
  const selected = selectedPeople(value, connectionIds, groups);
  if (selected.has(personId)) selected.delete(personId);
  else selected.add(personId);
  return audienceFor(selected, connectionIds);
}
