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
  Volume2,
  VolumeX,
  Camera,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Plus,
  Trash2,
} from "lucide-react";
import { saveFile, BulkOutputItem } from "../utils/db";
import { formatBytes } from "../utils/imageProcessor";
import { sanitizeFilename } from "../utils/sanitizer";
import { useFileDrop } from "../context/FileDropContext";
import { useToast } from "../context/ToastContext";
import ModuleIconBadge from "./ModuleIconBadge";

interface VideoConverterViewProps {
  onSuccess: () => void;
  initialFile?: File | null;
  initialFiles?: File[] | null;
}

type VideoOutputFormat = "mp4" | "webm" | "gif";
type ResolutionPreset = "original" | "1080" | "720" | "480" | "360";

interface VideoFormatOption {
  id: VideoOutputFormat;
  label: string;
  ext: string;
  mime: string;
  desc: string;
}

const VIDEO_FORMAT_OPTIONS: VideoFormatOption[] = [
  {
    id: "mp4",
    label: "MP4 VIDEO",
    ext: "mp4",
    mime: "video/mp4",
    desc: "Universal video container for mobile, web, and desktop players.",
  },
  {
    id: "webm",
    label: "WEBM (VP9 / VP8)",
    ext: "webm",
    mime: "video/webm",
    desc: "High-efficiency HTML5 web video with compact file size.",
  },
  {
    id: "gif",
    label: "ANIMATED GIF",
    ext: "gif",
    mime: "image/gif",
    desc: "Looping animated GIF clip with 256-color LZW encoding.",
  },
];

/**
 * Pure-TypeScript GIF89a Animated GIF Encoder (3-3-2 RGB 256-color palette + LZW compression).
 * Zero external dependencies, 100% browser-local.
 */
export function encodeAnimatedGif(
  frames: ImageData[],
  width: number,
  height: number,
  delayMs: number
): Blob {
  const bytes: number[] = [];
  const writeByte = (b: number) => bytes.push(b & 0xff);
  const writeShort = (s: number) => {
    bytes.push(s & 0xff);
    bytes.push((s >> 8) & 0xff);
  };
  const writeAscii = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      bytes.push(str.charCodeAt(i));
    }
  };

  writeAscii("GIF89a");
  writeShort(width);
  writeShort(height);
  writeByte(0xf7);
  writeByte(0);
  writeByte(0);

  for (let i = 0; i < 256; i++) {
    const r = Math.round(((i >> 5) & 0x07) * (255 / 7));
    const g = Math.round(((i >> 2) & 0x07) * (255 / 7));
    const b = Math.round((i & 0x03) * (255 / 3));
    writeByte(r);
    writeByte(g);
    writeByte(b);
  }

  writeByte(0x21);
  writeByte(0xff);
  writeByte(11);
  writeAscii("NETSCAPE2.0");
  writeByte(3);
  writeByte(1);
  writeShort(0);
  writeByte(0);

  const delayHundredths = Math.max(2, Math.round(delayMs / 10));
  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  for (const frame of frames) {
    writeByte(0x21);
    writeByte(0xf9);
    writeByte(4);
    writeByte(0x04);
    writeShort(delayHundredths);
    writeByte(0);
    writeByte(0);

    writeByte(0x2c);
    writeShort(0);
    writeShort(0);
    writeShort(width);
    writeShort(height);
    writeByte(0);

    const data = frame.data;
    const numPixels = width * height;
    const indexed = new Uint8Array(numPixels);
    for (let p = 0; p < numPixels; p++) {
      const idx = p * 4;
      const r = data[idx] >> 5;
      const g = data[idx + 1] >> 5;
      const b = data[idx + 2] >> 6;
      indexed[p] = (r << 5) | (g << 2) | b;
    }

    writeByte(minCodeSize);

    const subBlockBuffer: number[] = [];
    let bitBuffer = 0;
    let bitCount = 0;

    const emitCode = (code: number, codeSize: number) => {
      bitBuffer |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        subBlockBuffer.push(bitBuffer & 0xff);
        bitBuffer >>= 8;
        bitCount -= 8;
        if (subBlockBuffer.length === 255) {
          writeByte(255);
          for (let k = 0; k < 255; k++) writeByte(subBlockBuffer[k]);
          subBlockBuffer.length = 0;
        }
      }
    };

    let codeSize = minCodeSize + 1;
    let nextCode = endCode + 1;
    const dict = new Int32Array(4096 * 256).fill(-1);

    emitCode(clearCode, codeSize);

    let prefix = indexed[0];
    for (let i = 1; i < numPixels; i++) {
      const k = indexed[i];
      const key = (prefix << 8) | k;
      const found = dict[key];
      if (found !== -1) {
        prefix = found;
      } else {
        emitCode(prefix, codeSize);
        if (nextCode < 4096) {
          dict[key] = nextCode++;
          if (nextCode > 1 << codeSize && codeSize < 12) {
            codeSize++;
          }
        } else {
          emitCode(clearCode, codeSize);
          dict.fill(-1);
          codeSize = minCodeSize + 1;
          nextCode = endCode + 1;
        }
        prefix = k;
      }
    }

    emitCode(prefix, codeSize);
    emitCode(endCode, codeSize);

    if (bitCount > 0) {
      subBlockBuffer.push(bitBuffer & 0xff);
    }
    if (subBlockBuffer.length > 0) {
      writeByte(subBlockBuffer.length);
      for (let k = 0; k < subBlockBuffer.length; k++) {
        writeByte(subBlockBuffer[k]);
      }
    }
    writeByte(0);
  }

  writeByte(0x3b);
  return new Blob([new Uint8Array(bytes)], { type: "image/gif" });
}

