"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
};

function parseValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayValue(value: string) {
  return value ? value.replaceAll("-", "/") : "选择日期";
}

export function DatePicker({ value, onChange, className, ariaLabel = "选择日期" }: DatePickerProps) {
  const selected = parseValue(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    const next = parseValue(value);
    setVisibleMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  }, [value]);

  const days = useMemo(() => {
    const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const startOffset = firstDay.getDay();
    return Array.from({ length: 42 }, (_, index) => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index - startOffset + 1));
  }, [visibleMonth]);

  const choose = (date: Date) => {
    onChange(dateValue(date));
    setOpen(false);
  };

  const todayValue = dateValue(new Date());

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-input bg-background/75 px-3.5 text-left text-sm font-medium tabular-nums shadow-sm outline-none transition-all",
          "hover:border-primary/40 hover:bg-card focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/25",
          open && "border-primary/50 ring-2 ring-ring/20",
        )}
      >
        <span>{displayValue(value)}</span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="size-4" /></span>
      </button>

      {open && (
        <div role="dialog" aria-label="日期日历" className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl shadow-black/25">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" aria-label="上个月" onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))} className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronLeft className="size-4" /></button>
            <p className="text-sm font-bold tracking-wide">{visibleMonth.getFullYear()}年 {visibleMonth.getMonth() + 1}月</p>
            <button type="button" aria-label="下个月" onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))} className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronRight className="size-4" /></button>
          </div>

          <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground">
            {["日", "一", "二", "三", "四", "五", "六"].map((weekday) => <span key={weekday} className="py-1.5">{weekday}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((date) => {
              const currentValue = dateValue(date);
              const inMonth = date.getMonth() === visibleMonth.getMonth();
              const isSelected = currentValue === value;
              const isToday = currentValue === todayValue;
              return (
                <button
                  type="button"
                  key={currentValue}
                  onClick={() => choose(date)}
                  className={cn(
                    "relative flex aspect-square items-center justify-center rounded-xl text-xs font-medium transition-all",
                    inMonth ? "text-foreground hover:bg-primary/10 hover:text-primary" : "text-muted-foreground/40 hover:bg-muted/60",
                    isToday && !isSelected && "ring-1 ring-inset ring-primary/45 text-primary",
                    isSelected && "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary hover:text-primary-foreground",
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
            <span className="text-xs text-muted-foreground">{displayValue(value)}</span>
            <button type="button" onClick={() => choose(new Date())} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10">回到今天</button>
          </div>
        </div>
      )}
    </div>
  );
}

type DateTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

function currentTimeValue() {
  const now = new Date();
  const roundedMinutes = Math.floor(now.getMinutes() / 5) * 5;
  return {
    hour: String(now.getHours()).padStart(2, "0"),
    minute: String(roundedMinutes).padStart(2, "0"),
  };
}

export function DateTimePicker({ value, onChange, className }: DateTimePickerProps) {
  const [selectedDate = "", selectedTime = ""] = value.split("T");
  const [selectedHour = "", selectedMinute = ""] = selectedTime.split(":");

  const updateDate = (date: string) => {
    const fallback = currentTimeValue();
    onChange(`${date}T${selectedHour || fallback.hour}:${selectedMinute || fallback.minute}`);
  };

  const updateTime = (part: "hour" | "minute", nextValue: string) => {
    const fallback = currentTimeValue();
    const date = selectedDate || dateValue(new Date());
    const hour = part === "hour" ? nextValue : selectedHour || fallback.hour;
    const minute = part === "minute" ? nextValue : selectedMinute || fallback.minute;
    onChange(`${date}T${hour}:${minute}`);
  };

  const useCurrentTime = () => {
    const now = new Date();
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    onChange(`${dateValue(now)}T${hour}:${minute}`);
  };

  return (
    <div className={cn("grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(250px,.7fr)]", className)}>
      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">日期</span>
        <DatePicker value={selectedDate} onChange={updateDate} ariaLabel="选择到店日期" />
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">时间</span>
          <button
            type="button"
            onClick={useCurrentTime}
            className="text-xs font-semibold text-primary transition-colors hover:text-primary/75"
          >
            现在
          </button>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-input bg-card/80 p-1 shadow-sm">
          <div className="flex items-center gap-1.5 pl-2 text-muted-foreground">
            <Clock3 className="size-4 shrink-0" />
            <Select value={selectedHour} onValueChange={(next) => updateTime("hour", next)}>
              <SelectTrigger aria-label="选择小时" className="h-9 min-h-0 border-0 bg-transparent px-2 shadow-none focus:ring-0">
                <SelectValue placeholder="时" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {HOURS.map((hour) => <SelectItem key={hour} value={hour}>{hour}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <span className="font-semibold text-muted-foreground">:</span>
          <Select value={selectedMinute} onValueChange={(next) => updateTime("minute", next)}>
            <SelectTrigger aria-label="选择分钟" className="h-9 min-h-0 border-0 bg-transparent px-2 shadow-none focus:ring-0">
              <SelectValue placeholder="分" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {MINUTES.map((minute) => <SelectItem key={minute} value={minute}>{minute}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
