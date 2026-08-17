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
        <p className="text-sm text-muted">
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
                    ? "bg-accent text-accent-foreground shadow-sm shadow-accent/30"
                    : "bg-foreground/[0.06] text-muted hover:bg-foreground/[0.1] transition-colors")
                }
              >
                {r.label}
              </a>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {volume.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No transactions in this range.</p>
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
              <p className="py-10 text-center text-sm text-muted">No cities yet.</p>
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
              <p className="py-10 text-center text-sm text-muted">No cities yet.</p>
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
            <p className="py-10 text-center text-sm text-muted">No party activity yet.</p>
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
