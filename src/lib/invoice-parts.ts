export type InvoicePartUsage = { name: string; qty: number | null };

type PartSource = { name?: unknown; qty?: unknown };

export function invoicePartUsage(snapshot: unknown, fallback: PartSource[] = []): InvoicePartUsage[] {
  const data = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? snapshot as { parts?: unknown }
    : {};
  // An empty snapshot array means no parts. Only older snapshots with no array
  // fall back to the saved repair-case lines; never combine the two sources.
  const parts = Array.isArray(data.parts) ? data.parts : fallback;
  return parts.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const { name, qty } = part as PartSource;
    if (typeof name !== "string" || !name.trim()) return [];
    return [{
      name: name.trim(),
      qty: typeof qty === "number" && Number.isFinite(qty) && qty >= 0 ? qty : null,
    }];
  });
}

export function invoicePartUsageText(parts: InvoicePartUsage[]) {
  return parts.map((part) => `${part.name} × ${part.qty ?? "数量未记录"}`).join("\n");
}
