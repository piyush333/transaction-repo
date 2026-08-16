import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { getAllProfiles, getAuditLogs, getCurrentProfile } from "@/lib/queries";
import { redirect } from "next/navigation";

export default async function AuditLogPage() {
  const profile = await getCurrentProfile();
  if (!profile || !["owner", "auditor"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const [logs, profiles] = await Promise.all([getAuditLogs(200), getAllProfiles()]);
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Audit Log</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Every create, confirm, status change and reversal — append-only, never deleted.
        </p>
      </div>

      {logs.length === 0 ? (
        <Card className="p-10 text-center text-sm text-zinc-500">No activity recorded yet.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-black/10 text-left text-xs uppercase text-zinc-500 dark:border-white/10">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">By</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const actor = log.performed_by ? profileById.get(log.performed_by) : null;
                return (
                  <tr
                    key={log.id}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                      {log.entity_type}
                    </td>
                    <td className="px-4 py-3 font-medium">{log.action}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                      {actor?.full_name || actor?.email || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{log.reason || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
