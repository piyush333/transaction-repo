import { NavLinks } from "@/components/layout/nav-links";
import { SearchBar } from "@/components/layout/search-bar";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import type { Profile } from "@/lib/types";
import type { ReactNode } from "react";

// Each person owns exactly one private book, so there is only one role now.
// The `role` column is kept in the schema in case delegation is ever added
// back to an individual book.

export function AppShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 flex-col border-r border-border bg-surface/60 p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-sm shadow-accent/30">
            <span className="text-sm font-bold">S</span>
          </div>
          <div>
            <p className="text-sm font-bold leading-tight tracking-tight">Settlement Ledger</p>
            <p className="text-[11px] text-muted">Private accounting</p>
          </div>
        </div>
        <NavLinks />
        <div className="mt-auto space-y-1 border-t border-border pt-3">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
              {(profile.full_name || profile.email).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{profile.full_name || profile.email}</p>
              <p className="text-xs text-muted">Your book</p>
            </div>
          </div>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:px-6">
          <p className="text-sm font-bold md:hidden">Settlement Ledger</p>
          <SearchBar />
        </header>
        <main className="flex-1 p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
