import { randomInt } from "node:crypto";

const BUSINESS_TIME_ZONE = "America/Los_Angeles";

export function invoiceDatePrefix(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}${value("month")}${value("day")}`;
}

export function generateInvoiceNumber(
  date = new Date(),
  randomValue = randomInt(0, 100_000_000),
): string {
  if (!Number.isInteger(randomValue) || randomValue < 0 || randomValue >= 100_000_000) {
    throw new RangeError("randomValue must be an integer from 0 through 99,999,999");
  }
  return `${invoiceDatePrefix(date)}${String(randomValue).padStart(8, "0")}`;
}
