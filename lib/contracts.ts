// Frozen contracts (change = version bump, never in-place). Spec: specs/recipe-groceries-mvp.md.

export type Precision = "exact" | "estimated" | "guessed";

// Event envelope v1 — the spine every phase reads.
export interface EventEnvelope<T = unknown> {
  event_id: string;
  household_id: string;
  user_id?: string;
  type: string;
  ts: string; // ISO 8601 UTC, always trailing Z
  source: string;
  payload: T;
  schema_version: number;
  precision: Precision;
}

// PantryAsserted: an explicit user assertion of pantry truth (add/edit/remove).
// Only user action asserts inventory; inference is suggest-only.
export interface PantryAssertedPayload {
  name: string;
  qty: number | null; // null = present, amount unknown (rough-counts dial)
  unit: string | null;
  removed?: true;
  // additive (consumption-expiry): user-stated expiry date. Absent = none;
  // an assertion without it clears any standing date (assertions are absolute).
  expires?: string;
}

// One {name, qty, unit} line: order items, inflow actuals, cooked amounts.
export interface LineItem {
  name: string;
  qty: number | null;
  unit: string | null;
}

// PantryInflow: groceries entering the kitchen, confirmed by user action
// (aisle checkoff or delivery reconcile — both feed this same event).
export interface PantryInflowPayload {
  items: LineItem[];
  via: "checkoff" | "delivery";
  order_event_id?: string; // delivery reconcile: which OrderPlaced this settles
}

// OrderPlaced: a cart handed to a rail. Items are what was requested;
// actuals arrive later as PantryInflow via the delivery reconcile.
export interface OrderPlacedPayload {
  rail: string;
  items: LineItem[];
  url?: string;
}

// RecipeCooked: "I made this". Ingredients snapshotted at cook time so the
// rebuild never depends on the library's current state.
export interface RecipeCookedPayload {
  library_id: string;
  title: string;
  ingredients: LineItem[];
  // macros snapshotted at cook time (the ingredients rule): library rows
  // upsert in place, so a later re-save must never rewrite cooked history
  nutrition?: RecipeNutrition;
}

// PreferenceSet: a stated ingredient preference (structured for future
// product/UPC joins). All-null fields = preference cleared. Stated beats
// learned (UX.md § reliability).
export interface PreferenceSetPayload {
  name: string;
  brand: string | null;
  size: string | null;
  note: string | null;
}

export const PANTRY_ASSERTED = "PantryAsserted";
export const PANTRY_INFLOW = "PantryInflow";
export const ORDER_PLACED = "OrderPlaced";
export const RECIPE_COOKED = "RecipeCooked";
export const RECIPE_SAVED = "RecipeSaved";
export const PREFERENCE_SET = "PreferenceSet";
export const WEEK_PLANNED = "WeekPlanned";
export const SUGGESTION_MADE = "SuggestionMade";
export const SUGGESTION_RESOLVED = "SuggestionResolved";
export const SCHEDULE_PLANNED = "SchedulePlanned";
export const SESSION_LOGGED = "SessionLogged";
export const SLEPT_LOGGED = "SleptLogged";
export const JOURNAL_ENTRY = "JournalEntry";
export const SLOT_SKIPPED = "SlotSkipped";
export const RECOVERY_LOGGED = "RecoveryLogged";
export const WORKOUT_SAVED = "WorkoutSaved";
export const SET_LOGGED = "SetLogged";
export const GOAL_SET = "GoalSet";
export const PROGRAM_SET = "ProgramSet";
export const LOG_RETRACTED = "LogRetracted";
export const AUTONOMY_RUNG_SET = "AutonomyRungSet";

// LogRetracted (spec retraction-ladder): the undo trail. Folds ignore the
// target id; the diary stays append-only — nothing is deleted, the tap and
// the take-back are both on the record.
export interface LogRetractedPayload {
  retracted_event_id: string;
}

// The ONE list of what a user can retract (their own log-shaped taps).
// Imported by both the retract gate and any future consumer — never a
// per-site blacklist (the SLOT_LANES precedent).
export const RETRACTABLE_TYPES: readonly string[] = [
  SESSION_LOGGED,
  SET_LOGGED,
  SLEPT_LOGGED,
  JOURNAL_ENTRY,
  SLOT_SKIPPED,
  RECIPE_COOKED,
];

// The autonomy ladder's rung state (UX.md:77): per action type, set by the
// user, never forced. one_tap is today's de facto behavior.
export type AutonomyRung = "review" | "one_tap" | "auto" | "full_auto";
export const AUTONOMY_RUNGS: readonly AutonomyRung[] = [
  "review",
  "one_tap",
  "auto",
  "full_auto",
];

