/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import JSZip from "jszip";
import {
  Sliders,
  Zap,
  Play,
  Pause,
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

interface AudioConverterViewProps {
  onSuccess: () => void;
  initialFile?: File | null;
  initialFiles?: File[] | null;
}

export type AudioOutputFormat =
  | "wav_16"
  | "wav_24"
  | "wav_8"
  | "webm_opus"
  | "ogg_opus"
  | "m4a_aac";
export type SampleRateOption = 48000 | 44100 | 22050 | 16000;
export type ChannelOption = 2 | 1;

export interface FormatOption {
  id: AudioOutputFormat;
  label: string;
  ext: string;
  mime: string;
  desc: string;
}

export const AUDIO_FORMAT_OPTIONS: FormatOption[] = [
  {
    id: "wav_16",
    label: "WAV 16-BIT PCM",
    ext: "wav",
    mime: "audio/wav",
    desc: "Studio-grade uncompressed CD quality (instant offline render).",
  },
  {
    id: "wav_24",
    label: "WAV 24-BIT HI-RES",
    ext: "wav",
    mime: "audio/wav",
    desc: "Mastering-grade 24-bit linear PCM audio (instant offline render).",
  },
  {
    id: "wav_8",
    label: "WAV 8-BIT COMPACT",
    ext: "wav",
    mime: "audio/wav",
    desc: "Ultra-small 8-bit PCM voice/retro waveform (50% smaller than 16-bit).",
  },
  {
    id: "webm_opus",
    label: "WEBM (OPUS)",
    ext: "webm",
    mime: "audio/webm",
    desc: "High-efficiency compressed web audio stream.",
  },
  {
    id: "ogg_opus",
    label: "OGG AUDIO",
    ext: "ogg",
    mime: "audio/ogg",
    desc: "Open container compressed audio for podcasts & games.",
  },
  {
    id: "m4a_aac",
    label: "M4A / MP4 AUDIO",
    ext: "m4a",
    mime: "audio/mp4",
    desc: "AAC/MP4 audio container for mobile & desktop players.",
  },
];

/**
 * Encode an AudioBuffer into a standard RIFF WAV Blob (8-bit, 16-bit, or 24-bit PCM).
 */
export function encodeWavFromAudioBuffer(
  buffer: AudioBuffer,
  bitDepth: 8 | 16 | 24 = 16
): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      if (bitDepth === 8) {
        const val = Math.round((sample + 1) * 127.5);
        view.setUint8(offset, Math.max(0, Math.min(255, val)));
        offset += 1;
      } else if (bitDepth === 16) {
        const val = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, Math.round(val), true);
        offset += 2;
      } else {
        const val = Math.round(
          sample < 0 ? sample * 0x800000 : sample * 0x7fffff
        );
        view.setUint8(offset, val & 0xff);
        view.setUint8(offset + 1, (val >> 8) & 0xff);
        view.setUint8(offset + 2, (val >> 16) & 0xff);
        offset += 3;
      }
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export async function encodeCompressedAudioStream(
  renderedBuffer: AudioBuffer,
  desiredMime: string,
  bitrateKbps: number,
  onProgress: (pct: number) => void
): Promise<{ blob: Blob; actualMime: string }> {
  const candidates = [
    desiredMime,
    `${desiredMime};codecs=opus`,
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  const supportedMime =
    typeof MediaRecorder !== "undefined"
      ? candidates.find((m) => MediaRecorder.isTypeSupported(m))
      : undefined;

  if (!supportedMime) {
    const wavBlob = encodeWavFromAudioBuffer(renderedBuffer, 16);
    onProgress(100);
    return { blob: wavBlob, actualMime: "audio/wav" };
  }

  const audioCtx = new AudioContext({ sampleRate: renderedBuffer.sampleRate });
  try {
    const dest = audioCtx.createMediaStreamDestination();
    const src = audioCtx.createBufferSource();
    src.buffer = renderedBuffer;
    src.connect(dest);

    const recorder = new MediaRecorder(dest.stream, {
      mimeType: supportedMime,
      audioBitsPerSecond: bitrateKbps * 1000,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const durationMs = Math.max(100, renderedBuffer.duration * 1000);
    const startTime = performance.now();
    const timer = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const pct = Math.min(95, Math.round((elapsed / durationMs) * 90) + 5);
      onProgress(pct);
    }, 120);

    const resultBlob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        clearInterval(timer);
        resolve(new Blob(chunks, { type: supportedMime.split(";")[0] }));
      };
      recorder.onerror = (err) => {
        clearInterval(timer);
        reject(err);
      };
      recorder.start(100);
      src.start(0);
      src.onended = () => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      };
    });

    onProgress(100);
    return { blob: resultBlob, actualMime: supportedMime.split(";")[0] };
  } finally {
    await audioCtx.close().catch(() => {});
  }
}

