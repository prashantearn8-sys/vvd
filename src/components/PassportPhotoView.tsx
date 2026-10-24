/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload,
  RefreshCw,
  Check,
  Sliders,
  Eye,
  Trash2,
  ZoomIn,
  ZoomOut,
  Move,
  UserCheck,
  Grid,
  Eraser,
  Paintbrush,
  RotateCcw,
  Zap,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { sanitizeFilename } from "../utils/sanitizer";
import ModuleIconBadge from "./ModuleIconBadge";

interface PassportPhotoViewProps {
  initialFile?: File | null;
  onSuccess?: () => void;
}

type PassportSizeId = "2x2_in" | "35x45_mm" | "33x48_mm" | "50x70_mm";

interface PassportSizePreset {
  id: PassportSizeId;
  label: string;
  region: string;
  widthPx: number;
  heightPx: number;
  aspectDesc: string;
}

const PASSPORT_SIZES: PassportSizePreset[] = [
  {
    id: "2x2_in",
    label: "2×2 INCH (51×51mm)",
    region: "US / INDIA / GLOBAL",
    widthPx: 600,
    heightPx: 600,
    aspectDesc: "1:1 Square (600×600px @ 300 DPI)",
  },
  {
    id: "35x45_mm",
    label: "35×45 MM",
    region: "UK / EU / SCHENGEN / AU",
    widthPx: 413,
    heightPx: 531,
    aspectDesc: "7:9 Portrait (413×531px @ 300 DPI)",
  },
  {
    id: "33x48_mm",
    label: "33×48 MM",
    region: "CHINA / ASIA VISA",
    widthPx: 390,
    heightPx: 567,
    aspectDesc: "11:16 Portrait (390×567px @ 300 DPI)",
  },
  {
    id: "50x70_mm",
    label: "50×70 MM",
    region: "CANADA PASSPORT",
    widthPx: 591,
    heightPx: 827,
    aspectDesc: "5:7 Portrait (591×827px @ 300 DPI)",
  },
];

interface BgPreset {
  id: string;
  label: string;
  hex: string;
}

const BG_PRESETS: BgPreset[] = [
  { id: "white", label: "WHITE (DEFAULT)", hex: "#FFFFFF" },
  { id: "off_white", label: "CREAM WHITE", hex: "#F5F5F0" },
  { id: "light_blue", label: "PASSPORT BLUE", hex: "#D0E4F7" },
  { id: "sky_blue", label: "ROYAL BLUE", hex: "#3B82F6" },
  { id: "light_gray", label: "BIOMETRIC GRAY", hex: "#E5E7EB" },
  { id: "red", label: "OFFICIAL RED", hex: "#C8102E" },
];

type InteractionTarget = "portrait" | "erase" | "restore";

