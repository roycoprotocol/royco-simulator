import type { Metadata } from "next";
import SimulatorPageShell from "@/components/simulator/SimulatorPageShell";
import PoolCreator from "@/components/pool-creator/PoolCreator";
import { queryFromSearchParams } from "@/lib/pool-creator/permalink";

export const metadata: Metadata = {
  title: "Create a Royco Day pool",
  description:
    "Configure and launch a Royco Day pool on your own strategy: a protected Senior tranche, a first-loss Junior tranche, and a secondary exit pool.",
};

/**
 * `searchParams` is read on the SERVER and passed down as a prop.
 *
 * Not `useSearchParams()` — that suspends the whole subtree, and this repo has
 * already shipped a dead page that way once (see the warning comment in
 * `app/hybond-sim/page.tsx`).
 */
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <SimulatorPageShell>
      <PoolCreator initialQuery={queryFromSearchParams(params)} />
    </SimulatorPageShell>
  );
}
