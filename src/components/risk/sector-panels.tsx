"use client";

import { DOMAINS } from "@/lib/domain-config";
import { SectorPanel } from "./sector-panel";

/**
 * Renders all four domain sector panels.
 * The first panel (Private Credit) is expanded by default.
 */
export function SectorPanels() {
  return (
    <>
      {DOMAINS.map((domain, i) => (
        <SectorPanel
          key={domain.scoreKey}
          domain={domain}
          defaultExpanded={i === 0}
        />
      ))}
    </>
  );
}
