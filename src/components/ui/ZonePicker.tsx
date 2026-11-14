"use client";

import { useMemo } from "react";
import { deviceZone } from "@/lib/time";
import { setZonePreference, useZonePreference, zoneOptions } from "@/lib/zone";

/** Choose the time zone the app shows times in. "Automatic" follows the device. */
export function ZonePicker({ id }: { id: string }) {
  const preference = useZonePreference();
  const options = useMemo(() => zoneOptions(), []);
  const device = deviceZone();

  return (
    <select
      id={id}
      className="field"
      value={preference ?? ""}
      onChange={(event) => setZonePreference(event.target.value || null)}
    >
      <option value="">Automatic: this device ({device.replace(/_/g, " ")})</option>
      <optgroup label="United States">
        {options.us.map((zone) => (
          <option key={zone.value} value={zone.value}>
            {zone.label}
          </option>
        ))}
      </optgroup>
      {options.world.length > 0 && (
        <optgroup label="Everywhere else">
          {options.world.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
