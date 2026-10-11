"use client";

import { useEffect, useRef, useState } from "react";
import styles from './MathCanvas.module.css';

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
    <div className={styles.container}>
      {isLoading && (
        <div className={styles.statusOverlay}>
          Loading Desmos Graphing Calculator...
        </div>
      )}
      <div ref={calculatorRef} className={styles.desmosWrapper} id="calculator" style={{ width: '100%', height: '100%' }} />
    </div>
  );
}