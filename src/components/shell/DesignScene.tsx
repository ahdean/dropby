"use client";

import { BulldogScene } from "@/components/bulldog/BulldogScene";
import { MaraScene } from "@/components/mara/MaraScene";
import { VintageScene } from "@/components/vintage/VintageScene";

/**
 * The little animated scene of the design in use, if it has one: the mara
 * and alpaca (Mara), the bulldog and its ball (Bulldog), the cuckoo clock
 * (Vintage). Each is shown only in its own design (.only-<design>).
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
    </>
  );
}
