/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { UploadCloud } from "lucide-react";
import { useFileDrop } from "../context/FileDropContext";
import { RetroView } from "../types";

interface GlobalDropOverlayProps {
  currentView?: RetroView;
  onSelectView?: (view: RetroView) => void;
}

export default function GlobalDropOverlay({ currentView = "home" }: GlobalDropOverlayProps) {
  const { isGlobalDragging, draggedFileCount } = useFileDrop();

  // Drag and drop overlay is strictly enabled for file-processing views, NOT homescreen or static pages
  const isProcessingView = [
    "compress_img",
    "compress_pdf",
    "convert_img",
    "image_to_pdf",
    "merge_pdf",
    "pdf_to_images",
    "remove_pdf_pages",
    "organize_pdf",
    "word_to_pdf",
    "word_to_jpg",
    "pdf_to_word",
    "excel_to_pdf",
    "ppt_to_pdf",
    "pdf_to_ppt",
    "pdf_to_excel",
    "watermark_pdf",
    "lock_pdf",
    "unlock_pdf",
    "sign_pdf",
    "passport_photo",
  ].includes(currentView);

  if (!isGlobalDragging || !isProcessingView) return null;

  return (
    <div
      id="global-drag-drop-overlay"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-8 animate-fade-in pointer-events-auto select-none"
      role="region"
      aria-label="Global File Drop Zone"
    >
      <div className="w-full max-w-2xl border-2 border-white/80 bg-zinc-950/95 rounded-2xl p-8 sm:p-10 shadow-[0_0_50px_rgba(255,255,255,0.15)] flex flex-col items-center text-center space-y-6">
        
        {/* Animated Icon & HUD Header */}
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl border-2 border-white bg-zinc-900 flex items-center justify-center text-white shadow-[4px_4px_0px_0px_#ffffff] animate-bounce">
            <UploadCloud className="w-10 h-10" />
          </div>
          <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-white text-black text-[10px] font-mono font-bold uppercase rounded-full border border-black shadow-[1px_1px_0px_0px_#ffffff]">
            READY
          </span>
        </div>

        <div>
          <h2 className="text-xl sm:text-2xl font-bold uppercase font-sans tracking-tight text-white flex items-center justify-center gap-2">
            DROP FILE TO PROCESS LOCALLY
          </h2>
          <p className="text-xs sm:text-sm font-mono text-zinc-400 max-w-md mx-auto mt-1.5 uppercase">
            {draggedFileCount > 1
              ? `Detected ${draggedFileCount} files queued. Release to add to current workspace.`
              : "Release anywhere to load directly into the client sandbox. 100% private."}
          </p>
        </div>

        <div className="border-2 border-dashed border-zinc-700 bg-zinc-900/60 rounded-xl p-4 w-full text-xs font-mono text-zinc-300">
          ACTIVE_WORKSPACE: <span className="text-white font-bold uppercase">{currentView.replace(/_/g, " ")}</span>
          <div className="text-[11px] text-zinc-400 mt-1">
            Drop anywhere on screen to load into this engine.
          </div>
        </div>

        <div className="text-[10px] font-mono text-zinc-500 uppercase flex items-center gap-2">
          <span>PRESS [ESC] TO CANCEL DRAG</span>
          <span>•</span>
          <span>ALL PROCESSING 100% IN-BROWSER</span>
        </div>
      </div>
    </div>
  );
}
