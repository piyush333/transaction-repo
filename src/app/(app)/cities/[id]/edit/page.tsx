import { EditCityForm } from "@/components/forms/edit-city-form";
import { Card } from "@/components/ui/card";
import { getCityById } from "@/lib/queries";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function EditCityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const city = await getCityById(id);
  if (!city) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href={`/cities/${city.id}`} className="text-sm text-muted hover:underline">
          ← Back to {city.name}
        </Link>
        <h1 className="mt-1 text-xl font-bold">Edit City</h1>
      </div>
      <Card className="p-6">
        <EditCityForm city={city} />
      </Card>
    </div>
  );
}
