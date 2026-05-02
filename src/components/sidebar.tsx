"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBell,
  IconCalculator,
  IconHome,
  IconSettings,
  IconTrendingUp,
} from "./icons";
import type { ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: <IconHome /> },
  { href: "/yield", label: "Top Yield", icon: <IconTrendingUp /> },
  { href: "/calculator", label: "Calculator", icon: <IconCalculator /> },
  { href: "/notifications", label: "Notifications", icon: <IconBell /> },
  { href: "/settings", label: "Settings", icon: <IconSettings /> },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 sticky top-0 h-screen">
      <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800/80">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-gradient-to-br from-amber-300 to-emerald-500 grid place-items-center text-lg shadow-sm">
            🌻
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-sm">SFL Optimizer</div>
            <div className="text-xs text-zinc-500">Yield dashboard</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 font-medium"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
              }`}
            >
              <span className={active ? "text-emerald-600 dark:text-emerald-400" : ""}>
                {item.icon}
              </span>
              <span>{item.label}</span>
              {active && <span className="ml-auto size-1.5 rounded-full bg-emerald-500" />}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-zinc-200 dark:border-zinc-800/80">
        <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-amber-300/10 dark:from-emerald-500/15 dark:to-amber-300/10 border border-emerald-500/20 p-3">
          <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            Personal use
          </div>
          <div className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1 leading-snug">
            Sunflower Land is © Sunflower Land. This tool only reads farm data.
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Mobile bottom nav (shown only on small screens). */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur z-20">
      <div className="grid grid-cols-5 max-w-xl mx-auto">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] ${
                active ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
