"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Boxes, Check, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { nextAvailablePartId, searchInventoryParts } from "@/lib/inventory-part-search";
import { cn } from "@/lib/utils";

export type InventoryPartOption = {
  id: string; sku: string; name: string; unit: string; available_qty: number;
  is_active: boolean; image_data_url: string | null;
};

type Props = {
  id: string;
  items: InventoryPartOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
};

export function InventoryPartCombobox({ id, items, value, onChange, disabled, loading }: Props) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number; transform?: string } | null>(null);
  const visible = open && !disabled && !loading;
  const selected = items.find((item) => item.id === value);
  const matches = useMemo(() => searchInventoryParts(items, query), [items, query]);
  const active = matches.find((item) => item.id === activeId && item.available_qty > 0);
  const menuReady = visible && position !== null;

  const show = () => { setQuery(""); setActiveId(""); setOpen(true); };
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };
  const choose = (item: InventoryPartOption) => {
    if (disabled || loading || !item.is_active || item.available_qty <= 0) return;
    onChange(item.id);
    close(true);
  };

  useLayoutEffect(() => {
    if (!visible) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const below = bottom - rect.bottom - 12;
      const above = rect.top - top - 12;
      const showAbove = below < 240 && above > below;
      const width = Math.min(rect.width, window.innerWidth - 16);
      setPosition({
        top: showAbove ? rect.top - 6 : rect.bottom + 6,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width, maxHeight: Math.max(100, Math.min(400, showAbove ? above : below)),
        transform: showAbove ? "translateY(-100%)" : undefined,
      });
    };
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [visible]);

  useEffect(() => {
    if (menuReady) inputRef.current?.focus({ preventScroll: true });
  }, [menuReady]);

  useEffect(() => {
    if (!visible) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [visible]);

  useEffect(() => {
    if (!visible || !activeId) return;
    document.getElementById(`${listId}-${activeId}`)?.scrollIntoView({ block: "nearest" });
  }, [activeId, listId, visible]);

  return <>
    <button
      ref={triggerRef} id={id} type="button" disabled={disabled || loading}
      aria-haspopup="listbox" aria-expanded={visible} aria-controls={visible ? listId : undefined}
      className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-input bg-card/80 px-3.5 py-2 text-left text-sm shadow-sm outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
      title={selected ? `${selected.sku} · ${selected.name}` : undefined}
      onClick={() => visible ? close() : show()}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); }
      }}
    >
      <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>{loading ? "加载配件中…" : selected ? `${selected.sku} · ${selected.name}` : "搜索或选择库存配件"}</span>
      <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground", visible && "rotate-180")} />
    </button>
    {menuReady && createPortal(
      <div ref={menuRef} style={position!} className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
        onBlur={() => requestAnimationFrame(() => {
          if (!menuRef.current?.contains(document.activeElement) && document.activeElement !== triggerRef.current) setOpen(false);
        })}
      >
        <div className="relative shrink-0 border-b p-2">
          <Search aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={inputRef} role="combobox" aria-label="搜索库存配件" aria-autocomplete="list" aria-expanded={visible}
            aria-controls={listId} aria-activedescendant={active ? `${listId}-${active.id}` : undefined}
            autoComplete="off" placeholder="搜索 SKU / 英文名 / 中文名" className="pl-9 pr-10" value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveId(""); }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setActiveId(nextAvailablePartId(matches, activeId, event.key === "ArrowDown" ? 1 : -1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                const item = active ?? matches.find((option) => option.available_qty > 0);
                if (item) choose(item);
              } else if (event.key === "Escape") {
                event.preventDefault(); event.stopPropagation(); close(true);
              } else if (event.key === "Tab") {
                // Return to the trigger before native Tab moves to the next form field.
                close(true);
              }
            }}
          />
          {query && <button type="button" aria-label="清空配件搜索" className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => { setQuery(""); setActiveId(""); inputRef.current?.focus(); }}><X aria-hidden="true" className="size-4" /></button>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
          <div id={listId} role="listbox" aria-label="库存配件搜索结果">
            {matches.map((item) => <button key={item.id} id={`${listId}-${item.id}`} type="button" role="option" tabIndex={-1}
              disabled={item.available_qty <= 0} aria-disabled={item.available_qty <= 0} aria-selected={item.id === value}
              className={cn("flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50", active?.id === item.id && "bg-muted")}
              onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}
            >
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                {item.image_data_url ? <img src={item.image_data_url} alt="" loading="lazy" className="size-full object-cover" /> : <Boxes aria-hidden="true" className="size-4 text-muted-foreground" />}
              </span>
              <span className="min-w-0 flex-1"><span className="block break-words font-medium">{item.name}</span><span className="block break-all font-mono text-xs text-muted-foreground">{item.sku}</span><span className={cn("block text-xs", item.available_qty > 0 ? "text-primary" : "text-muted-foreground")}>{item.available_qty > 0 ? `可用 ${item.available_qty} ${item.unit}` : "暂无可用库存"}</span></span>
              {item.id === value && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
            </button>)}
          </div>
          {!matches.length && <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">{query.trim() ? "未找到匹配配件，试试其他编号或名称" : "暂无可选择的库存配件"}</p>}
        </div>
        <p className="shrink-0 border-t px-3 py-2 text-xs text-muted-foreground" role="status">{matches.length} 个匹配 · 有库存优先 · 支持多个关键词</p>
      </div>, document.body,
    )}
  </>;
}
