"use client";

import { useEffect, useState } from "react";

import { dayV3PoolDesignIssueMessage } from "@/lib/day-v3/pool-design";
import {
  dayV3SimulationPoolDesignMatchesRequest,
  dayV3SimulationPoolDesignRequestKey,
  isDayV3SimulationPoolDesignResult,
  type DayV3SimulationPoolDesignGoals,
  type DayV3SimulationPoolDesignResult,
} from "@/lib/day-v3/simulation-pool-design";

export type DayV3SimulationDesignState =
  | { status: "missing-goal"; result: null; message: string }
  | {
      status: "resolving";
      result: Extract<DayV3SimulationPoolDesignResult, { status: "resolved" }> | null;
      message: string;
    }
  | {
      status: "resolved";
      result: Extract<DayV3SimulationPoolDesignResult, { status: "resolved" }>;
      message: string;
    }
  | {
      status: "infeasible" | "unresolved";
      result: DayV3SimulationPoolDesignResult | null;
      message: string;
    };

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

const TRANSIENT_STATUS = new Set([429, 502, 503, 504]);
const RETRY_DELAYS_MS = [500, 1_250, 2_500] as const;
const INPUT_DEBOUNCE_MS = 350;

function retryDelayMs(response: Response, attempt: number): number {
  const raw = response.headers.get("retry-after");
  const seconds = raw === null ? Number.NaN : Number(raw);
  // A service may advertise a longer production window. Keep the interactive
  // retry bounded; subsequent retries and a manual reload still refresh live.
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(5_000, seconds * 1_000)
    : RETRY_DELAYS_MS[attempt];
}

async function fetchSimulationDesign(
  body: string,
  signal: AbortSignal,
): Promise<{ response: Response; body: unknown }> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch("/api/day-v3/pool-design/simulation", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal,
    });
    const parsed = await readJson(response);
    if (
      !TRANSIENT_STATUS.has(response.status) ||
      attempt >= RETRY_DELAYS_MS.length
    ) {
      return { response, body: parsed };
    }
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        resolve,
        retryDelayMs(response, attempt),
      );
      signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timeout);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
  }
}

/**
 * Resolves a simulation design from only the four issuer goals and source APY.
 * Deployment facts and target selection are intentionally not accepted here.
 */
export function useDayV3SimulationPoolDesign(
  goals: DayV3SimulationPoolDesignGoals | null,
  sourceApyPct: number | null,
): DayV3SimulationDesignState {
  const requestKey = dayV3SimulationPoolDesignRequestKey(goals, sourceApyPct);
  const [resolved, setResolved] = useState<{
    key: string;
    state: DayV3SimulationDesignState;
  } | null>(null);

  useEffect(() => {
    if (requestKey === null) return;

    const controller = new AbortController();
    const currentKey = requestKey;
    const request = JSON.parse(currentKey) as {
      goals: DayV3SimulationPoolDesignGoals;
      context: { sourceApyPct: number };
    };

    const timeout = window.setTimeout(() => {
      void fetchSimulationDesign(currentKey, controller.signal)
        .then(({ body }) => {
          if (!isDayV3SimulationPoolDesignResult(body)) {
            throw new Error(
              "The canonical simulation service returned an invalid response.",
            );
          }
          if (
            body.goals !== undefined &&
            !dayV3SimulationPoolDesignMatchesRequest(
              body,
              request.goals,
              request.context.sourceApyPct,
            )
          ) {
            throw new Error(
              "The canonical simulation response does not match the current goals.",
            );
          }

          if (body.status === "resolved") {
            setResolved({
              key: currentKey,
              state: {
                status: "resolved",
                result: body,
                message: `Modeled with ${body.policy.templateName} on ${body.policy.chainName} at block ${body.policy.blockNumber}.`,
              },
            });
            return;
          }

          setResolved({
            key: currentKey,
            state: {
              status:
                body.status === "infeasible" ? "infeasible" : "unresolved",
              result: body,
              message: dayV3PoolDesignIssueMessage(
                body.issues,
                body.status === "infeasible"
                  ? "The exit promise is not feasible under the live simulation policy."
                  : "The live simulation policy could not be resolved.",
              ),
            },
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setResolved({
            key: currentKey,
            state: {
              status: "unresolved",
              result: null,
              message:
                error instanceof Error
                  ? error.message
                  : "The live simulation policy could not be resolved.",
            },
          });
        });
    }, INPUT_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [requestKey]);

  if (requestKey === null) {
    return {
      status: "missing-goal",
      result: null,
      message:
        "Set the source yield, protection goal, and exit promise. Recovery timing is optional for forward simulation.",
    };
  }
  const previous =
    resolved?.state.status === "resolved"
      ? resolved.state.result
      : resolved?.state.status === "resolving"
        ? resolved.state.result
        : null;
  return resolved?.key === requestKey
    ? resolved.state
    : {
        status: "resolving",
        result: previous,
        message:
          "Updating the live fee and pool design. The last valid result stays visible until this finishes.",
      };
}
