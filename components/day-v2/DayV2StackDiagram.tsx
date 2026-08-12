"use client";

import { memo } from "react";

import { unitRatio, type DayV2Unit } from "@/components/day-v2/format";

/**
 * The capital stack drawn the way a capital stack is drawn.
 *
 * Three attempts got here. A horizontal segmented bar forced labels inside
 * their own segments, so a thin leg lost its label. A to-scale column beside
 * equal-height rows could not line up, and adjacency implies correspondence, so
 * it read as broken. Row-level progress bars aligned fine but stopped being a
 * stack at all: three separate bars are a table with decoration, and they throw
 * away the one thing the picture exists to say, which is that these layers sit
 * on top of each other in a specific order.
 *
 * So: blocks to scale, stacked, labelled from outside with leader lines. That
 * is the conventional idiom for this object for a good reason. It survives a
 * dominant Senior tranche and a 4% Junior sliver, which is the normal shape of
 * the data here and the case every other layout failed on.
 *
 * Two structural decisions the picture makes that a table cannot:
 *
 * 1. **Junior sits underneath Senior.** Loss enters at the bottom and works up,
 *    which is what "first loss" means. The arrow says so.
 * 2. **The exit pool stands beside, not under.** It is venue capital, not a
 *    loss layer, and stacking it into the same column would say it absorbs
 *    something. Same scale, so it stays comparable.
 *
 * The dashed rule on a block is that leg's minimum: the least capital that
 * satisfies the requirement, at 100% utilization. The gap between the rule and
 * the top of the block is the headroom the 90% target buys.
 */

// The viewBox is sized to the drawing, not padded around it. A viewBox wider
// than its content wastes the box the figure is given and renders everything
// smaller to fit the emptiness, which is what made the first version look tiny
// once its width was capped.
//
// The column gap is load-bearing, not taste: when Junior is thin its label goes
// outside at `STACK_X + COL_W + 12` and runs about 75 units right, so the pool
// column has to start clear of that or a 5% coverage setting collides the two.
const W = 380;
const H = 208;
const TOP = 24;
const BOTTOM = 192;
const PLOT = BOTTOM - TOP;
const STACK_X = 58;
const POOL_X = 220;
const COL_W = 60;
/** Below this a block cannot hold its own label, so the label goes outside. */
const INSIDE_MIN_HEIGHT = 26;

type Block = {
  fill: string;
  floor: number;
  ink: string;
  label: string;
  sub: string;
  value: number;
};

function money(value: number, unit: DayV2Unit) {
  return unitRatio(value, unit);
}

