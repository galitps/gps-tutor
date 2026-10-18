"use client";

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
    <section className="flex h-full min-h-0 flex-col gap-2">
      <div
        aria-label="Session workspace"
        className="flex shrink-0 items-center gap-1"
        role="tablist"
      >
        <button
          aria-controls="math-canvas-panel"
          aria-selected={view === "math"}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            view === "math"
              ? "bg-sky-800 text-white"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
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
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            view === "whiteboard"
              ? "bg-sky-800 text-white"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
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
        className={`${view === "math" ? "flex" : "hidden"} min-h-0 flex-1`}
        id="math-canvas-panel"
        role="tabpanel"
      >
        <MathCanvas sessionId={sessionId} sessionRole={sessionRole} />
      </div>
      <div
        aria-labelledby="whiteboard-tab"
        className={`${view === "whiteboard" ? "flex" : "hidden"} min-h-0 flex-1`}
        id="whiteboard-panel"
        role="tabpanel"
      >
        <Whiteboard sessionId={sessionId} sessionRole={sessionRole} />
      </div>
    </section>
  );
}
