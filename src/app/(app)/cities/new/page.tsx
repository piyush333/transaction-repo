import { CreateCityForm } from "@/components/forms/create-city-form";
import { Card } from "@/components/ui/card";

export default function NewCityPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold">Add City</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Only the Owner can add or edit cities.
        </p>
      </div>
      <Card className="p-6">
        <CreateCityForm />
      </Card>
    </div>
  );
}
