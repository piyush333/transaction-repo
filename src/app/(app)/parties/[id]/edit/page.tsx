import { EditPartyForm } from "@/components/forms/edit-party-form";
import { Card } from "@/components/ui/card";
import { getOtherProfiles, getPartyById } from "@/lib/queries";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function EditPartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [party, otherProfiles] = await Promise.all([getPartyById(id), getOtherProfiles()]);
  if (!party) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href={`/parties/${party.id}`} className="text-sm text-muted hover:underline">
          ← Back to {party.name}
        </Link>
        <h1 className="mt-1 text-xl font-bold">Edit Party</h1>
      </div>
      <Card className="p-6">
        <EditPartyForm party={party} otherProfiles={otherProfiles} />
      </Card>
    </div>
  );
}
