import {
  DAY_DOCS,
  type DayDocsKey,
} from "@/lib/day-simulator-template/docs-links";
import { DAY_V3_CONTROL_FOCUS } from "@/components/day-v3/DayV3Button";
import { cn } from "@/lib/utils";

/**
 * A link out to the docs section for whatever concept is next to it.
 *
 * Two rules it exists to enforce. It takes a **key**, never a URL, so no call
 * site can invent an anchor that does not resolve: the registry is the only
 * place a URL is written and every entry there was checked against the live
 * page. And it names the concept in both visible and accessible text. A page
 * full of links called "Docs" makes readers decode where every link goes.
 *
 * `rel="noreferrer"` and a new tab, for the same reason the deploy CTA uses
 * them: a reader following a definition must not lose the design they just
 * built.
 */
export default function DayV3DocsLink({
  label,
  topic,
}: {
  /** The linked concept. "Coverage requirements", not "Docs" or "this". */
  label: string;
  topic: DayDocsKey;
}) {
  return (
    <a
      aria-label={`Royco docs: ${label} (opens in new tab)`}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-sm px-1 py-1 text-[10px] font-semibold text-[var(--tertiary)] underline decoration-dotted underline-offset-2 hover:text-[var(--foreground)]",
        DAY_V3_CONTROL_FOCUS,
      )}
      href={DAY_DOCS[topic]}
      rel="noreferrer"
      target="_blank"
    >
      {label}
      <span aria-hidden="true">↗</span>
    </a>
  );
}