export function formatAudioDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00.0";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}

export default function AudioConverterView({
  onSuccess,
  initialFile,
  initialFiles,
}: AudioConverterViewProps) {
  const { registerDropHandler } = useFileDrop();
  const { showToast } = useToast();

  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [loopAudio, setLoopAudio] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);

  // Format conversion parameters
  const [outputFormat, setOutputFormat] = useState<AudioOutputFormat>("wav_16");
  const [sampleRate, setSampleRate] = useState<SampleRateOption>(44100);
  const [channels, setChannels] = useState<ChannelOption>(2);
  const [bitrateKbps, setBitrateKbps] = useState<number>(192);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioElRef = useRef<HTMLAudioElement>(null);

  const activeFile = files[activeIndex] || null;

  const decodeActiveAudioFile = useCallback(
    async (selected: File) => {
      setIsLoading(true);
      try {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        const url = URL.createObjectURL(selected);
        setAudioUrl(url);
        setCurrentTime(0);
        setIsPlaying(false);

        const arrayBuf = await selected.arrayBuffer();
        const ctx = new AudioContext();
        try {
          const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
          setAudioBuffer(decoded);
          setSampleRate(decoded.sampleRate === 48000 ? 48000 : 44100);
          setChannels(decoded.numberOfChannels >= 2 ? 2 : 1);
        } finally {
          await ctx.close().catch(() => {});
        }
      } catch {
        showToast(
          "Could not decode audio file. Please select a valid MP3, WAV, M4A, AAC, OGG, FLAC, or WebM audio file.",
          "error"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [audioUrl, showToast]
  );

  const handleFilesSelected = useCallback(
    (incoming: File[]) => {
      const valid = incoming.filter(
        (f) =>
          f.type.startsWith("audio/") ||
          /\.(mp3|wav|m4a|aac|ogg|flac|webm|opus)$/i.test(f.name)
      );
      if (valid.length === 0) {
        showToast(
          "Please select valid audio files (MP3, WAV, M4A, AAC, OGG, FLAC).",
          "error"
        );
        return;
      }
      setFiles((prev) => {
        const next = [...prev, ...valid];
        if (prev.length === 0 && next.length > 0) {
          setActiveIndex(0);
          decodeActiveAudioFile(next[0]);
        }
        return next;
      });
    },
    [decodeActiveAudioFile, showToast]
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
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Draw interactive waveform with live playhead cursor
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

    // Subtle center axis line
    ctx.fillStyle = "#27272a";
    ctx.fillRect(0, Math.floor(h / 2), w, 1);

    const data = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / w));
    const amp = h / 2;
    const playRatio =
      audioBuffer.duration > 0 ? currentTime / audioBuffer.duration : 0;
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
      ctx.fillStyle = x <= playheadX ? "#34d399" : "#10b981";
      const yTop = (1 + min) * amp;
      const yBottom = (1 + max) * amp;
      ctx.fillRect(x, Math.max(0, yTop), 1, Math.max(2, yBottom - yTop));
    }

    // Playhead cursor line
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(Math.min(w - 2, Math.max(0, playheadX)), 0, 2, h);
  }, [audioBuffer, currentTime]);

  const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioBuffer || !waveformCanvasRef.current) return;
    const rect = waveformCanvasRef.current.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width)
    );
    const targetTime = ratio * audioBuffer.duration;
    setCurrentTime(targetTime);
    if (audioElRef.current) {
      audioElRef.current.currentTime = targetTime;
    }
  };

  const togglePlay = () => {
    const a = audioElRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setIsPlaying(true);
    } else {
      a.pause();
      setIsPlaying(false);
    }
  };

  const selectQueueItem = (idx: number) => {
    if (idx < 0 || idx >= files.length) return;
    setActiveIndex(idx);
    decodeActiveAudioFile(files[idx]);
  };

  const removeQueueItem = (idx: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl("");
        setAudioBuffer(null);
        setActiveIndex(0);
      } else {
        const nextIdx = Math.min(activeIndex, next.length - 1);
        setActiveIndex(nextIdx);
        decodeActiveAudioFile(next[nextIdx]);
      }
      return next;
    });
  };

  const convertSingleAudioFile = async (
    targetFile: File,
    preDecodedBuffer?: AudioBuffer | null
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

    const totalFrames = Math.max(
      1,
      Math.ceil(srcBuffer.duration * sampleRate)
    );
    const offlineCtx = new OfflineAudioContext(
      channels,
      totalFrames,
      sampleRate
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = srcBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();
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
      targetFile.name.replace(/\.[^/.]+$/, "") || "audio"
    );
    return {
      blob: outBlob,
      filename: `${baseName}_converted.${outExt}`,
      size: outBlob.size,
      format: outMime,
      originalName: targetFile.name,
      originalSize: targetFile.size,
    };
  };

  const handleConvertAudio = async () => {
    if (files.length === 0 || !audioBuffer) return;
    if (audioElRef.current && !audioElRef.current.paused) {
      audioElRef.current.pause();
      setIsPlaying(false);
    }
    setIsProcessing(true);
    setProgress(15);

    try {
      const fmtMeta =
        AUDIO_FORMAT_OPTIONS.find((f) => f.id === outputFormat) ||
        AUDIO_FORMAT_OPTIONS[0];

      if (files.length === 1) {
        const item = await convertSingleAudioFile(files[0], audioBuffer);
        setProgress(100);
        await saveFile("audio_converter", {
          blob: item.blob,
          filename: item.filename,
          size: item.size,
          format: item.format,
          originalName: item.originalName,
          originalSize: item.originalSize,
          statusNote: `${fmtMeta.label} • ${sampleRate} Hz • ${
            channels === 2 ? "Stereo" : "Mono"
          } • ${formatAudioDuration(audioBuffer.duration)}`,
        });
      } else {
        const zip = new JSZip();
        const bulkItems: BulkOutputItem[] = [];
        for (let i = 0; i < files.length; i++) {
          setProgress(Math.round(((i + 0.3) / files.length) * 90));
          const item = await convertSingleAudioFile(
            files[i],
            i === activeIndex ? audioBuffer : null
          );
          zip.file(item.filename, item.blob);
          bulkItems.push(item);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        setProgress(100);
        await saveFile("audio_converter", {
          blob: zipBlob,
          filename: `converted_${files.length}_audio_files.zip`,
          size: zipBlob.size,
          format: "application/zip",
          originalName: `${files.length} Audio Files`,
          originalSize: files.reduce((acc, f) => acc + f.size, 0),
          statusNote: `Bulk Converted ${files.length} Audio Files to ${fmtMeta.label}`,
          bulkItems,
        });
      }

      onSuccess();
    } catch (err: any) {
      showToast(err?.message || "Audio conversion failed.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="audio-converter-view"
      aria-labelledby="audio-converter-heading"
    >
      {/* Header */}
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="audio-converter-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            AUDIO FORMAT CONVERTER // AUDIO_CONV.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Transcode single or bulk audio files between WAV (16/24/8-bit), WebM Opus, OGG, and M4A with custom sample rate and channel configuration.
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm"
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
          id="audio-converter-drag-drop"
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
            <ModuleIconBadge view="audio_converter" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            {isLoading
              ? "DECODING AUDIO STREAM IN MEMORY..."
              : "DRAG AND DROP SINGLE OR MULTIPLE AUDIO FILES (.MP3, .WAV, .M4A, .OGG, .FLAC)"}
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Supports bulk upload. Convert between uncompressed PCM WAV, WebM Opus, OGG, and M4A formats locally.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
          >
            SELECT_AUDIO_FILES
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Bulk Queue & Interactive Waveform Monitor */}
          <div className="lg:col-span-7 space-y-5">
            {/* Queue Strip */}
            <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold uppercase text-zinc-300">
                  AUDIO QUEUE ({files.length}{" "}
                  {files.length === 1 ? "FILE" : "FILES"})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-[11px] font-mono font-bold text-emerald-400 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ADD AUDIO</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (audioUrl) URL.revokeObjectURL(audioUrl);
                      setFiles([]);
                      setAudioBuffer(null);
                      setAudioUrl("");
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
                        ? "border-emerald-400 bg-emerald-500/10 text-white"
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
                    {activeFile ? formatBytes(activeFile.size) : ""} •{" "}
                    {audioBuffer.sampleRate} Hz •{" "}
                    {audioBuffer.numberOfChannels} ch •{" "}
                    <span className="text-emerald-400 font-bold">
                      {formatAudioDuration(currentTime)} /{" "}
                      {formatAudioDuration(audioBuffer.duration)}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
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
                    onClick={() => setLoopAudio((v) => !v)}
                    className={`px-2.5 py-1.5 rounded-lg border font-mono text-xs flex items-center gap-1 cursor-pointer ${
                      loopAudio
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                        : "border-zinc-800 bg-zinc-900 text-zinc-500"
                    }`}
                  >
                    <Repeat className="w-3.5 h-3.5" />
                    <span>LOOP</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-mono text-zinc-500 uppercase">
                  <span>CLICK WAVEFORM TO SEEK PLAYHEAD</span>
                  <span>
                    {formatAudioDuration(currentTime)} /{" "}
                    {formatAudioDuration(audioBuffer.duration)}
                  </span>
                </div>
                <canvas
                  ref={waveformCanvasRef}
                  width={640}
                  height={120}
                  onClick={handleWaveformClick}
                  className="w-full h-28 rounded-lg border border-zinc-800 bg-black block cursor-pointer"
                />
                <audio
                  ref={audioElRef}
                  src={audioUrl}
                  loop={loopAudio}
                  onTimeUpdate={(e) =>
                    setCurrentTime(e.currentTarget.currentTime)
                  }
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  controls
                  className="w-full h-10"
                />
              </div>

              <div className="bg-black border border-zinc-800 rounded-lg p-3.5 font-mono text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-400">SOURCE_SAMPLE_RATE:</span>
                  <strong className="text-white">
                    {audioBuffer.sampleRate} Hz
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">SOURCE_CHANNELS:</span>
                  <strong className="text-emerald-400">
                    {audioBuffer.numberOfChannels === 1
                      ? "Mono (1.0)"
                      : "Stereo (2.0)"}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">DURATION:</span>
                  <strong className="text-sky-400">
                    {formatAudioDuration(audioBuffer.duration)}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Target Format, Sample Rate & Channels */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-5">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                  TARGET AUDIO FORMAT &amp; CODEC
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

              {/* Sample Rate & Channels */}
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
                    <option value={48000}>48,000 Hz (Studio)</option>
                    <option value={44100}>44,100 Hz (CD)</option>
                    <option value={22050}>22,050 Hz (Voice)</option>
                    <option value={16000}>16,000 Hz (Compact)</option>
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
                onClick={handleConvertAudio}
                className="w-full py-3.5 px-4 bg-white text-black hover:bg-zinc-200 border-2 border-white rounded-lg font-mono text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0_0_#ffffff] disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>
                  {isProcessing
                    ? `CONVERTING AUDIO (${progress}%)...`
                    : files.length > 1
                    ? `BULK CONVERT ${files.length} AUDIO FILES`
                    : "CONVERT AUDIO FORMAT"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
