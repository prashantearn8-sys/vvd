/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { AlertTriangle, ArrowLeft, Terminal } from "lucide-react";

interface NotFoundViewProps {
  onBack: () => void;
  requestedPath?: string;
}

export default function NotFoundView({ onBack, requestedPath }: NotFoundViewProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-6 py-12 animate-fade-in text-center" id="not-found-view">
      <div className="border-3 border-white/90 bg-zinc-950 p-8 rounded-2xl shadow-[6px_6px_0_0_#ffffff] text-left">
        <div className="flex items-center gap-3 border-b-2 border-zinc-800 pb-4 mb-6">
          <div className="p-2 bg-zinc-900 text-white rounded-lg border border-zinc-700">
            <AlertTriangle className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="font-mono text-[10px] text-zinc-400 font-bold uppercase tracking-widest block">
              STATUS CODE: 404
            </span>
            <h1 className="text-xl md:text-2xl font-bold uppercase tracking-tight text-white font-sans">
              ERROR 404 — PAGE NOT FOUND
            </h1>
          </div>
        </div>

        <div className="space-y-4 font-mono text-xs text-zinc-300">
          <p>
            The requested sub-routine path <span className="text-white font-bold">"{requestedPath || (typeof window !== 'undefined' ? window.location.pathname : 'unknown')}"</span> could not be located on this local engine instance.
          </p>

          <div className="bg-black border border-zinc-800 p-4 rounded-xl space-y-2 text-zinc-400">
            <div className="flex items-center gap-2 text-white font-bold text-[11px]">
              <Terminal className="w-3.5 h-3.5 text-white" />
              AVAILABLE_VALID_TARGETS:
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-[11px]">
              <li>/ (System Deck)</li>
              <li>/compress-image (Image Compressor)</li>
              <li>/compress-pdf (PDF Compressor)</li>
              <li>/convert-image (Image Transcoder)</li>
              <li>/image-to-pdf (Image to PDF Assembler)</li>
              <li>/merge-pdf (PDF Page Merger)</li>
              <li>/pdf-to-images (PDF Rasterizer)</li>
              <li>/privacy (Zero-Telemetry Protocol)</li>
              <li>/terms (Terms of Service)</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-zinc-800 flex justify-center">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-white text-black font-mono font-bold text-xs uppercase tracking-wider rounded-xl border-2 border-white hover:bg-zinc-200 cursor-pointer shadow-[3px_3px_0_0_#ffffff] transition-transform active:translate-x-0.5 active:translate-y-0.5"
            aria-label="Return to System Deck"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>RETURN TO SYSTEM DECK</span>
          </button>
        </div>
      </div>
    </div>
  );
}
