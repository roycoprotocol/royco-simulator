// =============================================================================
// The deploy state machine.
// -----------------------------------------------------------------------------
// A pure reducer, so every transition is testable without a wallet, a chain, or
// a browser. The component holds the state and performs the effects; this file
// decides only what state comes next.
//
// Behaviours that matter more than the happy path:
//   - a user rejection is a distinct, calm state with a one-click retry that
//     does NOT rebuild the plan;
//   - a pending transaction that times out never auto-fails — a possibly-mined
//     transaction must not be reported as lost;
//   - simulation failure happens before any signature, so a revert costs
//     nothing;
//   - steps whose precondition is already met are skipped, not re-sent.
// =============================================================================

export type DeployStepId =
  | "approve-junior"
  | "approve-liquidity"
  | "approve-senior"
  | "deploy-market"
  | "seed-junior"
  | "seed-liquidity"
  | "seed-senior";

/**
 * Which phase a step belongs to. Deployment creates the market; seeding makes
 * it usable. They are shown as separate lists because the second only becomes
 * possible once the first has produced tranche addresses.
 */
export type DeployPhase = "deploy" | "seed";

export type DeployStep = {
  id: DeployStepId;
  phase: DeployPhase;
  title: string;
  /** One plain sentence about what this transaction does. */
  explanation: string;
  to: `0x${string}`;
  data: `0x${string}`;
  /** Already satisfied — shown as skipped rather than sent. */
  skipped?: boolean;
};

export type DeployPlan = {
  chainId: number;
  steps: DeployStep[];
};

export type DeployState =
  | { tag: "idle" }
  | { tag: "unavailable"; reason: string; detail: string }
  | { tag: "connecting" }
  | { tag: "wrong-network"; account: string; have: number; want: number }
  | { tag: "switching"; account: string; want: number }
  | { tag: "connected"; account: string; chainId: number; canDeploy: boolean; roleReason?: string }
  | { tag: "planning"; account: string; chainId: number }
  | { tag: "simulating"; account: string; chainId: number; plan: DeployPlan; cursor: number }
  | { tag: "simulation-failed"; account: string; chainId: number; plan: DeployPlan; step: DeployStepId; reason: string }
  | { tag: "ready"; account: string; chainId: number; plan: DeployPlan; cursor: number; hashes: string[] }
  | { tag: "awaiting-signature"; account: string; chainId: number; plan: DeployPlan; cursor: number; hashes: string[] }
  | { tag: "pending"; account: string; chainId: number; plan: DeployPlan; cursor: number; hash: string; hashes: string[] }
  | { tag: "timed-out"; account: string; chainId: number; plan: DeployPlan; cursor: number; hash: string; hashes: string[] }
  | { tag: "rejected"; account: string; chainId: number; plan: DeployPlan; cursor: number; hashes: string[] }
  | { tag: "step-failed"; account: string; chainId: number; plan: DeployPlan; cursor: number; reason: string; hash?: string; hashes: string[] }
  | { tag: "complete"; account: string; chainId: number; marketAddress?: string; hashes: string[] };

export type DeployEvent =
  | { type: "unavailable"; reason: string; detail: string }
  | { type: "connect" }
  | { type: "connected"; account: string; chainId: number; canDeploy: boolean; roleReason?: string }
  | { type: "wrong-network"; account: string; have: number; want: number }
  | { type: "switch"; want: number }
  | { type: "plan" }
  | { type: "planned"; plan: DeployPlan }
  | { type: "simulated" }
  | { type: "simulation-failed"; step: DeployStepId; reason: string }
  | { type: "sign" }
  | { type: "sent"; hash: string }
  | { type: "user-rejected" }
  | { type: "send-failed"; reason: string }
  | { type: "mined"; status: "success" | "reverted" }
  | { type: "timeout" }
  | { type: "retry" }
  | { type: "market-address"; address: string }
  | { type: "reset" };

const account = (state: DeployState): string =>
  "account" in state ? state.account : "";
const chainOf = (state: DeployState): number =>
  "chainId" in state ? state.chainId : 0;

/** Advance past any steps already satisfied. */
function nextActionable(plan: DeployPlan, from: number): number {
  let cursor = from;
  while (cursor < plan.steps.length && plan.steps[cursor].skipped) cursor += 1;
  return cursor;
}

