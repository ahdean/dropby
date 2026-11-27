import { DesignLogo } from "@/components/designs/DesignMark";

/**
 * The wheet mark: the design's own logo (components/designs/design-icons.ts),
 * plus the name. The browser-tab icon stays the line-drawn mara in every design.
 */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const large = size === "lg";
  return (
    <span className="inline-flex items-center gap-3">
      <DesignLogo size={large ? 56 : 36} className="shadow-[0_0_0_2px_var(--outline)]" />
      <span className={`font-display text-ink ${large ? "text-[22px]" : "text-[13px]"}`}>wheet</span>
    </span>
  );
}
