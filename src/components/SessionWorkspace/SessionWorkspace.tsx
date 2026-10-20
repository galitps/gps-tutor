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
    <section className={styles.contentSection}>
      <div
        aria-label="Session workspace"
        className={styles.alignedRow}
        role="tablist"
      >
        <button
          aria-controls="math-canvas-panel"
          aria-selected={view === "math"}
          className={[styles.workspaceTab, (view === "math" ? styles.selectedWorkspaceTab : styles.unselectedWorkspaceTab)].filter(Boolean).join(" ")}
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
          className={[styles.workspaceTab, (view === "whiteboard" ? styles.selectedWorkspaceTab : styles.unselectedWorkspaceTab)].filter(Boolean).join(" ")}
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
        className={[(view === "math" ? styles.workspacePanel : styles.hiddenWorkspacePanel), styles.workspacePanelLayout].filter(Boolean).join(" ")}
        id="math-canvas-panel"
        role="tabpanel"
      >
        <MathCanvas sessionId={sessionId} sessionRole={sessionRole} />
      </div>
      <div
        aria-labelledby="whiteboard-tab"
        className={[(view === "whiteboard" ? styles.workspacePanel : styles.hiddenWorkspacePanel), styles.workspacePanelLayout].filter(Boolean).join(" ")}
        id="whiteboard-panel"
        role="tabpanel"
      >
        <Whiteboard sessionId={sessionId} sessionRole={sessionRole} />
      </div>
    </section>
  );
}
