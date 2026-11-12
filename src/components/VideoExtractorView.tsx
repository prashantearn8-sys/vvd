/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import JSZip from "jszip";
import {
  Scissors,
  Sliders,
  Zap,
  RotateCcw,
  Camera,
  Play,
  Pause,
  Plus,
  Trash2,
  Download,
  Repeat,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { saveFile, BulkOutputItem } from "../utils/db";
import { formatBytes } from "../utils/imageProcessor";
import { sanitizeFilename } from "../utils/sanitizer";
import { useFileDrop } from "../context/FileDropContext";
import { useToast } from "../context/ToastContext";
import ModuleIconBadge from "./ModuleIconBadge";

interface VideoExtractorViewProps {
  onSuccess: () => void;
  initialFile?: File | null;
  initialFiles?: File[] | null;
}

type ExtractMode =
  | "frames_count"
  | "frames_interval"
  | "manual_snapshots"
  | "cover_thumbnails";
type ImageFormat = "image/jpeg" | "image/png" | "image/webp";

interface CapturedFrame {
  id: string;
  timestamp: number;
  url: string;
  blob: Blob;
  filename: string;
  size: number;
}

const FORMAT_EXT: Record<ImageFormat, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function formatTimecode(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00.0";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
}

export default function VideoExtractorView({
  onSuccess,
  initialFile,
  initialFiles,
}: VideoExtractorViewProps) {
  const { registerDropHandler } = useFileDrop();
  const { showToast } = useToast();

  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [loopPreview, setLoopPreview] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [videoDims, setVideoDims] = useState<{ w: number; h: number }>({
    w: 1280,
    h: 720,
  });

  const [extractMode, setExtractMode] = useState<ExtractMode>("frames_count");
  const [imageFormat, setImageFormat] = useState<ImageFormat>("image/jpeg");
  const [imageQuality, setImageQuality] = useState<number>(92);
  const [frameCount, setFrameCount] = useState<number>(12);
  const [intervalSec, setIntervalSec] = useState<number>(2);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);

  const [capturedFrames, setCapturedFrames] = useState<CapturedFrame[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>("EXTRACTING FRAMES...");
  const [progress, setProgress] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const activeFile = files[activeIndex] || null;

  const loadVideoPreview = useCallback(
    (f: File) => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      const url = URL.createObjectURL(f);
      setVideoUrl(url);
      setIsPlaying(false);
      setCurrentTime(0);
    },
    [videoUrl]
  );

  const handleFilesSelected = useCallback(
    (incoming: File[]) => {
      const valid = incoming.filter(
        (f) =>
          f.type.startsWith("video/") ||
          /\.(mp4|webm|mov|mkv|avi|m4v|ogv)$/i.test(f.name)
      );
      if (valid.length === 0) {
        showToast(
          "Please select valid video files (MP4, WebM, MOV, MKV, OGV).",
          "error"
        );
        return;
      }
      setFiles((prev) => {
        const next = [...prev, ...valid];
        if (prev.length === 0 && next.length > 0) {
          setActiveIndex(0);
          loadVideoPreview(next[0]);
        }
        return next;
      });
    },
    [loadVideoPreview, showToast]
  );

  useEffect(() => {
    if (initialFiles && initialFiles.length > 0 && files.length === 0) {
      handleFilesSelected(initialFiles);
    } else if (initialFile && files.length === 0) {
      handleFilesSelected([initialFile]);
    }
  }, [initialFile, initialFiles, files.length, handleFilesSelected]);

  useEffect(() => {
    return registerDropHandler((droppedFiles) => {
      if (droppedFiles.length > 0) {
        handleFilesSelected(droppedFiles);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, handleFilesSelected]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const selectQueueItem = (idx: number) => {
    if (idx < 0 || idx >= files.length) return;
    setActiveIndex(idx);
    loadVideoPreview(files[idx]);
  };

  const removeQueueItem = (idx: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl("");
        setActiveIndex(0);
      } else {
        const nextIdx = Math.min(activeIndex, next.length - 1);
        setActiveIndex(nextIdx);
        loadVideoPreview(next[nextIdx]);
      }
      return next;
    });
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    const dur = Number.isFinite(v.duration) ? v.duration : 10;
    setDuration(dur);
    setTrimStart(0);
    setTrimEnd(Number(dur.toFixed(1)));
    setVideoDims({ w: v.videoWidth || 1280, h: v.videoHeight || 720 });
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    if (trimEnd > trimStart && v.currentTime >= trimEnd) {
      if (loopPreview) {
        v.currentTime = trimStart;
        v.play().catch(() => {});
      } else {
        v.pause();
        setIsPlaying(false);
      }
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < trimStart || v.currentTime >= trimEnd) {
        v.currentTime = trimStart;
      }
      v.playbackRate = playbackSpeed;
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const stepFrame = (deltaFrames: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    setIsPlaying(false);
    const frameDur = 1 / 30;
    const next = Math.max(
      0,
      Math.min(duration, v.currentTime + deltaFrames * frameDur)
    );
    v.currentTime = next;
    setCurrentTime(next);
  };

  const captureCurrentSnapshot = async () => {
    const v = videoRef.current;
    if (!v || !activeFile) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 1280;
    canvas.height = v.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const ext = FORMAT_EXT[imageFormat];
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, imageFormat, imageQuality / 100)
    );
    if (!blob) return;
    const baseName = sanitizeFilename(
      activeFile.name.replace(/\.[^/.]+$/, "") || "video"
    );
    const timeLabel = v.currentTime.toFixed(2).replace(".", "s");
    const filename = `${baseName}_frame_${timeLabel}.${ext}`;
    const url = URL.createObjectURL(blob);
    setCapturedFrames((prev) => [
      ...prev,
      {
        id: `${Date.now()}_${Math.random()}`,
        timestamp: v.currentTime,
        url,
        blob,
        filename,
        size: blob.size,
      },
    ]);
    showToast(`Captured frame @ ${formatTimecode(v.currentTime)}`, "success");
  };

  const removeSnapshot = (id: string) => {
    setCapturedFrames((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((f) => f.id !== id);
    });
  };

  const downloadSnapshotsWithoutZip = () => {
    capturedFrames.forEach((frame, idx) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = frame.url;
        a.download = frame.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, idx * 140);
    });
  };

  const extractFramesFromVideoFile = async (
    file: File,
    timestamps: number[],
    ext: string,
    onProgress?: (idx: number, total: number) => void
  ): Promise<BulkOutputItem[]> => {
    const tempUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = tempUrl;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () =>
          reject(new Error(`Could not decode video ${file.name}`));
      });

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable.");

      const baseName = sanitizeFilename(
        file.name.replace(/\.[^/.]+$/, "") || "video"
      );
      const results: BulkOutputItem[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const t = Math.min(
          Math.max(0, timestamps[i]),
          Math.max(0, video.duration - 0.05)
        );
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            resolve();
          };
          video.addEventListener("seeked", onSeeked);
          video.currentTime = t;
        });

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, imageFormat, imageQuality / 100)
        );
        if (blob) {
          const idxStr = String(i + 1).padStart(3, "0");
          const timeStr = t.toFixed(1).replace(".", "s");
          const previewUrl = canvas.toDataURL("image/jpeg", 0.8);
          results.push({
            filename: `${baseName}_frame_${idxStr}_${timeStr}.${ext}`,
            blob,
            size: blob.size,
            format: imageFormat,
            originalName: file.name,
            originalSize: file.size,
            previewUrl,
          });
        }
        if (onProgress) onProgress(i + 1, timestamps.length);
      }

      return results;
    } finally {
      URL.revokeObjectURL(tempUrl);
    }
  };

  const handleExtract = async () => {
    if (files.length === 0) return;
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
      setIsPlaying(false);
    }

    setIsProcessing(true);
    setProgress(5);

    try {
      const ext = FORMAT_EXT[imageFormat];
      const zip = new JSZip();
      const allBulkItems: BulkOutputItem[] = [];

      if (extractMode === "manual_snapshots") {
        if (capturedFrames.length === 0) {
          await captureCurrentSnapshot();
        }
        if (capturedFrames.length === 0) {
          throw new Error(
            "Capture at least one frame using the 'SNAPSHOT' button first."
          );
        }
        for (let i = 0; i < capturedFrames.length; i++) {
          const item = capturedFrames[i];
          zip.file(item.filename, item.blob);
          allBulkItems.push({
            filename: item.filename,
            blob: item.blob,
            size: item.size,
            format: imageFormat,
            originalName: activeFile?.name,
            originalSize: activeFile?.size,
            previewUrl: item.url,
          });
        }
      } else if (extractMode === "cover_thumbnails" || files.length > 1) {
        for (let fIdx = 0; fIdx < files.length; fIdx++) {
          const f = files[fIdx];
          setProgressText(
            `EXTRACTING VIDEO ${fIdx + 1}/${files.length}: ${f.name}...`
          );
          const tempUrl = URL.createObjectURL(f);
          const probe = document.createElement("video");
          probe.src = tempUrl;
          const fileDur = await new Promise<number>((resolve) => {
            probe.onloadedmetadata = () =>
              resolve(Number.isFinite(probe.duration) ? probe.duration : 5);
            probe.onerror = () => resolve(5);
          });
          URL.revokeObjectURL(tempUrl);

          let timestamps: number[] = [];
          if (extractMode === "cover_thumbnails") {
            timestamps = [
              Math.min(1, fileDur * 0.15),
              fileDur * 0.5,
              fileDur * 0.85,
            ];
          } else if (extractMode === "frames_interval") {
            const step = Math.max(0.2, intervalSec);
            for (let t = 0; t < fileDur; t += step) {
              timestamps.push(t);
              if (timestamps.length >= 50) break;
            }
          } else {
            const count = Math.max(2, Math.min(50, frameCount));
            for (let i = 0; i < count; i++) {
              timestamps.push((fileDur * i) / Math.max(1, count - 1));
            }
          }

          const items = await extractFramesFromVideoFile(
            f,
            timestamps,
            ext,
            (done, total) => {
              const pct = Math.round(
                ((fIdx + done / total) / files.length) * 90
              );
              setProgress(Math.max(8, pct));
            }
          );
          items.forEach((it) => {
            zip.file(it.filename, it.blob);
            allBulkItems.push(it);
          });
        }
      } else {
        const f = activeFile!;
        const start = Math.max(0, trimStart);
        const end = Math.max(start + 0.2, trimEnd || duration || 5);
        const span = end - start;
        const timestamps: number[] = [];

        if (extractMode === "frames_interval") {
          const step = Math.max(0.2, intervalSec);
          for (let t = start; t <= end; t += step) {
            timestamps.push(t);
            if (timestamps.length >= 60) break;
          }
        } else {
          const count = Math.max(1, Math.min(60, frameCount));
          if (count === 1) {
            timestamps.push(currentTime || start);
          } else {
            for (let i = 0; i < count; i++) {
              timestamps.push(start + (span * i) / (count - 1));
            }
          }
        }

        const items = await extractFramesFromVideoFile(
          f,
          timestamps,
          ext,
          (done, total) => {
            setProgressText(`EXTRACTING FRAME ${done} OF ${total}...`);
            setProgress(Math.round((done / total) * 90));
          }
        );
        items.forEach((it) => {
          zip.file(it.filename, it.blob);
          allBulkItems.push(it);
        });
      }

      setProgressText("PACKAGING EXTRACTED IMAGES...");
      setProgress(96);

      if (allBulkItems.length === 1) {
        const single = allBulkItems[0];
        await saveFile("video_extractor", {
          blob: single.blob,
          filename: single.filename,
          size: single.size,
          format: single.format,
          originalName: activeFile?.name,
          originalSize: activeFile?.size,
          previewPages: single.previewUrl ? [single.previewUrl] : undefined,
          statusNote: `Extracted Frame (${ext.toUpperCase()})`,
        });
      } else {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const baseName =
          files.length === 1
            ? sanitizeFilename(files[0].name.replace(/\.[^/.]+$/, ""))
            : `bulk_${files.length}_videos`;
        await saveFile("video_extractor", {
          blob: zipBlob,
          filename: `${baseName}_extracted_frames.zip`,
          size: zipBlob.size,
          format: "application/zip",
          originalName:
            files.length === 1 ? files[0].name : `${files.length} Video Files`,
          originalSize: files.reduce((acc, f) => acc + f.size, 0),
          previewPages: allBulkItems
            .slice(0, 12)
            .map((b) => b.previewUrl)
            .filter(Boolean) as string[],
          statusNote: `${allBulkItems.length} Frames Extracted (${ext.toUpperCase()}) • Direct No-ZIP & ZIP Ready`,
          bulkItems: allBulkItems,
        });
      }

      showToast(
        `Extracted ${allBulkItems.length} frame${
          allBulkItems.length === 1 ? "" : "s"
        } successfully.`,
        "success"
      );
      onSuccess();
    } catch (err: any) {
      showToast(err?.message || "Failed to extract frames from video.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="video-extractor-view"
      aria-labelledby="video-extractor-heading"
    >
      {/* Header */}
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="video-extractor-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            VIDEO FRAME &amp; THUMBNAIL EXTRACTOR // VIDEO_EXTRACT.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Extract high-resolution JPG, PNG, or WebP frame sequences, timed intervals, or snapshots from single or bulk videos—with direct download without ZIP.
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.m4v,.ogv"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFilesSelected(Array.from(e.target.files));
          }
          e.target.value = "";
        }}
      />

      {files.length === 0 ? (
        <div
          id="video-extractor-drag-drop"
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className="border-2 border-dashed border-zinc-700 hover:border-white hover:bg-zinc-950 rounded-xl p-6 sm:p-12 text-center cursor-pointer transition-all"
        >
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="video_extractor" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP SINGLE OR MULTIPLE VIDEOS (.MP4, .WEBM, .MOV, .MKV)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-md mx-auto mb-4 uppercase">
            Supports bulk video upload. Extract evenly spaced frames, time intervals, or manual snapshots as individual images (No ZIP) or ZIP archive.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
          >
            SELECT_VIDEO_FILES
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Bulk Queue, Interactive Studio Video Monitor & Snapshot Basket */}
          <div className="lg:col-span-7 space-y-5">
            {/* Bulk Queue Strip */}
            <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold uppercase text-zinc-300">
                  VIDEO QUEUE ({files.length}{" "}
                  {files.length === 1 ? "FILE" : "FILES"})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-[11px] font-mono font-bold text-cyan-400 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ADD VIDEOS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (videoUrl) URL.revokeObjectURL(videoUrl);
                      setFiles([]);
                      setVideoUrl("");
                      setCapturedFrames([]);
                    }}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-[11px] font-mono font-bold text-zinc-400 hover:text-red-400 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>CLEAR</span>
                  </button>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {files.map((f, idx) => (
                  <div
                    key={`${f.name}-${idx}`}
                    onClick={() => selectQueueItem(idx)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer shrink-0 transition-all ${
                      idx === activeIndex
                        ? "border-cyan-400 bg-cyan-500/10 text-white"
                        : "border-zinc-800 bg-black text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <span className="text-xs font-mono truncate max-w-[150px]">
                      {f.name}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {formatBytes(f.size)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeQueueItem(idx);
                      }}
                      className="text-zinc-500 hover:text-red-400 ml-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive Video Monitor */}
            <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div className="min-w-0">
                  <p className="text-xs font-mono font-bold text-white truncate">
                    {activeFile?.name}
                  </p>
                  <p className="text-[11px] font-mono text-zinc-400">
                    {activeFile ? formatBytes(activeFile.size) : ""} •{" "}
                    {videoDims.w}×{videoDims.h}px •{" "}
                    <span className="text-cyan-400 font-bold">
                      {formatTimecode(currentTime)} / {formatTimecode(duration)}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={captureCurrentSnapshot}
                    className="px-3 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 rounded-lg font-mono text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>SNAPSHOT</span>
                  </button>
                </div>
              </div>

              <div className="bg-black rounded-lg border border-zinc-800 overflow-hidden flex items-center justify-center max-h-[360px]">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  playsInline
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                  className="max-w-full max-h-[340px] w-auto h-auto"
                />
              </div>

              {/* Studio Scrubber & Frame Step Controls */}
              <div className="space-y-3">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, duration)}
                  step={0.03}
                  value={currentTime}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    setCurrentTime(t);
                    if (videoRef.current) videoRef.current.currentTime = t;
                  }}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="px-3 py-1.5 bg-white text-black hover:bg-zinc-200 rounded-lg font-mono text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                    >
                      {isPlaying ? (
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
                      onClick={() => stepFrame(-1)}
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg font-mono text-xs text-zinc-200 flex items-center gap-1 cursor-pointer"
                      title="Step back 1 frame (-1/30s)"
                    >
                      <SkipBack className="w-3.5 h-3.5" />
                      <span>-1F</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => stepFrame(1)}
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg font-mono text-xs text-zinc-200 flex items-center gap-1 cursor-pointer"
                      title="Step forward 1 frame (+1/30s)"
                    >
                      <span>+1F</span>
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoopPreview((v) => !v)}
                      className={`px-2.5 py-1.5 rounded-lg border font-mono text-xs flex items-center gap-1 cursor-pointer ${
                        loopPreview
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                          : "border-zinc-800 bg-zinc-900 text-zinc-500"
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      <span>LOOP</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={playbackSpeed}
                      onChange={(e) => {
                        const spd = Number(e.target.value);
                        setPlaybackSpeed(spd);
                        if (videoRef.current)
                          videoRef.current.playbackRate = spd;
                      }}
                      className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200"
                    >
                      <option value={0.25}>0.25x</option>
                      <option value={0.5}>0.5x</option>
                      <option value={1}>1.0x</option>
                      <option value={1.5}>1.5x</option>
                      <option value={2}>2.0x</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Trim Range Sliders */}
              {duration > 0 && extractMode !== "manual_snapshots" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-800">
                  <div>
                    <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                      <span className="flex items-center gap-1 font-bold uppercase">
                        <Scissors className="w-3.5 h-3.5 text-cyan-400" />
                        EXTRACT FROM
                      </span>
                      <span>{formatTimecode(trimStart)}</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, trimEnd - 0.2)}
                      step={0.1}
                      value={trimStart}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setTrimStart(val);
                        if (videoRef.current) videoRef.current.currentTime = val;
                      }}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                      <span className="flex items-center gap-1 font-bold uppercase">
                        <Scissors className="w-3.5 h-3.5 text-cyan-400" />
                        EXTRACT TO
                      </span>
                      <span>{formatTimecode(trimEnd)}</span>
                    </label>
                    <input
                      type="range"
                      min={Math.min(duration, trimStart + 0.2)}
                      max={Number(duration.toFixed(1))}
                      step={0.1}
                      value={trimEnd}
                      onChange={(e) => setTrimEnd(Number(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Captured Snapshots Basket with Direct No-ZIP Download */}
            {capturedFrames.length > 0 && (
              <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-mono font-bold uppercase text-cyan-400">
                    CAPTURED SNAPSHOT BASKET ({capturedFrames.length} FRAMES)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={downloadSnapshotsWithoutZip}
                      className="px-3 py-1 bg-white text-black hover:bg-zinc-200 rounded font-mono text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        DOWNLOAD ALL ({capturedFrames.length}) WITHOUT ZIP
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        capturedFrames.forEach((f) => URL.revokeObjectURL(f.url));
                        setCapturedFrames([]);
                      }}
                      className="px-2.5 py-1 border border-zinc-700 rounded text-[11px] font-mono text-zinc-400 hover:text-red-400 cursor-pointer"
                    >
                      CLEAR
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-48 overflow-y-auto pr-1">
                  {capturedFrames.map((frame) => (
                    <div
                      key={frame.id}
                      className="bg-black border border-zinc-800 rounded-lg p-2 flex flex-col gap-1.5"
                    >
                      <img
                        src={frame.url}
                        alt={frame.filename}
                        className="w-full h-20 object-cover rounded bg-zinc-900"
                      />
                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                        <span>{formatTimecode(frame.timestamp)}</span>
                        <div className="flex items-center gap-1.5">
                          <a
                            href={frame.url}
                            download={frame.filename}
                            className="text-cyan-400 font-bold hover:underline"
                          >
                            SAVE
                          </a>
                          <button
                            type="button"
                            onClick={() => removeSnapshot(frame.id)}
                            className="text-zinc-500 hover:text-red-400"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Extraction Mode & Image Output Settings */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-5">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                  FRAME EXTRACTION PARAMETERS
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {[
                  {
                    id: "frames_count",
                    label: "EVENLY SPACED FRAME SEQUENCE",
                    desc: "Automatically extract N evenly spaced frames across the video.",
                  },
                  {
                    id: "frames_interval",
                    label: "TIMED INTERVAL EXTRACTION",
                    desc: "Extract 1 high-resolution frame every N seconds.",
                  },
                  {
                    id: "cover_thumbnails",
                    label: "COVER THUMBNAIL TRIO (START / MID / END)",
                    desc: "Extract 3 keyframe cover thumbnails per video (ideal for bulk).",
                  },
                  {
                    id: "manual_snapshots",
                    label: "EXPORT CAPTURED SNAPSHOT BASKET",
                    desc: "Export the specific frames you captured using the Snapshot button.",
                  },
                ].map((m) => {
                  const active = extractMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setExtractMode(m.id as ExtractMode)}
                      className={`text-left p-3 rounded-lg border-2 transition-all cursor-pointer ${
                        active
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-200 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      <div className="font-mono text-xs font-bold uppercase">
                        {m.label}
                      </div>
                      <p className="text-[11px] font-mono opacity-75 mt-0.5">
                        {m.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              {extractMode === "frames_count" && (
                <div className="pt-2 border-t border-zinc-800">
                  <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1.5">
                    <span className="font-bold uppercase">
                      NUMBER OF FRAMES PER VIDEO
                    </span>
                    <span className="text-cyan-400 font-bold">
                      {frameCount} FRAMES
                    </span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={48}
                    step={1}
                    value={frameCount}
                    onChange={(e) => setFrameCount(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
              )}

              {extractMode === "frames_interval" && (
                <div className="pt-2 border-t border-zinc-800">
                  <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1.5">
                    <span className="font-bold uppercase">
                      EXTRACT EVERY N SECONDS
                    </span>
                    <span className="text-cyan-400 font-bold">
                      {intervalSec}s
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0.5}
                    max={30}
                    step={0.5}
                    value={intervalSec}
                    onChange={(e) => setIntervalSec(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800">
                <div>
                  <label className="text-[11px] font-mono font-bold uppercase text-zinc-400 block mb-1.5">
                    IMAGE FORMAT
                  </label>
                  <select
                    value={imageFormat}
                    onChange={(e) =>
                      setImageFormat(e.target.value as ImageFormat)
                    }
                    className="w-full p-2.5 bg-black border-2 border-zinc-800 text-white rounded-lg text-xs font-mono"
                  >
                    <option value="image/jpeg">JPG (Photo)</option>
                    <option value="image/png">PNG (Lossless)</option>
                    <option value="image/webp">WebP (Compact)</option>
                  </select>
                </div>

                <div>
                  <label className="flex justify-between text-[11px] font-mono font-bold uppercase text-zinc-400 mb-1.5">
                    <span>QUALITY</span>
                    <span className="text-white">{imageQuality}%</span>
                  </label>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    value={imageQuality}
                    onChange={(e) => setImageQuality(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer mt-2"
                  />
                </div>
              </div>

              {isProcessing && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-[11px] font-mono text-zinc-300">
                    <span>{progressText}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-black border border-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 transition-all duration-150"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={isProcessing}
                onClick={handleExtract}
                className="w-full py-3.5 px-4 bg-white text-black hover:bg-zinc-200 border-2 border-white rounded-lg font-mono text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0_0_#ffffff] disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>
                  {isProcessing
                    ? `EXTRACTING (${progress}%)...`
                    : files.length > 1
                    ? `BULK EXTRACT FRAMES (${files.length} VIDEOS)`
                    : "EXTRACT VIDEO FRAMES"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
