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

/** The help button's picture. */
export function DesignHelpPicture({ width = 26 }: { width?: number }) {
  return (
    <>
      {THEMES.map((theme) => {
        const picture = designPictures(theme.id);
        return (
          // eslint-disable-next-line @next/next/no-img-element -- a tiny pixel picture drawn here, not a photo
          <img
            key={theme.id}
            src={picture.help}
            alt=""
            width={width}
            height={Math.round((width * picture.helpHeight) / picture.helpWidth)}
            draggable={false}
            className={`only-${theme.id} pixelated`}
          />
        );
      })}
    </>
  );
}
