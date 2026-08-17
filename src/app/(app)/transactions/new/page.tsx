import { CreateTransactionForm } from "@/components/forms/create-transaction-form";
import { Card } from "@/components/ui/card";
import { getCities, getParties } from "@/lib/queries";

export default async function NewTransactionPage() {
  const [cities, parties] = await Promise.all([getCities(), getParties()]);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold">New Transaction</h1>
        <p className="text-sm text-muted">
          A unique token is generated automatically once you submit.
        </p>
      </div>
      <Card className="p-6">
        {cities.length === 0 ? (
          <p className="text-sm text-muted">Add a city first.</p>
        ) : parties.length === 0 ? (
          <p className="text-sm text-muted">Add a party first.</p>
        ) : (
          <CreateTransactionForm cities={cities} parties={parties} />
        )}
      </Card>
    </div>
  );
}
