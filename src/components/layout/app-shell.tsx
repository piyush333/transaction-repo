import { NavLinks } from "@/components/layout/nav-links";
import { SearchBar } from "@/components/layout/search-bar";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { MobileNav } from "@/components/layout/mobile-nav";
import type { Profile } from "@/lib/types";
import type { ReactNode } from "react";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  city_manager: "City Manager",
  operator: "Operator",
  viewer: "Viewer",
  auditor: "Auditor",
};

export function AppShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 flex-col border-r border-black/10 p-4 md:flex dark:border-white/10">
        <div className="mb-6 px-2">
          <p className="text-sm font-bold tracking-tight">Settlement Ledger</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Private accounting</p>
        </div>
        <NavLinks />
        <div className="mt-auto space-y-2 border-t border-black/10 pt-4 dark:border-white/10">
          <div className="px-3">
            <p className="truncate text-sm font-medium">{profile.full_name || profile.email}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {ROLE_LABELS[profile.role] ?? profile.role}
            </p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-black/10 bg-white/90 px-4 py-3 backdrop-blur md:px-6 dark:border-white/10 dark:bg-zinc-950/90">
          <p className="text-sm font-bold md:hidden">Settlement Ledger</p>
          <SearchBar />
        </header>
        <main className="flex-1 p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
