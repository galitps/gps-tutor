"use client";


import styles from "./SessionWorkspace.module.css";
import { useState } from "react";
import { LayoutGrid, PencilRuler } from "lucide-react";
import MathCanvas from "@/components/MathCanvas/MathCanvas";
import Whiteboard from "@/components/Whiteboard/Whiteboard";

type WorkspaceView = "math" | "whiteboard";

export default function SessionWorkspace({
  sessionId,
  sessionRole,
}: {
  sessionId: string;
  sessionRole: "student" | "tutor";
}) {
  const [view, setView] = useState<WorkspaceView>("math");

  return (
    <section className={styles.utility_03d7e189}>
      <div
        aria-label="Session workspace"
        className={styles.utility_ba2fb302}
        role="tablist"
      >
        <button
          aria-controls="math-canvas-panel"
          aria-selected={view === "math"}
          className={[styles.utility_29d6713b, (view === "math" ? styles.utility_fd21abc5 : styles.utility_5454d762)].filter(Boolean).join(" ")}
          id="math-canvas-tab"
          onClick={() => setView("math")}
          role="tab"
          type="button"
        >
          <PencilRuler aria-hidden="true" size={16} />
          Math Canvas
        </button>
        <button
          aria-controls="whiteboard-panel"
          aria-selected={view === "whiteboard"}
          className={[styles.utility_29d6713b, (view === "whiteboard" ? styles.utility_fd21abc5 : styles.utility_5454d762)].filter(Boolean).join(" ")}
          id="whiteboard-tab"
          onClick={() => setView("whiteboard")}
          role="tab"
          type="button"
        >
          <LayoutGrid aria-hidden="true" size={16} />
          Whiteboard
        </button>
      </div>
      <div
        aria-labelledby="math-canvas-tab"
        className={[(view === "math" ? styles.utility_60fbb771 : styles.utility_99d72c7f), styles.utility_8b5f63d2].filter(Boolean).join(" ")}
        id="math-canvas-panel"
        role="tabpanel"
      >
        <MathCanvas sessionId={sessionId} sessionRole={sessionRole} />
      </div>
      <div
        aria-labelledby="whiteboard-tab"
        className={[(view === "whiteboard" ? styles.utility_60fbb771 : styles.utility_99d72c7f), styles.utility_8b5f63d2].filter(Boolean).join(" ")}
        id="whiteboard-panel"
        role="tabpanel"
      >
        <Whiteboard sessionId={sessionId} sessionRole={sessionRole} />
      </div>
    </section>
  );
}
