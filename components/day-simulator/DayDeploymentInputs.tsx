import type { YDMConfig } from "@/lib/day/engine/types";
import {
  DAY_SIMULATOR_THEME,
  DAY_SIMULATOR_TYPE,
  DaySectionHeader,
} from "@/components/day-simulator/DaySimulatorUI";

type DeploymentInput = {
  label: string;
  value: string;
  state?: "modeled" | "required" | "fixed";
};

function DeploymentGroup({
  inputs,
  title,
}: {
  inputs: DeploymentInput[];
  title: string;
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
                      : "Current simulation value"}
                </p>
              )}
            </div>
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
          </div>
        ))}
      </div>
    </div>
  );
}

const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits).replace(/\.0$/, "")}%`;

export default function DayDeploymentInputs({
  adaptationSpeed,
  chain,
  contractAddress,
  coveragePct,
  marketName,
  observationDays,
  protectedExitThresholdPct,
  riskYDM,
  selfLiquidationBonus,
  sourceApyPct,
  tokenSource,
}: {
  adaptationSpeed?: number;
  chain?: string;
  contractAddress?: string;
  coveragePct: number;
  marketName?: string;
  observationDays: number;
  protectedExitThresholdPct: number;
  riskYDM: YDMConfig;
  selfLiquidationBonus: number;
  sourceApyPct: number;
  tokenSource?: string;
}) {
  return (
    <section
      id="day-sim-deployment-inputs"
      style={{
        background: DAY_SIMULATOR_THEME.cardBg,
        borderTop: `1px solid ${DAY_SIMULATOR_THEME.border}`,
        padding: 16,
      }}
    >
      <DaySectionHeader
        description="The educational simulator can run with fewer inputs. A deployable market requires the complete configuration below."
        eyebrow="Market deployment"
        title="Every input needed to define the market"
      />
      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-4">
        <DeploymentGroup
          inputs={[
            { label: "Market name", value: marketName || "Not provided", state: marketName ? "modeled" : "required" },
            { label: "Token contract source", value: tokenSource || "Not provided", state: tokenSource ? "modeled" : "required" },
            { label: "Token contract address", value: contractAddress || "Not provided", state: contractAddress ? "modeled" : "required" },
            { label: "Chain", value: chain || "Not provided", state: chain ? "modeled" : "required" },
          ]}
          title="Token and deployment"
        />
        <DeploymentGroup
          inputs={[
            { label: "Net underlying APY", value: `${sourceApyPct.toFixed(1)}%`, state: "modeled" },
            { label: "Minimum coverage", value: `${coveragePct.toFixed(0)}%`, state: "modeled" },
            { label: "Observation period", value: `${observationDays} days`, state: "modeled" },
          ]}
          title="Market terms"
        />
        <DeploymentGroup
          inputs={[
            { label: "Yield share at low utilization (Y₀)", value: percent(riskYDM.y0), state: "modeled" },
            { label: "Yield share at target utilization (Yᴛ)", value: percent(riskYDM.yTarget), state: "modeled" },
            { label: "Yield share at full utilization (Y₁₀₀)", value: percent(riskYDM.y100), state: "modeled" },
            { label: "Target utilization", value: "90%", state: "fixed" },
            { label: "Adaptation speed", value: adaptationSpeed === undefined ? "Not provided" : String(adaptationSpeed), state: adaptationSpeed === undefined ? "required" : "modeled" },
          ]}
          title="Yield-share curve"
        />
        <DeploymentGroup
          inputs={[
            { label: "Protected exit threshold", value: `${protectedExitThresholdPct.toFixed(2).replace(/\.00$/, "")}%`, state: "modeled" },
            { label: "Self-liquidation bonus", value: percent(selfLiquidationBonus), state: "modeled" },
          ]}
          title="Recovery"
        />
      </div>
    </section>
  );
}
