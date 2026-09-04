import { randomInt } from "node:crypto";

export function generatePurchaseNumber(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const datePart = `${value("year")}${value("month")}${value("day")}`;
  return `PO-${datePart}-${String(randomInt(0, 10000)).padStart(4, "0")}`;
}