export interface AutonomyRungSetPayload {
  kind: SuggestionKind;
  rung: AutonomyRung;
}

// The schedule: 2-week loose-per-day plan across four lanes. Snapshot event,
// latest wins (the WeekPlanned pattern, dated + laned); slot_ids are minted
// once and survive later snapshots so logs never orphan.
export type SlotLane = "meal" | "workout" | "sleep" | "mind" | "custom";
export const SLOT_LANES: readonly SlotLane[] = ["meal", "workout", "sleep", "mind", "custom"];

export interface ScheduleSlot {
  slot_id: string;
  lane: SlotLane;
  title: string;
  library_id?: string; // meal slots: recipe; workout slots: template (lane-agnostic)
  // spec program-engine: a hard session the repair engine must respect —
  // adjacency (no makeup stacked the day before it) and pick priority
  priority?: "high";
}

export interface SchedulePlannedPayload {
  days: Array<{ date: string; slots: ScheduleSlot[] }>; // date: absolute YYYY-MM-DD
}

// One-tap logs. All work without a planned slot (spontaneous workout,
// unprompted journal); slot_id links them to the plan when there is one.
// v2 additive (wearable-ingest): external_id carries device-record identity
// ("whoop:workout:<id>") so redeliveries dedup and revisions resolve
// latest-wins; score keeps the device's raw number next to the mapped enum.
// Writers emit schema_version 2 only when these fields are present.
export interface SessionLoggedPayload {
  title: string;
  kind: "structured" | "loose";
  slot_id?: string;
  note?: string;
  external_id?: string;
  session_id?: string; // groups this session's SetLogged events
  library_id?: string; // which workout template was performed
}

// SetLogged: one set, written mid-workout (durable if the session dies).
// precision "exact" — the lifting dial (UX.md § precision).
export interface SetLoggedPayload {
  session_id: string;
  exercise: string;
  set_index: number;
  reps: number;
  weight?: number;
  unit?: string; // required when weight is present
  rpe?: number; // 1-10
  slot_id?: string;
  library_id?: string;
}

// GoalSet: latest event per goal_id wins; cleared removes (PreferenceSet idiom).
export interface GoalSetPayload {
  goal_id: string;
  title: string;
  kind: "strength" | "cadence" | "custom" | "nutrition";
  exercise?: string; // strength: which lift
  target_weight?: number;
  unit?: string;
  target_reps?: number; // strength: reps the target must be hit for (default 1)
  per_week?: number; // cadence: sessions per week
  daily_calories?: number; // nutrition: the smoothed weekly budget is 7× this
  protein_g?: number; // nutrition: optional daily protein target
  cleared?: true;
}

// ProgramSet (spec program-engine): the training block connecting a goal to
// week skeletons. ONE program per household — singleton fold, latest event
// wins, cleared removes; unlike goals nothing needs two concurrent programs.
// Weeks are skeleton only (kind + note): beyond next week the app never holds
// set/meal detail (UX.md horizon rule).
export type ProgramWeekKind = "build" | "volume" | "peak" | "deload";

export interface ProgramWeek {
  kind: ProgramWeekKind;
  note?: string;
}

export interface ProgramDefinition {
  title: string;
  per_week: number; // baseline sessions/week, 1-7
  start_monday: string; // YYYY-MM-DD, a Monday
  weeks: ProgramWeek[]; // 1-52
  goal_id?: string; // the goal this block serves
}

export type ProgramSetPayload = ProgramDefinition | { cleared: true };

export interface SleptLoggedPayload {
  date: string; // the night being logged, YYYY-MM-DD
  quality: "rough" | "ok" | "great";
  hours?: number;
  score?: number;
  external_id?: string;
}

export interface JournalEntryPayload {
  text: string;
  slot_id?: string;
  // v2 additive (spec coach-reflect): a one-tap felt-state, 1 (rough) - 5
  // (great). Typed input, never inferred from the text.
  mood?: number;
}

export interface SlotSkippedPayload {
  slot_id: string;
  lane: SlotLane;
}

// Wearable ingest contract (whoop ingester: lib/whoop-ingest.ts): a device writes the same shape
// a human does, distinguished by envelope source ("whoop"/"garmin") and
// trusted via precision ("exact" for device data).
export interface RecoveryLoggedPayload {
  date: string;
  score?: number;
  hrv?: number;
  resting_hr?: number;
  external_id?: string;
}

