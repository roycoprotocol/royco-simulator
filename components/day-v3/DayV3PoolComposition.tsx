import { DAY_V3_TONE_DOT } from "@/components/day-v3/DayV3Comparison";
import { unitAmount, type DayV3Unit } from "@/components/day-v3/format";

/**
 * What the exit pool is made of, and what set it.
 *
 * The SLP's capital is not one asset. It is a two-sided Balancer E-CLP holding
 * Senior shares on one side and the quote asset on the other, and almost every
 * number about the exit depends on which side is which: the stablecoin leg is
 * the depth a seller actually sells into, and the Senior leg is inventory the
 * pool carries to hold its price band open. Until this existed the page stated
 * an SLP capital figure and left the composition to be guessed.
 *
 * The balance point is not a free choice. It is what the maximum premium buys —
 * beta is `1 + premium`, and the resting composition follows from the curve.
 * That is how the deployment interface sets it, so it is how it is reported
 * here, premium and composition side by side.
 */
export default function DayV3PoolComposition({
  exitAssetLabel,
  poolPer100,
  premiumBps,
  seniorWeight,
  unit,
}: {
  /** What the non-Senior side is held in, named by the issuer. */
  exitAssetLabel: string;
  /** Pool capital per 100 Senior, so the two sides can be shown in amounts. */
  poolPer100: number | null;
  /** The premium the curve encodes, in bps. Null when no curve resolves. */
  premiumBps: number | null;
  /** Senior share of the pool's value at rest, 0..1. */
  seniorWeight: number;
  unit: DayV3Unit;
}) {
  const seniorPct = seniorWeight * 100;
  const quotePct = 100 - seniorPct;
  const seniorAmount = poolPer100 === null ? null : poolPer100 * seniorWeight;
  const quoteAmount = poolPer100 === null ? null : poolPer100 * (1 - seniorWeight);
  // The Senior leg is often a few percent, which is a sliver. It is still the
  // half that the premium moves, so it keeps a visible minimum rather than
  // disappearing into the border.
  const drawnSeniorPct = Math.max(1.5, Math.min(98.5, seniorPct));

  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-3"
      data-pool-composition
    >
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
          What the pool holds
        </span>
        <span className="text-[9.5px] text-[var(--tertiary)]">
          {premiumBps === null
            ? "no curve resolved"
            : `set by a ${premiumBps.toFixed(premiumBps < 10 ? 1 : 0)} bps maximum premium`}
        </span>
      </span>

      <span
        aria-hidden="true"
        className="flex h-2.5 w-full overflow-hidden rounded-full border border-[var(--border-subtle)]"
      >
        <span
          style={{
            background: DAY_V3_TONE_DOT.senior,
            width: `${drawnSeniorPct}%`,
          }}
        />
        <span
          style={{
            background: DAY_V3_TONE_DOT.liquidity,
            opacity: 0.45,
            width: `${100 - drawnSeniorPct}%`,
          }}
        />
      </span>

      <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex items-baseline gap-1.5 text-[10.5px] text-[var(--secondary)]">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 translate-y-px rounded-full"
            style={{ background: DAY_V3_TONE_DOT.senior }}
          />
          <span className="font-mono font-semibold tabular-nums text-[var(--foreground)]">
            {seniorPct.toFixed(seniorPct < 10 ? 2 : 1)}%
          </span>
          Senior shares
          {seniorAmount === null ? null : (
            <span className="text-[var(--tertiary)]">
              · {unitAmount(seniorAmount, unit)}
            </span>
          )}
        </span>
        <span className="flex items-baseline gap-1.5 text-[10.5px] text-[var(--secondary)]">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 translate-y-px rounded-full"
            style={{ background: DAY_V3_TONE_DOT.liquidity, opacity: 0.45 }}
          />
          <span className="font-mono font-semibold tabular-nums text-[var(--foreground)]">
            {quotePct.toFixed(quotePct > 90 ? 2 : 1)}%
          </span>
          {exitAssetLabel}
          {quoteAmount === null ? null : (
            <span className="text-[var(--tertiary)]">
              · {unitAmount(quoteAmount, unit)}
            </span>
          )}
        </span>
      </span>

      <span className="text-[9.5px] leading-snug text-[var(--tertiary)]">
        The {exitAssetLabel} side is the depth a seller sells into. The Senior
        side is inventory the pool carries to hold its premium band open, so a
        wider premium moves capital from the first to the second.
      </span>
    </div>
  );
}
