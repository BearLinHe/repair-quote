export const FINANCE_TIME_ZONE = "America/Los_Angeles";

export function financeDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: FINANCE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function financeDatePreset(preset: "today" | "week" | "month" | "previousMonth", now = new Date()) {
  const today = financeDateValue(now);
  const first = `${today.slice(0, 7)}-01`;
  if (preset === "today") return { start: today, end: today };
  if (preset === "week") return { start: shiftDate(today, -6), end: today };
  if (preset === "previousMonth") {
    const end = shiftDate(first, -1);
    return { start: `${end.slice(0, 7)}-01`, end };
  }
  return { start: first, end: today };
}

// Resolve local midnight independently of the server's TZ, including DST days.
export function financeMidnight(value: string) {
  const target = new Date(`${value}T00:00:00Z`).getTime();
  let time = target;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: FINANCE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = formatter.formatToParts(new Date(time));
    const n = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const local = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
    const correction = target - local;
    time += correction;
    if (correction === 0) break;
  }
  return new Date(time);
}