// The suggestion/response pair (WORKPLAN § contracts, defined at first use):
// every agent proposal and its outcome, logged the same way. This is the
// override training data and the autonomy ladder's evidence.
// v2 (spec suggestion-pair-v2): discriminated union — every engine's proposal
// flows through the one pair. plan_draft's shape is provisional until the LLM
// planner lands; repair was finalized by spec repair-engine.
export type SuggestionKind =
  | "add_to_list"
  | "ease_workout"
  | "next_target"
  | "repair"
  | "plan_draft"
  | "nutrition_adjust"
  | "goal_proposal";

export interface AddToListSuggestion {
  suggestion_id: string;
  kind: "add_to_list";
  name: string;
  qty: number | null;
  unit: string | null;
  reason: string;
}

export interface EaseWorkoutSuggestion {
  suggestion_id: string;
  kind: "ease_workout";
  slot_id: string;
  date: string; // YYYY-MM-DD, the red-zone day
  recovery_score: number;
  reason: string;
}

export interface NextTargetSuggestion {
  suggestion_id: string;
  kind: "next_target";
  exercise: string; // normalized (lib/workouts normalizeExercise)
  weight: number;
  unit: string;
  reason: string;
}

// A proposed FULL replacement plan (latest-snapshot-wins makes partial days
// destructive: any unlisted day would be deleted on apply). New slots omit
// slot_id — deterministic payloads keep producer recomputes byte-identical,
// and parseScheduleDays mints ids at the user's accept-POST.
export type ProposedDays = Array<{
  date: string; // YYYY-MM-DD
  slots: Array<Omit<ScheduleSlot, "slot_id"> & { slot_id?: string }>;
}>;

// Exercise-level guidance riding a repair option (spec program-engine AC7-8).
// Additive-optional: only present when the slots resolve to workout templates.
export interface RepairVolume {
  host?: Array<{ name: string; sets: number }>; // consolidate: the host's sets, unchanged
  added?: Array<{ name: string; sets: number }>; // consolidate: missed sets, halved
  // redistribute: which remaining session absorbs which missed exercise —
  // guidance only, the days snapshot moves nothing
  assignments?: Array<{
    date: string;
    slot_id: string;
    exercises: Array<{ name: string; sets: number }>;
  }>;
}

export interface RepairSuggestion {
  suggestion_id: string;
  kind: "repair";
  missed_slot_id: string;
  option: "shift" | "double_up" | "consolidate" | "drop" | "redistribute";
  recommended?: true; // the engine's pick; alternates omit it
  days: ProposedDays;
  volume?: RepairVolume;
  reason: string;
}

export interface PlanDraftSuggestion {
  suggestion_id: string;
  kind: "plan_draft";
  scope: "week" | "day" | "slot"; // slot = a single swap/substitution
  // what the draft is ABOUT: week → its Monday, day → the date, slot → the
  // slot_id being swapped. Identity anchors here, not on the days blob, so a
  // living-draft recompute supersedes its predecessor instead of stacking
  // open pairs forever (spec planner-composer).
  anchor: string;
  days: ProposedDays;
  // fingerprint of the DETERMINISTIC core draft the LLM picked from: an open
  // pair is reused while the basis matches even though picked days differ from
  // a bare recompute — without this every read would supersede a picked draft
  basis?: string;
  reason: string;
}

// A week-overshoot correction (spec nutrition AC7). Its own kind, not repair:
// an overshoot has no missed slot and proposes no schedule days — it is capped
// advice (UX.md:59 — corrections capped per-day and spread, never swings).
export interface NutritionAdjustSuggestion {
  suggestion_id: string;
  kind: "nutrition_adjust";
  week_start: string; // Monday, YYYY-MM-DD — one correction per week
  overage_calories: number;
  per_day_cap: number; // never trim more than this per day
  days_remaining: number; // days of the week left to spread over, today included
  reason: string;
}

// A derived calorie target from a goal conversation ("lose 15 by November").
// Proposed, never imposed: the user's yes turns it into the real GoalSet.
export interface GoalProposalSuggestion {
  suggestion_id: string;
  kind: "goal_proposal";
  daily_calories: number; // already clamped to the healthy floor at proposal time
  reason: string;
}

export type SuggestionMadePayload =
  | AddToListSuggestion
  | EaseWorkoutSuggestion
  | NextTargetSuggestion
  | RepairSuggestion
  | PlanDraftSuggestion
  | NutritionAdjustSuggestion
  | GoalProposalSuggestion;

