import type { DayV3ProtectedExitView } from "@/components/day-v3/DayV3Goals";
import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const dollars = (value: number | undefined, digits = 2) =>
  value === undefined ? "—" : `$${value.toFixed(digits)}`;

/**
 * A visible reading of the exact Protected Exit accountant runs already used
 * by the goal flow. This component never sizes a bonus or replays redemption:
 * it only presents `runDayV3ProtectedExitScenarios` output.
 */
export default function DayV3ProtectedExitModel({
  protectedExit,
}: {
  protectedExit: DayV3ProtectedExitView;
}) {
  const hasScenarios = protectedExit.scenarios.length > 0;
  const hasComparisons = (protectedExit.comparisons?.length ?? 0) > 0;

  return (
    <Card
      data-model-state={protectedExit.status}
      data-model-source="runDayV3ProtectedExitScenarios"
    >
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-[17px]">
            Protected Exit redemption model
          </CardTitle>
          <DayV3DocsLink label="Protected Exit" topic="protectedExit" />
        </div>
        <CardDescription>
          Actual accountant redemptions at 25%, 50%, and 100% of Senior. The
          model shows what Senior receives and how much Junior remains.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {hasScenarios ? (
          <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Senior redeemed</TableHead>
                  <TableHead className="text-right">Actual payout</TableHead>
                  <TableHead className="text-right">Bonus paid</TableHead>
                  <TableHead className="text-right">On-chain cap</TableHead>
                  <TableHead className="text-right">Junior used</TableHead>
                  <TableHead className="text-right">Coverage left</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {protectedExit.scenarios.map((scenario) => (
                  <TableRow key={scenario.redeemedPct}>
                    <TableCell className="font-mono font-semibold tabular-nums">
                      {scenario.redeemedPct.toFixed(0)}%
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold tabular-nums">
                      {dollars(scenario.payoutPer100)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {dollars(scenario.bonusPaidPer100)}
                      {scenario.capped ? " (capped)" : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {dollars(scenario.onChainBonusCapPer100)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {dollars(scenario.juniorUsedPer100)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {scenario.remainingCoveragePct.toFixed(2)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : hasComparisons ? (
          <div className="flex flex-col gap-3">
            <p className="text-[11.5px] leading-relaxed text-[var(--secondary)]">
              History cannot yet select a trigger. These exact accountant runs
              compare possible triggers with no bonus; they are scenarios, not
              recommendations.
            </p>
            <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Coverage-left trigger</TableHead>
                    <TableHead className="text-right">Drawdown to activate</TableHead>
                    <TableHead className="text-right">Payout at 100%</TableHead>
                    <TableHead className="text-right">Junior used</TableHead>
                    <TableHead className="text-right">Coverage left</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {protectedExit.comparisons?.map((comparison) => (
                    <TableRow key={comparison.thresholdPct}>
                      <TableCell className="font-mono font-semibold tabular-nums">
                        {comparison.thresholdPct.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {comparison.activationStressPct.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {dollars(comparison.payoutPer100)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {dollars(comparison.juniorUsedPer100)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {comparison.remainingCoveragePct.toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3.5 py-3 text-[11.5px] leading-relaxed text-[var(--secondary)]">
            {protectedExit.message ||
              "Resolve the trigger to run the 25%, 50%, and 100% redemption model."}
          </p>
        )}

        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--border-subtle)] pt-3 text-[10px] text-[var(--tertiary)]">
          <span>
            Trigger: {protectedExit.thresholdPct === null
              ? "unresolved"
              : `${protectedExit.thresholdPct.toFixed(2)}% coverage left`}
          </span>
          <span>
            Bonus: {protectedExit.bonusPct === null
              ? "unresolved"
              : `${protectedExit.bonusPct.toFixed(2)}%`}
          </span>
          <span>
            Activation stress: {typeof protectedExit.activationStressPct === "number"
              ? `${protectedExit.activationStressPct.toFixed(2)}%`
              : "unresolved"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
