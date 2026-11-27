import { THEMES } from "@/lib/themes";
import { designPictures } from "./design-icons";

/**
 * The design's own logo (top-left corner) and help-button picture
 * (design-icons.ts). One image per design is in the page; the stylesheet
 * shows only the one for the design in use (.only-<design>), so the right
 * one shows from the very first paint, before any script runs.
 */

export function DesignLogo({ size, className = "" }: { size: number; className?: string }) {
  return (
    <>
      {THEMES.map((theme) => (
        // eslint-disable-next-line @next/next/no-img-element -- a tiny pixel picture drawn here, not a photo
        <img
          key={theme.id}
          src={designPictures(theme.id).logo}
          alt=""
          width={size}
          height={size}
          draggable={false}
          className={`only-${theme.id} pixelated shrink-0 ${className}`}
        />
      ))}
    </>
  );
}

/** The help button's picture; those that don't already ask "?" get a small "?" in the corner. */
export function DesignHelpPicture({ width = 26 }: { width?: number }) {
  return (
    <>
      {THEMES.map((theme) => {
        const picture = designPictures(theme.id);
        return (
          <span key={theme.id} className={`only-${theme.id} relative inline-flex`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a tiny pixel picture drawn here, not a photo */}
            <img
              src={picture.help}
              alt=""
              width={width}
              height={Math.round((width * picture.helpHeight) / picture.helpWidth)}
              draggable={false}
              className="pixelated"
            />
            {!picture.helpHasQuestionMark && (
              <span
                className="absolute -bottom-2 -right-2.5 flex h-3.5 w-3.5 items-center justify-center border border-black bg-panel font-display text-[7px] leading-none text-ink"
                aria-hidden="true"
              >
                ?
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}
