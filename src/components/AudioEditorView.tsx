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
  Volume2,
  Play,
  Square,
  RefreshCw,
} from "lucide-react";
import { saveFile } from "../utils/db";
import { formatBytes } from "../utils/imageProcessor";
import { sanitizeFilename } from "../utils/sanitizer";
import { useFileDrop } from "../context/FileDropContext";
import { useToast } from "../context/ToastContext";
import ModuleIconBadge from "./ModuleIconBadge";
import {
  AUDIO_FORMAT_OPTIONS,
  AudioOutputFormat,
  encodeWavFromAudioBuffer,
  encodeCompressedAudioStream,
  formatAudioDuration,
} from "./AudioConverterView";

interface AudioEditorViewProps {
  onSuccess: () => void;
  initialFile?: File | null;
}

/**
 * Render edited AudioBuffer with Trim, Speed, Reverse, 3-Band EQ (Bass/Mid/Treble), Gain, Fade In/Out, and Normalization.
 */
async function renderEditedAudioBuffer(
  sourceBuffer: AudioBuffer,
  trimStart: number,
  trimEnd: number,
  playbackRate: number,
  gainPct: number,
  fadeInSec: number,
  fadeOutSec: number,
  bassDb: number,
  midDb: number,
  trebleDb: number,
  reverseAudio: boolean,
  normalizePeak: boolean
): Promise<AudioBuffer> {
  const startSec = Math.max(0, Math.min(trimStart, sourceBuffer.duration - 0.05));
  const endSec = Math.max(startSec + 0.05, Math.min(trimEnd, sourceBuffer.duration));
  const rawClipDuration = endSec - startSec;
  const speed = Math.max(0.5, Math.min(2.0, playbackRate));
  const outDuration = rawClipDuration / speed;

  const sampleRate = sourceBuffer.sampleRate;
  const numChannels = sourceBuffer.numberOfChannels;
  const startSample = Math.floor(startSec * sampleRate);
  const endSample = Math.min(sourceBuffer.length, Math.ceil(endSec * sampleRate));
  const sliceLen = Math.max(1, endSample - startSample);

  // Create sliced (and optionally reversed) source buffer
  const slicedCtx = new OfflineAudioContext(numChannels, sliceLen, sampleRate);
  const workingBuf = slicedCtx.createBuffer(numChannels, sliceLen, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    const srcData = sourceBuffer.getChannelData(ch);
    const dstData = workingBuf.getChannelData(ch);
    if (reverseAudio) {
      for (let i = 0; i < sliceLen; i++) {
        dstData[i] = srcData[endSample - 1 - i];
      }
    } else {
      for (let i = 0; i < sliceLen; i++) {
        dstData[i] = srcData[startSample + i];
      }
    }
  }

  const totalOutFrames = Math.max(1, Math.ceil(outDuration * sampleRate));
  const offlineCtx = new OfflineAudioContext(numChannels, totalOutFrames, sampleRate);

  const source = offlineCtx.createBufferSource();
  source.buffer = workingBuf;
  source.playbackRate.setValueAtTime(speed, 0);

  // 3-Band EQ: LowShelf (100Hz), Peaking (1000Hz), HighShelf (8000Hz)
  const bassFilter = offlineCtx.createBiquadFilter();
  bassFilter.type = "lowshelf";
  bassFilter.frequency.setValueAtTime(100, 0);
  bassFilter.gain.setValueAtTime(bassDb, 0);

  const midFilter = offlineCtx.createBiquadFilter();
  midFilter.type = "peaking";
  midFilter.frequency.setValueAtTime(1000, 0);
  midFilter.Q.setValueAtTime(1.0, 0);
  midFilter.gain.setValueAtTime(midDb, 0);

  const trebleFilter = offlineCtx.createBiquadFilter();
  trebleFilter.type = "highshelf";
  trebleFilter.frequency.setValueAtTime(8000, 0);
  trebleFilter.gain.setValueAtTime(trebleDb, 0);

  const gainNode = offlineCtx.createGain();
  const linearGain = Math.max(0.05, gainPct / 100);

  if (fadeInSec > 0 && fadeInSec < outDuration) {
    gainNode.gain.setValueAtTime(0.0001, 0);
    gainNode.gain.linearRampToValueAtTime(linearGain, fadeInSec);
  } else {
    gainNode.gain.setValueAtTime(linearGain, 0);
  }

  if (fadeOutSec > 0 && fadeOutSec < outDuration) {
    const fadeOutStart = Math.max(0, outDuration - fadeOutSec);
    gainNode.gain.setValueAtTime(linearGain, fadeOutStart);
    gainNode.gain.linearRampToValueAtTime(0.0001, outDuration);
  }

  source.connect(bassFilter);
  bassFilter.connect(midFilter);
  midFilter.connect(trebleFilter);
  trebleFilter.connect(gainNode);
  gainNode.connect(offlineCtx.destination);
  source.start(0);

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
      const scale = 0.96 / peak;
      for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        const chData = rendered.getChannelData(ch);
        for (let i = 0; i < chData.length; i++) {
          chData[i] *= scale;
        }
      }
    }
  }

  return rendered;
}

