import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { getAllProfiles, getAuditLogs, getCurrentProfile } from "@/lib/queries";
import { redirect } from "next/navigation";

export default async function AuditLogPage() {
  const profile = await getCurrentProfile();
  // Each person owns exactly one book and the audit log is RLS-scoped to it,
  // so there's nothing further to gate on beyond being signed in.
  if (!profile) {
    redirect("/dashboard");
  }

  const [logs, profiles] = await Promise.all([getAuditLogs(200), getAllProfiles()]);
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Audit Log</h1>
        <p className="text-sm text-muted">
          Every create, confirm, status change and reversal — append-only, never deleted.
        </p>
      </div>

      {logs.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">No activity recorded yet.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-muted">
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
                    className="border-b border-border/70 last:border-0"
                  >
                    <td className="px-4 py-3 text-xs text-muted">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-4 py-3 text-foreground/80">
                      {log.entity_type}
                    </td>
                    <td className="px-4 py-3 font-medium">{log.action}</td>
                    <td className="px-4 py-3 text-foreground/80">
                      {actor?.full_name || actor?.email || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{log.reason || "—"}</td>
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
