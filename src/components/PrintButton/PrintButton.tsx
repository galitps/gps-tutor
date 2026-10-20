"use client";


import styles from "./PrintButton.module.css";
import { Printer } from "lucide-react";

type PrintableDisplay = "math-canvas" | "whiteboard" | "chat";

export default function PrintButton({
  display,
  label,
}: {
  display: PrintableDisplay;
  label: string;
}) {
  function handlePrint(): void {
    const body = document.body;
    body.dataset.printTarget = display;

    const cleanup = () => {
      delete body.dataset.printTarget;
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    try {
      window.print();
    } catch (error: unknown) {
      cleanup();
      throw error;
    }
  }

  return (
    <button
      aria-label={`Print ${label}`}
      className={styles.printButton}
      data-print-hide
      onClick={handlePrint}
      title={`Print ${label}`}
      type="button"
    >
      <Printer aria-hidden="true" size={14} />
      Print
    </button>
  );
}
