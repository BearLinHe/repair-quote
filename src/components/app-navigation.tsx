"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesCombined, PackagePlus, SlidersHorizontal, Warehouse, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/purchases", label: "采购入库", shortLabel: "采购", icon: PackagePlus, match: ["/purchases"] },
  { href: "/inventory", label: "库存管理", shortLabel: "库存", icon: Warehouse, match: ["/inventory"] },
  { href: "/dashboard", label: "维修单", shortLabel: "维修", icon: Wrench, match: ["/dashboard", "/cases"] },
  { href: "/finance", label: "经营分析", shortLabel: "经营", icon: ChartNoAxesCombined, match: ["/finance"] },
  { href: "/settings", label: "系统设置", shortLabel: "设置", icon: SlidersHorizontal, match: ["/settings"] },
];

export function AppNavigation() {
  const pathname = usePathname();
  const isActive = (matches: string[]) => matches.some((value) => pathname.startsWith(value));

  return (
    <>
      <nav className="hidden items-center gap-1 rounded-2xl bg-muted/45 p-1.5 lg:flex" aria-label="主要导航">
        {links.map(({ href, label, icon: Icon, match }) => {
          const active = isActive(match);
          return (
            <div key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-all xl:min-h-11 xl:px-4",
                  active
                    ? "bg-primary text-primary-foreground shadow-[0_8px_22px_color-mix(in_srgb,var(--primary)_24%,transparent)]"
                    : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                )}
              >
                <Icon className="size-[17px] stroke-[1.8]" />
                <span>{label}</span>
              </Link>
            </div>
          );
        })}
      </nav>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border/80 bg-card/95 px-[max(8px,env(safe-area-inset-left))] pb-[max(7px,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl lg:hidden" aria-label="手机导航">
        {links.map(({ href, shortLabel, icon: Icon, match }) => {
          const active = isActive(match);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span className={cn("flex size-8 items-center justify-center rounded-xl transition-colors", active && "bg-primary text-primary-foreground shadow-sm")}><Icon className="size-[18px] stroke-[1.8]" /></span>
              <span>{shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
