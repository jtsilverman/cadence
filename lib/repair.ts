// The repair menu (spec repair-engine): a skipped workout in the current week
// gets a deterministic set of makeup options — shift / double_up / consolidate
// / drop — scored by documented rules, one marked recommended. Pure: same
// inputs, byte-identical output (no minted ids, no clocks), so the producer's
// idempotent reuse holds across recomputes. Suggest-only: proposals carry a
// full replacement plan the USER applies via POST /api/schedule; this module
// never writes anything.

import type { Client } from "@libsql/client";
import type { ProposedDays, RepairSuggestion, RepairVolume, WorkoutPlan } from "./contracts";
import { isoAddDays, mondayOf } from "./dates";
import type { ModelCall } from "./extract";
import { getPlans } from "./library";
import type { ProgramPosition } from "./program";
import { scoreRepairMenu } from "./repair-score";
import { GREEN_ZONE, latestScore, RED_ZONE, type DayRecovery } from "./recovery";
import { proposedSnapshot, type DayState, type SlotState } from "./schedule";
import { logSuggestions, readSuggestionState } from "./suggestions";

export type RepairProposal = Omit<RepairSuggestion, "suggestion_id">;

// A proposed slot: the plan slot minus fold status. Makeup slots omit slot_id
// (minted at the user's accept-POST — determinism over convenience).
type ProposedSlot = ProposedDays[number]["slots"][number];


const makeupSlot = (missed: SlotState): ProposedSlot => {
  const slot: ProposedSlot = { lane: missed.lane, title: missed.title };
  if (missed.library_id) slot.library_id = missed.library_id;
  return slot;
};

// Snapshot with `slot` appended to `date` (creating the day if the plan had
// nothing there), order kept sorted so recomputes stay byte-identical.
function withSlotOn(base: ProposedDays, date: string, slot: ProposedSlot): ProposedDays {
  if (base.some((d) => d.date === date)) {
    return base.map((d) => (d.date === date ? { ...d, slots: [...d.slots, slot] } : d));
  }
  return [...base, { date, slots: [slot] }].sort((a, b) => a.date.localeCompare(b.date));
}

// Resolve a slot to its workout template, if the caller supplied plans.
const templateOf = (
  slot: SlotState,
  plansById?: Map<string, WorkoutPlan>
): WorkoutPlan | undefined =>
  slot.library_id ? plansById?.get(slot.library_id) : undefined;

const setLine = (exercises: WorkoutPlan["exercises"], half: boolean) =>
  exercises.map((e) => ({ name: e.name, sets: half ? Math.max(1, Math.ceil(e.sets / 2)) : e.sets }));