export function deployReducer(state: DeployState, event: DeployEvent): DeployState {
  switch (event.type) {
    case "unavailable":
      return { tag: "unavailable", reason: event.reason, detail: event.detail };

    case "connect":
      return { tag: "connecting" };

    case "connected":
      return {
        tag: "connected",
        account: event.account,
        chainId: event.chainId,
        canDeploy: event.canDeploy,
        roleReason: event.roleReason,
      };

    case "wrong-network":
      return { tag: "wrong-network", account: event.account, have: event.have, want: event.want };

    case "switch":
      return { tag: "switching", account: account(state), want: event.want };

    case "plan":
      if (state.tag !== "connected") return state;
      return { tag: "planning", account: state.account, chainId: state.chainId };

    case "planned": {
      const cursor = nextActionable(event.plan, 0);
      // Everything already satisfied — nothing left to send.
      if (cursor >= event.plan.steps.length) {
        return { tag: "complete", account: account(state), chainId: chainOf(state), hashes: [] };
      }
      return {
        tag: "simulating",
        account: account(state),
        chainId: chainOf(state),
        plan: event.plan,
        cursor,
      };
    }

    case "simulated":
      if (state.tag !== "simulating") return state;
      return {
        tag: "ready",
        account: state.account,
        chainId: state.chainId,
        plan: state.plan,
        cursor: state.cursor,
        hashes: [],
      };

    case "simulation-failed":
      if (state.tag !== "simulating") return state;
      return {
        tag: "simulation-failed",
        account: state.account,
        chainId: state.chainId,
        plan: state.plan,
        step: event.step,
        reason: event.reason,
      };

    case "sign":
      if (state.tag !== "ready" && state.tag !== "rejected") return state;
      return {
        tag: "awaiting-signature",
        account: state.account,
        chainId: state.chainId,
        plan: state.plan,
        cursor: state.cursor,
        hashes: state.hashes,
      };

    case "sent":
      if (state.tag !== "awaiting-signature") return state;
      return {
        tag: "pending",
        account: state.account,
        chainId: state.chainId,
        plan: state.plan,
        cursor: state.cursor,
        hash: event.hash,
        hashes: state.hashes,
      };

    case "user-rejected":
      if (state.tag !== "awaiting-signature") return state;
      // Not a failure. The plan is intact; signing again resumes exactly here.
      return {
        tag: "rejected",
        account: state.account,
        chainId: state.chainId,
        plan: state.plan,
        cursor: state.cursor,
        hashes: state.hashes,
      };

    case "send-failed":
      if (state.tag !== "awaiting-signature") return state;
      // Distinct from a dismissal: the wallet tried and could not. Telling
      // someone they cancelled when they did not is its own small betrayal.
      return {
        tag: "step-failed",
        account: state.account,
        chainId: state.chainId,
        plan: state.plan,
        cursor: state.cursor,
        reason: event.reason,
        hashes: state.hashes,
      };

    case "mined": {
      if (state.tag !== "pending") return state;
      const hashes = [...state.hashes, state.hash];
      if (event.status === "reverted") {
        return {
          tag: "step-failed",
          account: state.account,
          chainId: state.chainId,
          plan: state.plan,
          cursor: state.cursor,
          reason: "The transaction was mined but reverted.",
          hash: state.hash,
          hashes,
        };
      }
      const cursor = nextActionable(state.plan, state.cursor + 1);
      if (cursor >= state.plan.steps.length) {
        return { tag: "complete", account: state.account, chainId: state.chainId, hashes };
      }
      return {
        tag: "ready",
        account: state.account,
        chainId: state.chainId,
        plan: state.plan,
        cursor,
        hashes,
      };
    }

    case "timeout":
      if (state.tag !== "pending") return state;
      // Deliberately NOT a failure: the transaction may still be mined.
      return {
        tag: "timed-out",
        account: state.account,
        chainId: state.chainId,
        plan: state.plan,
        cursor: state.cursor,
        hash: state.hash,
        hashes: state.hashes,
      };

    case "retry":
      if (state.tag === "timed-out") {
        return {
          tag: "pending",
          account: state.account,
          chainId: state.chainId,
          plan: state.plan,
          cursor: state.cursor,
          hash: state.hash,
          hashes: state.hashes,
        };
      }
      if (state.tag === "rejected" || state.tag === "step-failed") {
        return {
          tag: "ready",
          account: state.account,
          chainId: state.chainId,
          plan: state.plan,
          cursor: state.cursor,
          hashes: state.hashes,
        };
      }
      return state;

    case "market-address":
      if (state.tag !== "complete") return state;
      return { ...state, marketAddress: event.address };

    case "reset":
      return { tag: "idle" };

    default:
      return state;
  }
}

export const initialDeployState: DeployState = { tag: "idle" };

/** Progress for the checklist UI. */
export function stepStatus(
  state: DeployState,
  index: number,
): "done" | "active" | "pending" | "skipped" | "failed" {
  if (!("plan" in state)) return state.tag === "complete" ? "done" : "pending";
  if (state.plan.steps[index]?.skipped) return "skipped";
  const cursor = "cursor" in state ? state.cursor : 0;
  if (index < cursor) return "done";
  if (index > cursor) return "pending";
  if (state.tag === "step-failed" || state.tag === "simulation-failed") return "failed";
  return "active";
}
