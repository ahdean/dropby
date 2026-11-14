"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { ZonePicker } from "@/components/ui/ZonePicker";
import { zoneAbbreviation } from "@/lib/time";
import { useZone, useZonePreference } from "@/lib/zone";

/**
 * Shows which time zone the calendar is in ("EST") and opens the selector.
 * It lights up gold when a zone other than the device's own has been chosen,
 * so it is never a surprise that times look shifted.
 */
export function ZoneButton() {
  const zone = useZone();
  const overridden = useZonePreference() !== null;
  const [open, setOpen] = useState(false);
  const short = zoneAbbreviation(new Date().toISOString(), zone);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`btn btn-sm tile ${overridden ? "tile-locked" : "tile-dark"}`}
        aria-label={`Time zone: ${zone.replace(/_/g, " ")}. Change`}
        title={`Times are shown in ${zone.replace(/_/g, " ")}`}
      >
        <PixelIcon name="globe" size={13} />
        {short}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Time zone"
        footer={
          <Button variant="free" onClick={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-3">
          <label htmlFor="calendar-zone" className="label">
            Show all times in
          </label>
          <ZonePicker id="calendar-zone" />
          <p className="text-[17px] text-ink-faint">
            Your blocks don&apos;t move in real time: only the clock they are shown on changes. Friends always see them in
            their own zone. The choice is remembered on this device.
          </p>
        </div>
      </Dialog>
    </>
  );
}
