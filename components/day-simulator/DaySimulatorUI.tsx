import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";

export const DAY_SIMULATOR_THEME = {
  pageBg: "#F4F3EF",
  cardBg: "#FFFFFF",
  border: "#DEDDD7",
  text: "#1D1C19",
  muted: "#68665F",
  eyebrow: "#817A70",
  kpiLabel: "#969188",
  accent: "#A65B20",
  olive: "#3F7D5A",
  danger: "#A24737",
  faint: "#B7B3AB",
  seniorLine: "#8B6B4B",
  juniorLine: "#25231F",
  strategyLine: "#9A968F",
  obsFill: "#F4C77B",
  freeLine: "#51A473",
} as const;

export const DAY_SIMULATOR_TYPE = {
  sans: "var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: '"SFMono-Regular", Consolas, monospace',
} as const;

export const DAY_SIMULATOR_SPACE = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const DAY_SIMULATOR_RADIUS = {
  control: 8,
  panel: 10,
  surface: 14,
} as const;

const surfacePadding = {
  none: 0,
  compact: DAY_SIMULATOR_SPACE.md,
  normal: DAY_SIMULATOR_SPACE.lg,
  spacious: DAY_SIMULATOR_SPACE.xl,
} as const;

export function DaySurface({
  children,
  className,
  padding = "normal",
  style,
  ...props
}: HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  padding?: keyof typeof surfacePadding;
}) {
  return (
    <section
      className={className}
      style={{
        background: DAY_SIMULATOR_THEME.cardBg,
        border: `1px solid ${DAY_SIMULATOR_THEME.border}`,
        borderRadius: DAY_SIMULATOR_RADIUS.surface,
        boxShadow: "0 1px 2px rgba(29,28,25,.04)",
        padding: surfacePadding[padding],
        ...style,
      }}
      {...props}
    >
      {children}
    </section>
  );
}

export function DayEyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      style={{
        color: DAY_SIMULATOR_THEME.eyebrow,
        fontFamily: DAY_SIMULATOR_TYPE.mono,
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function DaySectionHeader({
  action,
  description,
  eyebrow,
  step,
  title,
}: {
  action?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  step?: number;
  title: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className={step ? "flex items-start gap-3" : undefined}>
        {step && (
          <span
            aria-hidden
            style={{
              color: DAY_SIMULATOR_THEME.accent,
              flex: "0 0 auto",
              fontFamily: DAY_SIMULATOR_TYPE.mono,
              fontSize: 25,
              fontWeight: 600,
              letterSpacing: "-0.06em",
              lineHeight: 1,
              paddingTop: 1,
            }}
          >
            {step}.
          </span>
        )}
        <div>
          {eyebrow && <DayEyebrow>{eyebrow}</DayEyebrow>}
          <h2
            className={eyebrow ? "mt-2" : undefined}
            style={{
              color: DAY_SIMULATOR_THEME.text,
              fontFamily: DAY_SIMULATOR_TYPE.sans,
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: "-0.025em",
              lineHeight: 1.12,
            }}
          >
            {title}
          </h2>
          {description && (
            <p
              className="mt-1"
              style={{ color: DAY_SIMULATOR_THEME.muted, fontSize: 11.5, lineHeight: 1.45 }}
            >
              {description}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

const buttonVariant = {
  primary: {
    background: DAY_SIMULATOR_THEME.accent,
    border: DAY_SIMULATOR_THEME.accent,
    color: DAY_SIMULATOR_THEME.cardBg,
  },
  secondary: {
    background: DAY_SIMULATOR_THEME.cardBg,
    border: DAY_SIMULATOR_THEME.border,
    color: DAY_SIMULATOR_THEME.text,
  },
  quiet: {
    background: "transparent",
    border: DAY_SIMULATOR_THEME.border,
    color: DAY_SIMULATOR_THEME.accent,
  },
} as const;

export function DayButton({
  children,
  style,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariant;
}) {
  const colors = buttonVariant[variant];
  return (
    <button
      style={{
        background: colors.background,
        border: `1px solid ${colors.border}`,
        borderRadius: DAY_SIMULATOR_RADIUS.control,
        color: colors.color,
        fontFamily: DAY_SIMULATOR_TYPE.sans,
        fontSize: 12,
        fontWeight: 600,
        minHeight: 40,
        padding: "9px 13px",
        ...style,
      }}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}


export function DayFieldLabel({
  children,
  className,
  style,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={className}
      style={{ color: DAY_SIMULATOR_THEME.text, display: "grid", gap: 6, ...style }}
      {...props}
    >
      {children}
    </label>
  );
}

export function DayFieldCaption({ children }: { children: ReactNode }) {
  return <DayEyebrow style={{ display: "block" }}>{children}</DayEyebrow>;
}

export function DaySegmentedControl({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      aria-label={label}
      className="grid grid-cols-1 sm:grid-cols-2"
      role="group"
      style={{
        background: DAY_SIMULATOR_THEME.pageBg,
        border: `1px solid ${DAY_SIMULATOR_THEME.border}`,
        borderRadius: DAY_SIMULATOR_RADIUS.panel,
        gap: 4,
        padding: 4,
      }}
    >
      {children}
    </div>
  );
}

export function DaySegmentedButton({
  active,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
}) {
  return (
    <button
      aria-pressed={active}
      style={{
        background: active ? DAY_SIMULATOR_THEME.cardBg : "transparent",
        border: `1px solid ${active ? DAY_SIMULATOR_THEME.border : "transparent"}`,
        borderRadius: DAY_SIMULATOR_RADIUS.control,
        boxShadow: active ? "0 1px 2px rgba(29,28,25,.05)" : "none",
        color: active ? DAY_SIMULATOR_THEME.text : DAY_SIMULATOR_THEME.muted,
        fontFamily: DAY_SIMULATOR_TYPE.sans,
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        minHeight: 42,
        padding: "9px 12px",
        textAlign: "left",
      }}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export function DayDisclosure({ children }: { children: ReactNode }) {
  return (
    <div
      aria-label="Educational simulator disclosure"
      role="note"
      style={{
        background: DAY_SIMULATOR_THEME.pageBg,
        border: `1px solid ${DAY_SIMULATOR_THEME.border}`,
        borderLeft: `3px solid ${DAY_SIMULATOR_THEME.accent}`,
        borderRadius: DAY_SIMULATOR_RADIUS.control,
        color: DAY_SIMULATOR_THEME.muted,
        fontSize: 11,
        lineHeight: 1.5,
        padding: "10px 12px",
      }}
    >
      {children}
    </div>
  );
}

export function DayValueTile({
  label,
  note,
  tone = DAY_SIMULATOR_THEME.text,
  value,
}: {
  label: ReactNode;
  note?: ReactNode;
  tone?: string;
  value: ReactNode;
}) {
  return (
    <div
      style={{
        background: DAY_SIMULATOR_THEME.pageBg,
        border: `1px solid ${DAY_SIMULATOR_THEME.border}`,
        borderRadius: DAY_SIMULATOR_RADIUS.panel,
        minHeight: 76,
        padding: "11px 12px",
      }}
    >
      <DayEyebrow>{label}</DayEyebrow>
      <p className="mt-1" style={{ color: tone, fontFamily: DAY_SIMULATOR_TYPE.mono, fontSize: 16, fontWeight: 600 }}>
        {value}
      </p>
      {note && <p className="mt-1" style={{ color: DAY_SIMULATOR_THEME.muted, fontSize: 10.5, lineHeight: 1.35 }}>{note}</p>}
    </div>
  );
}
