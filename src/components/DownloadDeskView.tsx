/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Download,
  CheckCircle,
  RotateCcw,
  ArrowLeft,
  Coffee,
  Eye,
  ChevronLeft,
  ChevronRight,
  Layers,
  Play,
  Pause,
  Volume2,
  Camera,
  Repeat,
} from "lucide-react";
import JSZip from "jszip";
import { formatBytes } from "../utils/imageProcessor";
import { getFileSync, clearFile, StoredFileData, BulkOutputItem } from "../utils/db";
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

interface UnpackedItem {
  filename: string;
  size: number;
  format: string;
  blob: Blob;
  url: string;
}

function guessMimeFromExt(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  return "application/octet-stream";
}

function formatTimeSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00.0";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}

export default function DownloadDeskView({
  toolKey,
  onAnotherFile,
  onBack,
  onBuyMeCoffee,
}: DownloadDeskViewProps) {
  const [data, setData] = useState<StoredFileData | null>(() => getFileSync(toolKey));
  const [downloadUrl, setDownloadUrl] = useState<string>("");
  const [customFilename, setCustomFilename] = useState<string>(() => {
    const initial = getFileSync(toolKey);
    return sanitizeFilename(initial?.filename || "output_monotranscoder");
  });
  const [downloaded, setDownloaded] = useState<boolean>(false);
  const [downloadedIndividualAll, setDownloadedIndividualAll] = useState<boolean>(false);
  const [previewPageIndex, setPreviewPageIndex] = useState<number>(0);
  const [compareOriginal, setCompareOriginal] = useState<boolean>(false);

  // Unpacked bulk items (either from data.bulkItems or auto-extracted from ZIP blob)
  const [unpackedItems, setUnpackedItems] = useState<UnpackedItem[]>([]);

  // Enhanced Audio Preview state
  const [audioPeaks, setAudioPeaks] = useState<Float32Array | null>(null);
  const [audioMeta, setAudioMeta] = useState<{
    duration: number;
    sampleRate: number;
    channels: number;
  } | null>(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);
  const [audioLoop, setAudioLoop] = useState<boolean>(false);

  // Enhanced Video Preview state
  const [videoMeta, setVideoMeta] = useState<{
    width: number;
    height: number;
    duration: number;
  } | null>(null);
  const [videoSpeed, setVideoSpeed] = useState<number>(1.0);
  const [videoLoop, setVideoLoop] = useState<boolean>(true);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioWaveCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const item = getFileSync(toolKey);
    if (!item) return;
    setData(item);
    setPreviewPageIndex(0);
    setCompareOriginal(false);
    setCustomFilename(sanitizeFilename(item.filename || "output_monotranscoder"));
    const activeUrl = createTrackedObjectURL(item.blob);
    setDownloadUrl(activeUrl);

    let createdUrls: string[] = [activeUrl];

    // Populate unpacked bulk items from bulkItems or by inspecting ZIP archive
    const loadBulkContents = async () => {
      if (item.bulkItems && item.bulkItems.length > 0) {
        const mapped: UnpackedItem[] = item.bulkItems.map((bi: BulkOutputItem) => {
          const u = createTrackedObjectURL(bi.blob);
          createdUrls.push(u);
          return {
            filename: bi.filename,
            size: bi.size,
            format: bi.format || guessMimeFromExt(bi.filename),
            blob: bi.blob,
            url: u,
          };
        });
        setUnpackedItems(mapped);
      } else if (
        item.format === "application/zip" ||
        item.filename?.toLowerCase().endsWith(".zip")
      ) {
        try {
          const zip = await JSZip.loadAsync(item.blob);
          const entries: UnpackedItem[] = [];
          const fileNames = Object.keys(zip.files).filter((k) => !zip.files[k].dir);
          for (const name of fileNames) {
            const zEntry = zip.files[name];
            const rawBlob = await zEntry.async("blob");
            const mime = guessMimeFromExt(name);
            const typedBlob = new Blob([rawBlob], { type: mime });
            const u = createTrackedObjectURL(typedBlob);
            createdUrls.push(u);
            entries.push({
              filename: name.split("/").pop() || name,
              size: typedBlob.size,
              format: mime,
              blob: typedBlob,
              url: u,
            });
          }
          setUnpackedItems(entries);
        } catch {
          setUnpackedItems([]);
        }
      } else {
        setUnpackedItems([]);
      }
    };

    loadBulkContents();

    // Decode waveform peaks if output is an audio file
    if (item.format.startsWith("audio/")) {
      item.blob
        .arrayBuffer()
        .then(async (buf) => {
          const ctx = new AudioContext();
          try {
            const decoded = await ctx.decodeAudioData(buf.slice(0));
            setAudioMeta({
              duration: decoded.duration,
              sampleRate: decoded.sampleRate,
              channels: decoded.numberOfChannels,
            });
            const ch0 = decoded.getChannelData(0);
            const numBins = 320;
            const step = Math.max(1, Math.floor(ch0.length / numBins));
            const peaks = new Float32Array(numBins * 2);
            for (let i = 0; i < numBins; i++) {
              let min = 1;
              let max = -1;
              const start = i * step;
              for (let j = 0; j < step && start + j < ch0.length; j++) {
                const v = ch0[start + j];
                if (v < min) min = v;
                if (v > max) max = v;
              }
              peaks[i * 2] = min;
              peaks[i * 2 + 1] = max;
            }
            setAudioPeaks(peaks);
          } finally {
            await ctx.close().catch(() => {});
          }
        })
        .catch(() => {
          setAudioPeaks(null);
          setAudioMeta(null);
        });
    } else {
      setAudioPeaks(null);
      setAudioMeta(null);
    }

    return () => {
      for (const u of createdUrls) {
        revokeTrackedObjectURL(u);
      }
    };
  }, [toolKey]);

  // Draw interactive audio waveform with playhead on Download Desk
  useEffect(() => {
    const canvas = audioWaveCanvasRef.current;
    if (!canvas || !audioPeaks) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, w, h);

    const numBins = audioPeaks.length / 2;
    const dur = audioMeta?.duration || 1;
    const playRatio = Math.min(1, Math.max(0, audioCurrentTime / Math.max(0.01, dur)));
    const mid = h / 2;

    for (let x = 0; x < w; x++) {
      const binIdx = Math.min(numBins - 1, Math.floor((x / w) * numBins));
      const min = audioPeaks[binIdx * 2];
      const max = audioPeaks[binIdx * 2 + 1];
      const ratio = x / w;
      ctx.fillStyle = ratio <= playRatio ? "#10b981" : "#3f3f46";
      const yTop = (1 + min) * mid;
      const yBot = (1 + max) * mid;
      ctx.fillRect(x, Math.max(0, yTop), 1, Math.max(2, yBot - yTop));
    }

    const playX = Math.round(playRatio * w);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(playX, 0, 2, h);
  }, [audioPeaks, audioCurrentTime, audioMeta]);

  const getOutputExtension = (fmt: string): string => {
    if (
      fmt === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fmt === "application/docx" ||
      fmt === "docx"
    ) {
      return "docx";
    }
    if (
      fmt === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      fmt === "application/xlsx" ||
      fmt === "xlsx"
    ) {
      return "xlsx";
    }
    if (fmt === "text/csv" || fmt === "application/csv" || fmt === "csv") return "csv";
    if (
      fmt === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      fmt === "application/pptx" ||
      fmt === "pptx"
    ) {
      return "pptx";
    }
    if (fmt === "application/zip" || fmt === "zip") return "zip";
    if (fmt === "audio/wav" || fmt === "wav") return "wav";
    if (fmt === "audio/mp4" || fmt === "audio/x-m4a") return "m4a";
    if (fmt === "audio/mpeg" || fmt === "mp3") return "mp3";
    if (fmt === "audio/ogg") return "ogg";
    if (fmt === "audio/webm") return "webm";
    if (fmt === "video/mp4") return "mp4";
    if (fmt === "video/webm") return "webm";
    if (fmt === "image/gif") return "gif";
    if (fmt.includes("/")) {
      const sub = fmt.split("/")[1];
      return sub === "jpeg" ? "jpg" : sub;
    }
    return fmt.toLowerCase() || "dat";
  };

  const handleDownload = () => {
    if (!downloadUrl || !data) return;

    const ext = getOutputExtension(data.format);
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

  const handleDownloadSingleItem = (item: UnpackedItem) => {
    const link = document.createElement("a");
    link.href = item.url;
    link.download = item.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAllWithoutZip = async () => {
    if (unpackedItems.length === 0) return;
    for (let i = 0; i < unpackedItems.length; i++) {
      handleDownloadSingleItem(unpackedItems[i]);
      if (i < unpackedItems.length - 1) {
        await new Promise((r) => setTimeout(r, 180));
      }
    }
    setDownloadedIndividualAll(true);
  };

  const handleDownloadVideoSnapshot = () => {
    const vid = videoRef.current;
    if (!vid) return;
    const canvas = document.createElement("canvas");
    canvas.width = vid.videoWidth || 1280;
    canvas.height = vid.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.94);
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${sanitizeFilename(customFilename || "video")}_frame.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
  const savingsPct =
    originalSize > 0 ? Math.round(((originalSize - data.size) / originalSize) * 100) : 0;

  const isAudioOutput = data.format.startsWith("audio/");
  const isVideoOutput = data.format.startsWith("video/");
  const isGifOutput = data.format === "image/gif";
  const isSingleImageOutput =
    data.format.startsWith("image/") && !isGifOutput;
  const isZipOutput =
    data.format === "application/zip" ||
    data.filename?.toLowerCase().endsWith(".zip") ||
    unpackedItems.length > 1;

  const hasPreviewPages = Boolean(data.previewPages && data.previewPages.length > 0);
  const totalPreviewPages = data.previewPages?.length || 0;
  const activePreviewSrc = hasPreviewPages
    ? compareOriginal && data.originalPreviewPages?.[previewPageIndex]
      ? data.originalPreviewPages[previewPageIndex]
      : data.previewPages![previewPageIndex]
    : isSingleImageOutput
    ? downloadUrl
    : "";

  return (
    <section
      className="max-w-4xl mx-auto space-y-6 animate-fade-in"
      id="download-desk-view"
      aria-labelledby="download-desk-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex items-center justify-between">
        <div>
          <h1
            id="download-desk-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            DOWNLOAD TRANSCODED FILE // DOWNLOAD_DESK
          </h1>
        </div>
      </div>

      <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-4 sm:p-6 space-y-5">
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

        {/* Studio Audio Output Preview (Interactive Waveform + Transport) */}
        {isAudioOutput && downloadUrl && (
          <div className="bg-black border-2 border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-emerald-400" />
                <span className="font-bold uppercase text-white">
                  STUDIO AUDIO OUTPUT MONITOR
                </span>
              </div>
              {audioMeta && (
                <div className="flex items-center gap-3 text-[11px] text-zinc-300">
                  <span>{audioMeta.sampleRate} HZ</span>
                  <span>•</span>
                  <span>{audioMeta.channels === 1 ? "MONO (1.0)" : "STEREO (2.0)"}</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-bold">
                    {formatTimeSec(audioCurrentTime)} / {formatTimeSec(audioMeta.duration)}
                  </span>
                </div>
              )}
            </div>
            <div className="p-4 bg-zinc-950 space-y-3">
              {audioPeaks && (
                <canvas
                  ref={audioWaveCanvasRef}
                  width={720}
                  height={110}
                  onClick={(e) => {
                    if (!audioRef.current || !audioMeta) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(
                      0,
                      Math.min(1, (e.clientX - rect.left) / rect.width)
                    );
                    audioRef.current.currentTime = ratio * audioMeta.duration;
                    setAudioCurrentTime(audioRef.current.currentTime);
                  }}
                  title="Click anywhere on waveform to seek"
                  className="w-full h-28 rounded-lg border border-zinc-800 bg-black block cursor-pointer"
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const el = audioRef.current;
                      if (!el) return;
                      if (el.paused) {
                        el.play();
                      } else {
                        el.pause();
                      }
                    }}
                    className="px-3.5 py-2 bg-white text-black rounded-lg font-mono text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                  >
                    {isAudioPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5 fill-current" />
                        <span>PAUSE</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>PLAY AUDIO</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const next = !audioLoop;
                      setAudioLoop(next);
                      if (audioRef.current) audioRef.current.loop = next;
                    }}
                    className={`px-2.5 py-2 rounded-lg font-mono text-xs font-bold uppercase flex items-center gap-1 border cursor-pointer ${
                      audioLoop
                        ? "bg-emerald-500 text-black border-emerald-400"
                        : "bg-zinc-900 text-zinc-300 border-zinc-700"
                    }`}
                  >
                    <Repeat className="w-3.5 h-3.5" />
                    <span>LOOP</span>
                  </button>
                </div>

                <audio
                  ref={audioRef}
                  src={downloadUrl}
                  controls
                  onPlay={() => setIsAudioPlaying(true)}
                  onPause={() => setIsAudioPlaying(false)}
                  onEnded={() => setIsAudioPlaying(false)}
                  onTimeUpdate={(e) => setAudioCurrentTime(e.currentTarget.currentTime)}
                  className="flex-1 min-w-[220px] h-10"
                />
              </div>
            </div>
          </div>
        )}

        {/* Studio Video / Animated GIF Output Preview */}
        {(isVideoOutput || isGifOutput) && downloadUrl && (
          <div className="bg-black border-2 border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-sky-400" />
                <span className="font-bold uppercase text-white">
                  {isGifOutput ? "ANIMATED GIF OUTPUT MONITOR" : "STUDIO VIDEO OUTPUT MONITOR"}
                </span>
              </div>
              {isVideoOutput && videoMeta && (
                <div className="flex items-center gap-3 text-[11px] text-zinc-300">
                  <span>
                    {videoMeta.width}×{videoMeta.height} PX
                  </span>
                  <span>•</span>
                  <span className="text-sky-400 font-bold">
                    {formatTimeSec(videoCurrentTime)} / {formatTimeSec(videoMeta.duration)}
                  </span>
                </div>
              )}
            </div>
            <div className="p-4 bg-zinc-950 space-y-3">
              <div className="flex items-center justify-center bg-black rounded-lg border border-zinc-800 p-2 max-h-[440px] overflow-hidden">
                {isVideoOutput && (
                  <video
                    ref={videoRef}
                    src={downloadUrl}
                    controls
                    loop={videoLoop}
                    playsInline
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      setVideoMeta({
                        width: v.videoWidth || 1280,
                        height: v.videoHeight || 720,
                        duration: Number.isFinite(v.duration) ? v.duration : 0,
                      });
                    }}
                    onPlay={() => setIsVideoPlaying(true)}
                    onPause={() => setIsVideoPlaying(false)}
                    onEnded={() => setIsVideoPlaying(false)}
                    onTimeUpdate={(e) => setVideoCurrentTime(e.currentTarget.currentTime)}
                    className="max-w-full max-h-[400px] rounded"
                  />
                )}
                {isGifOutput && (
                  <img
                    src={downloadUrl}
                    alt="Animated GIF output preview"
                    className="max-w-full max-h-[400px] rounded border border-zinc-800"
                  />
                )}
              </div>

              {isVideoOutput && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const v = videoRef.current;
                        if (!v) return;
                        if (v.paused) v.play();
                        else v.pause();
                      }}
                      className="px-3 py-1.5 bg-white text-black rounded-lg font-mono text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                    >
                      {isVideoPlaying ? (
                        <>
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          <span>PAUSE</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>PLAY</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setVideoLoop((l) => !l)}
                      className={`px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold uppercase flex items-center gap-1 border cursor-pointer ${
                        videoLoop
                          ? "bg-sky-400 text-black border-sky-300"
                          : "bg-zinc-900 text-zinc-300 border-zinc-700"
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      <span>LOOP</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadVideoSnapshot}
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg font-mono text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-sky-400" />
                      <span>SAVE FRAME JPG</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <span className="text-zinc-400 text-[11px]">SPEED:</span>
                    {[0.5, 1.0, 1.5, 2.0].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => {
                          setVideoSpeed(spd);
                          if (videoRef.current) videoRef.current.playbackRate = spd;
                        }}
                        className={`px-2 py-1 rounded border text-[11px] font-bold cursor-pointer ${
                          videoSpeed === spd
                            ? "bg-white text-black border-white"
                            : "bg-zinc-900 text-zinc-300 border-zinc-700"
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Visual Output Preview Box (Images, Watermark Remover & Multi-page Previews) */}
        {(hasPreviewPages || isSingleImageOutput) && !isVideoOutput && !isGifOutput && (
          <div className="bg-black border-2 border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-3.5 py-2.5 bg-zinc-900 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <span className="font-bold uppercase text-white">
                  {compareOriginal ? "ORIGINAL INPUT PREVIEW" : "PROCESSED OUTPUT PREVIEW"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {data.originalPreviewPages && data.originalPreviewPages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCompareOriginal((prev) => !prev)}
                    className={`px-2.5 py-1 rounded border text-[11px] font-bold uppercase cursor-pointer transition-colors ${
                      compareOriginal
                        ? "bg-amber-400 text-black border-amber-300"
                        : "bg-zinc-800 text-zinc-200 border-zinc-700 hover:border-white"
                    }`}
                  >
                    {compareOriginal ? "SHOW PROCESSED OUTPUT" : "COMPARE ORIGINAL"}
                  </button>
                )}

                {totalPreviewPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={previewPageIndex === 0}
                      onClick={() => setPreviewPageIndex((p) => Math.max(0, p - 1))}
                      className="p-1 bg-zinc-800 border border-zinc-700 rounded text-white disabled:opacity-40 cursor-pointer"
                      aria-label="Previous Preview Page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] text-zinc-300 px-1">
                      ITEM {previewPageIndex + 1} / {totalPreviewPages}
                    </span>
                    <button
                      type="button"
                      disabled={previewPageIndex >= totalPreviewPages - 1}
                      onClick={() =>
                        setPreviewPageIndex((p) => Math.min(totalPreviewPages - 1, p + 1))
                      }
                      className="p-1 bg-zinc-800 border border-zinc-700 rounded text-white disabled:opacity-40 cursor-pointer"
                      aria-label="Next Preview Page"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {activePreviewSrc && (
              <div className="p-4 bg-zinc-950 flex items-center justify-center max-h-[500px] overflow-auto">
                <img
                  src={activePreviewSrc}
                  alt={compareOriginal ? "Original input preview" : "Processed output preview"}
                  className="max-w-full max-h-[450px] w-auto h-auto object-contain rounded border border-zinc-800 shadow-xl"
                />
              </div>
            )}
          </div>
        )}

        {/* Bulk Individual Files Inspector & Direct No-ZIP Download List */}
        {unpackedItems.length > 0 && (
          <div className="bg-black border-2 border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-mono text-xs">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span className="font-bold uppercase text-white">
                  BULK PROCESSED FILES ({unpackedItems.length} ITEMS) — DIRECT DOWNLOAD WITHOUT ZIP
                </span>
              </div>
              <button
                type="button"
                onClick={handleDownloadAllWithoutZip}
                className="px-3 py-1.5 bg-emerald-400 hover:bg-emerald-300 text-black font-mono text-xs font-bold uppercase rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {downloadedIndividualAll
                    ? `DOWNLOAD ALL ${unpackedItems.length} FILES AGAIN (NO ZIP)`
                    : `DOWNLOAD ALL ${unpackedItems.length} FILES (WITHOUT ZIP)`}
                </span>
              </button>
            </div>

            <div className="p-3 sm:p-4 max-h-[380px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-zinc-950">
              {unpackedItems.map((item, idx) => {
                const isImg = item.format.startsWith("image/");
                const isAud = item.format.startsWith("audio/");
                const isVid = item.format.startsWith("video/");
                return (
                  <div
                    key={`${item.filename}_${idx}`}
                    className="bg-black border border-zinc-800 hover:border-zinc-600 rounded-lg p-2.5 flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isImg && (
                        <img
                          src={item.url}
                          alt={item.filename}
                          className="w-12 h-12 object-cover rounded border border-zinc-800 bg-zinc-900 shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1 font-mono">
                        <p
                          className="text-xs font-bold text-white truncate"
                          title={item.filename}
                        >
                          {item.filename}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          {formatBytes(item.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadSingleItem(item)}
                        className="px-2.5 py-1.5 bg-white hover:bg-zinc-200 text-black rounded font-mono text-[11px] font-bold uppercase flex items-center gap-1 cursor-pointer shrink-0"
                        title={`Download ${item.filename} directly without ZIP`}
                      >
                        <Download className="w-3 h-3" />
                        <span>SAVE</span>
                      </button>
                    </div>
                    {isAud && (
                      <audio src={item.url} controls className="w-full h-8 mt-1" />
                    )}
                    {isVid && (
                      <video
                        src={item.url}
                        controls
                        playsInline
                        className="w-full max-h-32 rounded border border-zinc-800 mt-1"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-black border border-zinc-800 p-3.5 sm:p-4 rounded-lg space-y-1.5 sm:space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-zinc-400">ORIGINAL_NAME:</span>
              <strong
                className="text-orange-400 font-bold truncate max-w-[180px]"
                title={data.originalName || data.filename}
              >
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
                {isSmaller
                  ? `-${savingsPct}% (${formatBytes(originalSize - data.size)} saved)`
                  : "Optimal"}
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
        <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3 pt-2">
          <button
            type="button"
            onClick={handleDownload}
            aria-label="Download Processed File"
            className="w-full sm:flex-1 py-3 px-4 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[2px_2px_0px_0px_#ffffff] sm:shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded-lg transition-all min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            <span>
              {downloaded
                ? isZipOutput
                  ? "DOWNLOAD .ZIP AGAIN"
                  : "DOWNLOAD AGAIN"
                : isZipOutput
                ? "DOWNLOAD AS .ZIP ARCHIVE"
                : "DOWNLOAD FILE NOW"}
            </span>
          </button>

          {unpackedItems.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadAllWithoutZip}
              aria-label="Download All Files Without ZIP"
              className="w-full sm:flex-1 py-3 px-4 bg-emerald-400 text-black hover:bg-emerald-300 border-2 border-emerald-300 font-sans font-bold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[2px_2px_0px_0px_#ffffff] active:translate-y-0.5 rounded-lg transition-all min-h-[44px]"
            >
              <Layers className="w-4 h-4" />
              <span>
                {downloadedIndividualAll
                  ? `DOWNLOAD ALL (${unpackedItems.length}) WITHOUT ZIP AGAIN`
                  : `DOWNLOAD ALL (${unpackedItems.length}) WITHOUT ZIP`}
              </span>
            </button>
          )}

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
