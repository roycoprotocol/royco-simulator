import { DAY_MARKETS } from "@/lib/day-markets/registry";

const DAY_MS = 86_400_000;
for (const mk of DAY_MARKETS as unknown as Record<string, unknown>[]) {
  const d = mk.defaults as Record<string, unknown>;
  const sr = (mk.series ?? []) as { date: string; price: number }[];
  if (sr.length < 3) { console.log(`${mk.id}: no history (declared ${( (d.sourceApy as number)*100).toFixed(2)}%)`); continue; }
  const first = sr[0], last = sr[sr.length - 1];
  const years = (Date.parse(last.date) - Date.parse(first.date)) / (365 * DAY_MS);
  const realized = Math.pow(last.price / first.price, 1 / years) - 1;
  const declared = d.sourceApy as number;
  console.log(
    `${mk.id}: declared ${(declared * 100).toFixed(2)}% | realized-from-history ${(realized * 100).toFixed(2)}% | gap ${((realized - declared) * 100).toFixed(2)}pp | ${sr.length} rows, ${years.toFixed(2)}y`,
  );
}
