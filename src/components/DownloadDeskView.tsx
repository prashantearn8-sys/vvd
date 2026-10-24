/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Download, CheckCircle, RotateCcw, ShieldCheck, ArrowLeft, Coffee } from "lucide-react";
import { formatBytes } from "../utils/imageProcessor";
import { getFileSync, clearFile, StoredFileData } from "../utils/db";
import { createTrackedObjectURL, revokeTrackedObjectURL } from "../utils/urlTracker";
import { sanitizeFilename } from "../utils/sanitizer";
import { RetroView } from "../types";

interface DownloadDeskViewProps {
  toolKey: string;
  sourceView: RetroView;
  onAnotherFile: () => void;
  onBack?: () => void;
  onBuyMeCoffee?: () => void;
}

export default function DownloadDeskView({ toolKey, sourceView, onAnotherFile, onBack, onBuyMeCoffee }: DownloadDeskViewProps) {
  const [data, setData] = useState<StoredFileData | null>(() => getFileSync(toolKey));
  const [downloadUrl, setDownloadUrl] = useState<string>("");
  const [customFilename, setCustomFilename] = useState<string>(() => {
    const initial = getFileSync(toolKey);
    return sanitizeFilename(initial?.filename || "output_monotranscoder");
  });
  const [downloaded, setDownloaded] = useState<boolean>(false);

  useEffect(() => {
    const item = getFileSync(toolKey);
    if (!item) return;
    setData(item);
    setCustomFilename(sanitizeFilename(item.filename || "output_monotranscoder"));
    const activeUrl = createTrackedObjectURL(item.blob);
    setDownloadUrl(activeUrl);

    return () => {
      if (activeUrl) {
        revokeTrackedObjectURL(activeUrl);
      }
    };
  }, [toolKey]);

  const handleDownload = () => {
    if (!downloadUrl || !data) return;

    let ext = "dat";
    if (
      data.format === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      data.format === "application/docx" ||
      data.format === "docx"
    ) {
      ext = "docx";
    } else if (
      data.format === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      data.format === "application/xlsx" ||
      data.format === "xlsx"
    ) {
      ext = "xlsx";
    } else if (
      data.format === "text/csv" ||
      data.format === "application/csv" ||
      data.format === "csv"
    ) {
      ext = "csv";
    } else if (
      data.format === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      data.format === "application/pptx" ||
      data.format === "pptx"
    ) {
      ext = "pptx";
    } else if (data.format.includes("/")) {
      ext = data.format.split("/")[1];
      if (ext === "jpeg") ext = "jpg";
    } else {
      ext = data.format.toLowerCase();
    }

    let baseName = sanitizeFilename(customFilename.trim() || "output_monotranscoder");
    if (baseName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
      baseName = baseName.slice(0, -(ext.length + 1));
    }
    if (!baseName) {
      const origBase = sanitizeFilename(data.originalName?.replace(/\.[^/.]+$/, "") || "output");
      baseName = `${origBase}_monotranscoder`;
    }

    const downloadName = `${baseName}.${ext}`;

    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloaded(true);
  };

  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      onAnotherFile();
    }
  };

  const handleAnotherFileClick = async () => {
    if (downloadUrl) {
      revokeTrackedObjectURL(downloadUrl);
    }
    await clearFile(toolKey);
    onAnotherFile();
  };

  if (!data) {
    return null;
  }

  const originalSize = data.originalSize || data.size;
  const isSmaller = data.size < originalSize;
  const savingsPct = originalSize > 0 ? Math.round(((originalSize - data.size) / originalSize) * 100) : 0;

  return (
    <section className="max-w-3xl mx-auto space-y-6 animate-fade-in" id="download-desk-view" aria-labelledby="download-desk-heading">
      <div className="border-b-2 border-zinc-800 pb-4 flex items-center justify-between">
        <div>
          <h1 id="download-desk-heading" className="text-xl font-bold uppercase tracking-tight text-white font-sans">
            DOWNLOAD TRANSCODED FILE // DOWNLOAD_DESK
          </h1>
        </div>
      </div>

      <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-row items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 border-2 border-white bg-zinc-900 text-white flex items-center justify-center rounded shadow-[2px_2px_0px_0px_#ffffff] shrink-0">
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base uppercase text-emerald-400 font-sans">
                PROCESS EXECUTION COMPLETE
              </h3>
              <p className="text-[11px] sm:text-xs text-zinc-400 font-mono">
                Ready for immediate download. Zero server uploads.
              </p>
            </div>
          </div>

          <button
            type="button"
            id="download-desk-back-btn"
            onClick={handleBackClick}
            aria-label="Back to parameters configuration page"
            className="group shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-red-400 border-2 border-zinc-700 hover:border-red-500/50 rounded-lg font-mono text-xs font-bold uppercase transition-all shadow-[2px_2px_0px_0px_rgba(255,255,255,0.15)] cursor-pointer active:translate-y-0.5"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-white group-hover:text-red-400 transition-colors" />
            <span>BACK</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-black border border-zinc-800 p-3.5 sm:p-4 rounded-lg space-y-1.5 sm:space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-zinc-400">ORIGINAL_NAME:</span>
              <strong className="text-orange-400 font-bold truncate max-w-[150px]" title={data.originalName || data.filename}>
                {data.originalName || data.filename}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">ORIGINAL_SIZE:</span>
              <strong className="text-blue-400 font-bold">{formatBytes(originalSize)}</strong>
            </div>
          </div>

          <div className="bg-black border border-zinc-800 p-3.5 sm:p-4 rounded-lg space-y-1.5 sm:space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-zinc-400">PROCESSED_SIZE:</span>
              <strong className="text-purple-400 font-bold">{formatBytes(data.size)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">SAVINGS / DELTA:</span>
              <strong className="text-emerald-400 font-bold">
                {isSmaller ? `-${savingsPct}% (${formatBytes(originalSize - data.size)} saved)` : "Optimal"}
              </strong>
            </div>
          </div>
        </div>

        {(data.statusNote || data.targetKB) && (
          <div
            role="status"
            className={`border rounded-lg p-3 text-xs font-mono flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 ${
              data.hitTarget === false
                ? "bg-amber-950/30 border-amber-500/50 text-amber-300"
                : "bg-emerald-950/30 border-emerald-500/50 text-emerald-300"
            }`}
          >
            <span className="font-bold uppercase">
              {data.statusNote ||
                `Achieved ${(data.size / 1024).toFixed(1)} KB / Target ${
                  data.minKB ? `${data.minKB}–${data.targetKB}` : data.targetKB
                } KB`}
            </span>
            <span className="text-[10px] uppercase opacity-80">
              {data.hitTarget === false ? "LIMIT WARNING" : "TARGET VERIFIED"}
            </span>
          </div>
        )}

        {/* Custom Filename Field */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold font-mono text-zinc-400 uppercase block">
            OUTPUT FILENAME (OPTIONAL):
          </label>
          <input
            type="text"
            value={customFilename}
            onChange={(e) => setCustomFilename(e.target.value)}
            className="w-full p-2.5 bg-black border-2 border-zinc-700 text-white rounded-lg text-xs font-mono focus:border-white focus:outline-none"
            aria-label="Output Filename"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 pt-2">
          <button
            type="button"
            onClick={handleDownload}
            aria-label="Download Processed File"
            className="w-full sm:flex-1 py-3 px-4 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[2px_2px_0px_0px_#ffffff] sm:shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded-lg transition-all min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            <span>{downloaded ? "DOWNLOAD AGAIN" : "DOWNLOAD FILE NOW"}</span>
          </button>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleAnotherFileClick}
              aria-label="Process Another File"
              className="flex-1 sm:flex-initial py-3 px-4 sm:px-6 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 border-2 border-zinc-700 font-sans font-bold text-xs sm:text-sm uppercase flex items-center justify-center gap-2 cursor-pointer rounded-lg transition-all whitespace-nowrap min-h-[44px]"
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>ANOTHER FILE</span>
            </button>

            {onBuyMeCoffee && (
              <button
                type="button"
                onClick={onBuyMeCoffee}
                aria-label="Buy Me A Coffee"
                title="Buy Me A Coffee — Support development"
                className="group py-3 px-3.5 sm:px-4 bg-amber-400 text-black hover:bg-amber-300 border-2 border-black flex items-center justify-center cursor-pointer rounded-lg transition-all shadow-[2px_2px_0px_0px_#ffffff] active:translate-y-0.5 min-h-[44px] shrink-0"
              >
                <Coffee className="w-5 h-5 text-black group-hover:scale-110 transition-transform" />
              </button>
            )}
          </div>
        </div>

      </div>
    </section>
  );
}
