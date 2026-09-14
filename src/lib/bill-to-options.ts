export function billToSearchKey(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** Keep the saved spelling, but collapse case/whitespace duplicates in the menu. */
export function uniqueBillToCompanies(values: Array<string | null>) {
  const companies = new Map<string, string>();
  for (const value of values) {
    if (!value?.trim()) continue;
    const key = billToSearchKey(value);
    if (!companies.has(key)) companies.set(key, value.trim());
  }
  return [...companies.values()].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function searchBillToCompanies(companies: string[], query: string) {
  const terms = billToSearchKey(query).split(" ").filter(Boolean);
  return companies.filter((company) => {
    const key = billToSearchKey(company);
    return terms.every((term) => key.includes(term));
  });
}
