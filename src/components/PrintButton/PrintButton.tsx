"use client";

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
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-sky-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
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
