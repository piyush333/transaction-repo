import { CreatePartyForm } from "@/components/forms/create-party-form";
import { Card } from "@/components/ui/card";
import { getCities } from "@/lib/queries";

export default async function NewPartyPage() {
  const cities = await getCities();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold">Add Party</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Every party gets its own ledger, tracked automatically from transactions.
        </p>
      </div>
      <Card className="p-6">
        {cities.length === 0 ? (
          <p className="text-sm text-zinc-500">Add a city first before adding parties.</p>
        ) : (
          <CreatePartyForm cities={cities} />
        )}
      </Card>
    </div>
  );
}
