import {
  BalanceByCityChart,
  PartyExposureChart,
  ReceivablePayableChart,
  VolumeChart,
} from "@/components/dashboard/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCityBalances,
  getCityReceivablePayable,
  getPartyExposure,
  getTransactionVolumeDaily,
} from "@/lib/queries";
import { formatDate } from "@/lib/format";

export default async function GraphsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const days = range ? parseInt(range, 10) : 30;

  const [volume, cityBalances, cityRp, partyExposure] = await Promise.all([
    getTransactionVolumeDaily(days),
    getCityBalances(),
    getCityReceivablePayable(),
    getPartyExposure(10),
  ]);

  const rpById = new Map(cityRp.map((r) => [r.city_id, r]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Graphs</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Balance, volume, and exposure — computed live from the ledger.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Transaction Volume</CardTitle>
          <div className="flex gap-1 text-xs">
            {[
              { label: "7D", value: 7 },
              { label: "30D", value: 30 },
              { label: "90D", value: 90 },
              { label: "1Y", value: 365 },
            ].map((r) => (
              <a
                key={r.value}
                href={`/graphs?range=${r.value}`}
                className={
                  "rounded-full px-2.5 py-1 " +
                  (days === r.value
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300")
                }
              >
                {r.label}
              </a>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {volume.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">No transactions in this range.</p>
          ) : (
            <VolumeChart data={volume.map((v) => ({ day: formatDate(v.day), volume: v.volume }))} />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Balance by City</CardTitle>
          </CardHeader>
          <CardContent>
            {cityBalances.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">No cities yet.</p>
            ) : (
              <BalanceByCityChart data={cityBalances.map((c) => ({ name: c.code, balance: c.balance }))} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receivable vs Payable (by City)</CardTitle>
          </CardHeader>
          <CardContent>
            {cityBalances.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">No cities yet.</p>
            ) : (
              <ReceivablePayableChart
                data={cityBalances.map((c) => {
                  const rp = rpById.get(c.city_id);
                  return { name: c.code, receivable: rp?.receivable ?? 0, payable: rp?.payable ?? 0 };
                })}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 Parties by Exposure</CardTitle>
        </CardHeader>
        <CardContent>
          {partyExposure.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">No party activity yet.</p>
          ) : (
            <PartyExposureChart
              data={partyExposure.map((p) => ({ name: p.name, exposure: p.exposure, status: p.status }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
