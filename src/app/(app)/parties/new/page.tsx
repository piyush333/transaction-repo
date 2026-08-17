import { CreatePartyForm } from "@/components/forms/create-party-form";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { getCities } from "@/lib/queries";

export default async function NewPartyPage() {
  const cities = await getCities();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold">Add Party</h1>
        <p className="text-sm text-muted">
          Every party gets its own ledger, tracked automatically from transactions.
        </p>
      </div>
      <Card className="p-6">
        {cities.length === 0 ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted">Add a city first before adding parties.</p>
            <LinkButton href="/cities/new">Add City</LinkButton>
          </div>
        ) : (
          <CreatePartyForm cities={cities} />
        )}
      </Card>
    </div>
  );
}
