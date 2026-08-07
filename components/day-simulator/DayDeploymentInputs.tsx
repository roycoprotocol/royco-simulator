import type { ReactNode } from "react";

import type {
  DayDeploymentFieldId,
  DayDeploymentFieldValues,
} from "@/lib/day-simulator-template/config-export";
import type { YDMConfig } from "@/lib/day/engine/types";
import {
  DAY_SIMULATOR_THEME,
  DAY_SIMULATOR_TYPE,
  DaySectionHeader,
} from "@/components/day-simulator/DaySimulatorUI";

type DeploymentInput = {
  inputId?: DayDeploymentFieldId;
  label: string;
  placeholder?: string;
  unit?: string;
  value: string;
  state?: "modeled" | "required" | "fixed" | "provided";
};

const inlineFieldStyle = {
  background: "#fff",
  border: `1px solid ${DAY_SIMULATOR_THEME.border}`,
  borderRadius: 6,
  color: DAY_SIMULATOR_THEME.text,
  fontFamily: DAY_SIMULATOR_TYPE.mono,
  fontSize: 13.5,
  fontWeight: 600,
  minHeight: 38,
  padding: "10px 12px",
  textAlign: "right",
  width: 172,
} as const;

function DeploymentGroup({
  inputs,
  onInputChange,
  title,
  values,
}: {
  inputs: DeploymentInput[];
  onInputChange: (id: DayDeploymentFieldId, value: string) => void;
  title: string;
  values: DayDeploymentFieldValues;
}) {
  return (
    <div>
      <p
        style={{
          color: DAY_SIMULATOR_THEME.eyebrow,
          fontFamily: DAY_SIMULATOR_TYPE.mono,
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </p>
      <div className="mt-2" style={{ borderTop: `1px solid ${DAY_SIMULATOR_THEME.border}` }}>
        {inputs.map((input) => (
          <div
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"
            key={input.label}
            style={{
              alignItems: "center",
              borderBottom: `1px solid ${DAY_SIMULATOR_THEME.border}`,
              minHeight: 46,
              padding: "8px 0",
            }}
          >
            <div>
              <p style={{ color: DAY_SIMULATOR_THEME.text, fontSize: 12, fontWeight: 500 }}>{input.label}</p>
              {input.state && (
                <p className="mt-0.5" style={{ color: DAY_SIMULATOR_THEME.kpiLabel, fontSize: 10 }}>
                  {input.state === "required"
                    ? "Required before deployment"
                    : input.state === "fixed"
                      ? "Fixed protocol parameter"
                      : input.state === "provided"
                        ? "Entered for deployment"
                        : "Current simulation value"}
                </p>
              )}
            </div>
            {input.inputId ? (
              <span className="flex items-center justify-end gap-1.5">
                <input
                  aria-label={input.label}
                  inputMode={input.unit ? "decimal" : undefined}
                  onChange={(event) => onInputChange(input.inputId as DayDeploymentFieldId, event.target.value)}
                  placeholder={input.placeholder ?? "Not provided"}
                  style={{
                    ...inlineFieldStyle,
                    borderColor: input.state === "required"
                      ? DAY_SIMULATOR_THEME.danger
                      : DAY_SIMULATOR_THEME.border,
                    width: input.unit ? 108 : 172,
                  }}
                  type="text"
                  value={values[input.inputId]}
                />
                {input.unit && (
                  <span
                    style={{
                      color: DAY_SIMULATOR_THEME.kpiLabel,
                      fontFamily: DAY_SIMULATOR_TYPE.mono,
                      fontSize: 11.5,
                    }}
                  >
                    {input.unit}
                  </span>
                )}
              </span>
            ) : (
            <strong
              style={{
                color: input.state === "required" ? DAY_SIMULATOR_THEME.danger : DAY_SIMULATOR_THEME.text,
                fontFamily: DAY_SIMULATOR_TYPE.mono,
                fontSize: 11.5,
                fontWeight: 600,
                textAlign: "right",
              }}
            >
              {input.value}
            </strong>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits).replace(/\.0$/, "")}%`;

export default function DayDeploymentInputs({
  adaptationSpeed,
  children,
  coveragePct,
  deploymentInputs,
  marketName,
  observationDays,
  onDeploymentInputChange,
  protectedExitThresholdPct,
  riskSharePct,
  riskYDM,
  selfLiquidationBonus,
  sourceApyPct,
  step,
}: {
  adaptationSpeed?: number;
  children?: ReactNode;
  coveragePct: number;
  deploymentInputs: DayDeploymentFieldValues;
  marketName?: string;
  observationDays: number;
  onDeploymentInputChange: (id: DayDeploymentFieldId, value: string) => void;
  protectedExitThresholdPct: number;
  riskSharePct: number;
  riskYDM: YDMConfig;
  selfLiquidationBonus: number;
  sourceApyPct: number;
  step?: number;
}) {
  const entered = (id: DayDeploymentFieldId): DeploymentInput["state"] =>
    deploymentInputs[id].trim() ? "provided" : "required";
  // Sim-wired terms always have a live value, so a blank input is not a blocker.
  const termState = (id: DayDeploymentFieldId): DeploymentInput["state"] =>
    deploymentInputs[id].trim() ? "provided" : "modeled";
  return (
    <section
      id="day-sim-deployment-inputs"
      style={{
        background: DAY_SIMULATOR_THEME.cardBg,
        border: `1px solid ${DAY_SIMULATOR_THEME.border}`,
        borderRadius: 12,
        boxShadow: "0 1px 2px rgba(29,28,25,.035)",
        padding: 16,
        scrollMarginTop: 16,
      }}
    >
      <DaySectionHeader
        description="The educational simulator can run with fewer inputs. A deployable market requires the complete configuration below."
        step={step}
        title="Every input needed to define the market"
      />
      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-4">
        <DeploymentGroup
          inputs={[
            { label: "Market name", value: marketName || "Not provided", state: marketName ? "modeled" : "required" },
            { inputId: "tokenContractSource", label: "Token contract source", value: "", state: entered("tokenContractSource") },
            { inputId: "tokenContractAddress", label: "Token contract address", value: "", state: entered("tokenContractAddress") },
            { inputId: "chain", label: "Chain", value: "", state: entered("chain") },
          ]}
          onInputChange={onDeploymentInputChange}
          title="Token and deployment"
          values={deploymentInputs}
        />
        <DeploymentGroup
          inputs={[
            { label: "Net underlying APY", value: `${sourceApyPct.toFixed(1)}%`, state: "modeled" },
            { label: "Minimum coverage", value: `${coveragePct.toFixed(0)}%`, state: "modeled" },
            { label: "Observation period", value: `${observationDays} days`, state: "modeled" },
          ]}
          onInputChange={onDeploymentInputChange}
          title="Market terms"
          values={deploymentInputs}
        />
        <DeploymentGroup
          inputs={[
            { label: "Yield share at low utilization (Y₀)", value: percent(Math.min(riskYDM.y0, riskSharePct / 100)), state: "modeled" },
            { label: "Yield share at target utilization (Yᴛ)", value: percent(riskSharePct / 100), state: "modeled" },
            {
              inputId: "yieldShareAtFullUtilization",
              label: "Yield share at full utilization (Y₁₀₀)",
              placeholder: percent(riskYDM.y100).replace("%", ""),
              state: termState("yieldShareAtFullUtilization"),
              unit: "%",
              value: "",
            },
            { label: "Target utilization", value: "90%", state: "fixed" },
            adaptationSpeed === undefined
              ? { inputId: "adaptationSpeed", label: "Adaptation speed", value: "", state: entered("adaptationSpeed") }
              : { label: "Adaptation speed", value: String(adaptationSpeed), state: "modeled" },
          ]}
          onInputChange={onDeploymentInputChange}
          title="Yield-share curve"
          values={deploymentInputs}
        />
        <DeploymentGroup
          inputs={[
            {
              inputId: "protectedExitThreshold",
              label: "Protected exit threshold",
              placeholder: protectedExitThresholdPct.toFixed(2).replace(/\.00$/, ""),
              state: termState("protectedExitThreshold"),
              unit: "%",
              value: "",
            },
            {
              inputId: "selfLiquidationBonus",
              label: "Self-liquidation bonus",
              placeholder: percent(selfLiquidationBonus).replace("%", ""),
              state: termState("selfLiquidationBonus"),
              unit: "%",
              value: "",
            },
          ]}
          onInputChange={onDeploymentInputChange}
          title="Recovery"
          values={deploymentInputs}
        />
      </div>
      {children}
    </section>
  );
}
