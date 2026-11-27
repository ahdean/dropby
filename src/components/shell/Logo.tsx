import { MainIcon } from "@/components/mara/MainIcon";

/** The wheet mark: the pixel mara's face on a grass tile, plus the name. The same in every design. */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const large = size === "lg";
  return (
    <span className="inline-flex items-center gap-3">
      <MainIcon size={large ? 56 : 36} className="shadow-[0_0_0_2px_var(--outline)]" />
      <span className={`font-display text-ink ${large ? "text-[22px]" : "text-[13px]"}`}>wheet</span>
    </span>
  );
}
