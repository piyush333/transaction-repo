"use client";

import { cn } from "@/lib/cn";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Building2,
  Users,
  ScaleIcon,
  ShieldCheck,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/cities", label: "Cities", icon: Building2 },
  { href: "/parties", label: "Parties", icon: Users },
  { href: "/graphs", label: "Graphs", icon: BarChart3 },
  { href: "/reconciliation", label: "Reconciliation", icon: ScaleIcon },
  { href: "/audit-log", label: "Audit Log", icon: ShieldCheck },
];

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
