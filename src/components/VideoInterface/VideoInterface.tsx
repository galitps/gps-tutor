"use client";

import { useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor } from "lucide-react";

export default function VideoInterface() {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-xl overflow-hidden shadow-lg border border-slate-800">
      {/* Video Streams Grid */}
      <div className="flex-1 p-3 grid grid-rows-2 gap-3 min-h-0">
        {/* Student Tile */}
        <div className="relative bg-slate-800 rounded-lg overflow-hidden border border-slate-700/50 flex items-center justify-center">
          <span className="text-slate-400 text-sm font-medium">Student Stream (Waiting to connect...)</span>
          <div className="absolute bottom-2 left-2 bg-slate-950/80 px-2 py-0.5 rounded text-xs text-white">
            Alex (Student)
          </div>
        </div>

        {/* Tutor Tile (Self View) */}
        <div className="relative bg-slate-800 rounded-lg overflow-hidden border border-slate-700/50 flex items-center justify-center">
          {!isVideoOff ? (
            <span className="text-slate-400 text-sm font-medium">Tutor Camera (Self View)</span>
          ) : (
            <div className="flex flex-col items-center text-slate-500">
              <VideoOff className="w-8 h-8 mb-1" />
              <span className="text-xs">Camera Off</span>
            </div>
          )}
          <div className="absolute bottom-2 left-2 bg-slate-950/80 px-2 py-0.5 rounded text-xs text-white">
            You (Tutor)
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="h-16 bg-slate-950 border-t border-slate-800 flex items-center justify-center gap-3 px-4">
        <button
          onClick={() => setIsMuted(!isMuted)}
          className={`p-3 rounded-full transition ${
            isMuted ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          onClick={() => setIsVideoOff(!isVideoOff)}
          className={`p-3 rounded-full transition ${
            isVideoOff ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
          }`}
          title={isVideoOff ? "Turn On Camera" : "Turn Off Camera"}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        <button
          className="p-3 rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 transition"
          title="Share Screen"
        >
          <Monitor className="w-5 h-5" />
        </button>

        <button
          className="p-3 rounded-full bg-red-600 text-white hover:bg-red-700 transition ml-4"
          title="End Session"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}