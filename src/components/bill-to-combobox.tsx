"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { billToSearchKey, searchBillToCompanies } from "@/lib/bill-to-options";
import { cn } from "@/lib/utils";

type BillToComboboxProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export function BillToCombobox({ id, value, onChange, disabled, required, className }: BillToComboboxProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<string[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number; transform?: string } | null>(null);
  const visible = open && !disabled;
  const matches = useMemo(() => searchBillToCompanies(companies ?? [], query), [companies, query]);
  const newCompany = value.trim();
  const canCreate = Boolean(newCompany) && companies !== null
    && !companies.some((company) => billToSearchKey(company) === billToSearchKey(newCompany));
  const optionCount = matches.length + (canCreate ? 1 : 0);

  // Fetch names only, within the signed-in account's data scope; no shared cache.
  useEffect(() => {
    if (!visible || companies !== null) return;
    const controller = new AbortController();
    setError(false);
    fetch("/api/bill-to", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("History unavailable");
        const data = await response.json();
        if (!Array.isArray(data.companies) || !data.companies.every((company: unknown) => typeof company === "string")) {
          throw new Error("Invalid company list");
        }
        if (!controller.signal.aborted) setCompanies(data.companies);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [visible, companies, retry]);

  // Portal avoids clipping by the new-case card and follows the mobile keyboard.
  useLayoutEffect(() => {
    if (!visible) return;
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const below = viewportBottom - rect.bottom - 12;
      const above = rect.top - viewportTop - 12;
      const showAbove = below < 180 && above > below;
      const maxHeight = Math.max(64, Math.min(320, showAbove ? above : below));
      const width = Math.min(rect.width, window.innerWidth - 16);
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: showAbove ? rect.top - 6 : rect.bottom + 6,
        transform: showAbove ? "translateY(-100%)" : undefined,
        width,
        maxHeight,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [visible]);

  useEffect(() => {
    if (activeIndex >= 0) {
      document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, listId]);

  const showHistory = () => {
    setQuery("");
    setActiveIndex(-1);
    setOpen(true);
  };

  const choose = (company: string) => {
    onChange(company);
    inputRef.current?.focus({ preventScroll: true });
    setActiveIndex(-1);
    setOpen(false);
  };

  const closeOnBlur = () => {
    requestAnimationFrame(() => {
      if (!rootRef.current?.contains(document.activeElement) && !menuRef.current?.contains(document.activeElement)) {
        setOpen(false);
      }
    });
  };

  return (
    <div ref={rootRef} className="relative min-w-0" onBlur={closeOnBlur}>
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={visible}
        aria-controls={visible ? listId : undefined}
        aria-activedescendant={visible && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        maxLength={200}
        value={value}
        required={required}
        disabled={disabled}
        placeholder="搜索或输入公司名称"
        className={cn("pr-11", className)}
        onFocus={showHistory}
        onClick={() => { if (!visible) showHistory(); }}
        onChange={(event) => {
          onChange(event.target.value);
          setQuery(event.target.value);
          setActiveIndex(-1);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!visible) { showHistory(); return; }
            setActiveIndex((index) => event.key === "ArrowDown"
              ? Math.min(index + 1, optionCount - 1)
              : index <= 0 ? optionCount - 1 : index - 1);
          } else if (event.key === "Enter" && visible) {
            event.preventDefault();
            if (activeIndex >= 0) choose(matches[activeIndex] ?? newCompany);
            else setOpen(false);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          } else if (event.key === "Tab") {
            setOpen(false);
          }
        }}
      />
      <button
        type="button"
        disabled={disabled}
        tabIndex={-1}
        aria-label={visible ? "收起历史 Bill To 公司" : "展开历史 Bill To 公司"}
        aria-expanded={visible}
        aria-controls={visible ? listId : undefined}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (visible) setOpen(false);
          else { inputRef.current?.focus({ preventScroll: true }); showHistory(); }
        }}
      >
        <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", visible && "rotate-180")} />
      </button>
      {visible && position && createPortal(
        <div
          ref={menuRef}
          style={position}
          className="fixed z-50 overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          onBlur={closeOnBlur}
        >
          <div id={listId} role="listbox" aria-label="历史 Bill To 公司" aria-busy={companies === null && !error}>
            {matches.map((company, index) => (
              <button
                key={company}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={billToSearchKey(value) === billToSearchKey(company)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(company)}
                className={cn("flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted", activeIndex === index && "bg-muted")}
              >
                <span className="min-w-0 flex-1 break-words">{company}</span>
                {billToSearchKey(value) === billToSearchKey(company) && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
              </button>
            ))}
            {canCreate && (
              <button
                id={`${listId}-${matches.length}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={false}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(newCompany)}
                className={cn("flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-primary hover:bg-primary/10", matches.length > 0 && "mt-1 border-t border-border", activeIndex === matches.length && "bg-primary/10")}
              >
                <Plus aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 break-words">使用新公司“{newCompany}”</span>
              </button>
            )}
          </div>
          {companies === null && !error && <p role="status" className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="size-4 animate-spin" />加载历史公司…</p>}
          {error && <div role="status" className="px-3 py-3 text-sm text-muted-foreground">历史公司加载失败，仍可手动输入。<button type="button" onClick={() => setRetry((count) => count + 1)} className="ml-2 text-primary">重试</button></div>}
          {companies !== null && !matches.length && !canCreate && <p role="status" className="px-3 py-3 text-sm text-muted-foreground">暂无历史公司，直接输入新公司名称</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}