export interface SuggestionResolvedPayload {
  suggestion_id: string;
  // absent = pre-v2 row; readers default to add_to_list (normalizeResolved)
  kind?: SuggestionKind;
  name?: string; // add_to_list only: denormalized so readers filter without joining
  // superseded = machine-retired by a drifted recompute of the same identity
  // (spec planner-composer AC2); never a user verdict, never silences.
  outcome: "accepted" | "dismissed" | "superseded";
}

// WeekPlanned: the picked week at list-build time. Titles snapshotted so
// readers never depend on the library's later state. Latest event = current plan.
export interface WeekPlannedPayload {
  recipes: Array<{ library_id: string; title: string }>;
}

// Rail interface v1 (frozen): one required method; per-rail extra
// capabilities are declared on the implementation, never assumed universal.
export interface RailCartResult {
  url?: string;
  cart_id?: string;
}

export interface Rail {
  id: string;
  buildCart(items: LineItem[]): Promise<RailCartResult>;
}

// StructuredPlan: discriminated union on kind — RecipePlan (v1/v2) and
// WorkoutPlan (v1, spec workout-engine). Recipe v2 = v1 + optional
// source_embed (additive; writers emit 2 only when present).
export type Confidence = "high" | "low";

// Sandboxed-embed ref for the source video. We store only ids and build our
// own iframe src — provider embed_html is never stored or rendered (XSS).
export interface SourceEmbed {
  provider: "tiktok" | "youtube";
  video_id: string;
  thumbnail_url?: string;
}

// The ONE embed validator (recipes and workouts alike — the SLOT_LANES
// one-authority precedent; living in extract.ts would make extract and
// workouts import each other). Strict: malformed is an error, not a drop.
export function parseSourceEmbed(value: unknown): SourceEmbed | null {
  if (typeof value !== "object" || value === null) return null;
  const e = value as Record<string, unknown>;
  if (e.provider !== "tiktok" && e.provider !== "youtube") return null;
  if (typeof e.video_id !== "string" || e.video_id.trim() === "") return null;
  const embed: SourceEmbed = { provider: e.provider, video_id: e.video_id };
  if (e.thumbnail_url !== undefined) {
    if (
      typeof e.thumbnail_url !== "string" ||
      !e.thumbnail_url.startsWith("https://")
    ) {
      return null;
    }
    embed.thumbnail_url = e.thumbnail_url;
  }
  return embed;
}

export interface RecipeIngredient {
  name: string;
  qty: number | null; // null = unparseable/to-taste
  unit: string | null;
  confidence: Confidence;
}

// Estimated per-serving macros (spec nutrition). Additive-optional on
// RecipePlan — absent means unknown, never zero. per_serving is a fixed
// literal so a future per-recipe basis is a new field, not a reinterpretation.
export interface RecipeNutrition {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  per_serving: true;
  confidence: Confidence;
}

export interface RecipePlan {
  plan_version: 1 | 2;
  kind: "recipe";
  title: string;
  servings: number | null;
  total_minutes: number | null;
  ingredients: RecipeIngredient[];
  steps: string[]; // distilled imperative steps, not source prose
  source_url: string;
  source_embed?: SourceEmbed;
  nutrition?: RecipeNutrition;
  confidence: {
    title: Confidence;
    servings: Confidence;
    total_minutes: Confidence;
  };
}

// Structured workout: exercises with target sets×reps and optional load.
// Enters via API (parseWorkoutPlan) or extraction (spec workout-video-
// extraction): a shared video becomes a template with the source attached.
export interface WorkoutExercise {
  name: string;
  sets: number;
  reps: number;
  weight?: number;
  unit?: string; // required when weight is present
  increment?: number; // per-exercise progression step in `unit`; requires unit
  note?: string;
}

// v2 = v1 + optional source fields (the RecipePlan idiom): writers emit 2
// only when source_embed is present. source_url populates the library dedup —
// re-sharing a video updates its template instead of stacking rows.
export interface WorkoutPlan {
  plan_version: 1 | 2;
  kind: "workout";
  title: string;
  exercises: WorkoutExercise[];
  source_url?: string;
  source_embed?: SourceEmbed;
}

export type StructuredPlan = RecipePlan | WorkoutPlan;

export interface RecipeSavedPayload {
  library_id: string;
  title: string;
  source_url: string;
}

// WorkoutSaved: the RecipeSaved pattern for the workout kind.
export interface WorkoutSavedPayload {
  library_id: string;
  title: string;
}
