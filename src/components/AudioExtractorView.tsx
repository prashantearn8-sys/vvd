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
  Volume2,
  Plus,
  Trash2,
  Play,
  Pause,
} from "lucide-react";
import { saveFile, BulkOutputItem } from "../utils/db";
import { formatBytes } from "../utils/imageProcessor";
import { sanitizeFilename } from "../utils/sanitizer";
import { useFileDrop } from "../context/FileDropContext";
import { useToast } from "../context/ToastContext";
import ModuleIconBadge from "./ModuleIconBadge";
import {
  AUDIO_FORMAT_OPTIONS,
  AudioOutputFormat,
  SampleRateOption,
  ChannelOption,
  encodeWavFromAudioBuffer,
  encodeCompressedAudioStream,
  formatAudioDuration,
} from "./AudioConverterView";

interface AudioExtractorViewProps {
  onSuccess: () => void;
  initialFile?: File | null;
  initialFiles?: File[] | null;
}

export default function AudioExtractorView({
  onSuccess,
  initialFile,
  initialFiles,
}: AudioExtractorViewProps) {
  const { registerDropHandler } = useFileDrop();
  const { showToast } = useToast();

  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);

  // Extraction parameters
  const [outputFormat, setOutputFormat] = useState<AudioOutputFormat>("wav_16");
  const [sampleRate, setSampleRate] = useState<SampleRateOption>(48000);
  const [channels, setChannels] = useState<ChannelOption>(2);
  const [bitrateKbps, setBitrateKbps] = useState<number>(192);
  const [gainPct, setGainPct] = useState<number>(100);
  const [normalizePeak, setNormalizePeak] = useState<boolean>(false);
  const [extractStart, setExtractStart] = useState<number>(0);
  const [extractEnd, setExtractEnd] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);

  const activeFile = files[activeIndex] || null;

  const loadVideoForExtraction = useCallback(
    async (selected: File) => {
      setIsLoading(true);
      try {
        if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
        }
        const url = URL.createObjectURL(selected);
        setVideoUrl(url);
        setCurrentTime(0);
        setIsPlaying(false);

        const arrayBuf = await selected.arrayBuffer();
        const ctx = new AudioContext();
        try {
          const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
          setAudioBuffer(decoded);
          setExtractStart(0);
          setExtractEnd(Number(decoded.duration.toFixed(2)));
          setSampleRate(decoded.sampleRate === 48000 ? 48000 : 44100);
          setChannels(decoded.numberOfChannels >= 2 ? 2 : 1);
        } finally {
          await ctx.close().catch(() => {});
        }
      } catch {
        showToast(
          "Could not decode audio stream from this video. Make sure the video file contains an audio track (MP4, WebM, MOV, MKV).",
          "error"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [videoUrl, showToast]
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
          loadVideoForExtraction(next[0]);
        }
        return next;
      });
    },
    [loadVideoForExtraction, showToast]
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

  // Draw extracted audio waveform with range markers and live playhead
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !audioBuffer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, w, h);

    const data = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / w));
    const amp = h / 2;

    const startRatio = extractStart / Math.max(0.01, audioBuffer.duration);
    const endRatio = extractEnd / Math.max(0.01, audioBuffer.duration);
    const playRatio = currentTime / Math.max(0.01, audioBuffer.duration);
    const playheadX = Math.round(playRatio * w);

    for (let x = 0; x < w; x++) {
      let min = 1.0;
      let max = -1.0;
      const startIdx = x * step;
      for (let j = 0; j < step && startIdx + j < data.length; j++) {
        const datum = data[startIdx + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const posRatio = x / w;
      const inRange = posRatio >= startRatio && posRatio <= endRatio;
      ctx.fillStyle = inRange
        ? x <= playheadX
          ? "#fbbf24"
          : "#f59e0b"
        : "#3f3f46";
      const yTop = (1 + min * (gainPct / 100)) * amp;
      const yBottom = (1 + max * (gainPct / 100)) * amp;
      ctx.fillRect(x, Math.max(0, yTop), 1, Math.max(2, yBottom - yTop));
    }

    const startX = Math.round(startRatio * w);
    const endX = Math.round(endRatio * w);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(startX, 0, 2, h);
    ctx.fillRect(Math.max(0, endX - 2), 0, 2, h);
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(Math.min(w - 2, Math.max(0, playheadX)), 0, 2, h);
  }, [audioBuffer, extractStart, extractEnd, gainPct, currentTime]);

  const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioBuffer || !waveformCanvasRef.current) return;
    const rect = waveformCanvasRef.current.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width)
    );
    const targetTime = ratio * audioBuffer.duration;
    setCurrentTime(targetTime);
    if (videoElRef.current) {
      videoElRef.current.currentTime = targetTime;
    }
  };

  const selectQueueItem = (idx: number) => {
    if (idx < 0 || idx >= files.length) return;
    setActiveIndex(idx);
    loadVideoForExtraction(files[idx]);
  };

  const removeQueueItem = (idx: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl("");
        setAudioBuffer(null);
        setActiveIndex(0);
      } else {
        const nextIdx = Math.min(activeIndex, next.length - 1);
        setActiveIndex(nextIdx);
        loadVideoForExtraction(next[nextIdx]);
      }
      return next;
    });
  };

  const extractSingleVideoAudio = async (
    targetFile: File,
    preDecodedBuffer: AudioBuffer | null,
    useRange: boolean
  ): Promise<BulkOutputItem> => {
    let srcBuffer = preDecodedBuffer;
    if (!srcBuffer) {
      const arrayBuf = await targetFile.arrayBuffer();
      const ctx = new AudioContext();
      try {
        srcBuffer = await ctx.decodeAudioData(arrayBuf.slice(0));
      } finally {
        await ctx.close().catch(() => {});
      }
    }

    const startSec = useRange
      ? Math.max(0, Math.min(extractStart, srcBuffer.duration - 0.05))
      : 0;
    const endSec = useRange
      ? Math.max(
          startSec + 0.05,
          Math.min(extractEnd || srcBuffer.duration, srcBuffer.duration)
        )
      : srcBuffer.duration;
    const clipDuration = endSec - startSec;
    const totalFrames = Math.max(1, Math.ceil(clipDuration * sampleRate));

    const offlineCtx = new OfflineAudioContext(
      channels,
      totalFrames,
      sampleRate
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = srcBuffer;

    const gainNode = offlineCtx.createGain();
    gainNode.gain.setValueAtTime(Math.max(0.05, gainPct / 100), 0);

    source.connect(gainNode);
    gainNode.connect(offlineCtx.destination);
    source.start(0, startSec, clipDuration);

    const rendered = await offlineCtx.startRendering();

    if (normalizePeak) {
      let peak = 0;
      for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        const chData = rendered.getChannelData(ch);
        for (let i = 0; i < chData.length; i++) {
          const abs = Math.abs(chData[i]);
          if (abs > peak) peak = abs;
        }
      }
      if (peak > 0.001) {
        const scale = 0.95 / peak;
        for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
          const chData = rendered.getChannelData(ch);
          for (let i = 0; i < chData.length; i++) {
            chData[i] *= scale;
          }
        }
      }
    }

    const fmtMeta =
      AUDIO_FORMAT_OPTIONS.find((f) => f.id === outputFormat) ||
      AUDIO_FORMAT_OPTIONS[0];
    let outBlob: Blob;
    let outExt = fmtMeta.ext;
    let outMime = fmtMeta.mime;

    if (outputFormat === "wav_16") {
      outBlob = encodeWavFromAudioBuffer(rendered, 16);
    } else if (outputFormat === "wav_24") {
      outBlob = encodeWavFromAudioBuffer(rendered, 24);
    } else if (outputFormat === "wav_8") {
      outBlob = encodeWavFromAudioBuffer(rendered, 8);
    } else {
      const encoded = await encodeCompressedAudioStream(
        rendered,
        fmtMeta.mime,
        bitrateKbps,
        setProgress
      );
      outBlob = encoded.blob;
      outMime = encoded.actualMime;
      if (outMime === "audio/wav") outExt = "wav";
      else if (outMime.includes("webm")) outExt = "webm";
      else if (outMime.includes("ogg")) outExt = "ogg";
      else if (outMime.includes("mp4")) outExt = "m4a";
    }

    const baseName = sanitizeFilename(
      targetFile.name.replace(/\.[^/.]+$/, "") || "video"
    );
    return {
      blob: outBlob,
      filename: `${baseName}_extracted.${outExt}`,
      size: outBlob.size,
      format: outMime,
      originalName: targetFile.name,
      originalSize: targetFile.size,
    };
  };

  const handleExtractAudio = async () => {
    if (files.length === 0 || !audioBuffer) return;
    if (videoElRef.current && !videoElRef.current.paused) {
      videoElRef.current.pause();
      setIsPlaying(false);
    }
    setIsProcessing(true);
    setProgress(15);

    try {
      const fmtMeta =
        AUDIO_FORMAT_OPTIONS.find((f) => f.id === outputFormat) ||
        AUDIO_FORMAT_OPTIONS[0];

      if (files.length === 1) {
        const item = await extractSingleVideoAudio(
          files[0],
          audioBuffer,
          true
        );
        setProgress(100);
        await saveFile("audio_extractor", {
          blob: item.blob,
          filename: item.filename,
          size: item.size,
          format: item.format,
          originalName: item.originalName,
          originalSize: item.originalSize,
          statusNote: `Extracted ${fmtMeta.label} • ${sampleRate} Hz`,
        });
      } else {
        const zip = new JSZip();
        const bulkItems: BulkOutputItem[] = [];
        for (let i = 0; i < files.length; i++) {
          setProgress(Math.round(((i + 0.3) / files.length) * 90));
          const item = await extractSingleVideoAudio(
            files[i],
            i === activeIndex ? audioBuffer : null,
            false
          );
          zip.file(item.filename, item.blob);
          bulkItems.push(item);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        setProgress(100);
        await saveFile("audio_extractor", {
          blob: zipBlob,
          filename: `extracted_${files.length}_audio_tracks.zip`,
          size: zipBlob.size,
          format: "application/zip",
          originalName: `${files.length} Video Files`,
          originalSize: files.reduce((acc, f) => acc + f.size, 0),
          statusNote: `Bulk Extracted ${files.length} Audio Tracks (${fmtMeta.label})`,
          bulkItems,
        });
      }

      showToast("Audio extracted from video successfully.", "success");
      onSuccess();
    } catch (err: any) {
      showToast(
        err?.message || "Failed to extract audio from video.",
        "error"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="audio-extractor-view"
      aria-labelledby="audio-extractor-heading"
    >
      {/* Header */}
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="audio-extractor-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            VIDEO AUDIO EXTRACTOR // AUDIO_EXTRACT.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Rip and extract lossless WAV, WebM Opus, OGG, or M4A audio tracks directly from single or bulk MP4, WebM, MOV, and MKV video files locally.
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.ogv,.m4v"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFilesSelected(Array.from(e.target.files));
          }
          e.target.value = "";
        }}
      />

      {files.length === 0 || !audioBuffer ? (
        <div
          id="audio-extractor-drag-drop"
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
            <ModuleIconBadge view="audio_extractor" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            {isLoading
              ? "DEMUXING AUDIO STREAM FROM VIDEO..."
              : "DRAG AND DROP SINGLE OR MULTIPLE VIDEOS TO EXTRACT AUDIO"}
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Supports bulk upload of MP4, WebM, MOV, MKV, and OGV video files. Extract full soundtracks or custom time segments.
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
          {/* Left Column: Bulk Queue, Video Preview, Demuxed Waveform & Segment Selector */}
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
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-[11px] font-mono font-bold text-amber-400 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ADD VIDEOS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (videoUrl) URL.revokeObjectURL(videoUrl);
                      setFiles([]);
                      setAudioBuffer(null);
                      setVideoUrl("");
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
                        ? "border-amber-400 bg-amber-500/10 text-white"
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
                    {activeFile ? formatBytes(activeFile.size) : ""} • Audio
                    Track: {audioBuffer.sampleRate} Hz (
                    {audioBuffer.numberOfChannels} ch) •{" "}
                    <span className="text-amber-400 font-bold">
                      {formatAudioDuration(currentTime)} /{" "}
                      {formatAudioDuration(audioBuffer.duration)}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const v = videoElRef.current;
                    if (!v) return;
                    if (v.paused) {
                      v.play();
                      setIsPlaying(true);
                    } else {
                      v.pause();
                      setIsPlaying(false);
                    }
                  }}
                  className="px-3 py-1.5 bg-white text-black hover:bg-zinc-200 rounded-lg font-mono text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer shrink-0"
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
              </div>

              <div className="bg-black rounded-lg border border-zinc-800 overflow-hidden flex items-center justify-center max-h-[260px]">
                <video
                  ref={videoElRef}
                  src={videoUrl}
                  controls
                  playsInline
                  onTimeUpdate={(e) =>
                    setCurrentTime(e.currentTarget.currentTime)
                  }
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  className="max-w-full max-h-[240px] w-auto h-auto"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-amber-400 uppercase font-bold">
                  <span>EXTRACTED AUDIO WAVEFORM (CLICK TO SEEK)</span>
                  <span>
                    {formatAudioDuration(extractStart)} —{" "}
                    {formatAudioDuration(extractEnd)}
                  </span>
                </div>
                <canvas
                  ref={waveformCanvasRef}
                  width={640}
                  height={96}
                  onClick={handleWaveformClick}
                  className="w-full h-24 rounded-lg border border-zinc-800 bg-black block cursor-pointer"
                />
              </div>

              {/* Segment Range & Volume Boost */}
              {files.length === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-800">
                  <div>
                    <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                      <span className="flex items-center gap-1 font-bold uppercase">
                        <Scissors className="w-3.5 h-3.5 text-amber-400" />
                        START TIME
                      </span>
                      <span>{formatAudioDuration(extractStart)}</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, extractEnd - 0.1)}
                      step={0.1}
                      value={extractStart}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setExtractStart(val);
                        if (videoElRef.current)
                          videoElRef.current.currentTime = val;
                      }}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                      <span className="flex items-center gap-1 font-bold uppercase">
                        <Scissors className="w-3.5 h-3.5 text-amber-400" />
                        END TIME
                      </span>
                      <span>{formatAudioDuration(extractEnd)}</span>
                    </label>
                    <input
                      type="range"
                      min={Math.min(audioBuffer.duration, extractStart + 0.1)}
                      max={Number(audioBuffer.duration.toFixed(2))}
                      step={0.1}
                      value={extractEnd}
                      onChange={(e) => setExtractEnd(Number(e.target.value))}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-800 items-center">
                <div>
                  <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                    <span className="flex items-center gap-1 font-bold uppercase">
                      <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                      EXTRACTION GAIN
                    </span>
                    <span>{gainPct}%</span>
                  </label>
                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={5}
                    value={gainPct}
                    onChange={(e) => setGainPct(Number(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer font-mono text-xs text-zinc-200 bg-black border border-zinc-800 p-3 rounded-lg">
                  <input
                    type="checkbox"
                    checked={normalizePeak}
                    onChange={(e) => setNormalizePeak(e.target.checked)}
                    className="accent-amber-400 w-4 h-4"
                  />
                  <div>
                    <strong className="uppercase block text-white">
                      AUTO PEAK NORMALIZE
                    </strong>
                    <span className="text-[10px] text-zinc-400">
                      Maximize quiet dialogue to -0.5 dB
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Right Column: Target Extracted Audio Format */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-5">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Sliders className="w-4 h-4 text-amber-400" />
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                  EXTRACTED AUDIO FORMAT
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {AUDIO_FORMAT_OPTIONS.map((fmt) => {
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
                    SAMPLE RATE
                  </label>
                  <select
                    value={sampleRate}
                    onChange={(e) =>
                      setSampleRate(Number(e.target.value) as SampleRateOption)
                    }
                    className="w-full p-2.5 bg-black border-2 border-zinc-800 text-white rounded-lg text-xs font-mono"
                  >
                    <option value={48000}>48,000 Hz (Video Native)</option>
                    <option value={44100}>44,100 Hz (CD)</option>
                    <option value={22050}>22,050 Hz (Voice)</option>
                    <option value={16000}>16,000 Hz (Speech)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-mono font-bold uppercase text-zinc-400 block mb-1.5">
                    CHANNELS
                  </label>
                  <select
                    value={channels}
                    onChange={(e) =>
                      setChannels(Number(e.target.value) as ChannelOption)
                    }
                    className="w-full p-2.5 bg-black border-2 border-zinc-800 text-white rounded-lg text-xs font-mono"
                  >
                    <option value={2}>Stereo (2.0)</option>
                    <option value={1}>Mono (1.0)</option>
                  </select>
                </div>
              </div>

              {!outputFormat.startsWith("wav_") && (
                <div className="pt-2 border-t border-zinc-800">
                  <label className="flex justify-between text-[11px] font-mono font-bold uppercase text-zinc-400 mb-1.5">
                    <span>TARGET BITRATE</span>
                    <span className="text-white">{bitrateKbps} KBPS</span>
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[64, 128, 192, 256].map((kbps) => (
                      <button
                        key={kbps}
                        type="button"
                        onClick={() => setBitrateKbps(kbps)}
                        className={`py-1.5 rounded border text-xs font-mono font-bold cursor-pointer ${
                          bitrateKbps === kbps
                            ? "bg-white text-black border-white"
                            : "bg-black text-zinc-300 border-zinc-800"
                        }`}
                      >
                        {kbps}k
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={isProcessing}
                onClick={handleExtractAudio}
                className="w-full py-3.5 px-4 bg-white text-black hover:bg-zinc-200 border-2 border-white rounded-lg font-mono text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0_0_#ffffff] disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>
                  {isProcessing
                    ? `EXTRACTING AUDIO (${progress}%)...`
                    : files.length > 1
                    ? `BULK EXTRACT ${files.length} AUDIO TRACKS`
                    : "EXTRACT AUDIO FROM VIDEO"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
