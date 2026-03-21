"use client";

import React, { useState } from "react";
import { JARGON_DEFINITIONS } from "@/lib/jargon";

interface JargonTooltipProps {
  term: string;
  children?: React.ReactNode;
}

/**
 * Wraps a financial term with a hover tooltip showing a plain-language definition.
 * Uses the JARGON_DEFINITIONS map for content. If no definition exists for the term,
 * renders the text without tooltip behavior.
 */
export function JargonTooltip({ term, children }: JargonTooltipProps) {
  const [hovered, setHovered] = useState(false);
  const definition = JARGON_DEFINITIONS[term];
  const displayText = children ?? term;

  if (!definition) {
    return <span>{displayText}</span>;
  }

  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span
        data-testid="jargon-trigger"
        tabIndex={0}
        role="term"
        aria-describedby={hovered ? "jargon-tooltip-content" : undefined}
        style={{
          borderBottom: "1px dotted currentColor",
          cursor: "help",
        }}
      >
        {displayText}
      </span>
      {hovered && (
        <span
          data-testid="jargon-tooltip-content"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#111827",
            color: "#e2e8f0",
            fontSize: 11,
            fontFamily: "var(--font-mono), JetBrains Mono, monospace",
            padding: "8px 12px",
            borderRadius: 6,
            whiteSpace: "normal",
            width: 260,
            maxWidth: "80vw",
            lineHeight: 1.4,
            zIndex: 100,
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {definition}
        </span>
      )}
    </span>
  );
}

/**
 * Maps display text fragments to their jargon definition keys.
 * Used by annotateText to detect jargon terms in description strings.
 */
const TEXT_TO_TERM: Record<string, string> = {
  BDC: "BDC",
  HY: "HY Credit Spread",
  VIX: "VIX",
  MOVE: "MOVE",
  contagion: "Contagion",
  Contagion: "Contagion",
  correlation: "Pearson Correlation",
};

/**
 * Scans a text string for known jargon terms and wraps matches
 * with JargonTooltip components. Non-matching segments remain as plain text.
 */
export function annotateText(text: string): React.ReactNode {
  const pattern = new RegExp(
    `\\b(${Object.keys(TEXT_TO_TERM).join("|")})\\b`,
    "g",
  );
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const fragment = match[1];
    const term = TEXT_TO_TERM[fragment];
    parts.push(
      <JargonTooltip key={match.index} term={term}>
        {fragment}
      </JargonTooltip>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : text;
}