export function computeRepairMenu(
  days: DayState[],
  recovery: Map<string, DayRecovery>,
  todayISO: string,
  plansById?: Map<string, WorkoutPlan>
): RepairProposal[] {
  const weekStart = mondayOf(todayISO);
  const weekEnd = isoAddDays(weekStart, 6);
  const dayByDate = new Map(days.map((d) => [d.date, d]));

  // Remaining days of the week, today included (a same-day makeup is a "log
  // it done" tap, so the missed slot's own day earns no special case).
  const remaining: string[] = [];
  for (let date = todayISO; date <= weekEnd; date = isoAddDays(date, 1)) {
    remaining.push(date);
  }
  const hasWorkout = (date: string, pred: (s: SlotState) => boolean): boolean =>
    (dayByDate.get(date)?.slots ?? []).some((s) => s.lane === "workout" && pred(s));
  const freeDay = remaining.find((date) => !hasWorkout(date, () => true));
  const busyDay = remaining.find((date) => hasWorkout(date, (s) => s.status === "planned"));
  // Adjacency (UX.md:55): never stack a makeup onto a day whose NEXT day
  // holds a planned high-priority session — no hard day before a hard day.
  // A high-priority day is also no host itself: the makeup would dilute it.
  const highOn = (date: string): boolean =>
    hasWorkout(date, (s) => s.status === "planned" && s.priority === "high");
  const stackDay = remaining.find(
    (date) =>
      hasWorkout(date, (s) => s.status === "planned") &&
      !highOn(date) &&
      !highOn(isoAddDays(date, 1))
  );

  const score = latestScore(recovery, todayISO);
  const red = score != null && score < RED_ZONE;
  const lastDay = remaining.length <= 1;

  const base = proposedSnapshot(days);
  const menu: RepairProposal[] = [];

  // Meal shifts mirror the workout freeDay rule on the meal lane: a day with
  // no meal at all can host the makeup meal.
  const freeMealDay = remaining.find(
    (date) => !(dayByDate.get(date)?.slots ?? []).some((s) => s.lane === "meal")
  );

  for (const day of days) {
    if (day.date < weekStart || day.date > weekEnd) continue; // repair is for the live week only
    for (const missed of day.slots) {
      if (missed.status !== "skipped") continue;

      // Meal misses repair too (spec nutrition AC6, Jake's UX.md:57 reversal):
      // shift or drop only — no volume math, no double-up, no consolidation.
      if (missed.lane === "meal") {
        const options: RepairProposal[] = [];
        if (freeMealDay) {
          options.push({
            kind: "repair",
            missed_slot_id: missed.slot_id,
            option: "shift",
            days: withSlotOn(base, freeMealDay, makeupSlot(missed)),
            reason: `you skipped "${missed.title}" — ${freeMealDay} has no meal planned yet`,
          });
        }
        options.push({
          kind: "repair",
          missed_slot_id: missed.slot_id,
          option: "drop",
          days: base,
          reason: lastDay
            ? `the week is nearly over — let "${missed.title}" go; it stays on the record`
            : `let "${missed.title}" go; it stays on the record`,
        });
        const mealPick = lastDay ? "drop" : freeMealDay ? "shift" : "drop";
        for (const option of options) {
          if (option.option === mealPick) option.recommended = true;
          menu.push(option);
        }
        continue;
      }

      if (missed.lane !== "workout") continue;

      const options: RepairProposal[] = [];
      if (freeDay) {
        options.push({
          kind: "repair",
          missed_slot_id: missed.slot_id,
          option: "shift",
          days: withSlotOn(base, freeDay, makeupSlot(missed)),
          reason: `you missed "${missed.title}" — ${freeDay} is free this week`,
        });
      }
      if (stackDay && !red) {
        options.push({
          kind: "repair",
          missed_slot_id: missed.slot_id,
          option: "double_up",
          days: withSlotOn(base, stackDay, makeupSlot(missed)),
          reason: `no rest day needed — stack "${missed.title}" onto ${stackDay}'s session`,
        });
      }
      if (busyDay) {
        const host = (dayByDate.get(busyDay)?.slots ?? []).find(
          (s) => s.lane === "workout" && s.status === "planned"
        ) as SlotState;
        const hostPlan = templateOf(host, plansById);
        const missedPlan = templateOf(missed, plansById);
        const consolidate: RepairProposal = {
          kind: "repair",
          missed_slot_id: missed.slot_id,
          option: "consolidate",
          days: base.map((d) =>
            d.date === busyDay
              ? {
                  ...d,
                  slots: d.slots.map((s) =>
                    s.slot_id === host.slot_id
                      ? { ...s, title: `${host.title} + ${missed.title} (merged)` }
                      : s
                  ),
                }
              : d
          ),
          // without both templates the merge stays honest about eyeballing it
          reason: `fold "${missed.title}" into ${busyDay}'s "${host.title}" — trim volume to taste`,
        };
        if (hostPlan && missedPlan) {
          // the real volume math (spec program-engine AC7): host unchanged,
          // missed sets halved (ceil, min 1), total stated in the reason
          const hostSets = setLine(hostPlan.exercises, false);
          const addedSets = setLine(missedPlan.exercises, true);
          const total =
            hostSets.reduce((n, e) => n + e.sets, 0) +
            addedSets.reduce((n, e) => n + e.sets, 0);
          consolidate.volume = { host: hostSets, added: addedSets };
          consolidate.reason = `fold "${missed.title}" into ${busyDay}'s "${host.title}" — ${total} sets total, missed work halved`;
        }
        options.push(consolidate);

        // redistribute (spec AC8): sprinkle the missed exercises across the
        // OTHER remaining sessions — guidance only, the plan moves nothing
        if (missedPlan) {
          const hosts: Array<{ date: string; slot_id: string }> = [];
          for (const date of remaining) {
            if (date === day.date) continue;
            const hostSlot = (dayByDate.get(date)?.slots ?? []).find(
              (s) => s.lane === "workout" && s.status === "planned"
            );
            if (hostSlot) hosts.push({ date, slot_id: hostSlot.slot_id });
          }
          if (hosts.length >= 2) {
            const byHost = new Map<string, Array<{ name: string; sets: number }>>();
            missedPlan.exercises.forEach((e, i) => {
              const key = hosts[i % hosts.length].slot_id;
              const list = byHost.get(key) ?? [];
              list.push({ name: e.name, sets: e.sets });
              byHost.set(key, list);
            });
            const assignments: NonNullable<RepairVolume["assignments"]> = hosts
              .filter((h) => byHost.has(h.slot_id))
              .map((h) => ({ date: h.date, slot_id: h.slot_id, exercises: byHost.get(h.slot_id)! }));
            options.push({
              kind: "repair",
              missed_slot_id: missed.slot_id,
              option: "redistribute",
              days: base,
              volume: { assignments },
              reason: `sprinkle "${missed.title}"'s ${missedPlan.exercises.length} exercises across ${hosts.length} remaining sessions — nothing moves`,
            });
          }
        }
      }
      options.push({
        kind: "repair",
        missed_slot_id: missed.slot_id,
        option: "drop",
        days: base,
        reason: red
          ? `recovery ${score} is red — absorb the miss; it stays on the record`
          : lastDay
            ? `the week is nearly over — absorb the miss; it stays on the record`
            : `absorb the miss; it stays on the record`,
      });

      // The pick: red recovery or a nearly-over week says don't chase volume
      // (UX.md drop rule). A HIGH-PRIORITY miss with genuinely green recovery
      // and an adjacency-safe host earns double_up (spec program-engine AC6);
      // otherwise prefer the makeup that costs no other session (shift), then
      // the gentler merge. Yellow recovery offers double_up, never picks it.
      const green = score != null && score >= GREEN_ZONE;
      const pick =
        red || lastDay
          ? "drop"
          : missed.priority === "high" && green && stackDay
            ? "double_up"
            : freeDay
              ? "shift"
              : busyDay
                ? "consolidate"
                : "drop";
      for (const option of options) {
        if (option.option === pick) option.recommended = true;
        menu.push(option);
      }
    }
  }
  return menu;
}