export default function AudioEditorView({
  onSuccess,
  initialFile,
}: AudioEditorViewProps) {
  const { registerDropHandler } = useFileDrop();
  const { showToast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);

  // Studio Editor Parameters
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [gainPct, setGainPct] = useState<number>(100);
  const [fadeInSec, setFadeInSec] = useState<number>(0);
  const [fadeOutSec, setFadeOutSec] = useState<number>(0);
  const [bassDb, setBassDb] = useState<number>(0);
  const [midDb, setMidDb] = useState<number>(0);
  const [trebleDb, setTrebleDb] = useState<number>(0);
  const [reverseAudio, setReverseAudio] = useState<boolean>(false);
  const [normalizePeak, setNormalizePeak] = useState<boolean>(false);
  const [outputFormat, setOutputFormat] = useState<AudioOutputFormat>("wav_16");

  // Live Web Audio Preview state
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const [previewProgressRatio, setPreviewProgressRatio] = useState<number>(0);
  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const previewRafRef = useRef<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);

  const stopLivePreview = useCallback(() => {
    if (previewRafRef.current) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = 0;
    }
    if (previewSrcRef.current) {
      try {
        previewSrcRef.current.stop();
      } catch {}
      previewSrcRef.current = null;
    }
    if (previewCtxRef.current) {
      previewCtxRef.current.close().catch(() => {});
      previewCtxRef.current = null;
    }
    setIsPreviewPlaying(false);
    setPreviewProgressRatio(0);
  }, []);

  useEffect(() => {
    return () => stopLivePreview();
  }, [stopLivePreview]);

  const loadAudioFile = useCallback(
    async (selected: File) => {
      stopLivePreview();
      setIsLoading(true);
      try {
        setFile(selected);
        const arrayBuf = await selected.arrayBuffer();
        const ctx = new AudioContext();
        try {
          const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
          setAudioBuffer(decoded);
          setTrimStart(0);
          setTrimEnd(Number(decoded.duration.toFixed(2)));
        } finally {
          await ctx.close().catch(() => {});
        }
      } catch {
        showToast(
          "Could not decode audio file. Please select a valid MP3, WAV, M4A, AAC, OGG, or FLAC file.",
          "error"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [stopLivePreview, showToast]
  );

  useEffect(() => {
    if (initialFile && !file) {
      loadAudioFile(initialFile);
    }
  }, [initialFile, file, loadAudioFile]);

  useEffect(() => {
    return registerDropHandler((droppedFiles) => {
      if (droppedFiles.length > 0) {
        loadAudioFile(droppedFiles[0]);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, loadAudioFile]);

  // Draw interactive waveform with trim, fade envelopes, gain preview, and live playhead
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
    const totalSamples = data.length;
    const step = Math.max(1, Math.floor(totalSamples / w));
    const amp = h / 2;

    const startRatio = trimStart / Math.max(0.01, audioBuffer.duration);
    const endRatio = trimEnd / Math.max(0.01, audioBuffer.duration);

    for (let x = 0; x < w; x++) {
      const sampleX = reverseAudio ? w - 1 - x : x;
      let min = 1.0;
      let max = -1.0;
      const startIdx = sampleX * step;
      for (let j = 0; j < step && startIdx + j < totalSamples; j++) {
        const datum = data[startIdx + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const posRatio = x / w;
      const inTrim = posRatio >= startRatio && posRatio <= endRatio;
      ctx.fillStyle = inTrim ? "#a855f7" : "#3f3f46";
      const yTop = (1 + min * (gainPct / 100)) * amp;
      const yBottom = (1 + max * (gainPct / 100)) * amp;
      ctx.fillRect(x, Math.max(0, yTop), 1, Math.max(2, yBottom - yTop));
    }

    const startX = Math.round(startRatio * w);
    const endX = Math.round(endRatio * w);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(startX, 0, 2, h);
    ctx.fillRect(Math.max(0, endX - 2), 0, 2, h);

    if (isPreviewPlaying) {
      const activeSpan = Math.max(1, endX - startX);
      const cursorX = Math.round(startX + previewProgressRatio * activeSpan);
      ctx.fillStyle = "#34d399";
      ctx.fillRect(Math.min(w - 2, Math.max(0, cursorX)), 0, 2, h);
    }
  }, [
    audioBuffer,
    trimStart,
    trimEnd,
    gainPct,
    reverseAudio,
    isPreviewPlaying,
    previewProgressRatio,
  ]);

  const handleToggleLivePreview = async () => {
    if (isPreviewPlaying) {
      stopLivePreview();
      return;
    }
    if (!audioBuffer) return;

    try {
      const edited = await renderEditedAudioBuffer(
        audioBuffer,
        trimStart,
        trimEnd,
        playbackRate,
        gainPct,
        fadeInSec,
        fadeOutSec,
        bassDb,
        midDb,
        trebleDb,
        reverseAudio,
        normalizePeak
      );
      const ctx = new AudioContext();
      const src = ctx.createBufferSource();
      src.buffer = edited;
      src.connect(ctx.destination);
      const startedAt = ctx.currentTime;
      const totalDur = Math.max(0.05, edited.duration);

      const updatePlayhead = () => {
        if (!previewCtxRef.current) return;
        const elapsed = previewCtxRef.current.currentTime - startedAt;
        const ratio = Math.min(1, Math.max(0, elapsed / totalDur));
        setPreviewProgressRatio(ratio);
        if (ratio < 1) {
          previewRafRef.current = requestAnimationFrame(updatePlayhead);
        }
      };

      src.onended = () => {
        if (previewRafRef.current) {
          cancelAnimationFrame(previewRafRef.current);
          previewRafRef.current = 0;
        }
        setIsPreviewPlaying(false);
        setPreviewProgressRatio(0);
      };
      previewCtxRef.current = ctx;
      previewSrcRef.current = src;
      setIsPreviewPlaying(true);
      src.start(0);
      previewRafRef.current = requestAnimationFrame(updatePlayhead);
    } catch {
      showToast("Failed to play preview.", "error");
    }
  };

  const handleResetEdits = () => {
    if (!audioBuffer) return;
    stopLivePreview();
    setTrimStart(0);
    setTrimEnd(Number(audioBuffer.duration.toFixed(2)));
    setPlaybackRate(1.0);
    setGainPct(100);
    setFadeInSec(0);
    setFadeOutSec(0);
    setBassDb(0);
    setMidDb(0);
    setTrebleDb(0);
    setReverseAudio(false);
    setNormalizePeak(false);
  };

  const handleExportEditedAudio = async () => {
    if (!file || !audioBuffer) return;
    stopLivePreview();
    setIsProcessing(true);
    setProgress(15);

    try {
      const rendered = await renderEditedAudioBuffer(
        audioBuffer,
        trimStart,
        trimEnd,
        playbackRate,
        gainPct,
        fadeInSec,
        fadeOutSec,
        bassDb,
        midDb,
        trebleDb,
        reverseAudio,
        normalizePeak
      );
      setProgress(65);

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
          192,
          setProgress
        );
        outBlob = encoded.blob;
        outMime = encoded.actualMime;
        if (outMime === "audio/wav") outExt = "wav";
        else if (outMime.includes("webm")) outExt = "webm";
        else if (outMime.includes("ogg")) outExt = "ogg";
        else if (outMime.includes("mp4")) outExt = "m4a";
      }

      setProgress(100);
      const baseName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, "") || "audio");

      await saveFile("audio_editor", {
        blob: outBlob,
        filename: `${baseName}_edited.${outExt}`,
        size: outBlob.size,
        format: outMime,
        originalName: file.name,
        originalSize: file.size,
        statusNote: `Edited ${fmtMeta.label} • ${playbackRate}x Speed • ${formatAudioDuration(
          rendered.duration
        )}`,
      });

      showToast("Edited audio exported successfully.", "success");
      onSuccess();
    } catch (err: any) {
      showToast(err?.message || "Failed to export edited audio.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="audio-editor-view"
      aria-labelledby="audio-editor-heading"
    >
      {/* Header */}
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="audio-editor-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            AUDIO EDITOR STUDIO // AUDIO_EDIT.PRG
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Trim waveforms, adjust speed/tempo, shape 3-band EQ (Bass/Mid/Treble), apply fades, reverse, and normalize audio locally.
          </p>
        </div>
      </div>

      {!file || !audioBuffer ? (
        <div
          id="audio-editor-drag-drop"
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
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadAudioFile(f);
            }}
          />
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="audio_editor" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            {isLoading
              ? "LOADING WAVEFORM INTO AUDIO STUDIO..."
              : "DRAG AND DROP OR BROWSE AUDIO FILE TO EDIT"}
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Trim, boost volume, equalize Bass/Mid/Treble, change playback speed, fade in/out, or reverse audio in 100% local memory.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
          >
            SELECT_AUDIO_FILE
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Waveform Trimmer, Live Preview & Fades */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div className="min-w-0">
                  <p className="text-xs font-mono font-bold text-white truncate">
                    {file.name}
                  </p>
                  <p className="text-[11px] font-mono text-zinc-400">
                    {formatBytes(file.size)} • {audioBuffer.sampleRate} Hz •{" "}
                    {formatAudioDuration(audioBuffer.duration)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleToggleLivePreview}
                    className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer border ${
                      isPreviewPlaying
                        ? "bg-amber-400 text-black border-amber-300"
                        : "bg-white text-black border-white"
                    }`}
                  >
                    {isPreviewPlaying ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>STOP PREVIEW</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>PREVIEW EDITS</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetEdits}
                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg font-mono text-xs font-bold uppercase flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>RESET</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopLivePreview();
                      setFile(null);
                      setAudioBuffer(null);
                    }}
                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg font-mono text-xs font-bold uppercase flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>CHANGE</span>
                  </button>
                </div>
              </div>

              <canvas
                ref={waveformCanvasRef}
                width={640}
                height={130}
                className="w-full h-32 rounded-lg border border-zinc-800 bg-black block"
              />

              {/* Trim Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-800">
                <div>
                  <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                    <span className="flex items-center gap-1 font-bold uppercase">
                      <Scissors className="w-3.5 h-3.5 text-purple-400" />
                      TRIM START
                    </span>
                    <span>{formatAudioDuration(trimStart)}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, trimEnd - 0.1)}
                    step={0.1}
                    value={trimStart}
                    onChange={(e) => setTrimStart(Number(e.target.value))}
                    className="w-full accent-purple-400 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                    <span className="flex items-center gap-1 font-bold uppercase">
                      <Scissors className="w-3.5 h-3.5 text-purple-400" />
                      TRIM END
                    </span>
                    <span>{formatAudioDuration(trimEnd)}</span>
                  </label>
                  <input
                    type="range"
                    min={Math.min(audioBuffer.duration, trimStart + 0.1)}
                    max={Number(audioBuffer.duration.toFixed(2))}
                    step={0.1}
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(Number(e.target.value))}
                    className="w-full accent-purple-400 cursor-pointer"
                  />
                </div>
              </div>

              {/* Gain & Fades */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-zinc-800">
                <div>
                  <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                    <span className="flex items-center gap-1 font-bold uppercase">
                      <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                      MASTER GAIN
                    </span>
                    <span>{gainPct}%</span>
                  </label>
                  <input
                    type="range"
                    min={25}
                    max={250}
                    step={5}
                    value={gainPct}
                    onChange={(e) => setGainPct(Number(e.target.value))}
                    className="w-full accent-purple-400 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                    <span className="font-bold uppercase">FADE IN</span>
                    <span>{fadeInSec}s</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={15}
                    step={0.5}
                    value={fadeInSec}
                    onChange={(e) => setFadeInSec(Number(e.target.value))}
                    className="w-full accent-purple-400 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                    <span className="font-bold uppercase">FADE OUT</span>
                    <span>{fadeOutSec}s</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={15}
                    step={0.5}
                    value={fadeOutSec}
                    onChange={(e) => setFadeOutSec(Number(e.target.value))}
                    className="w-full accent-purple-400 cursor-pointer"
                  />
                </div>
              </div>

              {/* Speed / Tempo Presets */}
              <div className="pt-2 border-t border-zinc-800">
                <label className="flex justify-between text-xs font-mono text-zinc-300 mb-2">
                  <span className="font-bold uppercase">PLAYBACK SPEED / TEMPO</span>
                  <span className="text-white font-bold">{playbackRate}x</span>
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setPlaybackRate(spd)}
                      className={`py-1.5 rounded border text-xs font-mono font-bold cursor-pointer ${
                        playbackRate === spd
                          ? "bg-white text-black border-white"
                          : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: 3-Band EQ, Reverse, Normalize & Export */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-5">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Sliders className="w-4 h-4 text-purple-400" />
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                  3-BAND EQUALIZER &amp; MASTERING
                </h2>
              </div>

              {/* 3-Band EQ Sliders */}
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                    <span className="font-bold uppercase">BASS / LOW (100 HZ)</span>
                    <span className="text-white font-bold">
                      {bassDb > 0 ? `+${bassDb}` : bassDb} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={bassDb}
                    onChange={(e) => setBassDb(Number(e.target.value))}
                    className="w-full accent-purple-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                    <span className="font-bold uppercase">MID / VOCAL (1 KHZ)</span>
                    <span className="text-white font-bold">
                      {midDb > 0 ? `+${midDb}` : midDb} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={midDb}
                    onChange={(e) => setMidDb(Number(e.target.value))}
                    className="w-full accent-purple-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono text-zinc-300 mb-1">
                    <span className="font-bold uppercase">TREBLE / AIR (8 KHZ)</span>
                    <span className="text-white font-bold">
                      {trebleDb > 0 ? `+${trebleDb}` : trebleDb} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={trebleDb}
                    onChange={(e) => setTrebleDb(Number(e.target.value))}
                    className="w-full accent-purple-400 cursor-pointer"
                  />
                </div>
              </div>

              {/* Mastering Effects Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-zinc-800">
                <label className="flex items-center gap-2.5 cursor-pointer font-mono text-xs text-zinc-200 bg-black border border-zinc-800 p-3 rounded-lg">
                  <input
                    type="checkbox"
                    checked={reverseAudio}
                    onChange={(e) => setReverseAudio(e.target.checked)}
                    className="accent-purple-400 w-4 h-4"
                  />
                  <div>
                    <strong className="uppercase block text-white">REVERSE AUDIO</strong>
                    <span className="text-[10px] text-zinc-400">Play clip backwards</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer font-mono text-xs text-zinc-200 bg-black border border-zinc-800 p-3 rounded-lg">
                  <input
                    type="checkbox"
                    checked={normalizePeak}
                    onChange={(e) => setNormalizePeak(e.target.checked)}
                    className="accent-purple-400 w-4 h-4"
                  />
                  <div>
                    <strong className="uppercase block text-white">PEAK NORMALIZE</strong>
                    <span className="text-[10px] text-zinc-400">Maximize loudness</span>
                  </div>
                </label>
              </div>

              {/* Export Format Selector */}
              <div className="pt-2 border-t border-zinc-800">
                <label className="text-[11px] font-mono font-bold uppercase text-zinc-400 block mb-1.5">
                  EXPORT AUDIO FORMAT
                </label>
                <select
                  value={outputFormat}
                  onChange={(e) =>
                    setOutputFormat(e.target.value as AudioOutputFormat)
                  }
                  className="w-full p-2.5 bg-black border-2 border-zinc-800 text-white rounded-lg text-xs font-mono"
                >
                  {AUDIO_FORMAT_OPTIONS.map((fmt) => (
                    <option key={fmt.id} value={fmt.id}>
                      {fmt.label} (.{fmt.ext.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                disabled={isProcessing}
                onClick={handleExportEditedAudio}
                className="w-full py-3.5 px-4 bg-white text-black hover:bg-zinc-200 border-2 border-white rounded-lg font-mono text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0_0_#ffffff] disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>
                  {isProcessing
                    ? `RENDERING EDITED AUDIO (${progress}%)...`
                    : "EXPORT EDITED AUDIO"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
