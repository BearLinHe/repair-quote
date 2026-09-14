"use client";

import { useId, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";

export function CompanyPicker({ value, onChange, options, id, disabled = false, placeholder = "搜索并选择 Bill To 公司" }: {
  value: string; onChange: (value: string) => void; options: string[];
  id?: string; disabled?: boolean; placeholder?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false);
  const [active, setActive] = useState(0);
  const matches = options.filter((company) => company.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const choose = (company: string) => { onChange(company); setQuery(""); setOpen(false); };
  return <div className="relative">
    <Input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
      aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
      autoComplete="off" disabled={disabled} placeholder={placeholder} className="pr-9"
      value={open && typing ? query : value}
      onFocus={() => { setOpen(true); setQuery(""); setTyping(false); setActive(0); }}
      onBlur={() => setOpen(false)}
      onChange={(event) => { if (value) onChange(""); setQuery(event.target.value); setTyping(true); setOpen(true); setActive(0); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { if (open) event.stopPropagation(); setOpen(false); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          setActive((current) => Math.max(0, Math.min(matches.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
        }
        if (event.key === "Enter" && open) { event.preventDefault(); if (matches[active]) choose(matches[active]); }
      }} />
    <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    {open && <div id={listId} role="listbox" aria-label="Bill To 公司" className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
      {matches.map((company, index) => <button type="button" role="option" aria-selected={value === company} id={`${listId}-${index}`} key={company}
        ref={index === active ? (element) => { element?.scrollIntoView({ block: "nearest" }); } : undefined}
        tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(company)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted ${index === active ? "bg-muted" : ""}`}>
        <span className="break-words">{company}</span>{value === company && <Check className="size-4 shrink-0 text-primary" />}
      </button>)}
      {!matches.length && <p className="px-3 py-4 text-sm text-muted-foreground">没有匹配的公司</p>}
    </div>}
  </div>;
}
