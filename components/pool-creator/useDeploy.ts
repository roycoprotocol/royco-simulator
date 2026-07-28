"use client";

// =============================================================================
// The effects behind the deploy state machine.
// -----------------------------------------------------------------------------
// `tx-machine.ts` decides what state comes next; this decides what to *do*.
// Keeping them apart is what makes every transition testable without a wallet.
//
// The sequencing rule that matters: nothing is ever signed before it has been
// simulated. `eth_call` first, and only if that succeeds does a signature
// prompt appear — so a revert costs a moment, never gas.
// =============================================================================

import { useCallback, useReducer, useRef, useState } from "react";
import {
  deployReducer,
  initialDeployState,
  type DeployPlan,
  type DeployState,
} from "@/lib/pool-creator/chain/tx-machine";
import {
  discoverWallets,
  getChainId,
  getReceipt,
  requestAccounts,
  sendTransaction,
  simulate,
  switchChain,
  WalletError,
  type DiscoveredWallet,
  type Eip1193Provider,
} from "@/lib/pool-creator/chain/wallet";
import {
  buildPlan,
  buildSeedSteps,
  checkDeployPermission,
  type PlanInputs,
  type TrancheAddresses,
} from "@/lib/pool-creator/chain/deploy";
import { deployAvailability } from "@/lib/pool-creator/chain/registry";

/** Poll cadence and give-up point for a pending transaction. */
const POLL_MS = 2_000;
const TIMEOUT_MS = 5 * 60_000;

export type DeployController = {
  state: DeployState;
  wallets: DiscoveredWallet[] | null;
  busy: boolean;
  discover: () => Promise<void>;
  connect: (wallet: DiscoveredWallet) => Promise<void>;
  switchNetwork: (chainId: number) => Promise<void>;
  plan: (inputs: Omit<PlanInputs, "account">) => Promise<void>;
  /**
   * Append the post-deployment seeding once the market exists. The tranche
   * addresses only come into being with the deploy transaction, so these steps
   * cannot be built up front.
   */
  addSeedSteps: (tranches: TrancheAddresses, quoteAsset: `0x${string}`, quoteDecimals: number) => void;
  signNext: () => Promise<void>;
  checkPending: () => Promise<void>;
  retry: () => void;
  reset: () => void;
};

