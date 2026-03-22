"use client";

import { C } from "@/lib/theme";
import { useFramework } from "@/lib/framework-context";
import type { Framework } from "@/lib/framework-config";

const SEGMENTS: { value: Framework; label: string }[] = [
  { value: "bookstaber", label: "Bookstaber \u2014 Systemic Risk" },
  { value: "yardeni", label: "Yardeni \u2014 Resilience" },
];

export function FrameworkToggle() {
  const { framework, setFramework } = useFramework();

  return (
    <div
      data-testid="framework-toggle"
      style={{
        display: "flex",
        gap: 0,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        borderRadius: 6,
        overflow: "hidden",
        border: `1px solid ${C.panelBorder}`,
      }}
    >
      {SEGMENTS.map((seg) => {
        const active = framework === seg.value;
        return (
          <button
            key={seg.value}
            aria-pressed={active}
            onClick={() => setFramework(seg.value)}
            style={{
              padding: "5px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              border: "none",
              cursor: "pointer",
              background: active ? C.panelBorder : "transparent",
              color: active ? C.text : C.textDim,
              fontWeight: active ? 600 : 400,
              letterSpacing: 0.3,
            }}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