export default function PassportPhotoView({
  initialFile,
  onSuccess,
}: PassportPhotoViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);

  // Passport size & Background state (Default background is solid White #FFFFFF)
  const [sizeId, setSizeId] = useState<PassportSizeId>("2x2_in");
  const [bgColor, setBgColor] = useState<string>("#FFFFFF");
  const [autoRemoveBg, setAutoRemoveBg] = useState<boolean>(true);
  const [tolerance, setTolerance] = useState<number>(36);
  const [edgeFeather, setEdgeFeather] = useState<number>(2);

  // Portrait transform state
  const [portraitScale, setPortraitScale] = useState<number>(1.0);
  const [portraitOffsetX, setPortraitOffsetX] = useState<number>(0);
  const [portraitOffsetY, setPortraitOffsetY] = useState<number>(0);

  // Canvas interaction mode
  const [interactionTarget, setInteractionTarget] =
    useState<InteractionTarget>("portrait");
  const [brushSize, setBrushSize] = useState<number>(22);
  const [showBiometricGuide, setShowBiometricGuide] = useState<boolean>(false);
  const [holdingCompare, setHoldingCompare] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Internal offscreen buffers for background removal & manual touch-up mask
  const sourceRgbaRef = useRef<Uint8ClampedArray | null>(null);
  const computedAlphaRef = useRef<Uint8Array | null>(null);
  const userMaskRef = useRef<Uint8Array | null>(null); // 0=none, 1=force erase, 2=force restore
  const segmentedSubjectCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Dragging / Painting pointer refs
  const isPointerDownRef = useRef<boolean>(false);
  const pointerMovedRef = useRef<boolean>(false);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    initX: number;
    initY: number;
  }>({
    x: 0,
    y: 0,
    initX: 0,
    initY: 0,
  });

  const activeSize =
    PASSPORT_SIZES.find((s) => s.id === sizeId) || PASSPORT_SIZES[0];

  // Load initial file from global drop or navigation
  useEffect(() => {
    if (initialFile && initialFile.type.startsWith("image/")) {
      handleFileLoad(initialFile);
    }
  }, [initialFile]);

  useEffect(() => {
    return registerDropHandler((files: File[]) => {
      if (files.length > 0) {
        handleFileLoad(files[0]);
      }
    });
  }, [registerDropHandler]);

  const handleFileLoad = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg(
        "UNSUPPORTED_FILE: Please upload a JPG, PNG, or WEBP portrait photo."
      );
      return;
    }
    setErrorMsg(null);
    setSelectedFile(file);

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1400;
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const offCanvas = document.createElement("canvas");
      offCanvas.width = w;
      offCanvas.height = h;
      const offCtx = offCanvas.getContext("2d");
      if (offCtx) {
        offCtx.drawImage(img, 0, 0, w, h);
        const imgData = offCtx.getImageData(0, 0, w, h);
        sourceRgbaRef.current = new Uint8ClampedArray(imgData.data);
        computedAlphaRef.current = new Uint8Array(w * h);
        userMaskRef.current = new Uint8Array(w * h);
      }

      const segCanvas = document.createElement("canvas");
      segCanvas.width = w;
      segCanvas.height = h;
      segmentedSubjectCanvasRef.current = segCanvas;

      // Reset alignments for new portrait
      setPortraitScale(1.0);
      setPortraitOffsetX(0);
      setPortraitOffsetY(0);
      setSourceImage(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setErrorMsg("DECODE_ERROR: Failed to decode image file.");
    };
    img.src = url;
  };

  // Run perimeter cluster background removal on the portrait image
  const recomputeSegmentedSubject = useCallback(() => {
    const src = sourceRgbaRef.current;
    const alphaOut = computedAlphaRef.current;
    const userMask = userMaskRef.current;
    const segCanvas = segmentedSubjectCanvasRef.current;
    if (!src || !alphaOut || !userMask || !segCanvas) return;

    const w = segCanvas.width;
    const h = segCanvas.height;
    const total = w * h;

    if (!autoRemoveBg) {
      alphaOut.fill(255);
    } else {
      const borderSamples: [number, number, number][] = [];
      const stepX = Math.max(1, Math.floor(w / 40));
      const stepY = Math.max(1, Math.floor(h / 40));

      for (let x = 0; x < w; x += stepX) {
        const idxTop = x * 4;
        if (src[idxTop + 3] > 128) {
          borderSamples.push([src[idxTop], src[idxTop + 1], src[idxTop + 2]]);
        }
      }
      const maxBorderY = Math.floor(h * 0.8);
      for (let y = 0; y < maxBorderY; y += stepY) {
        const idxL = y * w * 4;
        const idxR = (y * w + (w - 1)) * 4;
        if (src[idxL + 3] > 128)
          borderSamples.push([src[idxL], src[idxL + 1], src[idxL + 2]]);
        if (src[idxR + 3] > 128)
          borderSamples.push([src[idxR], src[idxR + 1], src[idxR + 2]]);
      }

      const clusters: { r: number; g: number; b: number; count: number }[] = [];
      const clusterRadiusSq = 28 * 28;
      for (const [r, g, b] of borderSamples) {
        let matched = false;
        for (const c of clusters) {
          const dr = r - c.r;
          const dg = g - c.g;
          const db = b - c.b;
          if (dr * dr + dg * dg + db * db <= clusterRadiusSq) {
            c.r = (c.r * c.count + r) / (c.count + 1);
            c.g = (c.g * c.count + g) / (c.count + 1);
            c.b = (c.b * c.count + b) / (c.count + 1);
            c.count++;
            matched = true;
            break;
          }
        }
        if (!matched) {
          clusters.push({ r, g, b, count: 1 });
        }
      }
      clusters.sort((a, b) => b.count - a.count);
      const topClusters = clusters.slice(0, 5);
      if (topClusters.length === 0) {
        topClusters.push({ r: 255, g: 255, b: 255, count: 1 });
      }

      const maxDist = (tolerance / 100) * 195 + 10;
      const maxDistSq = maxDist * maxDist;
      const visited = new Uint8Array(total);
      const queue = new Int32Array(total);
      let qHead = 0;
      let qTail = 0;

      const minDistSqToClusters = (idx4: number) => {
        const r = src[idx4];
        const g = src[idx4 + 1];
        const b = src[idx4 + 2];
        let best = Infinity;
        for (let i = 0; i < topClusters.length; i++) {
          const c = topClusters[i];
          const dr = r - c.r;
          const dg = g - c.g;
          const db = b - c.b;
          const d = dr * dr + dg * dg + db * db;
          if (d < best) best = d;
        }
        return best;
      };

      const tryEnqueue = (pIdx: number) => {
        if (visited[pIdx]) return;
        const idx4 = pIdx * 4;
        if (src[idx4 + 3] < 16 || minDistSqToClusters(idx4) <= maxDistSq) {
          visited[pIdx] = 1;
          queue[qTail++] = pIdx;
        }
      };

      for (let x = 0; x < w; x++) {
        tryEnqueue(x);
      }
      for (let y = 1; y < h; y++) {
        tryEnqueue(y * w);
        tryEnqueue(y * w + (w - 1));
      }

      const localStepSq = Math.max(
        196,
        tolerance * 0.58 * (tolerance * 0.58)
      );

      while (qHead < qTail) {
        const curr = queue[qHead++];
        const curr4 = curr * 4;
        const cr = src[curr4];
        const cg = src[curr4 + 1];
        const cb = src[curr4 + 2];
        const cx = curr % w;
        const cy = (curr - cx) / w;

        const neighbors: number[] = [];
        if (cx > 0) neighbors.push(curr - 1);
        if (cx < w - 1) neighbors.push(curr + 1);
        if (cy > 0) neighbors.push(curr - w);
        if (cy < h - 1) neighbors.push(curr + w);

        for (let i = 0; i < neighbors.length; i++) {
          const nb = neighbors[i];
          if (visited[nb]) continue;
          const nb4 = nb * 4;
          if (src[nb4 + 3] < 16) {
            visited[nb] = 1;
            queue[qTail++] = nb;
            continue;
          }
          const dr = src[nb4] - cr;
          const dg = src[nb4 + 1] - cg;
          const db = src[nb4 + 2] - cb;
          const stepDistSq = dr * dr + dg * dg + db * db;
          if (
            stepDistSq <= localStepSq &&
            minDistSqToClusters(nb4) <= maxDistSq * 1.3
          ) {
            visited[nb] = 1;
            queue[qTail++] = nb;
          }
        }
      }

      const softBandSq = maxDistSq * 1.65;
      for (let p = 0; p < total; p++) {
        const idx4 = p * 4;
        const origA = src[idx4 + 3];
        if (visited[p] === 1) {
          alphaOut[p] = 0;
        } else {
          const cx = p % w;
          const cy = (p - cx) / w;
          const touchesBg =
            (cx > 0 && visited[p - 1] === 1) ||
            (cx < w - 1 && visited[p + 1] === 1) ||
            (cy > 0 && visited[p - w] === 1) ||
            (cy < h - 1 && visited[p + w] === 1);

          if (touchesBg) {
            const dSq = minDistSqToClusters(idx4);
            if (dSq < softBandSq) {
              const ratio = Math.max(
                0.2,
                Math.min(
                  1,
                  (Math.sqrt(dSq) - maxDist * 0.65) / (maxDist * 0.65)
                )
              );
              alphaOut[p] = Math.round(origA * ratio);
            } else {
              alphaOut[p] = origA;
            }
          } else {
            alphaOut[p] = origA;
          }
        }
      }

      if (edgeFeather > 0) {
        const radius = Math.min(4, Math.round(edgeFeather));
        const tempAlpha = new Uint8Array(alphaOut);
        for (let y = radius; y < h - radius; y++) {
          for (let x = radius; x < w - radius; x++) {
            const p = y * w + x;
            const cA = tempAlpha[p];
            if (cA > 0 && cA < 255) {
              let sum = 0;
              let count = 0;
              for (let dy = -radius; dy <= radius; dy++) {
                const row = (y + dy) * w;
                for (let dx = -radius; dx <= radius; dx++) {
                  sum += tempAlpha[row + x + dx];
                  count++;
                }
              }
              alphaOut[p] = Math.round(sum / count);
            }
          }
        }
      }
    }

    const ctx = segCanvas.getContext("2d");
    if (!ctx) return;
    const outImg = ctx.createImageData(w, h);
    const dst = outImg.data;

    for (let p = 0; p < total; p++) {
      const idx4 = p * 4;
      let finalAlpha = alphaOut[p];
      if (userMask[p] === 1) finalAlpha = 0;
      else if (userMask[p] === 2) finalAlpha = src[idx4 + 3];

      dst[idx4] = src[idx4];
      dst[idx4 + 1] = src[idx4 + 1];
      dst[idx4 + 2] = src[idx4 + 2];
      dst[idx4 + 3] = finalAlpha;
    }

    ctx.putImageData(outImg, 0, 0);
  }, [autoRemoveBg, tolerance, edgeFeather]);

  // Composite full passport frame (Background + Subject Portrait + Optional Biometric Guide)
  const renderPassportComposite = useCallback(
    (
      targetCanvas: HTMLCanvasElement,
      includeBiometricOverlay: boolean,
      showOriginalRaw: boolean
    ) => {
      const segCanvas = segmentedSubjectCanvasRef.current;
      const src = sourceRgbaRef.current;
      if (!segCanvas || !src) return;

      const cw = activeSize.widthPx;
      const ch = activeSize.heightPx;
      if (targetCanvas.width !== cw || targetCanvas.height !== ch) {
        targetCanvas.width = cw;
        targetCanvas.height = ch;
      }

      const ctx = targetCanvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, cw, ch);

      // 1. Solid Passport Background (Default: #FFFFFF)
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, cw, ch);

      // Calculate base cover fit for the source portrait
      const imgW = segCanvas.width;
      const imgH = segCanvas.height;
      const coverScale = Math.max(cw / imgW, ch / imgH);
      const drawW = imgW * coverScale * portraitScale;
      const drawH = imgH * coverScale * portraitScale;
      const drawX = (cw - drawW) / 2 + (portraitOffsetX / 100) * cw;
      const drawY = (ch - drawH) / 2 + (portraitOffsetY / 100) * ch;

      if (showOriginalRaw && sourceImage) {
        ctx.drawImage(sourceImage, drawX, drawY, drawW, drawH);
        return;
      }

      // 2. Draw segmented portrait subject
      ctx.drawImage(segCanvas, drawX, drawY, drawW, drawH);

      // 3. Optional Biometric Alignment Guide (Preview only, never baked into exported image)
      if (includeBiometricOverlay) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);

        // Center vertical axis
        ctx.beginPath();
        ctx.moveTo(cw / 2, 0);
        ctx.lineTo(cw / 2, ch);
        ctx.stroke();

        // Eye level horizontal band (approx 42% from top)
        const eyeY = ch * 0.42;
        ctx.beginPath();
        ctx.moveTo(cw * 0.15, eyeY);
        ctx.lineTo(cw * 0.85, eyeY);
        ctx.stroke();

        // Head crown & chin oval guide
        ctx.beginPath();
        ctx.ellipse(cw / 2, ch * 0.43, cw * 0.27, ch * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Shoulder line guide
        ctx.strokeStyle = "rgba(113, 113, 122, 0.85)";
        ctx.beginPath();
        ctx.moveTo(cw * 0.08, ch * 0.72);
        ctx.lineTo(cw * 0.92, ch * 0.72);
        ctx.stroke();

        // Labels
        ctx.setLineDash([]);
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = "rgba(24, 24, 27, 0.85)";
        ctx.fillText("CROWN", cw / 2 + 6, ch * 0.12);
        ctx.fillText("EYES", cw * 0.16, eyeY - 5);
        ctx.fillText("SHOULDERS", cw * 0.1, ch * 0.72 - 5);
        ctx.restore();
      }
    },
    [
      activeSize,
      bgColor,
      portraitScale,
      portraitOffsetX,
      portraitOffsetY,
      sourceImage,
    ]
  );

  // Re-run background segmentation whenever segmentation controls change
  useEffect(() => {
    if (!sourceImage) return;
    recomputeSegmentedSubject();
    if (previewCanvasRef.current) {
      renderPassportComposite(
        previewCanvasRef.current,
        showBiometricGuide,
        holdingCompare
      );
    }
  }, [
    sourceImage,
    recomputeSegmentedSubject,
    renderPassportComposite,
    showBiometricGuide,
    holdingCompare,
  ]);

  // Re-render composite when layout or background color changes
  useEffect(() => {
    if (!sourceImage || !previewCanvasRef.current) return;
    renderPassportComposite(
      previewCanvasRef.current,
      showBiometricGuide,
      holdingCompare
    );
  }, [
    sourceImage,
    bgColor,
    sizeId,
    portraitScale,
    portraitOffsetX,
    portraitOffsetY,
    showBiometricGuide,
    holdingCompare,
    renderPassportComposite,
  ]);

  // Apply manual erase/restore brush stroke mapped from passport canvas back to source portrait coordinates
  const applyBrushAtClientPos = (clientX: number, clientY: number) => {
    const canvas = previewCanvasRef.current;
    const segCanvas = segmentedSubjectCanvasRef.current;
    const userMask = userMaskRef.current;
    const src = sourceRgbaRef.current;
    const alphaOut = computedAlphaRef.current;
    if (!canvas || !segCanvas || !userMask || !src || !alphaOut) return;

    const rect = canvas.getBoundingClientRect();
    const cw = canvas.width;
    const ch = canvas.height;
    const canvasX = ((clientX - rect.left) / rect.width) * cw;
    const canvasY = ((clientY - rect.top) / rect.height) * ch;

    const imgW = segCanvas.width;
    const imgH = segCanvas.height;
    const coverScale = Math.max(cw / imgW, ch / imgH);
    const drawW = imgW * coverScale * portraitScale;
    const drawH = imgH * coverScale * portraitScale;
    const drawX = (cw - drawW) / 2 + (portraitOffsetX / 100) * cw;
    const drawY = (ch - drawH) / 2 + (portraitOffsetY / 100) * ch;

    const imgX = Math.round(((canvasX - drawX) / drawW) * imgW);
    const imgY = Math.round(((canvasY - drawY) / drawH) * imgH);
    const imgRadius = Math.max(2, Math.round((brushSize / drawW) * imgW));
    const rSq = imgRadius * imgRadius;
    const maskVal = interactionTarget === "erase" ? 1 : 2;

    const minY = Math.max(0, imgY - imgRadius);
    const maxY = Math.min(imgH - 1, imgY + imgRadius);
    const minX = Math.max(0, imgX - imgRadius);
    const maxX = Math.min(imgW - 1, imgX + imgRadius);

    for (let y = minY; y <= maxY; y++) {
      const dy = y - imgY;
      for (let x = minX; x <= maxX; x++) {
        const dx = x - imgX;
        if (dx * dx + dy * dy <= rSq) {
          userMask[y * imgW + x] = maskVal;
        }
      }
    }

    const ctx = segCanvas.getContext("2d");
    if (ctx) {
      const outImg = ctx.createImageData(imgW, imgH);
      const dst = outImg.data;
      const total = imgW * imgH;
      for (let p = 0; p < total; p++) {
        const idx4 = p * 4;
        let finalA = alphaOut[p];
        if (userMask[p] === 1) finalA = 0;
        else if (userMask[p] === 2) finalA = src[idx4 + 3];
        dst[idx4] = src[idx4];
        dst[idx4 + 1] = src[idx4 + 1];
        dst[idx4 + 2] = src[idx4 + 2];
        dst[idx4 + 3] = finalA;
      }
      ctx.putImageData(outImg, 0, 0);
      renderPassportComposite(canvas, showBiometricGuide, false);
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isPointerDownRef.current = true;
    pointerMovedRef.current = false;

    if (interactionTarget === "erase" || interactionTarget === "restore") {
      applyBrushAtClientPos(e.clientX, e.clientY);
      return;
    }

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initX: portraitOffsetX,
      initY: portraitOffsetY,
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current) return;

    const dist = Math.hypot(
      e.clientX - dragStartRef.current.x,
      e.clientY - dragStartRef.current.y
    );
    if (dist > 3) {
      pointerMovedRef.current = true;
    }

    if (interactionTarget === "erase" || interactionTarget === "restore") {
      applyBrushAtClientPos(e.clientX, e.clientY);
      return;
    }

    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dxPct = ((e.clientX - dragStartRef.current.x) / rect.width) * 100;
    const dyPct = ((e.clientY - dragStartRef.current.y) / rect.height) * 100;

    setPortraitOffsetX(
      Math.max(-50, Math.min(50, Math.round(dragStartRef.current.initX + dxPct)))
    );
    setPortraitOffsetY(
      Math.max(-50, Math.min(50, Math.round(dragStartRef.current.initY + dyPct)))
    );
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const wasClickWithoutDrag =
      !pointerMovedRef.current &&
      interactionTarget !== "erase" &&
      interactionTarget !== "restore";
    isPointerDownRef.current = false;

    if (wasClickWithoutDrag) {
      setShowBiometricGuide(false);
      setInteractionTarget("portrait");
    }
  };

  const handleResetMask = () => {
    if (!userMaskRef.current) return;
    userMaskRef.current.fill(0);
    recomputeSegmentedSubject();
    if (previewCanvasRef.current) {
      renderPassportComposite(
        previewCanvasRef.current,
        showBiometricGuide,
        false
      );
    }
  };

  const handleExportPassportPhoto = async () => {
    if (!selectedFile || !sourceImage) return;
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      await new Promise((r) => setTimeout(r, 100));

      const singleCanvas = document.createElement("canvas");
      renderPassportComposite(singleCanvas, false, false);

      const suffix = `_passport_${activeSize.id}`;

      const blob = await new Promise<Blob>((resolve, reject) => {
        singleCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Canvas encoding failed"))),
          "image/png"
        );
      });

      const baseName = sanitizeFilename(
        selectedFile.name.replace(/\.[^/.]+$/, "")
      );
      const outName = `${baseName}_monotranscoder`;

      await yieldFrame();
      await saveFile("passport_photo", {
        blob,
        filename: outName,
        size: blob.size,
        originalName: selectedFile.name,
        originalSize: selectedFile.size,
        format: "image/png",
      });

      showToast("Passport photo ready for download!", "success");
      setIsProcessing(false);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      setErrorMsg("EXPORT_ERROR: Could not generate passport photo.");
      showToast("Passport photo export failed", "error");
      setIsProcessing(false);
    }
  };

  return (
    <section className="space-y-8" aria-label="Passport Photo Maker Tool">
      {/* HEADER MATCHING ALL OTHER TOOLS */}
      <div className="border-b-2 border-zinc-800 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-sans font-bold text-2xl uppercase tracking-tight text-white">
            Passport &amp; ID Photo Maker
          </h1>
          <p className="text-xs font-mono text-zinc-400 mt-1">
            Crop biometric photos (US 2×2", UK/EU/India 35×45mm, China 33×48mm, Canada 50×70mm) at 300 DPI. Background replacement uses colour-cluster flood fill + manual brush touch-up (best on plain walls). Warning: Many passport and visa authorities reject digitally altered backgrounds or attire—keep original backgrounds when required by official rules.
          </p>
        </div>

        {selectedFile && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-mono text-xs uppercase border border-zinc-700 rounded flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              CHANGE PHOTO
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedFile(null);
                setSourceImage(null);
              }}
              className="p-1.5 bg-zinc-900 hover:bg-red-950/60 text-zinc-400 hover:text-red-400 border border-zinc-700 rounded transition-colors cursor-pointer"
              title="Clear photo"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileLoad(f);
          e.target.value = "";
        }}
      />

      {errorMsg && (
        <div
          role="alert"
          className="bg-red-950/40 border-2 border-red-500/50 rounded-xl p-4 font-mono text-xs text-red-300"
        >
          {errorMsg}
        </div>
      )}

      {!selectedFile ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFileLoad(f);
          }}
          className="border-2 border-dashed border-zinc-700 hover:border-white rounded-2xl p-10 text-center bg-zinc-950/60 transition-all cursor-pointer"
        >
          <div className="mx-auto mb-3 flex items-center justify-center">
            <ModuleIconBadge view="passport_photo" size="lg" />
          </div>
          <p className="font-sans font-bold text-base uppercase text-white mb-1">
            DROP PORTRAIT PHOTO HERE OR CLICK TO BROWSE
          </p>
          <p className="text-xs font-mono text-zinc-500 mb-5">
            Supports JPG, PNG, WEBP • Auto background removal + Solid color backdrop (White default)
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-6 py-3 bg-white text-black font-sans font-bold text-xs uppercase tracking-wider border-2 border-white shadow-[4px_4px_0px_0px_#ffffff] hover:bg-zinc-200 cursor-pointer inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            SELECT PORTRAIT PHOTO
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT / CENTER: INTERACTIVE PASSPORT CANVAS WORKBENCH */}
          <div className="lg:col-span-7 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-4 space-y-4">
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-[10px] text-zinc-400 uppercase mr-1">
                  CANVAS TOOL:
                </span>
                <button
                  type="button"
                  onClick={() => setInteractionTarget("portrait")}
                  className={`px-2.5 py-1 rounded font-mono text-[11px] font-bold uppercase border flex items-center gap-1 cursor-pointer transition-all ${
                    interactionTarget === "portrait"
                      ? "bg-white border-white text-black"
                      : "bg-black border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white"
                  }`}
                >
                  <Move className="w-3 h-3" />
                  MOVE PHOTO
                </button>
                <button
                  type="button"
                  onClick={() => setInteractionTarget("erase")}
                  className={`px-2.5 py-1 rounded font-mono text-[11px] font-bold uppercase border flex items-center gap-1 cursor-pointer transition-all ${
                    interactionTarget === "erase"
                      ? "bg-white border-white text-black"
                      : "bg-black border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white"
                  }`}
                >
                  <Eraser className="w-3 h-3" />
                  ERASE BG
                </button>
                <button
                  type="button"
                  onClick={() => setInteractionTarget("restore")}
                  className={`px-2.5 py-1 rounded font-mono text-[11px] font-bold uppercase border flex items-center gap-1 cursor-pointer transition-all ${
                    interactionTarget === "restore"
                      ? "bg-white border-white text-black"
                      : "bg-black border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white"
                  }`}
                >
                  <Paintbrush className="w-3 h-3" />
                  RESTORE
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowBiometricGuide((v) => !v)}
                  className={`px-2.5 py-1 rounded font-mono text-[10px] font-bold uppercase border flex items-center gap-1 cursor-pointer transition-all ${
                    showBiometricGuide
                      ? "bg-white border-white text-black"
                      : "bg-black border-zinc-800 text-zinc-400 hover:border-zinc-600"
                  }`}
                  title="Toggle biometric head & shoulder guide"
                >
                  <Grid className="w-3 h-3" />
                  GUIDE
                </button>
                <button
                  type="button"
                  onMouseDown={() => setHoldingCompare(true)}
                  onMouseUp={() => setHoldingCompare(false)}
                  onMouseLeave={() => setHoldingCompare(false)}
                  onTouchStart={() => setHoldingCompare(true)}
                  onTouchEnd={() => setHoldingCompare(false)}
                  className="px-2.5 py-1 rounded bg-black hover:bg-zinc-900 border border-zinc-800 font-mono text-[10px] font-bold text-zinc-300 uppercase flex items-center gap-1 cursor-pointer select-none"
                >
                  <Eye className="w-3 h-3" />
                  HOLD ORIGINAL
                </button>
              </div>
            </div>

            {/* Brush Size Bar when Erase/Restore active */}
            {(interactionTarget === "erase" ||
              interactionTarget === "restore") && (
              <div className="flex items-center justify-between gap-4 bg-black border border-zinc-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-3 flex-1">
                  <span className="font-mono text-[10px] text-zinc-400 uppercase">
                    BRUSH SIZE: {brushSize}PX
                  </span>
                  <input
                    type="range"
                    min={6}
                    max={70}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-36 accent-white cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleResetMask}
                  className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded font-mono text-[10px] text-zinc-300 uppercase flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  RESET BRUSH
                </button>
              </div>
            )}

            {/* Main Passport Frame Preview (Click anywhere in preview container to deselect active brush/guide) */}
            <div
              onClick={() => {
                setInteractionTarget("portrait");
                setShowBiometricGuide(false);
              }}
              className="relative flex items-center justify-center min-h-[420px] max-h-[580px] overflow-hidden bg-black border border-zinc-800 rounded-lg p-6"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative shadow-2xl border-2 border-zinc-700 bg-white"
              >
                <canvas
                  ref={previewCanvasRef}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  className={`block max-w-full max-h-[480px] w-auto h-auto touch-none ${
                    interactionTarget === "erase" ||
                    interactionTarget === "restore"
                      ? "cursor-crosshair"
                      : "cursor-grab active:cursor-grabbing"
                  }`}
                />
              </div>
            </div>

            {/* Bottom Portrait Quick Zoom & Center Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 font-mono text-[11px] text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="uppercase text-[10px] text-zinc-500">
                  PHOTO ZOOM:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPortraitScale((s) =>
                      Math.max(0.6, +(s - 0.05).toFixed(2))
                    )
                  }
                  className="p-1 bg-black hover:bg-zinc-900 border border-zinc-700 rounded text-zinc-300 cursor-pointer"
                  title="Zoom Out Portrait"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-amber-400 w-12 text-center font-bold font-mono">
                  {Math.round(portraitScale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPortraitScale((s) =>
                      Math.min(2.0, +(s + 0.05).toFixed(2))
                    )
                  }
                  className="p-1 bg-black hover:bg-zinc-900 border border-zinc-700 rounded text-zinc-300 cursor-pointer"
                  title="Zoom In Portrait"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPortraitScale(1.0);
                    setPortraitOffsetX(0);
                    setPortraitOffsetY(0);
                  }}
                  className="px-2 py-0.5 bg-black hover:bg-zinc-900 border border-zinc-700 rounded text-[10px] text-zinc-300 uppercase cursor-pointer"
                >
                  CENTER PHOTO
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 uppercase">
                {activeSize.aspectDesc}
              </span>
            </div>
          </div>

          {/* RIGHT: STUDIO CONTROLS PANEL */}
          <div className="lg:col-span-5 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-rose-400" />
                <h2 className="font-mono font-bold text-xs uppercase tracking-wider text-zinc-300">
                  PASSPORT_STUDIO.CFG
                </h2>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
                300_DPI_LOCAL
              </span>
            </div>

            {/* 1. SOLID BACKGROUND COLOR (DEFAULT WHITE) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-mono text-[11px] text-zinc-300 uppercase font-bold">
                  1. SOLID BACKGROUND COLOR:
                </label>
                <button
                  type="button"
                  onClick={() => setAutoRemoveBg((v) => !v)}
                  className={`px-2.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase border cursor-pointer ${
                    autoRemoveBg
                      ? "bg-white text-black border-white"
                      : "bg-black text-zinc-400 border-zinc-700"
                  }`}
                >
                  {autoRemoveBg ? "AUTO BG REMOVE: ON" : "AUTO BG REMOVE: OFF"}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {BG_PRESETS.map((preset) => {
                  const isSelected =
                    bgColor.toUpperCase() === preset.hex.toUpperCase();
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setBgColor(preset.hex)}
                      className={`p-2 border rounded text-left flex items-center gap-2 transition-all cursor-pointer ${
                        isSelected
                          ? "bg-white border-white text-black font-bold"
                          : "bg-black border-zinc-800 text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 shrink-0 border border-zinc-500 rounded-sm"
                        style={{ backgroundColor: preset.hex }}
                      />
                      <span className="font-mono text-[10px] uppercase truncate">
                        {preset.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Solid Color Picker + BG Removal Tolerance */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-zinc-400 uppercase">
                    CUSTOM SOLID COLOR:
                  </span>
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-7 h-7 bg-transparent border border-zinc-700 cursor-pointer"
                  />
                  <span className="font-mono text-[10px] text-zinc-300 uppercase">
                    {bgColor}
                  </span>
                </div>
              </div>

              {autoRemoveBg && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-900">
                  <div>
                    <div className="flex justify-between font-mono text-[10px] mb-1">
                      <span className="text-zinc-400 uppercase">BG CUTOFF</span>
                      <span className="text-white font-bold">{tolerance}%</span>
                    </div>
                    <input
                      type="range"
                      min={8}
                      max={85}
                      value={tolerance}
                      onChange={(e) => setTolerance(Number(e.target.value))}
                      className="w-full accent-white cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between font-mono text-[10px] mb-1">
                      <span className="text-zinc-400 uppercase">
                        EDGE SMOOTH
                      </span>
                      <span className="text-white font-bold">
                        {edgeFeather}PX
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={4}
                      step={1}
                      value={edgeFeather}
                      onChange={(e) => setEdgeFeather(Number(e.target.value))}
                      className="w-full accent-white cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 2. OFFICIAL PASSPORT DIMENSIONS & OUTPUT FORMAT */}
            <div className="space-y-2.5 pt-3 border-t border-zinc-800">
              <label className="block font-mono text-[11px] text-zinc-300 uppercase font-bold">
                2. PASSPORT SIZE STANDARD:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PASSPORT_SIZES.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSizeId(preset.id)}
                    className={`p-2 border rounded text-left transition-all cursor-pointer ${
                      sizeId === preset.id
                        ? "bg-white border-white text-black font-bold"
                        : "bg-black border-zinc-800 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    <div className="font-mono font-bold text-[11px] uppercase">
                      {preset.label}
                    </div>
                    <div
                      className={`font-mono text-[9px] uppercase ${
                        sizeId === preset.id ? "text-zinc-700" : "text-zinc-500"
                      }`}
                    >
                      {preset.region}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* EXPORT BUTTON */}
            <button
              type="button"
              onClick={handleExportPassportPhoto}
              className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all"
            >
              <Zap className="w-4 h-4" />
              <span>EXPORT PASSPORT PHOTO NOW</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