export function useDeploy(): DeployController {
  const [state, dispatch] = useReducer(deployReducer, initialDeployState);
  const [wallets, setWallets] = useState<DiscoveredWallet[] | null>(null);
  const [busy, setBusy] = useState(false);
  const providerRef = useRef<Eip1193Provider | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const discover = useCallback(async () => {
    setBusy(true);
    try {
      setWallets(await discoverWallets());
    } finally {
      setBusy(false);
    }
  }, []);

  const connect = useCallback(async (wallet: DiscoveredWallet) => {
    setBusy(true);
    dispatch({ type: "connect" });
    providerRef.current = wallet.provider;
    try {
      const [account] = await requestAccounts(wallet.provider);
      const chainId = await getChainId(wallet.provider);
      const availability = deployAvailability(chainId);

      if (!availability.available) {
        dispatch({
          type: "connected",
          account,
          chainId,
          canDeploy: false,
          roleReason: availability.detail,
        });
        return;
      }

      // Read the permission before offering to sign anything.
      const permission = await checkDeployPermission(wallet.provider, availability.deployment, account);
      dispatch({
        type: "connected",
        account,
        chainId,
        canDeploy: permission.canDeploy,
        roleReason: permission.reason,
      });
    } catch (error) {
      const walletError = error as WalletError;
      dispatch({
        type: "connected",
        account: "",
        chainId: 0,
        canDeploy: false,
        roleReason: walletError.rejected
          ? "You dismissed the wallet prompt. Connect again when you're ready."
          : walletError.message,
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const switchNetwork = useCallback(async (chainId: number) => {
    const provider = providerRef.current;
    if (!provider) return;
    dispatch({ type: "switch", want: chainId });
    try {
      await switchChain(provider, chainId);
      const [account] = await requestAccounts(provider);
      const now = await getChainId(provider);
      const availability = deployAvailability(now);
      const permission = availability.available
        ? await checkDeployPermission(provider, availability.deployment, account)
        : { canDeploy: false, reason: availability.detail };
      dispatch({
        type: "connected",
        account,
        chainId: now,
        canDeploy: permission.canDeploy,
        roleReason: permission.reason,
      });
    } catch (error) {
      dispatch({ type: "wrong-network", account: "", have: 0, want: chainId });
      void error;
    }
  }, []);

  /** Build the plan, then simulate every step before arming the first. */
  const plan = useCallback(
    async (inputs: Omit<PlanInputs, "account">) => {
      const provider = providerRef.current;
      if (!provider || !("account" in state) || !state.account) return;
      const account = state.account;

      setBusy(true);
      dispatch({ type: "plan" });
      try {
        const built: DeployPlan = await buildPlan(provider, { ...inputs, account });
        dispatch({ type: "planned", plan: built });

        for (const step of built.steps) {
          if (step.skipped) continue;
          const result = await simulate(provider, {
            from: account,
            to: step.to,
            data: step.data,
          });
          if (!result.ok) {
            dispatch({ type: "simulation-failed", step: step.id, reason: result.reason });
            return;
          }
          // Only the first step can be simulated meaningfully: the later ones
          // depend on state the earlier ones create. Stop after it rather than
          // reporting a misleading failure for a transaction whose
          // preconditions do not exist yet.
          break;
        }
        dispatch({ type: "simulated" });
      } catch (error) {
        dispatch({
          type: "simulation-failed",
          step: "deploy-market",
          reason: (error as Error).message,
        });
      } finally {
        setBusy(false);
      }
    },
    [state],
  );

  const addSeedSteps = useCallback(
    (tranches: TrancheAddresses, quoteAsset: `0x${string}`, quoteDecimals: number) => {
      if (!("plan" in state) || !("account" in state)) return;
      const seeds = buildSeedSteps(tranches, quoteAsset, quoteDecimals, state.account);
      dispatch({
        type: "planned",
        plan: { ...state.plan, steps: [...state.plan.steps, ...seeds] },
      });
    },
    [state],
  );

  const poll = useCallback(
    (hash: string, startedAt: number) => {
      const provider = providerRef.current;
      if (!provider) return;
      stopPolling();
      pollRef.current = setTimeout(async () => {
        try {
          const receipt = await getReceipt(provider, hash);
          if (receipt) {
            dispatch({ type: "mined", status: receipt.status });
            return;
          }
          if (Date.now() - startedAt > TIMEOUT_MS) {
            // Never call it failed: it may still be mined.
            dispatch({ type: "timeout" });
            return;
          }
          poll(hash, startedAt);
        } catch {
          poll(hash, startedAt);
        }
      }, POLL_MS);
    },
    [stopPolling],
  );

  const signNext = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider || !("plan" in state) || !("cursor" in state)) return;
    const step = state.plan.steps[state.cursor];
    if (!step) return;

    dispatch({ type: "sign" });
    try {
      const hash = await sendTransaction(provider, {
        from: state.account,
        to: step.to,
        data: step.data,
      });
      dispatch({ type: "sent", hash });
      poll(hash, Date.now());
    } catch (error) {
      const walletError = error as WalletError;
      // A dismissed prompt is not a failure — the plan stays exactly as it was.
      // Anything else genuinely failed and must not be labelled a cancellation.
      dispatch(
        walletError.rejected
          ? { type: "user-rejected" }
          : { type: "send-failed", reason: walletError.message },
      );
    }
  }, [state, poll]);

  const checkPending = useCallback(async () => {
    if (state.tag !== "timed-out") return;
    dispatch({ type: "retry" });
    poll(state.hash, Date.now());
  }, [state, poll]);

  const retry = useCallback(() => {
    stopPolling();
    dispatch({ type: "retry" });
  }, [stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    providerRef.current = null;
    setWallets(null);
    dispatch({ type: "reset" });
  }, [stopPolling]);

  return {
    state,
    wallets,
    busy,
    discover,
    connect,
    switchNetwork,
    plan,
    addSeedSteps,
    signNext,
    checkPending,
    retry,
    reset,
  };
}