const isRepair = (p: { kind: string }): p is RepairSuggestion => p.kind === "repair";

// The menu becomes logged pairs on surface (the attachEase idiom): one
// idempotent SuggestionMade per still-live option, ids attached onto the
// missed slot's day. Silencing: a dismissed option stays down for its slot;
// an ACCEPTED option retires the whole menu for that slot — the skip status
// persists after the user applies the fix, and without this the engine would
// re-propose repairs for a miss already handled.
// Optional LLM re-rank of fresh menus (spec program-engine AC9). The model
// only picks among options this engine built; scoring fires solely when a
// slot's menu contains a not-yet-logged option, so steady-state GETs never
// pay a model call. callModel is injectable for tests; without it (and
// without an API key) the deterministic pick stands.
export interface RepairScoring {
  position: ProgramPosition | null;
  callModel?: ModelCall;
}

export async function attachRepairSuggestions(
  db: Client,
  householdId: string,
  days: DayState[],
  recovery: Map<string, DayRecovery>,
  todayISO: string,
  scoring?: RepairScoring
): Promise<DayState[]> {
  // resolve workout templates once so the menu can do exercise-level math
  const ids = [
    ...new Set(
      days.flatMap((d) =>
        d.slots.filter((s) => s.lane === "workout" && s.library_id).map((s) => s.library_id!)
      )
    ),
  ];
  const plansById = new Map<string, WorkoutPlan>();
  for (const { id, plan } of await getPlans(db, householdId, ids)) {
    if (plan.kind === "workout") plansById.set(id, plan);
  }
  const menu = computeRepairMenu(days, recovery, todayISO, plansById);
  if (menu.length === 0) return days;

  const { open, accepted, dismissed } = await readSuggestionState(db, householdId);
  const acceptedSlots = new Set(accepted.filter(isRepair).map((p) => p.missed_slot_id));
  const dismissedOptions = new Set(
    dismissed.filter(isRepair).map((p) => `${p.missed_slot_id}:${p.option}`)
  );
  const proposals = menu.filter(
    (p) =>
      !acceptedSlots.has(p.missed_slot_id) &&
      !dismissedOptions.has(`${p.missed_slot_id}:${p.option}`)
  );
  if (proposals.length === 0) return days;

  if (scoring && (scoring.callModel || process.env.ANTHROPIC_API_KEY)) {
    const openKeys = new Set(
      open.filter(isRepair).map((p) => `${p.missed_slot_id}:${p.option}`)
    );
    const bySlot = new Map<string, RepairProposal[]>();
    for (const p of proposals) {
      const list = bySlot.get(p.missed_slot_id) ?? [];
      list.push(p);
      bySlot.set(p.missed_slot_id, list);
    }
    const score = latestScore(recovery, todayISO);
    for (const [slotId, slotMenu] of bySlot) {
      const fresh = slotMenu.some((p) => !openKeys.has(`${slotId}:${p.option}`));
      if (!fresh || slotMenu.length < 2) continue;
      const missed = days
        .flatMap((d) => d.slots)
        .find((s) => s.slot_id === slotId);
      const pick = await scoreRepairMenu(
        slotMenu,
        {
          ...(score != null ? { recovery_score: score } : {}),
          ...(missed?.priority === "high" ? { missed_priority: "high" as const } : {}),
          position: scoring.position,
        },
        scoring.callModel ?? undefined
      );
      if (pick === null) continue;
      for (const p of slotMenu) {
        if (p.option === pick) p.recommended = true;
        else delete p.recommended;
      }
    }
  }

  const logged = (await logSuggestions(db, householdId, proposals)).filter(isRepair);
  // Exactly one recommended per slot, and it is the CURRENT pick: reused open
  // pairs carry whatever recommended they were persisted with (payloadMatches
  // ignores it by design), so a re-scored menu must re-stamp presentation rank
  // or a stale pick rides along beside the new one.
  const pickBySlot = new Map<string, RepairSuggestion["option"]>();
  for (const p of proposals) {
    if (p.recommended) pickBySlot.set(p.missed_slot_id, p.option);
  }
  const presented = logged.map((p) => {
    const { recommended: _r, ...rest } = p;
    return (
      pickBySlot.get(p.missed_slot_id) === p.option
        ? { ...rest, recommended: true }
        : rest
    ) as RepairSuggestion;
  });
  return days.map((day) => {
    const mine = presented.filter((p) =>
      day.slots.some((s) => s.slot_id === p.missed_slot_id)
    );
    return mine.length > 0 ? { ...day, repair_proposals: mine } : day;
  });
}
