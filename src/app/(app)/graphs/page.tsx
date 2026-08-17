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
  searchParams: Promise<{ range?: string; currency?: string }>;
}) {
  const { range, currency } = await searchParams;
  const days = range ? parseInt(range, 10) : 30;

  const [volume, cityBalances, cityRp, partyExposure] = await Promise.all([
    getTransactionVolumeDaily(days),
    getCityBalances(),
    getCityReceivablePayable(),
    getPartyExposure(50),
  ]);

  // Charts plot one currency at a time — the app holds no exchange rates, so
  // a shared axis across currencies would be meaningless.
  const availableCurrencies = [
    ...new Set([
      ...cityBalances.map((c) => c.currency),
      ...volume.map((v) => v.currency),
      ...partyExposure.map((p) => p.currency),
    ]),
  ].sort();
  const cur = currency && availableCurrencies.includes(currency)
    ? currency
    : availableCurrencies[0] ?? "INR";

  const volumeCur = volume.filter((v) => v.currency === cur);
  const cityBalancesCur = cityBalances.filter((c) => c.currency === cur);
  const partyExposureCur = partyExposure.filter((p) => p.currency === cur && p.balance !== 0).slice(0, 10);
  const rpById = new Map(cityRp.map((r) => [`${r.city_id}|${r.currency}`, r]));
  const rangeQs = range ? `&range=${range}` : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Graphs</h1>
          <p className="text-sm text-muted">
            Balance, volume, and exposure — computed live from the ledger.
          </p>
        </div>
        {availableCurrencies.length > 1 && (
          <div className="flex gap-1 text-xs">
            {availableCurrencies.map((c) => (
              <a
                key={c}
                href={`/graphs?currency=${c}${rangeQs}`}
                className={
                  "rounded-full px-2.5 py-1 " +
                  (cur === c
                    ? "bg-accent text-accent-foreground shadow-sm shadow-accent/30"
                    : "bg-foreground/[0.06] text-muted hover:bg-foreground/[0.1] transition-colors")
                }
              >
                {c}
              </a>
            ))}
          </div>
        )}
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
                href={`/graphs?range=${r.value}&currency=${cur}`}
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
          {volumeCur.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No transactions in this range.</p>
          ) : (
            <VolumeChart
              currency={cur}
              data={volumeCur.map((v) => ({ day: formatDate(v.day), volume: v.volume }))}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Balance by City</CardTitle>
          </CardHeader>
          <CardContent>
            {cityBalancesCur.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No cities yet.</p>
            ) : (
              <BalanceByCityChart
                currency={cur}
                data={cityBalancesCur.map((c) => ({ name: c.code, balance: c.balance }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receivable vs Payable (by City)</CardTitle>
          </CardHeader>
          <CardContent>
            {cityBalancesCur.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No cities yet.</p>
            ) : (
              <ReceivablePayableChart
                currency={cur}
                data={cityBalancesCur.map((c) => {
                  const rp = rpById.get(`${c.city_id}|${c.currency}`);
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
          {partyExposureCur.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No party activity yet.</p>
          ) : (
            <PartyExposureChart
              currency={cur}
              data={partyExposureCur.map((p) => ({
                name: p.name,
                exposure: p.exposure,
                status: p.status,
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
