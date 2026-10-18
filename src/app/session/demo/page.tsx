import MathCanvas from "@/components/MathCanvas/MathCanvas";
import SessionChat from "@/components/SessionChat/SessionChat";
import VideoInterface from "@/components/VideoInterface/VideoInterface";

export default function SessionPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="font-semibold text-sm sm:text-base text-slate-200">
            Calculus I: Limits & Derivatives — Session #101
          </h1>
        </div>
        <div className="text-xs text-slate-400 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">
          Demo Workspace Mode
        </div>
      </header>

      {/* Workspace Grid */}
      <main className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-3.5rem)] overflow-hidden">
        {/* Left Column: Interactive Desmos Math Canvas (8 cols)  */}
        <section className="lg:col-span-8 h-full flex flex-col">
          <MathCanvas />
        </section>
        {/* Right Column: Video Controls & Session Notes (4 cols)  */}
        <section className="lg:col-span-4 h-full min-h-0 flex flex-col gap-4">
          <div className="min-h-0 flex-1">
            <VideoInterface />
          </div>
          <SessionChat />
        </section>
      </main>
    </div>
  );
}