"use client";

import { createContext, useContext, useState, useEffect } from "react";
import type { Framework } from "./framework-config";

const FrameworkContext = createContext<{
  framework: Framework;
  setFramework: (f: Framework) => void;
}>({ framework: "bookstaber", setFramework: () => {} });

function readStoredFramework(): Framework {
  if (typeof window === "undefined") return "bookstaber";
  const stored = window.localStorage.getItem("risk-framework");
  if (stored === "bookstaber" || stored === "yardeni") return stored;
  return "bookstaber";
}

export function FrameworkProvider({ children }: { children: React.ReactNode }) {
  const [framework, setFramework] = useState<Framework>(readStoredFramework);

  useEffect(() => {
    window.localStorage.setItem("risk-framework", framework);
  }, [framework]);

  return (
    <FrameworkContext.Provider value={{ framework, setFramework }}>
      {children}
    </FrameworkContext.Provider>
  );
}

export function useFramework() {
  return useContext(FrameworkContext);
}
