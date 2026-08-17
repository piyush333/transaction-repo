"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Message, Profile } from "@/lib/types";
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ChatPanel({
  initialMessages,
  profiles,
  currentUserId,
}: {
  initialMessages: Message[];
  profiles: Profile[];
  currentUserId: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const next = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === next.id) ? prev : [...prev, next]));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: currentUserId, body })
      .select()
      .single();
    setSending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setText("");
    setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as Message]));
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col md:h-[calc(100vh-7.5rem)]">
      <div className="flex-1 space-y-3 overflow-y-auto rounded-t-xl border border-b-0 border-border bg-surface p-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">
            No messages yet. Say hello.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          const sender = profileById.get(m.sender_id);
          return (
            <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                  mine
                    ? "rounded-br-sm bg-accent text-accent-foreground"
                    : "rounded-bl-sm bg-foreground/[0.06] text-foreground"
                )}
              >
                {m.body}
              </div>
              <p className="mt-1 px-1 text-[11px] text-muted">
                {!mine && (sender?.full_name || sender?.email || "Unknown")} · {formatDateTime(m.created_at)}
              </p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2 rounded-b-xl border border-border bg-surface p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message..."
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" size="md" disabled={sending || !text.trim()} aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
