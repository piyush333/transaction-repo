import { ChatPanel } from "@/components/chat/chat-panel";
import { getAllProfiles, getCurrentProfile, getRecentMessages } from "@/lib/queries";
import { redirect } from "next/navigation";

export default async function ChatPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const [messages, profiles] = await Promise.all([getRecentMessages(200), getAllProfiles()]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold">Chat</h1>
        <p className="text-sm text-muted">Internal messages between everyone on this ledger.</p>
      </div>
      <ChatPanel initialMessages={messages} profiles={profiles} currentUserId={profile.id} />
    </div>
  );
}
