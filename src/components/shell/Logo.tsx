import { MARA_FACE } from "@/components/mara/sprites";
import { PixelArt } from "@/components/mara/PixelArt";
import { PixelIcon } from "@/components/ui/PixelIcon";

/**
 * The wheet mark: a little door on a blue tile, plus the name. In the Mara
 * design the door becomes a pixel mara's face on a grass-green tile (both are
 * drawn; the stylesheet shows the one that fits the design).
 */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const large = size === "lg";
  return (
    <span className="inline-flex items-center gap-3">
      <span className={`except-mara tile tile-free inline-flex items-center justify-center ${large ? "h-14 w-14" : "h-9 w-9"}`}>
        <PixelIcon name="door" size={large ? 30 : 18} />
      </span>
      <span className={`only-mara tile tile-join inline-flex items-end justify-center overflow-hidden ${large ? "h-14 w-14" : "h-9 w-9"}`}>
        <PixelArt art={MARA_FACE} size={large ? 48 : 30} />
      </span>
      <span className={`font-display text-ink ${large ? "text-[22px]" : "text-[13px]"}`}>wheet</span>
    </span>
  );
}
