// Household-local calendar dates. UTC dates roll over at 8pm ET, so every
// "which day did this happen" join must convert through the household's
// timezone or evening events land on tomorrow (reviewer findings 1-2).
// One household until P4: timezone is a constant with an env override.

const HOUSEHOLD_TZ = process.env.HOUSEHOLD_TZ ?? "America/New_York";

// en-CA formats as YYYY-MM-DD.
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: HOUSEHOLD_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function localDate(iso: string | Date): string {
  return fmt.format(typeof iso === "string" ? new Date(iso) : iso);
}

// Monday-start week containing the given local date (Sun belongs to the
// prior Monday). Pure calendar arithmetic on an already-local date string.
export function mondayOf(dateISO: string): string {
  const day = new Date(`${dateISO}T00:00:00Z`);
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}

// A calendar-valid YYYY-MM-DD (the shape regex alone admits 2026-13-99).
export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

// Day arithmetic on YYYY-MM-DD (UTC-anchored: input and output are plain
// calendar dates, no TZ involved).
export function isoAddDays(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
