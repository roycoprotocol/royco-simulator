"use client";

import { useCallback, useEffect, useState } from "react";

import {
  DAY_V3_POOL_DESIGN_SCHEMA,
  dayV3PoolDesignRequestKey,
  dayV3PoolDesignMatchesGoals,
  dayV3PoolDesignIssueMessage,
  isDayV3PoolDesignInventory,
  isDayV3PoolDesignResult,
  type DayV3PoolDesignResult,
  type DayV3PoolDesignTarget,
  type DayV3PoolDesignContext,
} from "@/lib/day-v3/pool-design";
import type { DayV3Goals } from "@/lib/day-v3/types";

type InventoryState =
  | { status: "loading"; targets: DayV3PoolDesignTarget[]; message: string }
  | { status: "ready"; targets: DayV3PoolDesignTarget[]; message: string }
  | { status: "unresolved"; targets: DayV3PoolDesignTarget[]; message: string };

type DesignState =
  | { status: "missing-goal"; result: null; message: string }
  | { status: "resolving"; result: null; message: string }
  | {
      status: "resolved";
      result: Extract<DayV3PoolDesignResult, { status: "resolved" }>;
      message: string;
    }
  | {
      status: "infeasible" | "unresolved";
      result: DayV3PoolDesignResult | null;
      message: string;
    };

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function useDayV3PoolDesign(
  goals: DayV3Goals | null,
  context: DayV3PoolDesignContext | null,
  enabled = true,
) {
  const [inventory, setInventory] = useState<InventoryState>({
    status: "loading",
    targets: [],
    message: "Loading live deployment targets…",
  });
  const goalsKey = dayV3PoolDesignRequestKey(goals, context);
  const [resolvedDesign, setResolvedDesign] = useState<{
    key: string;
    state: DesignState;
  } | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const retry = useCallback(() => {
    setResolvedDesign(null);
    setInventory({
      status: "loading",
      targets: [],
      message: "Refreshing live deployment targets…",
    });
    setRefreshNonce((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch("/api/day-v3/pool-design", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await readJson(response);
        if (!response.ok || !isDayV3PoolDesignInventory(body)) {
          const issues =
            isDayV3PoolDesignResult(body) && body.status !== "resolved"
              ? body.issues
              : [];
          throw new Error(
            dayV3PoolDesignIssueMessage(
              issues,
              "Canonical deployment targets could not be loaded.",
            ),
          );
        }
        setInventory({
          status: body.status === "resolved" ? "ready" : "unresolved",
          targets: body.targets,
          message:
            body.targets.length > 0
              ? "Choose the chain and template whose canonical pool policy should be used."
              : dayV3PoolDesignIssueMessage(
                  body.issues,
                  "No canonical deployment template is currently available.",
                ),
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setInventory({
          status: "unresolved",
          targets: [],
          message:
            error instanceof Error
              ? error.message
              : "Canonical deployment targets could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [enabled, refreshNonce]);

  useEffect(() => {
    if (!enabled || !goals || !context || goalsKey === null) return;

    const controller = new AbortController();
    const requestKey = goalsKey;
    void fetch("/api/day-v3/pool-design", {
      method: "POST",
      body: JSON.stringify({
        schemaVersion: DAY_V3_POOL_DESIGN_SCHEMA,
        goals,
        context,
      }),
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await readJson(response);
        if (!isDayV3PoolDesignResult(body)) {
          throw new Error(
            "The canonical pool-design service returned an invalid response.",
          );
        }
        if (body.status === "resolved") {
          if (!dayV3PoolDesignMatchesGoals(body, goals, context)) {
            throw new Error(
              "The canonical pool-design response does not match the current goals.",
            );
          }
          setResolvedDesign({
            key: requestKey,
            state: {
              status: "resolved",
              result: body,
              message: `Resolved from ${body.policy.templateName} on ${body.policy.chainName} at block ${body.policy.blockNumber}.`,
            },
          });
          return;
        }
        setResolvedDesign({
          key: requestKey,
          state: {
            status: body.status === "infeasible" ? "infeasible" : "unresolved",
            result: body,
            message: dayV3PoolDesignIssueMessage(
              body.issues,
              response.ok
                ? "The exit terms could not be resolved."
                : "The canonical pool policy could not be refreshed.",
            ),
          },
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResolvedDesign({
          key: requestKey,
          state: {
            status: "unresolved",
            result: null,
            message:
              error instanceof Error
                ? error.message
                : "The canonical pool policy could not be refreshed.",
          },
        });
      });
    return () => controller.abort();
  }, [context, enabled, goals, goalsKey, refreshNonce]);

  const design: DesignState =
    !enabled || goalsKey === null
      ? {
          status: "missing-goal",
          result: null,
          message:
            "Complete the source yield, operating facts, exit terms, and deployment target.",
        }
      : resolvedDesign?.key === goalsKey
        ? resolvedDesign.state
        : {
            status: "resolving",
            result: null,
            message:
              "Refreshing the market pool fee and solving the exact E-CLP design…",
          };

  return { design, inventory, retry };
}
