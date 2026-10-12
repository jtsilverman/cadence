// Raw Garmin Connect and MyFitnessPal payloads → diary events.
// The Python sync (integrations/) fetches; this module is the only place
// that knows those response shapes. Fixtures in tests/ are captured-style
// JSON, never live calls.

import type {
  ExertionLoggedPayload,
  FoodEntry,
  FoodLoggedPayload,
  RecoveryLoggedPayload,
  SessionLoggedPayload,
  SleptLoggedPayload,
} from "./contracts";
import {
  EXERTION_LOGGED,
  FOOD_LOGGED,
  RECOVERY_LOGGED,
  SESSION_LOGGED,
  SLEPT_LOGGED,
} from "./contracts";
import type { MappedEvent } from "./ingest";

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function round(v: number, places = 0): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

function firstNum(obj: Json | undefined, keys: string[]): number | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const n = num(obj[key]);
    if (n !== undefined) return n;
  }
  return undefined;
}

// Garmin instants arrive as "YYYY-MM-DD HH:MM:SS" (GMT) or ISO. Fall back to
// noon UTC on the calendar date so a missing clock still lands on that day
// in the household timezone.
export function garminInstant(gmt: unknown, fallbackDate: string): string {
  if (typeof gmt === "number" && Number.isFinite(gmt)) {
    const ms = gmt > 1e12 ? gmt : gmt * 1000;
    const parsed = new Date(ms);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (typeof gmt === "string" && gmt.trim()) {
    const trimmed = gmt.trim();
    const iso = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
    const withZone = /Z$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
    const parsed = new Date(withZone);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return `${fallbackDate}T16:00:00.000Z`;
}

// Same bands as lib/whoop-ingest.ts (score ≥85 great, ≥70 ok, else rough).
function qualityFromScore(score: number): SleptLoggedPayload["quality"] {
  return score >= 85 ? "great" : score >= 70 ? "ok" : "rough";
}

function qualityFromHours(hours: number): SleptLoggedPayload["quality"] {
  return hours >= 7.5 ? "great" : hours >= 6 ? "ok" : "rough";
}

function activityType(raw: Json): string | undefined {
  const typed = raw.activityType;
  if (isObj(typed) && typeof typed.typeKey === "string") return typed.typeKey;
  if (typeof raw.activityType === "string") return raw.activityType;
  return undefined;
}

export function mapGarminActivity(raw: Json): MappedEvent | null {
  const id = num(raw.activityId) ?? num(raw.activityUUID);
  if (id == null && typeof raw.activityId !== "string") return null;
  const externalId = `garmin:activity:${raw.activityId}`;
  const local = typeof raw.startTimeLocal === "string" ? raw.startTimeLocal.slice(0, 10) : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(local) ? local : "1970-01-01";
  const typeKey = activityType(raw);
  const title =
    (typeof raw.activityName === "string" && raw.activityName.trim()) || typeKey || "activity";
  const payload: SessionLoggedPayload = {
    title,
    kind: "loose",
    external_id: externalId,
  };
  if (typeKey) payload.activity_type = typeKey;
  const distance = num(raw.distance);
  if (distance != null && distance > 0) payload.distance_m = round(distance);
  const duration = num(raw.duration);
  if (duration != null && duration > 0) payload.duration_s = round(duration);
  const calories = num(raw.calories);
  if (calories != null && calories > 0) payload.calories = round(calories);
  const hr = num(raw.averageHR) ?? num(raw.averageHeartRate);
  if (hr != null && hr > 0) payload.avg_hr = round(hr);
  const fallback = date === "1970-01-01" ? new Date().toISOString().slice(0, 10) : date;
  return {
    type: SESSION_LOGGED,
    ts: garminInstant(raw.startTimeGMT ?? raw.startTimeLocal, fallback),
    payload: payload as SessionLoggedPayload & { external_id: string },
    schema_version: 2,
  };
}

function sleepScore(dto: Json): number | undefined {
  const scores = isObj(dto.sleepScores) ? dto.sleepScores : undefined;
  const overall = scores && isObj(scores.overall) ? scores.overall : undefined;
  return (
    firstNum(overall, ["value"]) ??
    firstNum(scores, ["overallScore", "sleepScore"]) ??
    firstNum(dto, ["sleepScore"])
  );
}

export function mapGarminSleep(date: string, raw: unknown): MappedEvent | null {
  if (!isObj(raw) || raw._error) return null;
  const dto = isObj(raw.dailySleepDTO) ? raw.dailySleepDTO : raw;
  const seconds = firstNum(dto, ["sleepTimeSeconds"]);
  const score = sleepScore(dto);
  if ((seconds == null || seconds <= 0) && score == null) return null;
  const hours = seconds != null ? round(seconds / 3600, 1) : undefined;
  const payload: SleptLoggedPayload = {
    date,
    quality: score != null ? qualityFromScore(score) : qualityFromHours(hours ?? 0),
    external_id: `garmin:sleep:${date}`,
  };
  if (hours != null) payload.hours = hours;
  if (score != null) payload.score = round(score);
  const end = dto.sleepEndTimestampGMT ?? raw.sleepEndTimestampGMT;
  return {
    type: SLEPT_LOGGED,
    ts: garminInstant(end, date),
    payload: payload as SleptLoggedPayload & { external_id: string },
    schema_version: 2,
  };
}

function bodyBatteryLevel(entry: Json): number | undefined {
  const series = entry.bodyBatteryValuesArray;
  if (Array.isArray(series) && series.length > 0) {
    const last = series[series.length - 1];
    if (Array.isArray(last)) {
      const level = num(last[1]);
      if (level != null) return round(level);
    } else if (isObj(last)) {
      const level = num(last.level) ?? num(last.value);
      if (level != null) return round(level);
    }
  }
  const charged = num(entry.charged);
  if (charged != null) return round(charged);
  return undefined;
}

export function pickTrainingLoad(raw: unknown): number | undefined {
  if (!isObj(raw) || raw._error) return undefined;
  const recent = isObj(raw.mostRecentTrainingStatus) ? raw.mostRecentTrainingStatus : undefined;
  const latest = recent && isObj(recent.latestTrainingStatusData) ? recent.latestTrainingStatusData : undefined;
  const status = isObj(raw.trainingStatus) ? raw.trainingStatus : undefined;
  const candidates = [
    num(raw.acuteTrainingLoad),
    latest ? num(latest.acuteTrainingLoad) : undefined,
    recent ? num(recent.acuteTrainingLoad) : undefined,
    status ? num(status.acuteTrainingLoad) : undefined,
  ];
  for (const c of candidates) {
    if (c != null) return round(c);
  }
  return undefined;
}

export interface GarminDayRaw {
  date: string;
  stats?: unknown;
  sleep?: unknown;
  hrv?: unknown;
  body_battery?: unknown;
  training_status?: unknown;
}

export interface GarminBundle {
  source: "garmin";
  activities?: unknown[];
  days?: GarminDayRaw[];
}

function hrvLastNight(raw: unknown): number | undefined {
  if (!isObj(raw) || raw._error) return undefined;
  const summary = isObj(raw.hrvSummary) ? raw.hrvSummary : raw;
  return firstNum(summary, ["lastNightAvg", "lastNight5MinHigh", "weeklyAvg"]);
}

function batteryForDate(raw: unknown, date: string): number | undefined {
  if (!Array.isArray(raw)) {
    if (!isObj(raw) || raw._error) return undefined;
    return bodyBatteryLevel(raw);
  }
  for (const entry of raw) {
    if (!isObj(entry)) continue;
    const entryDate = entry.date ?? entry.calendarDate;
    if (entryDate === date) return bodyBatteryLevel(entry);
  }
  return undefined;
}

export function mapGarminBundle(bundle: GarminBundle): MappedEvent[] {
  const events: MappedEvent[] = [];
  for (const raw of bundle.activities ?? []) {
    if (!isObj(raw)) continue;
    const mapped = mapGarminActivity(raw);
    if (mapped) events.push(mapped);
  }
  for (const day of bundle.days ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) continue;
    const stats = isObj(day.stats) && !day.stats._error ? day.stats : undefined;
    const hrv = hrvLastNight(day.hrv);
    const resting = firstNum(stats, ["restingHeartRate", "restingHR"]);
    if (hrv != null || resting != null) {
      const payload: RecoveryLoggedPayload = {
        date: day.date,
        external_id: `garmin:recovery:${day.date}`,
      };
      if (hrv != null) payload.hrv = round(hrv, 1);
      if (resting != null) payload.resting_hr = round(resting);
      events.push({
        type: RECOVERY_LOGGED,
        ts: `${day.date}T12:00:00.000Z`,
        payload: payload as RecoveryLoggedPayload & { external_id: string },
        schema_version: 2,
      });
    }
    const sleep = mapGarminSleep(day.date, day.sleep);
    if (sleep) events.push(sleep);

    const steps = firstNum(stats, ["totalSteps", "steps"]);
    const active = firstNum(stats, ["activeKilocalories", "activeCalories"]);
    const total = firstNum(stats, ["totalKilocalories", "totalCalories"]);
    const battery = batteryForDate(day.body_battery, day.date);
    const load = pickTrainingLoad(day.training_status);
    if (steps == null && active == null && total == null && battery == null && load == null) continue;
    const payload: ExertionLoggedPayload = {
      date: day.date,
      external_id: `garmin:exertion:${day.date}`,
    };
    if (steps != null) payload.steps = round(steps);
    if (active != null) payload.active_calories = round(active);
    if (total != null) payload.total_calories = round(total);
    if (battery != null) payload.body_battery = battery;
    if (load != null) payload.training_load = load;
    events.push({
      type: EXERTION_LOGGED,
      ts: `${day.date}T23:00:00.000Z`,
      payload: payload as ExertionLoggedPayload & { external_id: string },
      schema_version: 1,
    });
  }
  return events;
}

export interface MfpEntryRaw {
  name?: string;
  nutrition?: Json;
}

export interface MfpMealRaw {
  name?: string;
  entries?: MfpEntryRaw[];
}

export interface MfpDayRaw {
  date: string;
  meals?: MfpMealRaw[];
  totals?: Json;
  goals?: Json;
}

export interface MfpBundle {
  source: "mfp";
  days?: MfpDayRaw[];
}

function macro(obj: Json | undefined, keys: string[]): number | undefined {
  const n = firstNum(obj, keys);
  return n == null ? undefined : round(n, 1);
}

function mapEntry(meal: string, raw: MfpEntryRaw): FoodEntry | null {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  const nutrition = isObj(raw.nutrition) ? raw.nutrition : undefined;
  const entry: FoodEntry = { meal, name };
  const calories = macro(nutrition, ["calories"]);
  const protein = macro(nutrition, ["protein", "protein_g"]);
  const carbs = macro(nutrition, ["carbohydrates", "carbs", "carbs_g"]);
  const fat = macro(nutrition, ["fat", "fat_g"]);
  if (calories != null) entry.calories = round(calories);
  if (protein != null) entry.protein_g = protein;
  if (carbs != null) entry.carbs_g = carbs;
  if (fat != null) entry.fat_g = fat;
  return entry;
}

export function mapMfpDay(day: MfpDayRaw): MappedEvent | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return null;
  const entries: FoodEntry[] = [];
  for (const meal of day.meals ?? []) {
    const mealName = (meal.name ?? "meal").trim() || "meal";
    for (const entry of meal.entries ?? []) {
      const mapped = mapEntry(mealName, entry);
      if (mapped) entries.push(mapped);
    }
  }
  if (entries.length === 0) return null;
  const totals = isObj(day.totals) ? day.totals : undefined;
  const goals = isObj(day.goals) ? day.goals : undefined;
  const payload: FoodLoggedPayload = {
    date: day.date,
    entries,
    external_id: `mfp:diary:${day.date}`,
  };
  const calories =
    macro(totals, ["calories"]) ??
    round(entries.reduce((sum, e) => sum + (e.calories ?? 0), 0));
  const protein = macro(totals, ["protein", "protein_g"]);
  const carbs = macro(totals, ["carbohydrates", "carbs", "carbs_g"]);
  const fat = macro(totals, ["fat", "fat_g"]);
  if (calories != null) payload.calories = round(calories);
  if (protein != null) payload.protein_g = protein;
  if (carbs != null) payload.carbs_g = carbs;
  if (fat != null) payload.fat_g = fat;
  const goalCalories = macro(goals, ["calories"]);
  const goalProtein = macro(goals, ["protein", "protein_g"]);
  const goalCarbs = macro(goals, ["carbohydrates", "carbs", "carbs_g"]);
  const goalFat = macro(goals, ["fat", "fat_g"]);
  if (goalCalories != null) payload.goal_calories = round(goalCalories);
  if (goalProtein != null) payload.goal_protein_g = goalProtein;
  if (goalCarbs != null) payload.goal_carbs_g = goalCarbs;
  if (goalFat != null) payload.goal_fat_g = goalFat;
  return {
    type: FOOD_LOGGED,
    ts: `${day.date}T23:30:00.000Z`,
    payload: payload as FoodLoggedPayload & { external_id: string },
    schema_version: 1,
  };
}

export function mapMfpBundle(bundle: MfpBundle): MappedEvent[] {
  const events: MappedEvent[] = [];
  for (const day of bundle.days ?? []) {
    const mapped = mapMfpDay(day);
    if (mapped) events.push(mapped);
  }
  return events;
}
