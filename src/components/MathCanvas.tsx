"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Desmos: any;
  }
}

export default function MathCanvas() {
  const calculatorRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Function to initialize calculator once script is available
    const initCalculator = () => {
      if (calculatorRef.current && window.Desmos) {
        // Clear previous instance if re-rendering
        calculatorRef.current.innerHTML = "";
        window.Desmos.GraphingCalculator(calculatorRef.current, {
          expressions: true,
          settingsMenu: true,
          zoomButtons: true,
          lockViewport: false,
        });
        setIsLoading(false);
      }
    };

    if (window.Desmos) {
      initCalculator();
      return;
    }

    // Load Desmos API script
    const script = document.createElement("script");
    const apiKey = process.env.NEXT_PUBLIC_DESMOS_API_KEY || "dcb31709b452b149dc269b578d5367f0";
    script.src = `https://www.desmos.com/api/v1.9/calculator.js?apiKey=${apiKey}`;
    script.async = true;
    script.onload = () => initCalculator();
    document.head.appendChild(script);

    return () => {
      // Cleanup script tag on unmount if needed
    };
  }, []);

  return (
    <div className="relative w-full h-[600px] bg-white rounded-xl shadow-inner border border-slate-200 overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-500 font-medium z-10">
          Loading Desmos Graphing Calculator...
        </div>
      )}
      <div ref={calculatorRef} className="w-full h-full min-h-[600px]" />
    </div>
  );
}