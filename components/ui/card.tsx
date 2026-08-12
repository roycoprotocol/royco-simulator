import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Ported from royco-rwa-frontend components/ui/card.tsx, plus a weight.
 *
 * Nine cards built from one object give a page no hierarchy: rank ends up
 * decided by area, so the largest section wins and the answer loses. Weight is
 * the rank. The rule it buys is that exactly two things carry a shadow, the
 * answer and the control, and everything else recedes.
 */
const CARD_WEIGHTS = {
  primary: "border-[var(--border-subtle)] bg-[var(--card)] shadow-[0_2px_10px_-4px_rgba(23,25,31,0.18)]",
  default: "border-[var(--border-subtle)] bg-[var(--card)]",
  quiet: "border-[var(--border-subtle)] bg-transparent",
} as const;

export function Card({
  className,
  weight = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & { weight?: keyof typeof CARD_WEIGHTS }) {
  return (
    <div
      className={cn(
        "rounded-xl border text-[var(--foreground)]",
        CARD_WEIGHTS[weight],
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 px-5 pt-5", className)} {...props} />;
}

/**
 * Level is a prop because a card's depth in the page is the page's business,
 * not the card's. Most cards are top-level sections under the one `h1`, so the
 * default is 2, and the position cards inside the positions group pass 3. It
 * changes the outline a screen reader announces, never the size on screen.
 */
export function CardTitle({
  className,
  level = 2,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { level?: 2 | 3 | 4 }) {
  const Heading = `h${level}` as const;
  return (
    <Heading
      className={cn("text-[15px] font-semibold tracking-[-0.01em]", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-[12px] leading-relaxed text-[var(--tertiary)]", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}
