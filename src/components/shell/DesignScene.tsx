"use client";

import { BulldogScene } from "@/components/bulldog/BulldogScene";
import { LANDSCAPES, LandscapeScene } from "@/components/designs/LandscapeScene";
import { MaraScene } from "@/components/mara/MaraScene";
import { VintageScene } from "@/components/vintage/VintageScene";

/**
 * The little animated scene of the design in use, if it has one: the mara
 * and alpaca (Mara), the bulldog and its ball (Bulldog), the cuckoo clock
 * (Vintage), and a little landscape for each of the others but Retro night
 * and Light. Each is shown only in its own design (.only-<design>).
 */
export function DesignScene() {
  return (
    <>
      <div className="only-mara">
        <MaraScene />
      </div>
      <div className="only-bulldog">
        <BulldogScene />
      </div>
      <div className="only-vintage">
        <VintageScene />
      </div>
      {LANDSCAPES.map((id) => (
        <div key={id} className={`only-${id}`}>
          <LandscapeScene id={id} />
        </div>
      ))}
    </>
  );
}
