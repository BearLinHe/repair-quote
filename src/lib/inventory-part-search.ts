type SearchablePart = { id: string; sku: string; name: string; available_qty: number; is_active: boolean };

const searchKey = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

/** Search only the inventory already authorized by the API; never match by name to select an ID. */
export function searchInventoryParts<T extends SearchablePart>(items: T[], query: string): T[] {
  const terms = searchKey(query).split(" ").filter(Boolean);
  return items.filter((item) => {
    const text = searchKey(`${item.sku} ${item.name}`);
    return item.is_active && terms.every((term) => text.includes(term));
  }).sort((a, b) => Number(b.available_qty > 0) - Number(a.available_qty > 0));
}

export function nextAvailablePartId(items: SearchablePart[], activeId: string, direction: 1 | -1): string {
  const available = items.filter((item) => item.is_active && item.available_qty > 0);
  if (!available.length) return "";
  const index = available.findIndex((item) => item.id === activeId);
  if (index < 0) return available[direction === 1 ? 0 : available.length - 1].id;
  return available[(index + direction + available.length) % available.length].id;
}
