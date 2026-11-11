import { PixelIcon } from "@/components/ui/PixelIcon";

/** The dropby mark: a little door on a blue tile, plus the name. */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const large = size === "lg";
  return (
    <span className="inline-flex items-center gap-3">
      <span className={`tile tile-free inline-flex items-center justify-center ${large ? "h-14 w-14" : "h-9 w-9"}`}>
        <PixelIcon name="door" size={large ? 30 : 18} />
      </span>
      <span className={`font-display text-ink ${large ? "text-[22px]" : "text-[13px]"}`}>dropby</span>
    </span>
  );
}