function DayV2StackDiagram({
  jt,
  jtFloor,
  lt,
  ltFloor,
  st,
  unit,
}: {
  jt: number;
  jtFloor: number;
  lt: number;
  ltFloor: number;
  st: number;
  unit: DayV2Unit;
}) {
  // One scale for both columns, set by the taller of the two things being
  // drawn, so the pool beside the stack is read against the same ruler.
  const stackTotal = st + jt;
  const scaleMax = Math.max(stackTotal, lt) || 1;
  const h = (value: number) => (value / scaleMax) * PLOT;

  const juniorH = h(jt);
  const seniorH = h(st);
  const poolH = h(lt);

  // Bottom up: Junior takes the first loss, so Junior is the floor of the
  // column and Senior rests on it.
  const juniorY = BOTTOM - juniorH;
  const seniorY = juniorY - seniorH;
  const poolY = BOTTOM - poolH;

  const blocks: (Block & { height: number; x: number; y: number })[] = [
    {
      fill: "var(--theme-navy)",
      floor: st,
      height: seniorH,
      ink: "var(--navy-emphasis)",
      label: "Senior",
      sub: `${money(st, unit)} · last to take a loss`,
      value: st,
      x: STACK_X,
      y: seniorY,
    },
    {
      fill: "var(--theme-brown)",
      floor: jtFloor,
      height: juniorH,
      ink: "#3e2616",
      label: "Junior",
      sub: `${money(jt, unit)} · absorbs first`,
      value: jt,
      x: STACK_X,
      y: juniorY,
    },
    {
      fill: "var(--theme-green)",
      floor: ltFloor,
      height: poolH,
      ink: "var(--green-emphasis)",
      label: "SLP",
      sub: `${money(lt, unit)} · stands beside`,
      value: lt,
      x: POOL_X,
      y: poolY,
    },
  ].filter((block) => block.value > 0);

  // Labels want their block's midpoint. Where a block is too thin to hold one,
  // the label goes to the right of the column and a leader line connects them.
  // Collisions are resolved by pushing labels apart from the top down, which is
  // what keeps a 4% Junior legible next to a 75% Senior.
  const outside = blocks
    .filter((block) => block.height < INSIDE_MIN_HEIGHT)
    .map((block) => ({ block, y: block.y + block.height / 2 }))
    .sort((a, b) => a.y - b.y);
  const MIN_GAP = 17;
  for (let i = 1; i < outside.length; i += 1) {
    if (outside[i].y - outside[i - 1].y < MIN_GAP) {
      outside[i].y = outside[i - 1].y + MIN_GAP;
    }
  }
  const labelYFor = (block: Block) =>
    outside.find((entry) => entry.block.label === block.label)?.y ?? null;

  return (
    <svg
      className="w-full"
      role="img"
      aria-label={
        `Capital stack. Senior ${money(st, unit)} rests on Junior ${money(jt, unit)}, ` +
        `which absorbs the first loss. SLP capital of ${money(lt, unit)} stands beside ` +
        `the stack rather than under it, because it is venue capital and not a loss layer.`
      }
      viewBox={`0 0 ${W} ${H}`}
    >
      {/* The two things being drawn, named. */}
      <text
        className="fill-[var(--tertiary)] text-[9px] font-semibold uppercase tracking-[0.09em]"
        x={STACK_X}
        y={14}
      >
        Loss stack
      </text>
      <text
        className="fill-[var(--tertiary)] text-[9px] font-semibold uppercase tracking-[0.09em]"
        x={POOL_X}
        y={14}
      >
        Exit venue
      </text>

      {/* Loss enters at the bottom and works up. This is the whole reason the
          column is ordered the way it is, so it is drawn rather than captioned. */}
      <g>
        <line
          stroke="var(--tertiary)"
          strokeDasharray="2 3"
          strokeWidth={1}
          x1={STACK_X - 16}
          x2={STACK_X - 16}
          y1={BOTTOM}
          y2={seniorY + 6}
        />
        <path
          d={`M ${STACK_X - 19.5} ${seniorY + 11} L ${STACK_X - 16} ${seniorY + 4} L ${STACK_X - 12.5} ${seniorY + 11} Z`}
          fill="var(--tertiary)"
        />
        <text
          className="fill-[var(--tertiary)] text-[8.5px]"
          textAnchor="middle"
          transform={`rotate(-90 ${STACK_X - 24} ${(BOTTOM + seniorY) / 2})`}
          x={STACK_X - 24}
          y={(BOTTOM + seniorY) / 2}
        >
          loss travels up
        </text>
      </g>

      {blocks.map((block) => {
        const inside = block.height >= INSIDE_MIN_HEIGHT;
        const labelY = labelYFor(block);
        const floorY = BOTTOM - h(block.floor);
        const showFloor =
          block.floor > 0 &&
          block.floor < block.value * 0.995 &&
          block.height > 5;
        const labelX = block.x + COL_W + 12;
        return (
          <g key={block.label}>
            <rect
              fill={`color-mix(in srgb, ${block.fill} 24%, transparent)`}
              height={Math.max(block.height, 2)}
              rx={3}
              stroke={`color-mix(in srgb, ${block.fill} 55%, transparent)`}
              strokeWidth={1}
              width={COL_W}
              x={block.x}
              y={block.y}
            />

            {/* The floor, where the requirement is exactly met. The band above
                it is the headroom the target buys. */}
            {showFloor ? (
              <line
                stroke={block.fill}
                strokeDasharray="3 2"
                strokeWidth={1}
                x1={block.x}
                x2={block.x + COL_W}
                y1={floorY}
                y2={floorY}
              />
            ) : null}

            {inside ? (
              <>
                <text
                  className="text-[10px] font-semibold uppercase tracking-[0.08em]"
                  fill={block.ink}
                  x={block.x + COL_W / 2}
                  textAnchor="middle"
                  y={block.y + block.height / 2 - 1}
                >
                  {block.label}
                </text>
                <text
                  className="text-[9.5px]"
                  fill={block.ink}
                  x={block.x + COL_W / 2}
                  textAnchor="middle"
                  y={block.y + block.height / 2 + 11}
                >
                  {money(block.value, unit)}
                </text>
              </>
            ) : (
              <>
                {/* Leader: out of the block, then across to the label. */}
                <path
                  d={`M ${block.x + COL_W} ${block.y + block.height / 2} L ${labelX - 7} ${labelY ?? block.y} L ${labelX - 2} ${labelY ?? block.y}`}
                  fill="none"
                  stroke="var(--border-strong, var(--tertiary))"
                  strokeWidth={0.9}
                />
                <text
                  className="text-[9.5px] font-semibold"
                  fill={block.ink}
                  x={labelX}
                  y={(labelY ?? block.y) + 3}
                >
                  {block.label} {money(block.value, unit)}
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* The ground the stack rests on. */}
      <line
        stroke="var(--border-subtle)"
        strokeWidth={1}
        x1={STACK_X - 30}
        x2={W - 8}
        y1={BOTTOM + 0.5}
        y2={BOTTOM + 0.5}
      />
      <text
        className="fill-[var(--tertiary)] text-[9px]"
        x={STACK_X}
        y={BOTTOM + 14}
      >
        {`${money(st + jt, unit)} protected`}
      </text>
      <text
        className="fill-[var(--tertiary)] text-[9px]"
        x={POOL_X}
        y={BOTTOM + 14}
      >
        {lt > 0 ? `${money(lt, unit)} to exit into` : "no pool funded"}
      </text>
    </svg>
  );
}

export default memo(DayV2StackDiagram);
