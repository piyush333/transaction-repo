"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBar() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <form onSubmit={onSubmit} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search token, party, city, phone, amount..."
        className="w-full rounded-lg border border-black/10 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-zinc-400 dark:border-white/10 dark:bg-zinc-900 dark:focus:border-zinc-500"
      />
    </form>
  );
}