function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00.0";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}

export default function VideoConverterView({
  onSuccess,
  initialFile,
  initialFiles,
}: VideoConverterViewProps) {
  const { registerDropHandler } = useFileDrop();
  const { showToast } = useToast();

  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [videoMeta, setVideoMeta] = useState<{
    width: number;
    height: number;
    duration: number;
  } | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [loopPreview, setLoopPreview] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const [outputFormat, setOutputFormat] = useState<VideoOutputFormat>("mp4");
  const [resolution, setResolution] = useState<ResolutionPreset>("720");
  const [fps, setFps] = useState<number>(24);
  const [bitrateMbps, setBitrateMbps] = useState<number>(2.5);
  const [muteAudio, setMuteAudio] = useState<boolean>(false);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [stepLabel, setStepLabel] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const activeFile = files[activeIndex] || null;

  const loadVideoPreview = useCallback(
    (selected: File) => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      const url = URL.createObjectURL(selected);
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
        setVideoMeta(null);
        setActiveIndex(0);
      } else {
        const nextIdx = Math.min(activeIndex, next.length - 1);
        setActiveIndex(nextIdx);
        loadVideoPreview(next[nextIdx]);
      }
      return next;
    });
  };

  const togglePlay = () => {
    const v = videoPreviewRef.current;
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
    const v = videoPreviewRef.current;
    if (!v || !videoMeta) return;
    v.pause();
    setIsPlaying(false);
    const next = Math.max(
      0,
      Math.min(videoMeta.duration, v.currentTime + deltaFrames * (1 / 30))
    );
    v.currentTime = next;
    setCurrentTime(next);
  };

  const computeTargetDimensions = (
    srcW: number,
    srcH: number,
    preset: ResolutionPreset
  ): { width: number; height: number } => {
    if (preset === "original") {
      return { width: srcW, height: srcH };
    }
    const targetH = Number(preset);
    if (srcH <= targetH) {
      return { width: srcW, height: srcH };
    }
    const scale = targetH / srcH;
    const w = Math.max(2, Math.round((srcW * scale) / 2) * 2);
    const h = Math.max(2, Math.round((srcH * scale) / 2) * 2);
    return { width: w, height: h };
  };

  const handleCaptureFrameSnapshot = async () => {
    const vid = videoPreviewRef.current;
    if (!vid || !activeFile) return;
    const canvas = document.createElement("canvas");
    canvas.width = vid.videoWidth || 1280;
    canvas.height = vid.videoHeight || 720;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95)
    );
    if (!blob) return;

    const baseName = sanitizeFilename(
      activeFile.name.replace(/\.[^/.]+$/, "") || "video"
    );
    await saveFile("video_converter", {
      blob,
      filename: `${baseName}_frame.jpg`,
      size: blob.size,
      format: "image/jpeg",
      originalName: activeFile.name,
      originalSize: activeFile.size,
      previewPages: [canvas.toDataURL("image/jpeg", 0.92)],
      statusNote: `Frame Snapshot (${canvas.width}×${canvas.height})`,
    });
    onSuccess();
  };

  const transcodeSingleVideoFile = async (
    targetFile: File,
    useTrimRange: boolean,
    onSubProgress: (pct: number) => void
  ): Promise<BulkOutputItem> => {
    const baseName = sanitizeFilename(
      targetFile.name.replace(/\.[^/.]+$/, "") || "video"
    );
    const tempUrl = URL.createObjectURL(targetFile);

    try {
      const probe = document.createElement("video");
      probe.src = tempUrl;
      probe.muted = true;
      probe.playsInline = true;
      await new Promise<void>((res, rej) => {
        probe.onloadedmetadata = () => res();
        probe.onerror = () => rej(new Error(`Failed to load ${targetFile.name}`));
      });

      const srcW = probe.videoWidth || 1280;
      const srcH = probe.videoHeight || 720;
      const fileDur = Number.isFinite(probe.duration) ? probe.duration : 10;

      const startSec = useTrimRange
        ? Math.max(0, Math.min(trimStart, fileDur - 0.1))
        : 0;
      const endSec = useTrimRange
        ? Math.max(startSec + 0.1, Math.min(trimEnd || fileDur, fileDur))
        : fileDur;
      const clipDuration = endSec - startSec;

      if (outputFormat === "gif") {
        const gifFps = Math.min(15, fps);
        const maxGifDuration = Math.min(clipDuration, 12);
        const totalFrames = Math.max(2, Math.round(maxGifDuration * gifFps));
        const { width, height } = computeTargetDimensions(
          srcW,
          srcH,
          resolution === "original" || resolution === "1080" ? "480" : resolution
        );

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        const frames: ImageData[] = [];
        let previewThumb = "";

        for (let i = 0; i < totalFrames; i++) {
          const t = startSec + i / gifFps;
          probe.currentTime = Math.min(fileDur, t);
          await new Promise<void>((res) => {
            const onSeek = () => {
              probe.removeEventListener("seeked", onSeek);
              res();
            };
            probe.addEventListener("seeked", onSeek);
          });
          ctx.drawImage(probe, 0, 0, width, height);
          if (i === 0) {
            previewThumb = canvas.toDataURL("image/jpeg", 0.85);
          }
          frames.push(ctx.getImageData(0, 0, width, height));
          onSubProgress(Math.round(((i + 1) / totalFrames) * 85));
        }

        const gifBlob = encodeAnimatedGif(
          frames,
          width,
          height,
          Math.round(1000 / gifFps)
        );
        return {
          blob: gifBlob,
          filename: `${baseName}.gif`,
          size: gifBlob.size,
          format: "image/gif",
          originalName: targetFile.name,
          originalSize: targetFile.size,
          previewUrl: previewThumb,
        };
      }

      const { width, height } = computeTargetDimensions(srcW, srcH, resolution);
      const workVideo = document.createElement("video");
      workVideo.src = tempUrl;
      workVideo.muted = muteAudio;
      workVideo.playsInline = true;
      workVideo.crossOrigin = "anonymous";

      await new Promise<void>((res, rej) => {
        workVideo.onloadeddata = () => res();
        workVideo.onerror = () => rej(new Error("Failed to load video stream."));
      });

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      const stream = canvas.captureStream(fps);

      let audioCtx: AudioContext | null = null;
      if (!muteAudio) {
        try {
          audioCtx = new AudioContext();
          const sourceNode = audioCtx.createMediaElementSource(workVideo);
          const destNode = audioCtx.createMediaStreamDestination();
          sourceNode.connect(destNode);
          const audioTracks = destNode.stream.getAudioTracks();
          if (audioTracks.length > 0) {
            stream.addTrack(audioTracks[0]);
          }
        } catch {
          // Video may have no audio track
        }
      }

      const preferredMimes =
        outputFormat === "mp4"
          ? [
              "video/mp4;codecs=avc1",
              "video/mp4",
              "video/webm;codecs=vp9,opus",
              "video/webm;codecs=vp8,opus",
              "video/webm",
            ]
          : [
              "video/webm;codecs=vp9,opus",
              "video/webm;codecs=vp8,opus",
              "video/webm",
              "video/mp4",
            ];

      const chosenMime =
        typeof MediaRecorder !== "undefined"
          ? preferredMimes.find((m) => MediaRecorder.isTypeSupported(m)) ||
            "video/webm"
          : "video/webm";

      const recorder = new MediaRecorder(stream, {
        mimeType: chosenMime,
        videoBitsPerSecond: Math.round(bitrateMbps * 1_000_000),
      });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      workVideo.currentTime = startSec;
      await new Promise<void>((res) => {
        const onSeek = () => {
          workVideo.removeEventListener("seeked", onSeek);
          res();
        };
        workVideo.addEventListener("seeked", onSeek);
      });

      ctx.drawImage(workVideo, 0, 0, width, height);
      const firstFramePreview = canvas.toDataURL("image/jpeg", 0.88);

      const outBlob = await new Promise<Blob>((resolve, reject) => {
        let rafId = 0;

        const renderLoop = () => {
          if (
            workVideo.paused ||
            workVideo.ended ||
            workVideo.currentTime >= endSec
          ) {
            if (recorder.state !== "inactive") {
              recorder.stop();
            }
            workVideo.pause();
            return;
          }
          ctx.drawImage(workVideo, 0, 0, width, height);
          const elapsed = Math.max(0, workVideo.currentTime - startSec);
          const pct = Math.min(98, Math.round((elapsed / clipDuration) * 90) + 5);
          onSubProgress(pct);
          rafId = requestAnimationFrame(renderLoop);
        };

        recorder.onstop = () => {
          cancelAnimationFrame(rafId);
          const containerMime =
            outputFormat === "mp4" ? "video/mp4" : "video/webm";
          resolve(new Blob(chunks, { type: containerMime }));
        };

        recorder.onerror = (err) => {
          cancelAnimationFrame(rafId);
          reject(err);
        };

        recorder.start(150);
        workVideo
          .play()
          .then(() => {
            rafId = requestAnimationFrame(renderLoop);
          })
          .catch(reject);
      });

      if (audioCtx) {
        await audioCtx.close().catch(() => {});
      }

      const finalExt = outputFormat === "mp4" ? "mp4" : "webm";
      const finalMime = outputFormat === "mp4" ? "video/mp4" : "video/webm";

      return {
        blob: outBlob,
        filename: `${baseName}_converted.${finalExt}`,
        size: outBlob.size,
        format: finalMime,
        originalName: targetFile.name,
        originalSize: targetFile.size,
        previewUrl: firstFramePreview,
      };
    } finally {
      URL.revokeObjectURL(tempUrl);
    }
  };

  const handleConvertVideo = async () => {
    if (files.length === 0) return;
    if (videoPreviewRef.current && !videoPreviewRef.current.paused) {
      videoPreviewRef.current.pause();
      setIsPlaying(false);
    }

    setIsProcessing(true);
    setProgress(5);
    setStepLabel("INITIALIZING LOCAL VIDEO TRANSCODER...");

    try {
      if (files.length === 1) {
        const res = await transcodeSingleVideoFile(files[0], true, setProgress);
        setProgress(100);
        await saveFile("video_converter", {
          blob: res.blob,
          filename: res.filename,
          size: res.size,
          format: res.format,
          originalName: res.originalName,
          originalSize: res.originalSize,
          previewPages: res.previewUrl ? [res.previewUrl] : undefined,
          statusNote: `Transcoded to ${outputFormat.toUpperCase()} (${resolution}p @ ${fps} FPS)`,
        });
      } else {
        const zip = new JSZip();
        const bulkItems: BulkOutputItem[] = [];
        for (let i = 0; i < files.length; i++) {
          setStepLabel(
            `TRANSCODING VIDEO ${i + 1} OF ${files.length}: ${files[i].name}...`
          );
          const item = await transcodeSingleVideoFile(files[i], false, (sub) => {
            const overall = Math.round(((i + sub / 100) / files.length) * 94);
            setProgress(Math.max(5, overall));
          });
          zip.file(item.filename, item.blob);
          bulkItems.push(item);
        }
        setStepLabel("PACKAGING BULK VIDEOS...");
        const zipBlob = await zip.generateAsync({ type: "blob" });
        await saveFile("video_converter", {
          blob: zipBlob,
          filename: `converted_${files.length}_videos.zip`,
          size: zipBlob.size,
          format: "application/zip",
          originalName: `${files.length} Video Files`,
          originalSize: files.reduce((acc, f) => acc + f.size, 0),
          previewPages: bulkItems
            .map((b) => b.previewUrl)
            .filter(Boolean) as string[],
          statusNote: `Bulk Converted ${files.length} Videos to ${outputFormat.toUpperCase()}`,
          bulkItems,
        });
      }
      onSuccess();
    } catch (err: any) {
      showToast(err?.message || "Video conversion failed.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="video-converter-view"
      aria-labelledby="video-converter-heading"
    >
      {/* Header */}
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="video-converter-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            VIDEO CONVERTER &amp; COMPRESSOR // VIDEO_CONV.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Convert and compress single or bulk videos into MP4, WebM, or looping Animated GIF in 100% local memory.
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.ogv"
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
          id="video-converter-drag-drop"
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
            <ModuleIconBadge view="video_converter" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP SINGLE OR MULTIPLE VIDEO FILES (.MP4, .WEBM, .MOV)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Supports bulk upload. Convert to MP4, WebM, or looping Animated GIF locally.
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
          {/* Left Column: Bulk Queue + Studio Video Monitor */}
          <div className="lg:col-span-7 space-y-5">
            {/* Queue Strip */}
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
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-[11px] font-mono font-bold text-sky-400 flex items-center gap-1 cursor-pointer"
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
                      setVideoMeta(null);
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
                        ? "border-sky-400 bg-sky-500/10 text-white"
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

            <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div className="min-w-0">
                  <p className="text-xs font-mono font-bold text-white truncate">
                    {activeFile?.name}
                  </p>
                  <p className="text-[11px] font-mono text-zinc-400">
                    {activeFile ? formatBytes(activeFile.size) : ""}
                    {videoMeta
                      ? ` • ${videoMeta.width}×${videoMeta.height} • ${formatSec(
                          currentTime
                        )} / ${formatSec(videoMeta.duration)}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCaptureFrameSnapshot}
                    title="Export current video frame as JPG"
                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg font-mono text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-sky-400" />
                    <span>SNAPSHOT</span>
                  </button>
                </div>
              </div>

              <div className="bg-black rounded-lg border border-zinc-800 overflow-hidden flex items-center justify-center max-h-[380px]">
                <video
                  ref={videoPreviewRef}
                  src={videoUrl}
                  playsInline
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    const dur = Number.isFinite(v.duration) ? v.duration : 10;
                    setVideoMeta({
                      width: v.videoWidth || 1280,
                      height: v.videoHeight || 720,
                      duration: dur,
                    });
                    setTrimStart(0);
                    setTrimEnd(Number(dur.toFixed(1)));
                  }}
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
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
                  }}
                  onEnded={() => setIsPlaying(false)}
                  className="max-w-full max-h-[360px] w-auto h-auto"
                />
              </div>

              {/* Studio Scrubber & Frame Stepping */}
              {videoMeta && (
                <div className="space-y-3">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.1, videoMeta.duration)}
                    step={0.03}
                    value={currentTime}
                    onChange={(e) => {
                      const t = Number(e.target.value);
                      setCurrentTime(t);
                      if (videoPreviewRef.current)
                        videoPreviewRef.current.currentTime = t;
                    }}
                    className="w-full accent-sky-400 cursor-pointer"
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
                            ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                            : "border-zinc-800 bg-zinc-900 text-zinc-500"
                        }`}
                      >
                        <Repeat className="w-3.5 h-3.5" />
                        <span>LOOP</span>
                      </button>
                    </div>

                    <select
                      value={playbackSpeed}
                      onChange={(e) => {
                        const spd = Number(e.target.value);
                        setPlaybackSpeed(spd);
                        if (videoPreviewRef.current)
                          videoPreviewRef.current.playbackRate = spd;
                      }}
                      className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200"
                    >
                      <option value={0.5}>0.5x</option>
                      <option value={1}>1.0x</option>
                      <option value={1.5}>1.5x</option>
                      <option value={2}>2.0x</option>
                    </select>
                  </div>
                </div>
              )}

              {videoMeta && files.length === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-800">
                  <div>
                    <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                      <span className="flex items-center gap-1 font-bold uppercase">
                        <Scissors className="w-3.5 h-3.5 text-sky-400" />
                        TRIM START
                      </span>
                      <span>{formatSec(trimStart)}</span>
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
                        if (videoPreviewRef.current) {
                          videoPreviewRef.current.currentTime = val;
                        }
                      }}
                      className="w-full accent-sky-400 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                      <span className="flex items-center gap-1 font-bold uppercase">
                        <Scissors className="w-3.5 h-3.5 text-sky-400" />
                        TRIM END
                      </span>
                      <span>{formatSec(trimEnd)}</span>
                    </label>
                    <input
                      type="range"
                      min={Math.min(videoMeta.duration, trimStart + 0.2)}
                      max={Number(videoMeta.duration.toFixed(1))}
                      step={0.1}
                      value={trimEnd}
                      onChange={(e) => setTrimEnd(Number(e.target.value))}
                      className="w-full accent-sky-400 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Output Format, Resolution & Bitrate */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-5">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Sliders className="w-4 h-4 text-sky-400" />
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                  VIDEO TRANSCODER PARAMETERS
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {VIDEO_FORMAT_OPTIONS.map((fmt) => {
                  const active = outputFormat === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setOutputFormat(fmt.id)}
                      className={`text-left p-3 rounded-lg border-2 transition-all cursor-pointer ${
                        active
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-200 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono text-xs font-bold uppercase">
                        <span>{fmt.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-current">
                          .{fmt.ext.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono opacity-75 mt-0.5">
                        {fmt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800">
                <div>
                  <label className="text-[11px] font-mono font-bold uppercase text-zinc-400 block mb-1.5">
                    RESOLUTION
                  </label>
                  <select
                    value={resolution}
                    onChange={(e) =>
                      setResolution(e.target.value as ResolutionPreset)
                    }
                    className="w-full p-2.5 bg-black border-2 border-zinc-800 text-white rounded-lg text-xs font-mono"
                  >
                    <option value="original">Original Size</option>
                    <option value="1080">1080p Full HD</option>
                    <option value="720">720p HD</option>
                    <option value="480">480p SD</option>
                    <option value="360">360p Compact</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-mono font-bold uppercase text-zinc-400 block mb-1.5">
                    FRAME RATE
                  </label>
                  <select
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    className="w-full p-2.5 bg-black border-2 border-zinc-800 text-white rounded-lg text-xs font-mono"
                  >
                    <option value={30}>30 FPS (Smooth)</option>
                    <option value={24}>24 FPS (Cinema)</option>
                    <option value={15}>15 FPS (Compact)</option>
                    <option value={10}>10 FPS (GIF / Lite)</option>
                  </select>
                </div>
              </div>

              {outputFormat !== "gif" && (
                <div className="pt-2 border-t border-zinc-800 space-y-3">
                  <div>
                    <label className="flex justify-between text-[11px] font-mono font-bold uppercase text-zinc-400 mb-1.5">
                      <span>VIDEO BITRATE / QUALITY</span>
                      <span className="text-white">{bitrateMbps} MBPS</span>
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: "0.8M", val: 0.8 },
                        { label: "1.5M", val: 1.5 },
                        { label: "2.5M", val: 2.5 },
                        { label: "5.0M", val: 5.0 },
                      ].map((b) => (
                        <button
                          key={b.val}
                          type="button"
                          onClick={() => setBitrateMbps(b.val)}
                          className={`py-1.5 rounded border text-xs font-mono font-bold cursor-pointer ${
                            bitrateMbps === b.val
                              ? "bg-white text-black border-white"
                              : "bg-black text-zinc-300 border-zinc-800"
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMuteAudio((m) => !m)}
                    className="w-full py-2 px-3 bg-black border border-zinc-800 hover:border-zinc-600 rounded-lg flex items-center justify-between text-xs font-mono text-zinc-200 cursor-pointer"
                  >
                    <span className="flex items-center gap-2 font-bold uppercase">
                      {muteAudio ? (
                        <VolumeX className="w-4 h-4 text-red-400" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-emerald-400" />
                      )}
                      <span>
                        {muteAudio
                          ? "AUDIO TRACK MUTED (SILENT VIDEO)"
                          : "KEEP ORIGINAL AUDIO TRACK"}
                      </span>
                    </span>
                    <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700">
                      {muteAudio ? "MUTED" : "ACTIVE"}
                    </span>
                  </button>
                </div>
              )}

              {isProcessing && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-[11px] font-mono text-zinc-300">
                    <span>{stepLabel}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-black border border-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-400 transition-all duration-150"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={isProcessing || !videoMeta}
                onClick={handleConvertVideo}
                className="w-full py-3.5 px-4 bg-white text-black hover:bg-zinc-200 border-2 border-white rounded-lg font-mono text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0_0_#ffffff] disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>
                  {isProcessing
                    ? `TRANSCODING (${progress}%)...`
                    : files.length > 1
                    ? `BULK CONVERT ${files.length} VIDEOS`
                    : "CONVERT VIDEO LOCALLY"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
