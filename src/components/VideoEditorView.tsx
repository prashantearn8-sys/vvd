/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Scissors,
  Sliders,
  Zap,
  RotateCcw,
  RefreshCw,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Volume2,
  VolumeX,
  Type,
} from "lucide-react";
import { saveFile } from "../utils/db";
import { formatBytes } from "../utils/imageProcessor";
import { sanitizeFilename } from "../utils/sanitizer";
import { useFileDrop } from "../context/FileDropContext";
import { useToast } from "../context/ToastContext";
import ModuleIconBadge from "./ModuleIconBadge";
import { encodeAnimatedGif } from "./VideoConverterView";

interface VideoEditorViewProps {
  onSuccess: () => void;
  initialFile?: File | null;
}

type ExportFormat = "mp4" | "webm" | "gif";
type AspectPreset = "original" | "16:9" | "9:16" | "1:1" | "4:3";
type TextPosition = "top" | "center" | "bottom";

function formatTimecode(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00.0";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
}

export default function VideoEditorView({
  onSuccess,
  initialFile,
}: VideoEditorViewProps) {
  const { registerDropHandler } = useFileDrop();
  const { showToast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [loopPreview, setLoopPreview] = useState<boolean>(true);
  const [videoDims, setVideoDims] = useState<{ w: number; h: number }>({
    w: 1280,
    h: 720,
  });

  // Studio Editor Parameters
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(10);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>("original");
  const [muteAudio, setMuteAudio] = useState<boolean>(false);

  // Color Grading
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [saturation, setSaturation] = useState<number>(100);
  const [sepia, setSepia] = useState<number>(0);
  const [blurPx, setBlurPx] = useState<number>(0);

  // Caption Overlay
  const [overlayText, setOverlayText] = useState<string>("");
  const [textPosition, setTextPosition] = useState<TextPosition>("bottom");
  const [textColor, setTextColor] = useState<string>("#ffffff");

  // Export Format
  const [exportFormat, setExportFormat] = useState<ExportFormat>("mp4");
  const [fps] = useState<number>(24);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>(
    "RENDERING EDITED VIDEO..."
  );
  const [progress, setProgress] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleFileSelected = useCallback(
    (f: File) => {
      if (
        !f.type.startsWith("video/") &&
        !/\.(mp4|webm|mov|mkv|avi|m4v|ogv)$/i.test(f.name)
      ) {
        showToast(
          "Please select a valid video file (MP4, WebM, MOV, MKV, OGV).",
          "error"
        );
        return;
      }
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      const url = URL.createObjectURL(f);
      setFile(f);
      setVideoUrl(url);
      setIsPlaying(false);
    },
    [videoUrl, showToast]
  );

  useEffect(() => {
    if (initialFile && !file) {
      handleFileSelected(initialFile);
    }
  }, [initialFile, file, handleFileSelected]);

  useEffect(() => {
    return registerDropHandler((droppedFiles) => {
      if (droppedFiles.length > 0) {
        handleFileSelected(droppedFiles[0]);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, handleFileSelected]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

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
    if (v.currentTime >= trimEnd) {
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
      v.muted = muteAudio;
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
    const next = Math.max(
      trimStart,
      Math.min(trimEnd, v.currentTime + deltaFrames * (1 / 30))
    );
    v.currentTime = next;
    setCurrentTime(next);
  };

  const resetAllAdjustments = () => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setAspectPreset("original");
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setSepia(0);
    setBlurPx(0);
    setPlaybackSpeed(1);
    setOverlayText("");
    setTrimStart(0);
    setTrimEnd(Number(duration.toFixed(1)));
  };

  const cssFilterString = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${sepia}%) blur(${blurPx}px)`;

  const computeCropBox = (srcW: number, srcH: number, preset: AspectPreset) => {
    if (preset === "original") return { sx: 0, sy: 0, sw: srcW, sh: srcH };
    const ratioMap: Record<Exclude<AspectPreset, "original">, number> = {
      "16:9": 16 / 9,
      "9:16": 9 / 16,
      "1:1": 1,
      "4:3": 4 / 3,
    };
    const targetRatio = ratioMap[preset];
    const currentRatio = srcW / srcH;
    let sw = srcW;
    let sh = srcH;
    if (currentRatio > targetRatio) {
      sw = Math.round(srcH * targetRatio);
    } else {
      sh = Math.round(srcW / targetRatio);
    }
    const sx = Math.round((srcW - sw) / 2);
    const sy = Math.round((srcH - sh) / 2);
    return { sx, sy, sw, sh };
  };

  const drawEditedFrame = (
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    outW: number,
    outH: number
  ) => {
    ctx.save();
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, outW, outH);
    ctx.filter = cssFilterString;

    const { sx, sy, sw, sh } = computeCropBox(
      video.videoWidth || 1280,
      video.videoHeight || 720,
      aspectPreset
    );

    ctx.translate(outW / 2, outH / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

    const drawW = rotation === 90 || rotation === 270 ? outH : outW;
    const drawH = rotation === 90 || rotation === 270 ? outW : outH;

    ctx.drawImage(video, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    if (overlayText.trim()) {
      ctx.save();
      const fontSize = Math.max(18, Math.round(outH * 0.055));
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const yPos =
        textPosition === "top"
          ? fontSize * 1.4
          : textPosition === "center"
          ? outH / 2
          : outH - fontSize * 1.4;

      const metrics = ctx.measureText(overlayText.trim());
      const padX = 16;
      const padY = 10;
      ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
      ctx.fillRect(
        outW / 2 - metrics.width / 2 - padX,
        yPos - fontSize / 2 - padY,
        metrics.width + padX * 2,
        fontSize + padY * 2
      );
      ctx.fillStyle = textColor;
      ctx.fillText(overlayText.trim(), outW / 2, yPos);
      ctx.restore();
    }
  };

  const handleRenderVideo = async () => {
    if (!file) return;
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
      setIsPlaying(false);
    }

    setIsProcessing(true);
    setProgress(5);

    const tempUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = tempUrl;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () =>
          reject(new Error("Could not load video for rendering."));
      });

      const start = Math.max(0, trimStart);
      const end = Math.min(video.duration || 10, Math.max(start + 0.3, trimEnd));
      const clipDuration = (end - start) / playbackSpeed;

      const { sw, sh } = computeCropBox(
        video.videoWidth || 1280,
        video.videoHeight || 720,
        aspectPreset
      );
      const rotated = rotation === 90 || rotation === 270;
      const rawW = rotated ? sh : sw;
      const rawH = rotated ? sw : sh;
      const maxDim = exportFormat === "gif" ? 480 : 1280;
      const scale = Math.min(1, maxDim / Math.max(rawW, rawH));
      const outW = Math.max(2, Math.round((rawW * scale) / 2) * 2);
      const outH = Math.max(2, Math.round((rawH * scale) / 2) * 2);

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas context unavailable.");

      const baseName = sanitizeFilename(
        file.name.replace(/\.[^/.]+$/, "") || "video"
      );

      if (exportFormat === "gif") {
        const gifFps = 12;
        const totalFrames = Math.min(
          90,
          Math.max(4, Math.floor(clipDuration * gifFps))
        );
        const frames: ImageData[] = [];
        let firstPreview = "";

        for (let i = 0; i < totalFrames; i++) {
          const targetTime = start + (i / totalFrames) * (end - start);
          setProgressText(`ENCODING EDITED GIF FRAME ${i + 1}/${totalFrames}...`);
          setProgress(Math.round(((i + 1) / totalFrames) * 85));

          await new Promise<void>((resolve) => {
            const onSeeked = () => {
              video.removeEventListener("seeked", onSeeked);
              resolve();
            };
            video.addEventListener("seeked", onSeeked);
            video.currentTime = targetTime;
          });

          drawEditedFrame(ctx, video, outW, outH);
          if (i === 0) {
            firstPreview = canvas.toDataURL("image/jpeg", 0.85);
          }
          frames.push(ctx.getImageData(0, 0, outW, outH));
        }

        const gifBlob = encodeAnimatedGif(
          frames,
          outW,
          outH,
          Math.round(1000 / gifFps)
        );
        await saveFile("video_editor", {
          blob: gifBlob,
          filename: `${baseName}_edited.gif`,
          size: gifBlob.size,
          format: "image/gif",
          originalName: file.name,
          originalSize: file.size,
          previewPages: firstPreview ? [firstPreview] : undefined,
          statusNote: `Edited Animated GIF (${outW}×${outH} • ${playbackSpeed}x)`,
        });
      } else {
        setProgressText("RENDERING EDITED VIDEO STREAM...");
        const candidates =
          exportFormat === "mp4"
            ? [
                "video/mp4;codecs=avc1",
                "video/mp4",
                "video/webm;codecs=vp9",
                "video/webm",
              ]
            : [
                "video/webm;codecs=vp9,opus",
                "video/webm;codecs=vp8,opus",
                "video/webm",
              ];
        let selectedMime = "video/webm";
        for (const c of candidates) {
          if (
            typeof MediaRecorder !== "undefined" &&
            MediaRecorder.isTypeSupported(c)
          ) {
            selectedMime = c;
            break;
          }
        }

        const stream = canvas.captureStream(fps);
        let audioCtx: AudioContext | null = null;
        if (!muteAudio) {
          try {
            audioCtx = new AudioContext();
            const source = audioCtx.createMediaElementSource(video);
            const dest = audioCtx.createMediaStreamDestination();
            source.connect(dest);
            dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
          } catch {
            // Video might not have an audio track
          }
        }

        video.muted = muteAudio;
        video.currentTime = start;
        video.playbackRate = playbackSpeed;

        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            resolve();
          };
          video.addEventListener("seeked", onSeeked);
        });

        drawEditedFrame(ctx, video, outW, outH);
        const firstPreview = canvas.toDataURL("image/jpeg", 0.85);

        const chunks: BlobPart[] = [];
        const recorder = new MediaRecorder(stream, {
          mimeType: selectedMime,
          videoBitsPerSecond: 3_500_000,
        });
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        const finished = new Promise<Blob>((resolve) => {
          recorder.onstop = () => {
            resolve(
              new Blob(chunks, {
                type: exportFormat === "mp4" ? "video/mp4" : "video/webm",
              })
            );
          };
        });

        recorder.start(120);
        await video.play();

        await new Promise<void>((resolve) => {
          const renderLoop = () => {
            if (video.paused || video.ended || video.currentTime >= end) {
              video.pause();
              resolve();
              return;
            }
            drawEditedFrame(ctx, video, outW, outH);
            const pct = Math.min(
              95,
              Math.max(
                8,
                Math.round(((video.currentTime - start) / (end - start)) * 92)
              )
            );
            setProgress(pct);
            requestAnimationFrame(renderLoop);
          };
          requestAnimationFrame(renderLoop);
        });

        if (recorder.state !== "inactive") recorder.stop();
        const outBlob = await finished;
        if (audioCtx) await audioCtx.close().catch(() => {});

        const ext = exportFormat === "mp4" ? "mp4" : "webm";
        await saveFile("video_editor", {
          blob: outBlob,
          filename: `${baseName}_edited.${ext}`,
          size: outBlob.size,
          format: outBlob.type,
          originalName: file.name,
          originalSize: file.size,
          previewPages: [firstPreview],
          statusNote: `Edited ${ext.toUpperCase()} (${outW}×${outH} • ${playbackSpeed}x Speed)`,
        });
      }

      showToast("Edited video exported successfully.", "success");
      onSuccess();
    } catch (err: any) {
      showToast(err?.message || "Failed to render edited video.", "error");
    } finally {
      setIsProcessing(false);
      URL.revokeObjectURL(tempUrl);
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="video-editor-view"
      aria-labelledby="video-editor-heading"
    >
      {/* Header */}
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="video-editor-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            VIDEO EDITOR STUDIO // VIDEO_EDIT.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Trim timeline segments, rotate &amp; flip, crop aspect ratios, grade colors, adjust playback speed, and burn custom text captions locally.
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.m4v,.ogv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileSelected(f);
          e.target.value = "";
        }}
      />

      {!file ? (
        <div
          id="video-editor-drag-drop"
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
            <ModuleIconBadge view="video_editor" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE VIDEO FILE TO EDIT (.MP4, .WEBM, .MOV)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-md mx-auto mb-4 uppercase">
            Trim clips, rotate/flip, crop 16:9 / 9:16 / 1:1, adjust brightness/contrast/saturation, change speed, and burn text overlays locally.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
          >
            SELECT_VIDEO_FILE
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Live Studio Video Monitor & Timeline Trimmer */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div className="min-w-0">
                  <p className="text-xs font-mono font-bold text-white truncate">
                    {file.name}
                  </p>
                  <p className="text-[11px] font-mono text-zinc-400">
                    {formatBytes(file.size)} • {videoDims.w}×{videoDims.h}px •{" "}
                    <span className="text-rose-400 font-bold">
                      {formatTimecode(currentTime)} / {formatTimecode(duration)}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetAllAdjustments}
                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg font-mono text-xs font-bold uppercase flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>RESET</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (videoUrl) URL.revokeObjectURL(videoUrl);
                      setFile(null);
                      setVideoUrl("");
                    }}
                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg font-mono text-xs font-bold uppercase flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>CHANGE</span>
                  </button>
                </div>
              </div>

              {/* Real-time CSS Filter & Transform Video Monitor */}
              <div className="relative bg-black rounded-lg border border-zinc-800 overflow-hidden flex items-center justify-center min-h-[260px] max-h-[360px]">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  playsInline
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                  style={{
                    filter: cssFilterString,
                    transform: `rotate(${rotation}deg) scaleX(${
                      flipH ? -1 : 1
                    }) scaleY(${flipV ? -1 : 1})`,
                  }}
                  className="max-w-full max-h-[340px] w-auto h-auto transition-transform duration-150"
                />
                {overlayText.trim() && (
                  <div
                    className={`pointer-events-none absolute left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded bg-black/75 font-mono font-bold text-xs sm:text-sm tracking-wide shadow ${
                      textPosition === "top"
                        ? "top-4"
                        : textPosition === "center"
                        ? "top-1/2 -translate-y-1/2"
                        : "bottom-4"
                    }`}
                    style={{ color: textColor }}
                  >
                    {overlayText}
                  </div>
                )}
              </div>

              {/* Scrubber & Transport Controls */}
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
                  className="w-full accent-rose-400 cursor-pointer"
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
                          <span>PLAY PREVIEW</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => stepFrame(-1)}
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg font-mono text-xs text-zinc-200 flex items-center gap-1 cursor-pointer"
                    >
                      <SkipBack className="w-3.5 h-3.5" />
                      <span>-1F</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => stepFrame(1)}
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg font-mono text-xs text-zinc-200 flex items-center gap-1 cursor-pointer"
                    >
                      <span>+1F</span>
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoopPreview((v) => !v)}
                      className={`px-2.5 py-1.5 rounded-lg border font-mono text-xs flex items-center gap-1 cursor-pointer ${
                        loopPreview
                          ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
                          : "border-zinc-800 bg-zinc-900 text-zinc-500"
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      <span>LOOP</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMuteAudio((m) => !m)}
                    className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg font-mono text-xs text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    {muteAudio ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5 text-red-400" />
                        <span>MUTED</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>AUDIO ON</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Trim Start / End */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-800">
                <div>
                  <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                    <span className="flex items-center gap-1 font-bold uppercase">
                      <Scissors className="w-3.5 h-3.5 text-rose-400" />
                      TRIM START
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
                    className="w-full accent-rose-400 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                    <span className="flex items-center gap-1 font-bold uppercase">
                      <Scissors className="w-3.5 h-3.5 text-rose-400" />
                      TRIM END
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
                    className="w-full accent-rose-400 cursor-pointer"
                  />
                </div>
              </div>

              {/* Rotate, Flip & Aspect Crop */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-800">
                <div>
                  <label className="text-[11px] font-mono font-bold uppercase text-zinc-400 block mb-1.5">
                    ROTATE &amp; FLIP
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {([0, 90, 180, 270] as const).map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => setRotation(deg)}
                        className={`px-2.5 py-1.5 rounded border text-xs font-mono font-bold cursor-pointer ${
                          rotation === deg
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-300 border-zinc-800"
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setFlipH((v) => !v)}
                      className={`px-2.5 py-1.5 rounded border text-xs font-mono font-bold cursor-pointer ${
                        flipH
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800"
                      }`}
                    >
                      FLIP H
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlipV((v) => !v)}
                      className={`px-2.5 py-1.5 rounded border text-xs font-mono font-bold cursor-pointer ${
                        flipV
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800"
                      }`}
                    >
                      FLIP V
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-mono font-bold uppercase text-zinc-400 block mb-1.5">
                    ASPECT RATIO CROP
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      ["original", "16:9", "9:16", "1:1", "4:3"] as AspectPreset[]
                    ).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setAspectPreset(p)}
                        className={`px-2.5 py-1.5 rounded border text-xs font-mono font-bold uppercase cursor-pointer ${
                          aspectPreset === p
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-300 border-zinc-800"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Color Grading, Speed, Text Overlay & Export */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-5">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Sliders className="w-4 h-4 text-rose-400" />
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                  COLOR GRADING, SPEED &amp; TEXT OVERLAY
                </h2>
              </div>

              {/* Color Sliders */}
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                    <span className="font-bold uppercase">BRIGHTNESS</span>
                    <span className="text-white font-bold">{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={180}
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full accent-rose-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                    <span className="font-bold uppercase">CONTRAST</span>
                    <span className="text-white font-bold">{contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={180}
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full accent-rose-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                    <span className="font-bold uppercase">SATURATION</span>
                    <span className="text-white font-bold">{saturation}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={220}
                    value={saturation}
                    onChange={(e) => setSaturation(Number(e.target.value))}
                    className="w-full accent-rose-400 cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                      <span className="font-bold uppercase">SEPIA</span>
                      <span>{sepia}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={sepia}
                      onChange={(e) => setSepia(Number(e.target.value))}
                      className="w-full accent-rose-400 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                      <span className="font-bold uppercase">BLUR</span>
                      <span>{blurPx}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      value={blurPx}
                      onChange={(e) => setBlurPx(Number(e.target.value))}
                      className="w-full accent-rose-400 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Playback Speed */}
              <div className="pt-2 border-t border-zinc-800">
                <label className="flex justify-between text-xs font-mono text-zinc-300 mb-2">
                  <span className="font-bold uppercase">PLAYBACK SPEED</span>
                  <span className="text-white font-bold">{playbackSpeed}x</span>
                </label>
                <div className="grid grid-cols-6 gap-1.5">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => {
                        setPlaybackSpeed(spd);
                        if (videoRef.current)
                          videoRef.current.playbackRate = spd;
                      }}
                      className={`py-1.5 rounded border text-xs font-mono font-bold cursor-pointer ${
                        playbackSpeed === spd
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800"
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Caption Overlay */}
              <div className="pt-2 border-t border-zinc-800 space-y-2.5">
                <label className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase text-zinc-400">
                  <Type className="w-3.5 h-3.5 text-rose-400" />
                  <span>BURN-IN CAPTION TEXT OVERLAY</span>
                </label>
                <input
                  type="text"
                  placeholder="Optional text caption..."
                  value={overlayText}
                  onChange={(e) => setOverlayText(e.target.value)}
                  className="w-full p-2.5 bg-black border-2 border-zinc-800 text-white rounded-lg text-xs font-mono"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={textPosition}
                    onChange={(e) =>
                      setTextPosition(e.target.value as TextPosition)
                    }
                    className="flex-1 p-2 bg-black border-2 border-zinc-800 text-white rounded-lg text-xs font-mono"
                  >
                    <option value="bottom">Bottom Lower-Third</option>
                    <option value="center">Center Title</option>
                    <option value="top">Top Header</option>
                  </select>
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="w-10 h-9 rounded border border-zinc-700 bg-black cursor-pointer"
                  />
                </div>
              </div>

              {/* Export Format */}
              <div className="pt-2 border-t border-zinc-800">
                <label className="text-[11px] font-mono font-bold uppercase text-zinc-400 block mb-1.5">
                  EXPORT CONTAINER FORMAT
                </label>
                <select
                  value={exportFormat}
                  onChange={(e) =>
                    setExportFormat(e.target.value as ExportFormat)
                  }
                  className="w-full p-2.5 bg-black border-2 border-zinc-800 text-white rounded-lg text-xs font-mono"
                >
                  <option value="mp4">MP4 Video (.MP4)</option>
                  <option value="webm">WebM Video (.WEBM)</option>
                  <option value="gif">Animated GIF (.GIF)</option>
                </select>
              </div>

              {isProcessing && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-[11px] font-mono text-zinc-300">
                    <span>{progressText}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-black border border-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-400 transition-all duration-150"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={isProcessing}
                onClick={handleRenderVideo}
                className="w-full py-3.5 px-4 bg-white text-black hover:bg-zinc-200 border-2 border-white rounded-lg font-mono text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0_0_#ffffff] disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>
                  {isProcessing
                    ? `RENDERING (${progress}%)...`
                    : "EXPORT EDITED VIDEO"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
