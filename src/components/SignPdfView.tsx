/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  PenTool,
  Type as TypeIcon,
  Image as ImageIcon,
  RotateCcw,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Zap,
  Check,
  Plus,
  Eraser,
  Maximize2,
  Minus,
  Upload,
  Trash2,
  X,
} from "lucide-react";
import "@fontsource/alex-brush/400.css";
import "@fontsource/allura/400.css";
import "@fontsource/caveat/600.css";
import "@fontsource/caveat/700.css";
import "@fontsource/dancing-script/600.css";
import "@fontsource/dancing-script/700.css";
import "@fontsource/great-vibes/400.css";
import "@fontsource/sacramento/400.css";
import { PDFDocument } from "pdf-lib";
import { formatBytes, yieldFrame } from "../utils/imageProcessor";
import { saveFile } from "../utils/db";
import { loadPdfJsLibrary } from "../utils/pdfProcessor";
import { sanitizeFilename } from "../utils/sanitizer";
import { useToast } from "../context/ToastContext";
import { useFileDrop } from "../context/FileDropContext";
import { useAuth, UID_MAX_LENGTH, UID_PATTERN } from "../context/AuthContext";
import { getFirebaseServices, handleFirestoreError, OperationType } from "../firebase";
import { logger } from "../utils/logger";
import ModuleIconBadge from "./ModuleIconBadge";
import { processSignatureBuffer } from "../modules/signature-extractor/signatureProcessor";
import {
  NormalizedCropRect,
  DEFAULT_PROCESSING_PARAMS,
  ThresholdMethod,
} from "../modules/signature-extractor/types";

// Validation constants synchronized verbatim with firebase-blueprint.json (UserSignature)
const SIG_ID_MAX_LENGTH = 128;
const SIG_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
const SIG_LABEL_MAX_LENGTH = 100;
const SIG_DATA_URL_MIN_LENGTH = 20;
const SIG_DATA_URL_MAX_LENGTH = 250000;
const SIG_INK_COLOR_MAX_LENGTH = 20;
const SIG_TYPED_NAME_MAX_LENGTH = 120;
const SIG_FONT_ID_MAX_LENGTH = 40;

interface SignPdfViewProps {
  onSuccess: () => void;
  askPassword: (reason?: "wrong" | "required") => Promise<string | null>;
  initialFile?: File | null;
}

type SignatureSourceMode = "DRAW" | "TYPE" | "UPLOAD";
type InkColor = "#000000" | "#1d4ed8" | "#b91c1c" | "#15803d";
type TargetPageScope = "CURRENT_PAGE" | "LAST_PAGE" | "ALL_PAGES";
type SignatureFontId =
  | "great_vibes"
  | "dancing_script"
  | "alex_brush"
  | "allura"
  | "sacramento"
  | "caveat";

interface SignatureFontOption {
  id: SignatureFontId;
  label: string;
  styleTag: string;
  fontFamily: string;
  canvasFont: string;
  verticalOffset: number;
}

const SIGNATURE_FONTS: SignatureFontOption[] = [
  {
    id: "great_vibes",
    label: "Great Vibes",
    styleTag: "CALLIGRAPHIC",
    fontFamily: "'Great Vibes', cursive",
    canvasFont: "400 76px 'Great Vibes', cursive",
    verticalOffset: 4,
  },
  {
    id: "dancing_script",
    label: "Dancing Script",
    styleTag: "FLUID CURSIVE",
    fontFamily: "'Dancing Script', cursive",
    canvasFont: "700 70px 'Dancing Script', cursive",
    verticalOffset: 0,
  },
  {
    id: "alex_brush",
    label: "Alex Brush",
    styleTag: "CLASSIC BRUSH",
    fontFamily: "'Alex Brush', cursive",
    canvasFont: "400 78px 'Alex Brush', cursive",
    verticalOffset: 4,
  },
  {
    id: "allura",
    label: "Allura",
    styleTag: "EXECUTIVE",
    fontFamily: "'Allura', cursive",
    canvasFont: "400 80px 'Allura', cursive",
    verticalOffset: 4,
  },
  {
    id: "sacramento",
    label: "Sacramento",
    styleTag: "MONOLINE INK",
    fontFamily: "'Sacramento', cursive",
    canvasFont: "400 74px 'Sacramento', cursive",
    verticalOffset: 4,
  },
  {
    id: "caveat",
    label: "Caveat",
    styleTag: "NATURAL PEN",
    fontFamily: "'Caveat', cursive",
    canvasFont: "700 76px 'Caveat', cursive",
    verticalOffset: 0,
  },
];

const INK_COLOR_LABELS: { color: InkColor; label: string; dotClass: string }[] = [
  { color: "#000000", label: "BLACK_INK", dotClass: "bg-zinc-900 border-white" },
  { color: "#1d4ed8", label: "BLUE_INK", dotClass: "bg-blue-600 border-blue-300" },
  { color: "#b91c1c", label: "RED_INK", dotClass: "bg-red-600 border-red-300" },
  { color: "#15803d", label: "GREEN_INK", dotClass: "bg-green-600 border-green-300" },
];

interface PlacedSignatureItem {
  id: string;
  pageNumber: number;
  targetScope: TargetPageScope;
  posX: number;
  posY: number;
  widthRatio: number;
  rotation: number;
  dataUrl: string;
  sigMode: SignatureSourceMode;
  inkColor: InkColor;
  typedName: string;
  fontId: SignatureFontId;
  includeDateStamp: boolean;
  includeFlourish: boolean;
  rawUploadDataUrl: string | null;
  removeBg: boolean;
  bgThreshold: number;
  inkContrast: number;
  strokeBoost: number;
  recolorUploadInk: boolean;
}

interface SavedSignatureTemplate {
  id: string;
  dataUrl: string;
  sigMode: SignatureSourceMode;
  inkColor: InkColor;
  label: string;
  typedName: string;
  fontId: SignatureFontId;
  includeDateStamp: boolean;
  includeFlourish: boolean;
  rawUploadDataUrl: string | null;
  removeBg: boolean;
  bgThreshold: number;
  inkContrast: number;
  strokeBoost: number;
  recolorUploadInk: boolean;
}

function hexToRgb(hex: InkColor): { r: number; g: number; b: number } {
  if (hex === "#1d4ed8") return { r: 29, g: 78, b: 216 };
  if (hex === "#b91c1c") return { r: 185, g: 28, b: 28 };
  if (hex === "#15803d") return { r: 21, g: 128, b: 61 };
  return { r: 0, g: 0, b: 0 };
}

/**
 * Unified Image + 9-Step Signature Extractor pipeline:
 * Crops the uploaded image to `cropRect`, and when `removeBg` is enabled, runs the
 * 9-step Otsu/Adaptive shadow-normalizing signature extractor (`processSignatureBuffer`).
 * Recoloring is only active when `removeBg` is enabled.
 */
async function processMergedSignatureImage(
  sourceDataUrl: string,
  cropRect: NormalizedCropRect,
  removeBg: boolean,
  sensitivity: number,
  thickness: number,
  noiseSliderVal: number,
  thresholdMethod: ThresholdMethod,
  morphClose: boolean,
  recolorInk: boolean,
  inkColor: InkColor
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1400;
      let fullW = img.naturalWidth || 600;
      let fullH = img.naturalHeight || 240;
      if (fullW > maxDim || fullH > maxDim) {
        const scale = maxDim / Math.max(fullW, fullH);
        fullW = Math.max(1, Math.round(fullW * scale));
        fullH = Math.max(1, Math.round(fullH * scale));
      }

      const sx = Math.max(0, Math.min(fullW - 1, Math.round(cropRect.x * fullW)));
      const sy = Math.max(0, Math.min(fullH - 1, Math.round(cropRect.y * fullH)));
      const sw = Math.max(16, Math.min(fullW - sx, Math.round(cropRect.width * fullW)));
      const sh = Math.max(16, Math.min(fullH - sy, Math.round(cropRect.height * fullH)));

      const fullCanvas = document.createElement("canvas");
      fullCanvas.width = fullW;
      fullCanvas.height = fullH;
      const fullCtx = fullCanvas.getContext("2d");
      if (!fullCtx) {
        resolve(sourceDataUrl);
        return;
      }
      fullCtx.drawImage(img, 0, 0, fullW, fullH);

      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        fullCanvas.width = 0;
        fullCanvas.height = 0;
        resolve(sourceDataUrl);
        return;
      }

      ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
      fullCanvas.width = 0;
      fullCanvas.height = 0;

      if (removeBg) {
        const srcData = ctx.getImageData(0, 0, sw, sh);
        const extracted = processSignatureBuffer(srcData.data, sw, sh, {
          ...DEFAULT_PROCESSING_PARAMS,
          sensitivity,
          thickness,
          minComponentAreaRatio: noiseSliderVal / 100000,
          thresholdMethod,
          morphClose,
          inkColor: recolorInk ? inkColor : "#000000",
        });

        if (!extracted.empty && extracted.width > 0 && extracted.height > 0) {
          const outCanvas = document.createElement("canvas");
          outCanvas.width = extracted.width;
          outCanvas.height = extracted.height;
          const outCtx = outCanvas.getContext("2d");
          if (outCtx) {
            const outImgData = new ImageData(
              new Uint8ClampedArray(extracted.data),
              extracted.width,
              extracted.height
            );
            outCtx.putImageData(outImgData, 0, 0);
            const url = outCanvas.toDataURL("image/png");
            outCanvas.width = 0;
            outCanvas.height = 0;
            canvas.width = 0;
            canvas.height = 0;
            resolve(url);
            return;
          }
        }

        if (recolorInk) {
          const imgData = ctx.getImageData(0, 0, sw, sh);
          const data = imgData.data;
          const targetRgb = hexToRgb(inkColor);
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 16) {
              const lum =
                0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              if (lum < 215) {
                data[i] = targetRgb.r;
                data[i + 1] = targetRgb.g;
                data[i + 2] = targetRgb.b;
              }
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }
      }

      const fallbackUrl = canvas.toDataURL("image/png");
      canvas.width = 0;
      canvas.height = 0;
      resolve(fallbackUrl);
    };
    img.onerror = () => resolve(sourceDataUrl);
    img.src = sourceDataUrl;
  });
}

async function compactSignatureDataUrl(dataUrl: string): Promise<string> {
  if (dataUrl.length <= SIG_DATA_URL_MAX_LENGTH) {
    return dataUrl;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 520;
      const maxH = 200;
      const w = img.naturalWidth || 400;
      const h = img.naturalHeight || 160;
      const scale = Math.min(1, maxW / Math.max(1, w), maxH / Math.max(1, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        const compressed = canvas.toDataURL("image/png");
        canvas.width = 0;
        canvas.height = 0;
        resolve(compressed.slice(0, SIG_DATA_URL_MAX_LENGTH));
        return;
      }
      resolve(dataUrl.slice(0, SIG_DATA_URL_MAX_LENGTH));
    };
    img.onerror = () => resolve(dataUrl.slice(0, SIG_DATA_URL_MAX_LENGTH));
    img.src = dataUrl;
  });
}

type CropDragMode = "none" | "move" | "nw" | "ne" | "sw" | "se";

export default function SignPdfView({
  onSuccess,
  askPassword,
  initialFile,
}: SignPdfViewProps) {
  const { showToast } = useToast();
  const { registerDropHandler } = useFileDrop();
  const { user, isAuthReady } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pagePreviewUrl, setPagePreviewUrl] = useState<string | null>(null);
  const [pageAspectRatio, setPageAspectRatio] = useState<number>(0.707);
  const [unlockedPassword, setUnlockedPassword] = useState<string | undefined>(
    undefined
  );

  // Controls whether the Signature Studio (Draw / Type / Image) is open or closed (showing Recent Signatures)
  const [isStudioOpen, setIsStudioOpen] = useState<boolean>(true);
  // Recently created signatures for 1-click placement on any page
  const [savedSignatures, setSavedSignatures] = useState<
    SavedSignatureTemplate[]
  >([]);

  // Signature creation studio states (Merged 3 modes: 1st IMAGE/UPLOAD, 2nd TYPE, 3rd DRAW)
  const [sigMode, setSigMode] = useState<SignatureSourceMode>("UPLOAD");
  const [inkColor, setInkColor] = useState<InkColor>("#000000");
  const [typedName, setTypedName] = useState<string>("");
  const [selectedFontId, setSelectedFontId] =
    useState<SignatureFontId>("great_vibes");
  const [includeDateStamp, setIncludeDateStamp] = useState<boolean>(false);
  const [includeFlourish, setIncludeFlourish] = useState<boolean>(false);

  // Merged Image Upload + 9-Step Extractor states (Default removeBg is ON)
  const [rawUploadedSigDataUrl, setRawUploadedSigDataUrl] = useState<
    string | null
  >(null);
  const [uploadSourceImg, setUploadSourceImg] =
    useState<HTMLImageElement | null>(null);
  const [uploadCropRect, setUploadCropRect] = useState<NormalizedCropRect>({
    x: 0.06,
    y: 0.08,
    width: 0.88,
    height: 0.84,
  });
  const [removeBg, setRemoveBg] = useState<boolean>(true);
  const [bgThreshold, setBgThreshold] = useState<number>(55);
  const [inkContrast, setInkContrast] = useState<number>(10); // Maps to noise removal (0..100)
  const [strokeBoost, setStrokeBoost] = useState<number>(0); // -2 to +2 px
  const [thresholdMethod, setThresholdMethod] =
    useState<ThresholdMethod>("otsu");
  const [morphClose, setMorphClose] = useState<boolean>(true);
  const [recolorUploadInk, setRecolorUploadInk] = useState<boolean>(false);

  // Active generated signature image inside the studio
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [hasDrawnStrokes, setHasDrawnStrokes] = useState<boolean>(false);
  const hasDrawnStrokesRef = useRef<boolean>(false);

  // Active placement / scale / rotation states
  const [posX, setPosX] = useState<number>(0.74);
  const [posY, setPosY] = useState<number>(0.84);
  const [widthRatio, setWidthRatio] = useState<number>(0.28);
  const [rotation, setRotation] = useState<number>(0);
  const [targetScope, setTargetScope] =
    useState<TargetPageScope>("CURRENT_PAGE");

  // Multi-signature instances placed on the PDF
  const [placedSignatures, setPlacedSignatures] = useState<
    PlacedSignatureItem[]
  >([]);
  const [activeSigId, setActiveSigId] = useState<string | null>(null);
  const lastEditedSigIdRef = useRef<string | null>(null);

  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isPageDropOver, setIsPageDropOver] = useState<boolean>(false);

  // Dragging, corner-resizing, & rotating interaction states on page preview
  const [draggingSigId, setDraggingSigId] = useState<string | null>(null);
  const [resizingSigId, setResizingSigId] = useState<string | null>(null);
  const [rotatingSigId, setRotatingSigId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Interactive crop canvas refs for merged IMAGE tab
  const uploadCropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropDragModeRef = useRef<CropDragMode>("none");
  const cropDragStartRef = useRef<{
    x: number;
    y: number;
    rect: NormalizedCropRect;
  }>({
    x: 0,
    y: 0,
    rect: { x: 0, y: 0, width: 1, height: 1 },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sigImageInputRef = useRef<HTMLInputElement>(null);
  const typedInputRef = useRef<HTMLInputElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const pagePreviewContainerRef = useRef<HTMLDivElement>(null);
  const isDrawingPadActiveRef = useRef<boolean>(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const isSwitchingActiveSigRef = useRef<boolean>(false);

  // Helper to paint or clear the DRAW pad canvas when switching signatures or modes
  const syncDrawCanvasWithDataUrl = useCallback((url: string | null) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!url) {
      hasDrawnStrokesRef.current = false;
      setHasDrawnStrokes(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      hasDrawnStrokesRef.current = true;
      setHasDrawnStrokes(true);
    };
    img.src = url;
  }, []);

  // Keep track of the most recently selected signature ID so studio edits work even when deselected
  useEffect(() => {
    if (activeSigId) {
      lastEditedSigIdRef.current = activeSigId;
    }
  }, [activeSigId]);

  // Decode uploaded signature image for interactive crop box canvas
  useEffect(() => {
    if (!rawUploadedSigDataUrl) {
      setUploadSourceImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setUploadSourceImg(img);
    };
    img.src = rawUploadedSigDataUrl;
  }, [rawUploadedSigDataUrl]);

  // Draw interactive crop box overlay inside the merged IMAGE tab
  useEffect(() => {
    if (
      !isStudioOpen ||
      sigMode !== "UPLOAD" ||
      !uploadSourceImg ||
      !uploadCropCanvasRef.current
    )
      return;
    const canvas = uploadCropCanvasRef.current;
    const maxDisplayW = 460;
    const maxDisplayH = 210;
    const scale = Math.min(
      1,
      maxDisplayW /
        Math.max(1, uploadSourceImg.naturalWidth || uploadSourceImg.width),
      maxDisplayH /
        Math.max(1, uploadSourceImg.naturalHeight || uploadSourceImg.height)
    );
    const dw = Math.max(
      1,
      Math.round(
        (uploadSourceImg.naturalWidth || uploadSourceImg.width) * scale
      )
    );
    const dh = Math.max(
      1,
      Math.round(
        (uploadSourceImg.naturalHeight || uploadSourceImg.height) * scale
      )
    );

    if (canvas.width !== dw || canvas.height !== dh) {
      canvas.width = dw;
      canvas.height = dh;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, dw, dh);
    ctx.drawImage(uploadSourceImg, 0, 0, dw, dh);

    // Dim outside crop region
    ctx.fillStyle = "rgba(9, 9, 11, 0.62)";
    ctx.fillRect(0, 0, dw, dh);

    const cx = Math.round(uploadCropRect.x * dw);
    const cy = Math.round(uploadCropRect.y * dh);
    const cw = Math.round(uploadCropRect.width * dw);
    const ch = Math.round(uploadCropRect.height * dh);

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, cw, ch);
    ctx.clip();
    ctx.drawImage(uploadSourceImg, 0, 0, dw, dh);
    ctx.restore();

    // High-contrast monochrome crop frame & corner handles
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cw, ch);

    const handleSize = 9;
    ctx.fillStyle = "#ffffff";
    const corners = [
      [cx, cy],
      [cx + cw, cy],
      [cx, cy + ch],
      [cx + cw, cy + ch],
    ];
    for (const [hx, hy] of corners) {
      ctx.fillRect(
        hx - handleSize / 2,
        hy - handleSize / 2,
        handleSize,
        handleSize
      );
    }
  }, [isStudioOpen, sigMode, uploadSourceImg, uploadCropRect]);

  const handleCropPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = uploadCropCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height);

    const hitTol = 0.07;
    const { x, y, width, height } = uploadCropRect;
    let mode: CropDragMode = "none";

    if (Math.abs(nx - x) < hitTol && Math.abs(ny - y) < hitTol) mode = "nw";
    else if (Math.abs(nx - (x + width)) < hitTol && Math.abs(ny - y) < hitTol)
      mode = "ne";
    else if (Math.abs(nx - x) < hitTol && Math.abs(ny - (y + height)) < hitTol)
      mode = "sw";
    else if (
      Math.abs(nx - (x + width)) < hitTol &&
      Math.abs(ny - (y + height)) < hitTol
    )
      mode = "se";
    else if (nx >= x && nx <= x + width && ny >= y && ny <= y + height)
      mode = "move";

    cropDragModeRef.current = mode;
    cropDragStartRef.current = { x: nx, y: ny, rect: { ...uploadCropRect } };
  };

  const handleCropPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mode = cropDragModeRef.current;
    if (mode === "none") return;
    const canvas = uploadCropCanvasRef.current;
    if (!canvas) return;

    const b = canvas.getBoundingClientRect();
    const nx = Math.max(
      0,
      Math.min(1, (e.clientX - b.left) / Math.max(1, b.width))
    );
    const ny = Math.max(
      0,
      Math.min(1, (e.clientY - b.top) / Math.max(1, b.height))
    );
    const dx = nx - cropDragStartRef.current.x;
    const dy = ny - cropDragStartRef.current.y;
    const init = cropDragStartRef.current.rect;
    const minSize = 0.1;

    if (mode === "move") {
      const nextX = Math.max(0, Math.min(1 - init.width, init.x + dx));
      const nextY = Math.max(0, Math.min(1 - init.height, init.y + dy));
      setUploadCropRect({
        x: nextX,
        y: nextY,
        width: init.width,
        height: init.height,
      });
    } else if (mode === "nw") {
      const nextX = Math.max(
        0,
        Math.min(init.x + init.width - minSize, init.x + dx)
      );
      const nextY = Math.max(
        0,
        Math.min(init.y + init.height - minSize, init.y + dy)
      );
      setUploadCropRect({
        x: nextX,
        y: nextY,
        width: init.x + init.width - nextX,
        height: init.y + init.height - nextY,
      });
    } else if (mode === "ne") {
      const nextW = Math.max(minSize, Math.min(1 - init.x, init.width + dx));
      const nextY = Math.max(
        0,
        Math.min(init.y + init.height - minSize, init.y + dy)
      );
      setUploadCropRect({
        x: init.x,
        y: nextY,
        width: nextW,
        height: init.y + init.height - nextY,
      });
    } else if (mode === "sw") {
      const nextX = Math.max(
        0,
        Math.min(init.x + init.width - minSize, init.x + dx)
      );
      const nextH = Math.max(minSize, Math.min(1 - init.y, init.height + dy));
      setUploadCropRect({
        x: nextX,
        y: init.y,
        width: init.x + init.width - nextX,
        height: nextH,
      });
    } else if (mode === "se") {
      const nextW = Math.max(minSize, Math.min(1 - init.x, init.width + dx));
      const nextH = Math.max(minSize, Math.min(1 - init.y, init.height + dy));
      setUploadCropRect({
        x: init.x,
        y: init.y,
        width: nextW,
        height: nextH,
      });
    }
  };

  const handleCropPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    cropDragModeRef.current = "none";
  };

  // Sync studio edits into the active signature item (only scales/moves when a signature is actively selected)
  useEffect(() => {
    if (isSwitchingActiveSigRef.current) return;

    setPlacedSignatures((prev) => {
      const targetId = activeSigId || (isStudioOpen ? lastEditedSigIdRef.current : null);

      if (targetId && prev.some((item) => item.id === targetId)) {
        return prev.map((item) => {
          if (item.id !== targetId) return item;
          const isSelected = activeSigId === item.id;
          return {
            ...item,
            dataUrl:
              isStudioOpen && signatureDataUrl !== null
                ? signatureDataUrl
                : item.dataUrl,
            posX: isSelected ? posX : item.posX,
            posY: isSelected ? posY : item.posY,
            widthRatio: isSelected ? widthRatio : item.widthRatio,
            rotation: isSelected ? rotation : item.rotation,
            targetScope: isSelected ? targetScope : item.targetScope,
            sigMode: isStudioOpen ? sigMode : item.sigMode,
            inkColor: isStudioOpen ? inkColor : item.inkColor,
            typedName: isStudioOpen ? typedName : item.typedName,
            fontId: isStudioOpen ? selectedFontId : item.fontId,
            includeDateStamp: isStudioOpen
              ? includeDateStamp
              : item.includeDateStamp,
            includeFlourish: isStudioOpen
              ? includeFlourish
              : item.includeFlourish,
            rawUploadDataUrl: isStudioOpen
              ? rawUploadedSigDataUrl
              : item.rawUploadDataUrl,
            removeBg: isStudioOpen ? removeBg : item.removeBg,
            bgThreshold: isStudioOpen ? bgThreshold : item.bgThreshold,
            inkContrast: isStudioOpen ? inkContrast : item.inkContrast,
            strokeBoost: isStudioOpen ? strokeBoost : item.strokeBoost,
            recolorUploadInk: isStudioOpen
              ? removeBg
                ? recolorUploadInk
                : false
              : item.recolorUploadInk,
          };
        });
      }

      if (!isStudioOpen || !signatureDataUrl) return prev;

      // Create a new signature slot on current page when studio generates a new signature
      const sigsOnCurrentPage = prev.filter(
        (s) =>
          s.targetScope === "ALL_PAGES" ||
          (s.targetScope === "LAST_PAGE" && currentPage === totalPages) ||
          s.pageNumber === currentPage
      );
      const candidatePositions = [
        { x: 0.74, y: 0.84 },
        { x: 0.28, y: 0.84 },
        { x: 0.5, y: 0.84 },
        { x: 0.74, y: 0.68 },
        { x: 0.28, y: 0.68 },
      ];
      const chosenPos =
        candidatePositions[
          sigsOnCurrentPage.length % candidatePositions.length
        ] || { x: 0.74, y: 0.84 };

      const newId = `sig_${Date.now()}_${prev.length + 1}`;
      lastEditedSigIdRef.current = newId;
      setActiveSigId(newId);
      setPosX(chosenPos.x);
      setPosY(chosenPos.y);
      return [
        ...prev,
        {
          id: newId,
          pageNumber: currentPage,
          targetScope,
          posX: chosenPos.x,
          posY: chosenPos.y,
          widthRatio,
          rotation,
          dataUrl: signatureDataUrl,
          sigMode,
          inkColor,
          typedName,
          fontId: selectedFontId,
          includeDateStamp,
          includeFlourish,
          rawUploadDataUrl: rawUploadedSigDataUrl,
          removeBg,
          bgThreshold,
          inkContrast,
          strokeBoost,
          recolorUploadInk: removeBg ? recolorUploadInk : false,
        },
      ];
    });
  }, [
    isStudioOpen,
    activeSigId,
    signatureDataUrl,
    posX,
    posY,
    widthRatio,
    rotation,
    targetScope,
    sigMode,
    inkColor,
    typedName,
    selectedFontId,
    includeDateStamp,
    includeFlourish,
    rawUploadedSigDataUrl,
    removeBg,
    bgThreshold,
    inkContrast,
    strokeBoost,
    recolorUploadInk,
    currentPage,
    totalPages,
  ]);

  // Scale only works when a signature is actively selected
  const handleScaleSelectedSignature = useCallback(
    (nextRatio: number) => {
      if (!activeSigId) return;
      const clamped = Math.max(0.08, Math.min(0.8, Number(nextRatio.toFixed(2))));
      setWidthRatio(clamped);
      setPlacedSignatures((prev) =>
        prev.map((item) =>
          item.id === activeSigId ? { ...item, widthRatio: clamped } : item
        )
      );
    },
    [activeSigId]
  );

  // Select a placed signature on the page
  const handleSelectPlacedSignature = useCallback(
    (sig: PlacedSignatureItem) => {
      isSwitchingActiveSigRef.current = true;
      lastEditedSigIdRef.current = sig.id;
      setActiveSigId(sig.id);
      setPosX(sig.posX);
      setPosY(sig.posY);
      setWidthRatio(sig.widthRatio);
      setRotation(sig.rotation ?? 0);
      setTargetScope(sig.targetScope);

      if (isStudioOpen) {
        setSigMode(sig.sigMode);
        setInkColor(sig.inkColor);
        setTypedName(sig.typedName);
        setSelectedFontId(sig.fontId);
        setIncludeDateStamp(sig.includeDateStamp);
        setIncludeFlourish(sig.includeFlourish);
        setRawUploadedSigDataUrl(sig.rawUploadDataUrl);
        setRemoveBg(sig.removeBg);
        setBgThreshold(sig.bgThreshold);
        setInkContrast(sig.inkContrast ?? 10);
        setStrokeBoost(sig.strokeBoost ?? 0);
        setRecolorUploadInk(sig.removeBg ? sig.recolorUploadInk : false);
        setSignatureDataUrl(sig.dataUrl || null);
      }

      if (sig.targetScope === "CURRENT_PAGE" && sig.pageNumber !== currentPage) {
        setCurrentPage(sig.pageNumber);
      }

      requestAnimationFrame(() => {
        if (isStudioOpen && sig.sigMode === "DRAW") {
          syncDrawCanvasWithDataUrl(sig.dataUrl || null);
        }
        isSwitchingActiveSigRef.current = false;
      });
    },
    [currentPage, isStudioOpen, syncDrawCanvasWithDataUrl]
  );

  // Deselect any active signature when clicking anywhere on the image preview
  const handleDeselectSignature = useCallback(() => {
    setActiveSigId(null);
    setDraggingSigId(null);
    setResizingSigId(null);
    setRotatingSigId(null);
  }, []);

  // Track signature IDs already synced or in-flight to Firestore for the current user
  const syncedSigIdsRef = useRef<Set<string>>(new Set());
  const savedSignaturesRef = useRef<SavedSignatureTemplate[]>([]);
  useEffect(() => {
    savedSignaturesRef.current = savedSignatures;
  }, [savedSignatures]);

  // Persist a saved signature template to Firestore when user is signed in
  const persistSignatureToFirestore = useCallback(
    async (template: SavedSignatureTemplate) => {
      if (!user || !user.emailVerified) return;
      const uid = user.uid;
      if (!uid || uid.length > UID_MAX_LENGTH || !UID_PATTERN.test(uid)) return;

      const safeSigId = template.id
        .replace(/[^a-zA-Z0-9_\-]/g, "_")
        .slice(0, SIG_ID_MAX_LENGTH);
      if (!safeSigId || !SIG_ID_PATTERN.test(safeSigId)) return;

      const dedupKey = `${uid}:${safeSigId}`;
      if (syncedSigIdsRef.current.has(dedupKey)) return;
      syncedSigIdsRef.current.add(dedupKey);

      const compactUrl = await compactSignatureDataUrl(template.dataUrl);
      if (
        compactUrl.length < SIG_DATA_URL_MIN_LENGTH ||
        compactUrl.length > SIG_DATA_URL_MAX_LENGTH
      ) {
        syncedSigIdsRef.current.delete(dedupKey);
        return;
      }

      const safeLabel =
        (template.label || "SAVED SIGNATURE").trim().slice(0, SIG_LABEL_MAX_LENGTH) ||
        "SAVED SIGNATURE";
      const safeMode: SignatureSourceMode =
        template.sigMode === "DRAW" ||
        template.sigMode === "TYPE" ||
        template.sigMode === "UPLOAD"
          ? template.sigMode
          : "UPLOAD";
      const safeInkColor =
        (template.inkColor || "#000000").trim().slice(0, SIG_INK_COLOR_MAX_LENGTH) ||
        "#000000";
      const safeTypedName = (template.typedName || "")
        .trim()
        .slice(0, SIG_TYPED_NAME_MAX_LENGTH);
      const safeFontId =
        (template.fontId || "great_vibes").trim().slice(0, SIG_FONT_ID_MAX_LENGTH) ||
        "great_vibes";

      const sigDocPath = `users/${uid}/signatures/${safeSigId}`;
      try {
        const { db, firestoreMod } = await getFirebaseServices();
        const { doc, getDoc, setDoc, serverTimestamp } = firestoreMod;
        const sigDocRef = doc(db, "users", uid, "signatures", safeSigId);
        const existingSnap = await getDoc(sigDocRef);
        if (existingSnap.exists()) {
          return;
        }
        await setDoc(sigDocRef, {
          uid,
          sigId: safeSigId,
          label: safeLabel,
          dataUrl: compactUrl,
          sigMode: safeMode,
          inkColor: safeInkColor,
          typedName: safeTypedName,
          fontId: safeFontId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        syncedSigIdsRef.current.delete(dedupKey);
        try {
          handleFirestoreError(error, OperationType.WRITE, sigDocPath);
        } catch {
          // Handled and logged
        }
      }
    },
    [user]
  );

  // Real-time listener to load user's saved signatures from Firestore when signed in
  useEffect(() => {
    if (!isAuthReady) {
      return;
    }
    if (!user) {
      syncedSigIdsRef.current.clear();
      setSavedSignatures([]);
      return;
    }
    const uid = user.uid;
    if (!uid || uid.length > UID_MAX_LENGTH || !UID_PATTERN.test(uid)) {
      return;
    }

    let unsub: (() => void) | null = null;
    let cancelled = false;

    void getFirebaseServices().then(({ db, firestoreMod }) => {
      if (cancelled) return;
      const { collection, query, where, onSnapshot } = firestoreMod;
      const colPath = `users/${uid}/signatures`;
      const sigsQuery = query(
        collection(db, "users", uid, "signatures"),
        where("uid", "==", uid)
      );
      unsub = onSnapshot(
        sigsQuery,
        (snap) => {
          const cloudTemplates: SavedSignatureTemplate[] = snap.docs
            .map((docSnap) => {
              const d = docSnap.data();
              const mode: SignatureSourceMode =
                d.sigMode === "DRAW" || d.sigMode === "TYPE" || d.sigMode === "UPLOAD"
                  ? d.sigMode
                  : "UPLOAD";
              const url = String(d.dataUrl || "");
              const idStr = String(d.sigId || docSnap.id);
              syncedSigIdsRef.current.add(`${uid}:${idStr}`);
              return {
                id: idStr,
                dataUrl: url,
                sigMode: mode,
                inkColor: (d.inkColor as InkColor) || "#000000",
                label: String(d.label || "SAVED SIGNATURE"),
                typedName: String(d.typedName || ""),
                fontId: (d.fontId as SignatureFontId) || "great_vibes",
                includeDateStamp: false,
                includeFlourish: false,
                rawUploadDataUrl: mode === "UPLOAD" ? url : null,
                removeBg: true,
                bgThreshold: 55,
                inkContrast: 10,
                strokeBoost: 0,
                recolorUploadInk: false,
              };
            })
            .filter((item) => item.dataUrl.length >= SIG_DATA_URL_MIN_LENGTH);

          const cloudIds = new Set(cloudTemplates.map((c) => c.id));
          const cloudUrls = new Set(cloudTemplates.map((c) => c.dataUrl));
          const localUnsynced = savedSignaturesRef.current.filter((p) => {
            const safeId = p.id
              .replace(/[^a-zA-Z0-9_\-]/g, "_")
              .slice(0, SIG_ID_MAX_LENGTH);
            return (
              !cloudIds.has(p.id) &&
              !cloudIds.has(safeId) &&
              !cloudUrls.has(p.dataUrl) &&
              !syncedSigIdsRef.current.has(`${uid}:${safeId}`)
            );
          });
          for (const unsynced of localUnsynced) {
            void persistSignatureToFirestore(unsynced);
          }

          const merged = [...cloudTemplates, ...localUnsynced];
          setSavedSignatures(merged);
          if (merged.length > 0 && !signatureDataUrl && placedSignatures.length === 0) {
            setIsStudioOpen(false);
          }
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.LIST, colPath);
          } catch {
            // Handled and logged
          }
        }
      );
    });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [isAuthReady, user, persistSignatureToFirestore]);

  // Save the currently created signature in the studio, close the studio, and show Recent Signatures
  const handleSaveSignatureFromStudio = () => {
    if (!signatureDataUrl) {
      showToast(
        "Please create a signature first before saving.",
        "error"
      );
      return;
    }

    const modeTag =
      sigMode === "DRAW"
        ? "DRAWN"
        : sigMode === "TYPE"
        ? `TYPED (${typedName.trim().slice(0, 12) || "TEXT"})`
        : "IMAGE";

    const currentSaved = savedSignaturesRef.current;
    const alreadyExists = currentSaved.some((s) => s.dataUrl === signatureDataUrl);
    if (!alreadyExists) {
      const uniqueSuffix = Math.random().toString(36).slice(2, 7);
      const newSaved: SavedSignatureTemplate = {
        id: `saved_sig_${Date.now()}_${uniqueSuffix}`,
        dataUrl: signatureDataUrl,
        sigMode,
        inkColor,
        label: `SIG #${currentSaved.length + 1} - ${modeTag}`,
        typedName,
        fontId: selectedFontId,
        includeDateStamp,
        includeFlourish,
        rawUploadDataUrl: rawUploadedSigDataUrl,
        removeBg,
        bgThreshold,
        inkContrast,
        strokeBoost,
        recolorUploadInk: removeBg ? recolorUploadInk : false,
      };
      setSavedSignatures((prev) =>
        prev.some((s) => s.dataUrl === signatureDataUrl)
          ? prev
          : [...prev, newSaved]
      );
      void persistSignatureToFirestore(newSaved);
    }

    setIsStudioOpen(false);
  };

  // Open the Signature Studio with a clean workspace to make another signature
  const handleOpenStudioForNewSignature = () => {
    isSwitchingActiveSigRef.current = true;
    lastEditedSigIdRef.current = null;
    setActiveSigId(null);
    setRotation(0);
    setWidthRatio(0.28);
    setTypedName("");
    setRawUploadedSigDataUrl(null);
    setUploadSourceImg(null);
    setRemoveBg(true);
    setRecolorUploadInk(false);
    setSignatureDataUrl(null);
    hasDrawnStrokesRef.current = false;
    setHasDrawnStrokes(false);
    if (sigImageInputRef.current) {
      sigImageInputRef.current.value = "";
    }
    setIsStudioOpen(true);

    requestAnimationFrame(() => {
      syncDrawCanvasWithDataUrl(null);
      isSwitchingActiveSigRef.current = false;
      if (sigMode === "TYPE") {
        typedInputRef.current?.focus();
      }
    });
  };

  // 1-Click or Drag-and-Drop: Place a saved signature onto the currently viewed PDF page
  const handlePlaceSavedSignatureOnCurrentPage = useCallback(
    (
      template: SavedSignatureTemplate,
      customPos?: { x: number; y: number }
    ) => {
      const sigsOnCurrentPage = placedSignatures.filter(
        (s) =>
          s.targetScope === "ALL_PAGES" ||
          (s.targetScope === "LAST_PAGE" && currentPage === totalPages) ||
          s.pageNumber === currentPage
      );

      const candidatePositions = [
        { x: 0.74, y: 0.84 },
        { x: 0.28, y: 0.84 },
        { x: 0.5, y: 0.84 },
        { x: 0.74, y: 0.68 },
        { x: 0.28, y: 0.68 },
      ];
      const chosenPos =
        customPos ||
        candidatePositions[
          sigsOnCurrentPage.length % candidatePositions.length
        ] || {
          x: 0.5,
          y: 0.78,
        };

      const newId = `sig_${Date.now()}_${placedSignatures.length + 1}`;
      const newItem: PlacedSignatureItem = {
        id: newId,
        pageNumber: currentPage,
        targetScope: "CURRENT_PAGE",
        posX: chosenPos.x,
        posY: chosenPos.y,
        widthRatio: 0.28,
        rotation: 0,
        dataUrl: template.dataUrl,
        sigMode: template.sigMode,
        inkColor: template.inkColor,
        typedName: template.typedName,
        fontId: template.fontId,
        includeDateStamp: template.includeDateStamp,
        includeFlourish: template.includeFlourish,
        rawUploadDataUrl: template.rawUploadDataUrl,
        removeBg: template.removeBg,
        bgThreshold: template.bgThreshold,
        inkContrast: template.inkContrast,
        strokeBoost: template.strokeBoost,
        recolorUploadInk: template.recolorUploadInk,
      };

      isSwitchingActiveSigRef.current = true;
      lastEditedSigIdRef.current = newId;
      setPlacedSignatures((prev) => [...prev, newItem]);
      setActiveSigId(newId);
      setPosX(chosenPos.x);
      setPosY(chosenPos.y);
      setWidthRatio(0.28);
      setRotation(0);
      requestAnimationFrame(() => {
        isSwitchingActiveSigRef.current = false;
      });
    },
    [currentPage, placedSignatures, totalPages]
  );

  // Handle dropping a signature (from Recent Signatures, Studio preview, or image file) directly onto the PDF page
  const handleDropSignatureOnPage = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPageDropOver(false);

    const container = pagePreviewContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const dropX = Math.max(
      0.08,
      Math.min(0.92, (e.clientX - rect.left) / Math.max(1, rect.width))
    );
    const dropY = Math.max(
      0.06,
      Math.min(0.94, (e.clientY - rect.top) / Math.max(1, rect.height))
    );

    // 1. Check if user dragged a saved signature card from Recent Signatures
    const savedSigId = e.dataTransfer.getData(
      "application/x-monotranscoder-sig-id"
    );
    if (savedSigId) {
      const found = savedSignatures.find((s) => s.id === savedSigId);
      if (found) {
        handlePlaceSavedSignatureOnCurrentPage(found, { x: dropX, y: dropY });
        return;
      }
    }

    // 2. Check if user dragged the active Studio preview onto the page
    const isStudioPreviewDrag = e.dataTransfer.getData(
      "application/x-monotranscoder-studio-sig"
    );
    if (isStudioPreviewDrag && signatureDataUrl) {
      const newId = `sig_${Date.now()}_${placedSignatures.length + 1}`;
      const newItem: PlacedSignatureItem = {
        id: newId,
        pageNumber: currentPage,
        targetScope: "CURRENT_PAGE",
        posX: dropX,
        posY: dropY,
        widthRatio: 0.28,
        rotation: 0,
        dataUrl: signatureDataUrl,
        sigMode,
        inkColor,
        typedName,
        fontId: selectedFontId,
        includeDateStamp,
        includeFlourish,
        rawUploadDataUrl: rawUploadedSigDataUrl,
        removeBg,
        bgThreshold,
        inkContrast,
        strokeBoost,
        recolorUploadInk: removeBg ? recolorUploadInk : false,
      };
      isSwitchingActiveSigRef.current = true;
      lastEditedSigIdRef.current = newId;
      setPlacedSignatures((prev) => [...prev, newItem]);
      setActiveSigId(newId);
      setPosX(dropX);
      setPosY(dropY);
      setWidthRatio(0.28);
      setRotation(0);
      requestAnimationFrame(() => {
        isSwitchingActiveSigRef.current = false;
      });
      return;
    }

    // 3. Check if user dragged an external signature image file directly onto the PDF page
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          const rawUrl = reader.result;
          const defaultCrop: NormalizedCropRect = {
            x: 0.06,
            y: 0.08,
            width: 0.88,
            height: 0.84,
          };
          processMergedSignatureImage(
            rawUrl,
            defaultCrop,
            true,
            55,
            0,
            10,
            "otsu",
            true,
            false,
            "#000000"
          ).then((processedDataUrl) => {
            const newId = `sig_${Date.now()}_${placedSignatures.length + 1}`;
            const newItem: PlacedSignatureItem = {
              id: newId,
              pageNumber: currentPage,
              targetScope: "CURRENT_PAGE",
              posX: dropX,
              posY: dropY,
              widthRatio: 0.28,
              rotation: 0,
              dataUrl: processedDataUrl,
              sigMode: "UPLOAD",
              inkColor: "#000000",
              typedName: "",
              fontId: "great_vibes",
              includeDateStamp: false,
              includeFlourish: false,
              rawUploadDataUrl: rawUrl,
              removeBg: true,
              bgThreshold: 55,
              inkContrast: 10,
              strokeBoost: 0,
              recolorUploadInk: false,
            };
            isSwitchingActiveSigRef.current = true;
            lastEditedSigIdRef.current = newId;
            setPlacedSignatures((prev) => [...prev, newItem]);
            const currentSaved = savedSignaturesRef.current;
            if (!currentSaved.some((s) => s.dataUrl === processedDataUrl)) {
              const uniqueSuffix = Math.random().toString(36).slice(2, 7);
              const droppedTemplate: SavedSignatureTemplate = {
                id: `saved_sig_${Date.now()}_${uniqueSuffix}`,
                dataUrl: processedDataUrl,
                sigMode: "UPLOAD",
                inkColor: "#000000",
                label: `SIG #${currentSaved.length + 1} - IMAGE`,
                typedName: "",
                fontId: "great_vibes",
                includeDateStamp: false,
                includeFlourish: false,
                rawUploadDataUrl: rawUrl,
                removeBg: true,
                bgThreshold: 55,
                inkContrast: 10,
                strokeBoost: 0,
                recolorUploadInk: false,
              };
              setSavedSignatures((prev) =>
                prev.some((s) => s.dataUrl === processedDataUrl)
                  ? prev
                  : [...prev, droppedTemplate]
              );
              void persistSignatureToFirestore(droppedTemplate);
            }
            setActiveSigId(newId);
            setPosX(dropX);
            setPosY(dropY);
            setWidthRatio(0.28);
            setRotation(0);
            requestAnimationFrame(() => {
              isSwitchingActiveSigRef.current = false;
            });
          });
        }
      };
      reader.readAsDataURL(droppedFile);
    }
  };

  // Delete a saved signature template from the Recent Signatures list (and Firestore if signed in)
  const handleDeleteSavedSignature = (
    e: React.MouseEvent,
    templateId: string
  ) => {
    e.stopPropagation();
    setSavedSignatures((prev) => {
      const next = prev.filter((item) => item.id !== templateId);
      if (next.length === 0) {
        setIsStudioOpen(true);
      }
      return next;
    });

    if (user && user.emailVerified) {
      const uid = user.uid;
      const safeSigId = templateId
        .replace(/[^a-zA-Z0-9_\-]/g, "_")
        .slice(0, SIG_ID_MAX_LENGTH);
      if (uid && safeSigId && SIG_ID_PATTERN.test(safeSigId)) {
        const sigDocPath = `users/${uid}/signatures/${safeSigId}`;
        void getFirebaseServices().then(({ db, firestoreMod }) => {
          firestoreMod.deleteDoc(firestoreMod.doc(db, "users", uid, "signatures", safeSigId)).catch((err) => {
            try {
              handleFirestoreError(err, OperationType.DELETE, sigDocPath);
            } catch {
              // Handled and logged
            }
          });
        });
      }
    }
  };

  // Remove a placed signature from the PDF page
  const handleDeletePlacedSignature = (idToRemove: string) => {
    setPlacedSignatures((prev) => {
      const remaining = prev.filter((s) => s.id !== idToRemove);
      if (
        activeSigId === idToRemove ||
        lastEditedSigIdRef.current === idToRemove
      ) {
        const nextActive = remaining[remaining.length - 1] || null;
        if (nextActive) {
          lastEditedSigIdRef.current = nextActive.id;
          setTimeout(() => handleSelectPlacedSignature(nextActive), 0);
        } else {
          lastEditedSigIdRef.current = null;
          setActiveSigId(null);
          if (isStudioOpen) {
            setSignatureDataUrl(null);
            syncDrawCanvasWithDataUrl(null);
          }
        }
      }
      return remaining;
    });
  };

  // Load PDF and render active page preview
  const renderPagePreview = useCallback(
    async (targetFile: File, pageNumber: number, pwd?: string) => {
      let pdfDocument: any = null;
      try {
        const arrayBuffer = await targetFile.arrayBuffer();
        const pdfjsLib = await loadPdfJsLibrary();
        const docParams: any = { data: new Uint8Array(arrayBuffer) };
        if (pwd) docParams.password = pwd;
        pdfDocument = await pdfjsLib.getDocument(docParams).promise;

        const page = await pdfDocument.getPage(pageNumber);
        const origVp = page.getViewport({ scale: 1.0 });
        setPageAspectRatio(origVp.width / Math.max(1, origVp.height));

        const previewVp = page.getViewport({ scale: 1.25 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(previewVp.width));
        canvas.height = Math.max(1, Math.round(previewVp.height));
        const ctx = canvas.getContext("2d");

        if (ctx) {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: previewVp }).promise;
        }

        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setPagePreviewUrl(dataUrl);
        canvas.width = 0;
        canvas.height = 0;
        if (typeof page.cleanup === "function") page.cleanup();
      } catch (err) {
        logger.warn("Failed rendering page preview:", err);
      } finally {
        if (pdfDocument && typeof pdfDocument.destroy === "function") {
          pdfDocument.destroy();
        }
      }
    },
    []
  );

  const handleLoadPdfFile = useCallback(
    async (selectedFile: File) => {
      const isPdf =
        selectedFile.type === "application/pdf" ||
        selectedFile.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        showToast(
          `Invalid file type: ${selectedFile.name}. Please select a valid PDF document (.pdf).`,
          "error"
        );
        return;
      }

      if (selectedFile.size > 500 * 1024 * 1024) {
        showToast("PDF file exceeds the 500MB safe in-browser limit.", "error");
        return;
      }

      setFile(selectedFile);
      setIsLoadingPdf(true);
      setPagePreviewUrl(null);
      setUnlockedPassword(undefined);
      setPlacedSignatures([]);
      setActiveSigId(null);
      lastEditedSigIdRef.current = null;
      setIsStudioOpen(savedSignatures.length === 0);

      let pdfDocument: any = null;

      try {
        await yieldFrame();
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdfjsLib = await loadPdfJsLibrary();

        let usedPassword: string | undefined = undefined;

        const loadWithPasswordAttempt = async (pwd?: string): Promise<any> => {
          const docParams: any = { data: new Uint8Array(arrayBuffer.slice(0)) };
          if (pwd) docParams.password = pwd;
          const loadingTask = pdfjsLib.getDocument(docParams);
          try {
            const doc = await loadingTask.promise;
            usedPassword = pwd;
            return doc;
          } catch (err: any) {
            const isPasswordRequired =
              err?.name === "PasswordException" ||
              err?.name === "IncorrectPasswordException" ||
              err?.message?.toLowerCase().includes("password");
            if (isPasswordRequired) {
              const entered = await askPassword(pwd ? "wrong" : "required");
              if (entered === null) {
                throw new Error("Password decryption cancelled by user.");
              }
              return await loadWithPasswordAttempt(entered);
            }
            throw err;
          }
        };

        pdfDocument = await loadWithPasswordAttempt();
        setUnlockedPassword(usedPassword);
        const count = pdfDocument.numPages;
        setTotalPages(count);
        setCurrentPage(1);

        await renderPagePreview(selectedFile, 1, usedPassword);
      } catch (err: any) {
        logger.error("Failed loading PDF for signing:", err);
        showToast(`Could not load PDF: ${err?.message || err}`, "error");
        setFile(null);
        setTotalPages(0);
      } finally {
        setIsLoadingPdf(false);
        if (pdfDocument && typeof pdfDocument.destroy === "function") {
          pdfDocument.destroy();
        }
      }
    },
    [askPassword, renderPagePreview, savedSignatures.length, showToast]
  );

  useEffect(() => {
    if (initialFile) {
      handleLoadPdfFile(initialFile);
    }
  }, [initialFile, handleLoadPdfFile]);

  useEffect(() => {
    return registerDropHandler((files) => {
      const first = files[0];
      if (first) {
        handleLoadPdfFile(first);
        return true;
      }
      return false;
    });
  }, [registerDropHandler, handleLoadPdfFile]);

  useEffect(() => {
    if (file && currentPage >= 1 && currentPage <= totalPages) {
      renderPagePreview(file, currentPage, unlockedPassword);
    }
  }, [file, currentPage, totalPages, unlockedPassword, renderPagePreview]);

  // Render TYPE signature with authentic handwritten font
  useEffect(() => {
    if (!isStudioOpen || sigMode !== "TYPE") return;

    const clean = typedName.trim();
    if (!clean) {
      setSignatureDataUrl(null);
      return;
    }

    let cancelled = false;
    const fontConfig =
      SIGNATURE_FONTS.find((f) => f.id === selectedFontId) ||
      SIGNATURE_FONTS[0];

    const renderTypedCanvas = async () => {
      try {
        if (document.fonts && typeof document.fonts.load === "function") {
          await document.fonts.load(fontConfig.canvasFont, clean);
        }
      } catch {
        // Proceed even if font API is unavailable
      }
      if (cancelled) return;

      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 250;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = inkColor;
        ctx.strokeStyle = inkColor;
        ctx.font = fontConfig.canvasFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const centerY =
          (includeDateStamp ? 96 : 118) + (fontConfig.verticalOffset || 0);
        ctx.fillText(clean, canvas.width / 2, centerY, 670);

        if (includeFlourish) {
          const metrics = ctx.measureText(clean);
          const lineW = Math.min(620, Math.max(180, metrics.width * 0.92));
          const startX = canvas.width / 2 - lineW / 2;
          const endX = canvas.width / 2 + lineW / 2;
          const flourishY = centerY + 42;

          ctx.lineWidth = 2.6;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(startX, flourishY + 4);
          ctx.quadraticCurveTo(
            canvas.width / 2,
            flourishY - 10,
            endX,
            flourishY + 2
          );
          ctx.quadraticCurveTo(
            endX + 18,
            flourishY + 5,
            endX - 28,
            flourishY + 13
          );
          ctx.stroke();
        }

        if (includeDateStamp) {
          const dateStr = `SIGNED: ${new Date().toISOString().split("T")[0]}`;
          ctx.font = "bold 21px 'JetBrains Mono', monospace";
          ctx.fillText(dateStr, canvas.width / 2, 198);
        }
      }
      setSignatureDataUrl(canvas.toDataURL("image/png"));
      canvas.width = 0;
      canvas.height = 0;
    };

    renderTypedCanvas();
    return () => {
      cancelled = true;
    };
  }, [
    isStudioOpen,
    sigMode,
    typedName,
    selectedFontId,
    inkColor,
    includeDateStamp,
    includeFlourish,
  ]);

  // Process merged IMAGE + 9-Step Signature Extractor live
  useEffect(() => {
    if (!isStudioOpen || sigMode !== "UPLOAD") return;
    if (!rawUploadedSigDataUrl) {
      setSignatureDataUrl(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      processMergedSignatureImage(
        rawUploadedSigDataUrl,
        uploadCropRect,
        removeBg,
        bgThreshold,
        strokeBoost,
        inkContrast,
        thresholdMethod,
        morphClose,
        removeBg && recolorUploadInk,
        inkColor
      ).then((processedUrl) => {
        if (!cancelled) {
          setSignatureDataUrl(processedUrl);
        }
      });
    }, 60);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    isStudioOpen,
    sigMode,
    rawUploadedSigDataUrl,
    uploadCropRect,
    removeBg,
    bgThreshold,
    strokeBoost,
    inkContrast,
    thresholdMethod,
    morphClose,
    recolorUploadInk,
    inkColor,
  ]);

  // When switching back to DRAW mode inside the studio, restore the active signature's drawn strokes
  useEffect(() => {
    if (!isStudioOpen || sigMode !== "DRAW") return;
    const targetId = activeSigId || lastEditedSigIdRef.current;
    const activeItem = placedSignatures.find((s) => s.id === targetId);
    if (activeItem && activeItem.sigMode === "DRAW" && activeItem.dataUrl) {
      syncDrawCanvasWithDataUrl(activeItem.dataUrl);
    } else if (!targetId || (activeItem && !activeItem.dataUrl)) {
      syncDrawCanvasWithDataUrl(null);
    }
  }, [isStudioOpen, sigMode, activeSigId, syncDrawCanvasWithDataUrl]);

  // Recolor existing drawn strokes on the pad when inkColor changes in DRAW mode
  const handleSelectInkColor = (newColor: InkColor) => {
    setInkColor(newColor);
    if (
      sigMode === "DRAW" &&
      drawCanvasRef.current &&
      hasDrawnStrokesRef.current
    ) {
      const canvas = drawCanvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const rgb = hexToRgb(newColor);
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 0) {
            data[i] = rgb.r;
            data[i + 1] = rgb.g;
            data[i + 2] = rgb.b;
          }
        }
        ctx.putImageData(imgData, 0, 0);
        setSignatureDataUrl(canvas.toDataURL("image/png"));
      }
    }
  };

  // Drawing Pad Handlers
  const getCanvasPoint = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
  ): { x: number; y: number } | null => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);

    if ("touches" in e) {
      const t = e.touches[0] || e.changedTouches[0];
      if (!t) return null;
      return {
        x: (t.clientX - rect.left) * scaleX,
        y: (t.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePadStart = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if ("cancelable" in e && e.cancelable) {
      e.preventDefault();
    }
    const pt = getCanvasPoint(e);
    if (!pt) return;
    isDrawingPadActiveRef.current = true;
    lastPointRef.current = pt;

    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.fillStyle = inkColor;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.1, 0, Math.PI * 2);
      ctx.fill();
      hasDrawnStrokesRef.current = true;
      setHasDrawnStrokes(true);
    }
  };

  const handlePadMove = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if ("cancelable" in e && e.cancelable) {
      e.preventDefault();
    }
    if (!isDrawingPadActiveRef.current) return;
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    const pt = getCanvasPoint(e);
    if (!canvas || !ctx || !pt || !lastPointRef.current) return;

    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 4.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();

    lastPointRef.current = pt;
    hasDrawnStrokesRef.current = true;
    setHasDrawnStrokes(true);
  };

  const handlePadEnd = () => {
    if (!isDrawingPadActiveRef.current) return;
    isDrawingPadActiveRef.current = false;
    lastPointRef.current = null;
    const canvas = drawCanvasRef.current;
    if (canvas && hasDrawnStrokesRef.current) {
      setSignatureDataUrl(canvas.toDataURL("image/png"));
    }
  };

  const handleClearPad = () => {
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    hasDrawnStrokesRef.current = false;
    setHasDrawnStrokes(false);
    setSignatureDataUrl(null);
    const targetId = activeSigId || lastEditedSigIdRef.current;
    if (targetId) {
      setPlacedSignatures((prev) => prev.filter((s) => s.id !== targetId));
      setActiveSigId(null);
      lastEditedSigIdRef.current = null;
    }
  };

  const handleUploadSignatureFile = (f: File) => {
    if (!f.type.startsWith("image/")) {
      showToast(
        "Please select a valid signature image (PNG, JPG, WebP).",
        "error"
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setRawUploadedSigDataUrl(reader.result);
        setUploadCropRect({
          x: 0.06,
          y: 0.08,
          width: 0.88,
          height: 0.84,
        });
      }
    };
    reader.readAsDataURL(f);
  };

  const handleUploadSignatureImage = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const f = e.target.files?.[0];
    if (!f) return;
    handleUploadSignatureFile(f);
  };

  // Interactive Page Drag / Resize / Rotate Positioning
  const handleViewportPointerMove = (clientX: number, clientY: number) => {
    const container = pagePreviewContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const relX = (clientX - rect.left) / Math.max(1, rect.width);
    const relY = (clientY - rect.top) / Math.max(1, rect.height);

    if (rotatingSigId) {
      const targetSig = placedSignatures.find((s) => s.id === rotatingSigId);
      if (!targetSig) return;
      const centerX = rect.left + targetSig.posX * rect.width;
      const centerY = rect.top + targetSig.posY * rect.height;
      const angleRad = Math.atan2(clientY - centerY, clientX - centerX);
      let deg = Math.round((angleRad * 180) / Math.PI + 90);
      if (deg > 180) deg -= 360;
      if (deg < -180) deg += 360;
      for (const snap of [-180, -90, -45, 0, 45, 90, 180]) {
        if (Math.abs(deg - snap) <= 3) {
          deg = snap;
          break;
        }
      }
      setRotation(deg);
      setPlacedSignatures((prev) =>
        prev.map((s) =>
          s.id === rotatingSigId ? { ...s, rotation: deg } : s
        )
      );
      return;
    }

    if (resizingSigId) {
      const targetSig = placedSignatures.find((s) => s.id === resizingSigId);
      if (!targetSig) return;
      const halfWidth = Math.abs(relX - targetSig.posX);
      const nextRatio = Math.max(
        0.08,
        Math.min(0.8, Number((halfWidth * 2).toFixed(2)))
      );
      setWidthRatio(nextRatio);
      setPlacedSignatures((prev) =>
        prev.map((s) =>
          s.id === resizingSigId ? { ...s, widthRatio: nextRatio } : s
        )
      );
      return;
    }

    if (draggingSigId) {
      const normX = Math.max(
        0.05,
        Math.min(0.95, relX - dragOffsetRef.current.dx)
      );
      const normY = Math.max(
        0.04,
        Math.min(0.96, relY - dragOffsetRef.current.dy)
      );
      setPosX(normX);
      setPosY(normY);
      setPlacedSignatures((prev) =>
        prev.map((s) =>
          s.id === draggingSigId ? { ...s, posX: normX, posY: normY } : s
        )
      );
    }
  };

  const handleResetFile = () => {
    setFile(null);
    setTotalPages(0);
    setCurrentPage(1);
    setPagePreviewUrl(null);
    setUnlockedPassword(undefined);
    setPlacedSignatures([]);
    setActiveSigId(null);
    lastEditedSigIdRef.current = null;
    setIsProcessing(false);
    setProgressMsg("");
  };

  // Determine which signatures are visible on the current page preview
  const visibleSignaturesOnCurrentPage = placedSignatures.filter(
    (s) =>
      Boolean(s.dataUrl) &&
      (s.targetScope === "ALL_PAGES" ||
        (s.targetScope === "LAST_PAGE" && currentPage === totalPages) ||
        (s.targetScope === "CURRENT_PAGE" && s.pageNumber === currentPage))
  );

  const validPlacedSignatures = placedSignatures.filter((s) =>
    Boolean(s.dataUrl)
  );

  // Actively selected signature on the page (null when no signature is selected)
  const selectedSignature = activeSigId
    ? placedSignatures.find((s) => s.id === activeSigId && Boolean(s.dataUrl)) ??
      null
    : null;

  const handleApplySignatureAndExport = async () => {
    if (!file || validPlacedSignatures.length === 0 || isProcessing) return;

    // Automatically save any placed signatures that haven't been saved yet
    const newlyAutoSaved: SavedSignatureTemplate[] = [];
    const existingList = [...savedSignaturesRef.current];
    for (const sig of validPlacedSignatures) {
      if (
        !existingList.some((existing) => existing.dataUrl === sig.dataUrl) &&
        !newlyAutoSaved.some((added) => added.dataUrl === sig.dataUrl)
      ) {
        const modeTag =
          sig.sigMode === "DRAW"
            ? "DRAWN"
            : sig.sigMode === "TYPE"
            ? `TYPED (${sig.typedName.trim().slice(0, 12) || "TEXT"})`
            : "IMAGE";
        const uniqueSuffix = Math.random().toString(36).slice(2, 7);
        const autoSaved: SavedSignatureTemplate = {
          id: `saved_sig_${Date.now()}_${uniqueSuffix}`,
          dataUrl: sig.dataUrl,
          sigMode: sig.sigMode,
          inkColor: sig.inkColor,
          label: `SIG #${existingList.length + newlyAutoSaved.length + 1} - ${modeTag}`,
          typedName: sig.typedName,
          fontId: sig.fontId,
          includeDateStamp: sig.includeDateStamp,
          includeFlourish: sig.includeFlourish,
          rawUploadDataUrl: sig.rawUploadDataUrl,
          removeBg: sig.removeBg,
          bgThreshold: sig.bgThreshold,
          inkContrast: sig.inkContrast,
          strokeBoost: sig.strokeBoost,
          recolorUploadInk: sig.recolorUploadInk,
        };
        newlyAutoSaved.push(autoSaved);
      }
    }
    if (newlyAutoSaved.length > 0) {
      setSavedSignatures((prev) => {
        const next = [...prev];
        for (const item of newlyAutoSaved) {
          if (!next.some((existing) => existing.dataUrl === item.dataUrl)) {
            next.push(item);
          }
        }
        return next;
      });
      for (const item of newlyAutoSaved) {
        void persistSignatureToFirestore(item);
      }
    }

    setIsProcessing(true);
    setProgressMsg("EMBEDDING_DIGITAL_INK_SIGNATURES...");

    try {
      await yieldFrame();
      const arrayBuffer = await file.arrayBuffer();

      // Pre-decode all placed signature images into rotated PNG bytes & dimensions
      const decodedSigs = await Promise.all(
        validPlacedSignatures.map(async (sigItem) => {
          const dims = await new Promise<{
            baseWidth: number;
            baseHeight: number;
            rotWidth: number;
            rotHeight: number;
            pngBytes: Uint8Array;
          }>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const baseW = img.naturalWidth || 600;
              const baseH = img.naturalHeight || 200;

              const deg = sigItem.rotation ?? 0;
              const rad = (deg * Math.PI) / 180;
              const absCos = Math.abs(Math.cos(rad));
              const absSin = Math.abs(Math.sin(rad));
              const rotW = Math.max(
                1,
                Math.round(baseW * absCos + baseH * absSin)
              );
              const rotH = Math.max(
                1,
                Math.round(baseW * absSin + baseH * absCos)
              );

              const finalCanvas = document.createElement("canvas");
              finalCanvas.width = rotW;
              finalCanvas.height = rotH;
              const finalCtx = finalCanvas.getContext("2d");
              if (finalCtx) {
                finalCtx.translate(rotW / 2, rotH / 2);
                finalCtx.rotate(rad);
                finalCtx.drawImage(img, -baseW / 2, -baseH / 2);
              }

              finalCanvas.toBlob((blob) => {
                if (!blob) {
                  reject(new Error("Failed to encode signature PNG."));
                  return;
                }
                blob.arrayBuffer().then((buf) => {
                  resolve({
                    baseWidth: baseW,
                    baseHeight: baseH,
                    rotWidth: rotW,
                    rotHeight: rotH,
                    pngBytes: new Uint8Array(buf),
                  });
                });
              }, "image/png");
            };
            img.onerror = () =>
              reject(new Error("Could not load signature image."));
            img.src = sigItem.dataUrl;
          });

          return {
            sigItem,
            baseAspect: dims.baseHeight / Math.max(1, dims.baseWidth),
            rotScaleW: dims.rotWidth / Math.max(1, dims.baseWidth),
            rotScaleH: dims.rotHeight / Math.max(1, dims.baseHeight),
            pngBytes: dims.pngBytes,
          };
        })
      );

      const doesSigApplyToPage = (sig: PlacedSignatureItem, pageNum: number) => {
        if (sig.targetScope === "ALL_PAGES") return true;
        if (sig.targetScope === "LAST_PAGE") return pageNum === totalPages;
        return sig.pageNumber === pageNum;
      };

      let outputPdfBytes: Uint8Array;
      let canUseLosslessPdfLib = !unlockedPassword;
      let pdfDoc: PDFDocument | null = null;

      if (canUseLosslessPdfLib) {
        try {
          pdfDoc = await PDFDocument.load(arrayBuffer, {
            updateMetadata: false,
          });
          if (pdfDoc.isEncrypted) {
            canUseLosslessPdfLib = false;
          }
        } catch {
          canUseLosslessPdfLib = false;
        }
      }

      if (canUseLosslessPdfLib && pdfDoc) {
        const pages = pdfDoc.getPages();

        for (const decoded of decodedSigs) {
          const embeddedSig = await pdfDoc.embedPng(decoded.pngBytes);
          const { sigItem, baseAspect, rotScaleW, rotScaleH } = decoded;

          for (let pageNum = 1; pageNum <= pages.length; pageNum++) {
            if (!doesSigApplyToPage(sigItem, pageNum)) continue;
            const page = pages[pageNum - 1];
            if (!page) continue;

            const { width: pw, height: ph } = page.getSize();
            const baseDrawW = pw * sigItem.widthRatio;
            const baseDrawH = baseDrawW * baseAspect;
            const drawW = baseDrawW * rotScaleW;
            const drawH = baseDrawH * rotScaleH;

            const pdfX = sigItem.posX * pw - drawW / 2;
            const pdfY = (1 - sigItem.posY) * ph - drawH / 2;

            page.drawImage(embeddedSig, {
              x: pdfX,
              y: pdfY,
              width: drawW,
              height: drawH,
            });
          }
        }

        setProgressMsg("SAVING_SIGNED_PDF_STREAM...");
        outputPdfBytes = await pdfDoc.save({
          useObjectStreams: true,
          objectsPerTick: Infinity,
          updateFieldAppearances: false,
        });
      } else {
        // Fallback for encrypted PDFs unlocked via PDF.js
        const pdfjsLib = await loadPdfJsLibrary();
        const docParams: any = { data: new Uint8Array(arrayBuffer) };
        if (unlockedPassword) docParams.password = unlockedPassword;
        const pdfDocument = await pdfjsLib.getDocument(docParams).promise;

        const outPdf = await PDFDocument.create();
        const embeddedList = await Promise.all(
          decodedSigs.map(async (d) => ({
            ...d,
            embeddedSig: await outPdf.embedPng(d.pngBytes),
          }))
        );

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        try {
          for (let p = 1; p <= totalPages; p++) {
            setProgressMsg(`STAMPING_PAGE_${p}_OF_${totalPages}...`);
            const page = await pdfDocument.getPage(p);
            const origVp = page.getViewport({ scale: 1.0 });
            const renderVp = page.getViewport({ scale: 1.5 });

            canvas.width = Math.max(1, Math.round(renderVp.width));
            canvas.height = Math.max(1, Math.round(renderVp.height));

            if (ctx) {
              ctx.fillStyle = "#FFFFFF";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              await page.render({ canvasContext: ctx, viewport: renderVp })
                .promise;
            }

            const jpgBlob: Blob = await new Promise((res, rej) =>
              canvas.toBlob(
                (b) => (b ? res(b) : rej(new Error("Canvas export failed"))),
                "image/jpeg",
                0.92
              )
            );
            const jpgBytes = await jpgBlob.arrayBuffer();
            const embeddedJpg = await outPdf.embedJpg(jpgBytes);
            const pdfPage = outPdf.addPage([origVp.width, origVp.height]);
            pdfPage.drawImage(embeddedJpg, {
              x: 0,
              y: 0,
              width: origVp.width,
              height: origVp.height,
            });

            const pw = origVp.width;
            const ph = origVp.height;

            for (const item of embeddedList) {
              if (!doesSigApplyToPage(item.sigItem, p)) continue;
              const baseDrawW = pw * item.sigItem.widthRatio;
              const baseDrawH = baseDrawW * item.baseAspect;
              const drawW = baseDrawW * item.rotScaleW;
              const drawH = baseDrawH * item.rotScaleH;
              const pdfX = item.sigItem.posX * pw - drawW / 2;
              const pdfY = (1 - item.sigItem.posY) * ph - drawH / 2;

              pdfPage.drawImage(item.embeddedSig, {
                x: pdfX,
                y: pdfY,
                width: drawW,
                height: drawH,
              });
            }

            if (typeof page.cleanup === "function") page.cleanup();
          }
        } finally {
          canvas.width = 0;
          canvas.height = 0;
          if (pdfDocument && typeof pdfDocument.destroy === "function") {
            pdfDocument.destroy();
          }
        }

        outputPdfBytes = await outPdf.save({
          useObjectStreams: true,
          objectsPerTick: Infinity,
          updateFieldAppearances: false,
        });
      }

      const outBlob = new Blob([outputPdfBytes], { type: "application/pdf" });
      const cleanName = sanitizeFilename(file.name.replace(/\.[^/.]+$/, ""));
      const defaultFilename = `${cleanName}_monotranscoder`;

      await saveFile("sign_pdf", {
        blob: outBlob,
        filename: defaultFilename,
        size: outBlob.size,
        format: "application/pdf",
        originalName: sanitizeFilename(file.name),
        originalSize: file.size,
      });

      showToast(
        `PDF signed with ${validPlacedSignatures.length} signature${
          validPlacedSignatures.length > 1 ? "s" : ""
        } and exported successfully.`,
        "success"
      );
      onSuccess();
    } catch (err: any) {
      logger.error("Sign PDF error:", err);
      showToast(`Failed to sign PDF: ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
      setProgressMsg("");
    }
  };

  return (
    <section
      className="space-y-6 animate-fade-in"
      id="sign-pdf-view"
      aria-labelledby="sign-pdf-heading"
    >
      <div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            id="sign-pdf-heading"
            className="text-xl font-bold uppercase tracking-tight text-white font-sans"
          >
            Sign PDF Document
          </h1>
          <p className="text-xs text-zinc-400 font-mono">
            Draw, type with calligraphic fonts, or upload &amp; extract signature images. Note: This tool stamps a visual signature image onto the PDF and does not apply a cryptographic (PKI/X.509) certificate.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          id="sign-pdf-drag-drop"
          role="button"
          tabIndex={0}
          aria-label="Upload PDF file to sign. Drag and drop or press enter to browse."
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.[0]) {
              handleLoadPdfFile(e.dataTransfer.files[0]);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 sm:p-12 text-center cursor-pointer transition-all ${
            isDragOver
              ? "border-white bg-zinc-900"
              : "border-zinc-700 hover:border-white hover:bg-zinc-950"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleLoadPdfFile(f);
            }}
            accept="application/pdf,.pdf"
            className="hidden"
            aria-label="Select PDF Document"
          />
          <div className="mx-auto mb-4 flex items-center justify-center">
            <ModuleIconBadge view="sign_pdf" size="lg" />
          </div>
          <h3 className="font-sans font-bold text-base uppercase mb-1 text-white">
            DRAG AND DROP OR BROWSE PDF TO SIGN
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono max-w-sm mx-auto mb-4 uppercase">
            Create handwritten, typed, or extracted image signatures, rotate &amp; stamp them onto your PDF in RAM.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-all shadow-[2px_2px_0px_0px_#ffffff] cursor-pointer rounded"
            aria-label="Select PDF File"
          >
            SELECT_PDF_FILE
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Interactive Page Placement Viewport */}
          <div className="lg:col-span-7 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <div className="font-mono text-xs font-bold uppercase text-white">
                PAGE PLACEMENT VIEWPORT (CLICK PAGE TO DESELECT // DRAG TO MOVE OR ROTATE)
              </div>

              <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 rounded disabled:opacity-30 cursor-pointer"
                  aria-label="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-zinc-300 px-2 font-mono">
                  PAGE <strong className="text-emerald-400 font-bold">{currentPage}</strong> / <span className="text-zinc-400">{totalPages}</span>
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 rounded disabled:opacity-30 cursor-pointer"
                  aria-label="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Placed Signatures Manager Bar on PDF */}
            <div className="bg-black border border-zinc-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold uppercase text-zinc-400 mr-1">
                  PLACED ON PDF ({validPlacedSignatures.length}):
                </span>
                {validPlacedSignatures.length === 0 ? (
                  <span className="text-[11px] font-mono text-zinc-500">
                    Create or click a signature on the right to place on Page {currentPage}
                  </span>
                ) : (
                  validPlacedSignatures.map((sig, idx) => {
                    const isSelected = sig.id === activeSigId;
                    const scopeBadge = `P.${sig.pageNumber}`;
                    return (
                      <div key={sig.id} className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              handleDeselectSignature();
                            } else {
                              handleSelectPlacedSignature(sig);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-l font-mono text-[11px] font-bold uppercase border transition-all cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? "bg-white text-black border-white"
                              : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                          }`}
                        >
                          <span>SIG #{idx + 1}</span>
                          <span className="text-[9px] opacity-80">
                            [{scopeBadge}]
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePlacedSignature(sig.id)}
                          title={`Remove SIG #${idx + 1}`}
                          className={`px-1.5 py-1 rounded-r border-y border-r font-mono text-[11px] cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-zinc-200 text-black border-white hover:bg-red-500 hover:text-white"
                              : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:bg-red-950 hover:text-red-300"
                          }`}
                          aria-label={`Remove Signature ${idx + 1}`}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Page Canvas Container — Supports Drag & Drop onto PDF Page & Click to Deselect */}
            <div
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                  handleDeselectSignature();
                }
              }}
              className="bg-black border border-zinc-800 rounded-lg p-4 flex items-center justify-center"
            >
              <div
                ref={pagePreviewContainerRef}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  if (!isPageDropOver) setIsPageDropOver(true);
                }}
                onDragLeave={() => setIsPageDropOver(false)}
                onDrop={handleDropSignatureOnPage}
                onMouseDown={(e) => {
                  if (
                    e.target === e.currentTarget ||
                    (e.target as HTMLElement).tagName === "IMG"
                  ) {
                    handleDeselectSignature();
                  }
                }}
                onMouseMove={(e) => {
                  if (draggingSigId || resizingSigId || rotatingSigId) {
                    handleViewportPointerMove(e.clientX, e.clientY);
                  }
                }}
                onMouseUp={() => {
                  setDraggingSigId(null);
                  setResizingSigId(null);
                  setRotatingSigId(null);
                }}
                onMouseLeave={() => {
                  setDraggingSigId(null);
                  setResizingSigId(null);
                  setRotatingSigId(null);
                }}
                onTouchMove={(e) => {
                  if (
                    (draggingSigId || resizingSigId || rotatingSigId) &&
                    e.touches[0]
                  ) {
                    if (e.cancelable) e.preventDefault();
                    handleViewportPointerMove(
                      e.touches[0].clientX,
                      e.touches[0].clientY
                    );
                  }
                }}
                onTouchEnd={() => {
                  setDraggingSigId(null);
                  setResizingSigId(null);
                  setRotatingSigId(null);
                }}
                style={{ aspectRatio: `${pageAspectRatio}` }}
                className={`relative w-full max-w-[460px] bg-white rounded shadow-lg overflow-hidden cursor-default select-none transition-all ${
                  isPageDropOver ? "ring-4 ring-black/80" : ""
                }`}
              >
                {pagePreviewUrl ? (
                  <img
                    src={pagePreviewUrl}
                    alt={`PDF Page ${currentPage}`}
                    referrerPolicy="no-referrer"
                    draggable={false}
                    className="w-full h-full object-contain pointer-events-none"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500 font-mono text-xs">
                    RENDERING_PAGE_PREVIEW...
                  </div>
                )}

                {isPageDropOver && (
                  <div className="absolute inset-2 border-2 border-dashed border-black bg-black/10 rounded flex items-center justify-center pointer-events-none z-30">
                    <span className="px-3 py-1.5 bg-black text-white font-mono text-xs font-bold uppercase rounded shadow">
                      DROP SIGNATURE HERE ON PAGE {currentPage}
                    </span>
                  </div>
                )}

                {/* Render All Signatures Placed on Current Page */}
                {visibleSignaturesOnCurrentPage.map((sigItem) => {
                  const globalIdx = validPlacedSignatures.findIndex(
                    (s) => s.id === sigItem.id
                  );
                  const isSelected = sigItem.id === activeSigId;
                  const itemRot = sigItem.rotation ?? 0;

                  return (
                    <div
                      key={sigItem.id}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleSelectPlacedSignature(sigItem);
                        const container = pagePreviewContainerRef.current;
                        if (container) {
                          const rect = container.getBoundingClientRect();
                          const clickX =
                            (e.clientX - rect.left) / Math.max(1, rect.width);
                          const clickY =
                            (e.clientY - rect.top) / Math.max(1, rect.height);
                          dragOffsetRef.current = {
                            dx: clickX - sigItem.posX,
                            dy: clickY - sigItem.posY,
                          };
                        }
                        setDraggingSigId(sigItem.id);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        handleSelectPlacedSignature(sigItem);
                        const container = pagePreviewContainerRef.current;
                        const touch = e.touches[0];
                        if (container && touch) {
                          const rect = container.getBoundingClientRect();
                          const clickX =
                            (touch.clientX - rect.left) /
                            Math.max(1, rect.width);
                          const clickY =
                            (touch.clientY - rect.top) /
                            Math.max(1, rect.height);
                          dragOffsetRef.current = {
                            dx: clickX - sigItem.posX,
                            dy: clickY - sigItem.posY,
                          };
                        }
                        setDraggingSigId(sigItem.id);
                      }}
                      style={{
                        left: `${sigItem.posX * 100}%`,
                        top: `${sigItem.posY * 100}%`,
                        width: `${sigItem.widthRatio * 100}%`,
                        transform: `translate(-50%, -50%) rotate(${itemRot}deg)`,
                      }}
                      className={`absolute rounded p-1 cursor-move transition-shadow ${
                        isSelected
                          ? "border-2 border-dashed border-black bg-black/5 shadow-md z-20"
                          : "border border-transparent hover:border-dashed hover:border-zinc-400/80 z-10"
                      }`}
                    >
                      {/* Top-Center Drag Handle for Rotating Signature */}
                      {isSelected && (
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setRotatingSigId(sigItem.id);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            setRotatingSigId(sigItem.id);
                          }}
                          title="Drag to rotate signature"
                          className="absolute -top-9 left-1/2 -translate-x-1/2 w-7 h-7 bg-black border-2 border-white rounded-full cursor-grab active:cursor-grabbing flex items-center justify-center shadow-lg z-30 touch-none"
                        >
                          <RotateCw className="w-3 h-3 text-white" />
                        </div>
                      )}

                      {/* Badge & Delete Button ONLY shown when signature is selected */}
                      {isSelected && (
                        <div className="absolute -bottom-5 left-0 flex items-center gap-1 pointer-events-auto">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-black text-white whitespace-nowrap">
                            SIG #{globalIdx + 1} • {itemRot}°
                          </span>
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePlacedSignature(sigItem.id);
                            }}
                            className="px-1 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded text-[9px] font-mono font-bold cursor-pointer"
                            title="Delete this signature"
                          >
                            ×
                          </button>
                        </div>
                      )}

                      <img
                        src={sigItem.dataUrl}
                        alt={`Signature ${globalIdx + 1}`}
                        referrerPolicy="no-referrer"
                        draggable={false}
                        className="w-full h-auto object-contain pointer-events-none"
                      />

                      {/* Bottom-Right Corner Resize Handle ONLY shown when signature is selected */}
                      {isSelected && (
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setResizingSigId(sigItem.id);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            setResizingSigId(sigItem.id);
                          }}
                          title="Drag corner to extend or shrink signature scale"
                          className="absolute -bottom-3 -right-3 w-6 h-6 bg-black border-2 border-white rounded-sm cursor-nwse-resize flex items-center justify-center shadow-lg z-30 touch-none"
                        >
                          <Maximize2 className="w-3 h-3 text-white rotate-90" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Position Presets for Active Signature */}
            {selectedSignature && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800 text-[11px] font-mono">
                <span className="text-zinc-400 uppercase">QUICK_POSITION:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPosX(0.75);
                      setPosY(0.85);
                    }}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 rounded cursor-pointer"
                  >
                    BOTTOM_RIGHT
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPosX(0.25);
                      setPosY(0.85);
                    }}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 rounded cursor-pointer"
                  >
                    BOTTOM_LEFT
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPosX(0.5);
                      setPosY(0.85);
                    }}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 rounded cursor-pointer"
                  >
                    BOTTOM_CENTER
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Either Signature Studio (when creating) OR Recently Made Signatures (when studio is closed) */}
          <div className="lg:col-span-5 bg-zinc-950 border-2 border-zinc-800 rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-white flex items-center gap-1.5">
                <PenTool className="w-4 h-4 text-emerald-400" />{" "}
                {isStudioOpen
                  ? "SIGNATURE_STUDIO.CFG"
                  : `MY SIGNATURES (${savedSignatures.length})`}
              </h3>
              <div className="flex items-center gap-3">
                {isStudioOpen && savedSignatures.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsStudioOpen(false)}
                    className="text-[10px] font-mono font-bold uppercase text-zinc-300 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" /> CLOSE STUDIO
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleResetFile}
                  className="text-[10px] font-mono font-bold uppercase underline hover:text-red-400 cursor-pointer text-zinc-400"
                >
                  [CHANGE_FILE]
                </button>
              </div>
            </div>

            {isStudioOpen ? (
              /* =========================================================
               * OPEN STATE: SIGNATURE CREATION STUDIO (DRAW / TYPE / IMAGE)
               * ========================================================= */
              <div className="space-y-4">
                {/* Mode Switcher: 1st IMAGE / 2nd TYPE / 3rd DRAW */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSigMode("UPLOAD")}
                    className={`py-2.5 sm:py-2 min-h-[42px] px-2 rounded-lg font-mono text-[11px] font-bold uppercase border-2 flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      sigMode === "UPLOAD"
                        ? "bg-white text-black border-white"
                        : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>IMAGE</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSigMode("TYPE")}
                    className={`py-2.5 sm:py-2 min-h-[42px] px-2 rounded-lg font-mono text-[11px] font-bold uppercase border-2 flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      sigMode === "TYPE"
                        ? "bg-white text-black border-white"
                        : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    <TypeIcon className="w-3.5 h-3.5" />
                    <span>TYPE</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSigMode("DRAW")}
                    className={`py-2.5 sm:py-2 min-h-[42px] px-2 rounded-lg font-mono text-[11px] font-bold uppercase border-2 flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      sigMode === "DRAW"
                        ? "bg-white text-black border-white"
                        : "bg-black text-zinc-300 border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    <span>DRAW</span>
                  </button>
                </div>

                {/* Ink Color Selector for Draw & Type Modes */}
                {(sigMode === "DRAW" || sigMode === "TYPE") && (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-mono font-bold uppercase text-zinc-400">
                      INK COLOR:
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {INK_COLOR_LABELS.map((item) => (
                        <button
                          key={item.color}
                          type="button"
                          onClick={() => handleSelectInkColor(item.color)}
                          className={`py-1.5 px-2 rounded-lg border font-mono text-[10px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                            inkColor === item.color
                              ? "bg-zinc-900 border-white text-white"
                              : "bg-black border-zinc-800 text-zinc-400 hover:border-zinc-600"
                          }`}
                        >
                          <span
                            className={`w-2.5 h-2.5 rounded-full border shrink-0 ${item.dotClass}`}
                          />
                          <span>{item.label.replace("_INK", "")}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* DRAW MODE */}
                {sigMode === "DRAW" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                      <span>DRAW SIGNATURE BELOW:</span>
                      <button
                        type="button"
                        onClick={handleClearPad}
                        className="text-red-400 hover:underline flex items-center gap-1 cursor-pointer font-bold"
                      >
                        <RotateCcw className="w-3 h-3" /> CLEAR_PAD
                      </button>
                    </div>
                    <canvas
                      ref={drawCanvasRef}
                      width={560}
                      height={190}
                      onMouseDown={handlePadStart}
                      onMouseMove={handlePadMove}
                      onMouseUp={handlePadEnd}
                      onMouseLeave={handlePadEnd}
                      onTouchStart={handlePadStart}
                      onTouchMove={handlePadMove}
                      onTouchEnd={handlePadEnd}
                      className="w-full h-36 bg-white border-2 border-zinc-700 rounded-lg cursor-crosshair touch-none"
                    />
                    {!hasDrawnStrokes && (
                      <p className="text-[10px] font-mono text-zinc-500">
                        Use mouse or touch to sign inside the white pad above.
                      </p>
                    )}
                  </div>
                )}

                {/* TYPE MODE WITH HANDWRITTEN SIGNATURE FONTS */}
                {sigMode === "TYPE" && (
                  <div className="space-y-3.5">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="typed-sig-input"
                        className="block text-[11px] font-mono font-bold uppercase text-zinc-300"
                      >
                        TYPE YOUR NAME OR INITIALS:
                      </label>
                      <input
                        id="typed-sig-input"
                        ref={typedInputRef}
                        type="text"
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        placeholder="e.g. Alex Morgan"
                        className="w-full p-2.5 bg-black border-2 border-zinc-700 text-white rounded-lg text-xs font-mono focus:border-white focus:outline-none"
                      />
                    </div>

                    {/* Handwritten Signature Font Picker */}
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-mono font-bold uppercase text-zinc-400">
                        HANDWRITTEN SIGNATURE FONT STYLE:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {SIGNATURE_FONTS.map((font) => {
                          const isSelected = selectedFontId === font.id;
                          const previewText = typedName.trim() || "Alex Morgan";
                          return (
                            <button
                              key={font.id}
                              type="button"
                              onClick={() => setSelectedFontId(font.id)}
                              className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between overflow-hidden ${
                                isSelected
                                  ? "bg-white text-black border-white shadow-[2px_2px_0px_0px_#ffffff]"
                                  : "bg-black text-zinc-200 border-zinc-800 hover:border-zinc-600"
                              }`}
                            >
                              <div className="flex items-center justify-between w-full text-[9px] font-mono uppercase opacity-70 mb-1">
                                <span>{font.label}</span>
                                <span>{font.styleTag}</span>
                              </div>
                              <div
                                style={{ fontFamily: font.fontFamily }}
                                className="text-2xl leading-tight truncate py-0.5"
                              >
                                {previewText}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 pt-1">
                      <button
                        type="button"
                        onClick={() => setIncludeFlourish((prev) => !prev)}
                        className="flex items-center gap-2 text-xs font-mono text-zinc-300 cursor-pointer"
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center ${
                            includeFlourish
                              ? "bg-white border-white text-black"
                              : "bg-black border-zinc-600"
                          }`}
                        >
                          {includeFlourish && <Check className="w-3 h-3" />}
                        </span>
                        <span>SIGNATURE UNDERLINE SWOOSH</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIncludeDateStamp((prev) => !prev)}
                        className="flex items-center gap-2 text-xs font-mono text-zinc-300 cursor-pointer"
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center ${
                            includeDateStamp
                              ? "bg-white border-white text-black"
                              : "bg-black border-zinc-600"
                          }`}
                        >
                          {includeDateStamp && <Check className="w-3 h-3" />}
                        </span>
                        <span>INCLUDE DATE STAMP</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* MERGED IMAGE + 9-STEP SIGNATURE EXTRACTOR MODE */}
                {sigMode === "UPLOAD" && (
                  <div className="space-y-3">
                    <input
                      type="file"
                      ref={sigImageInputRef}
                      onChange={handleUploadSignatureImage}
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                    />

                    {!rawUploadedSigDataUrl ? (
                      <div
                        onClick={() => sigImageInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const f = e.dataTransfer.files?.[0];
                          if (f) handleUploadSignatureFile(f);
                        }}
                        className="border-2 border-dashed border-zinc-700 hover:border-white bg-black/60 hover:bg-zinc-900/60 transition-colors p-6 text-center cursor-pointer rounded-xl"
                      >
                        <Upload className="w-7 h-7 text-zinc-300 mx-auto mb-2.5" />
                        <p className="font-sans font-bold text-xs sm:text-sm uppercase text-white">
                          DROP HANDWRITTEN SIGNATURE PHOTO OR CLICK TO BROWSE
                        </p>
                        <p className="text-[11px] font-mono text-zinc-400 mt-1">
                          Crop &amp; extract clean transparent ink directly onto the PDF page.
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            sigImageInputRef.current?.click();
                          }}
                          className="mt-4 px-4 py-2 bg-white hover:bg-zinc-200 text-black font-sans font-bold text-xs uppercase inline-flex items-center gap-1.5 rounded shadow-[3px_3px_0px_0px_#ffffff] cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          SELECT SIGNATURE IMAGE
                        </button>
                      </div>
                    ) : (
                      <div className="bg-black border border-zinc-800 rounded-lg p-3.5 space-y-3.5">
                        <button
                          type="button"
                          onClick={() => sigImageInputRef.current?.click()}
                          className="w-full py-2 px-3 border border-zinc-700 hover:border-white rounded bg-zinc-900 text-zinc-200 font-mono text-[11px] font-bold uppercase cursor-pointer transition-colors"
                        >
                          CHANGE SIGNATURE IMAGE
                        </button>

                        {/* Live Interactive Crop Canvas */}
                        <div className="bg-zinc-950 border border-zinc-800 rounded p-2 flex items-center justify-center overflow-hidden">
                          <canvas
                            ref={uploadCropCanvasRef}
                            onPointerDown={handleCropPointerDown}
                            onPointerMove={handleCropPointerMove}
                            onPointerUp={handleCropPointerUp}
                            aria-label="Drag corners to crop signature image"
                            className="max-w-full h-auto cursor-crosshair touch-none border border-zinc-700"
                          />
                        </div>

                        {/* Remove Background (9-Step Signature Extractor Toggle) */}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-900">
                          <div>
                            <span className="text-[11px] font-mono font-bold uppercase text-white flex items-center gap-1.5">
                              <Eraser className="w-3.5 h-3.5" /> REMOVE BACKGROUND
                            </span>
                            <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                              {removeBg
                                ? "9-step Otsu/Adaptive ink extractor active."
                                : "Off: using cropped signature image as-is."}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setRemoveBg((prev) => {
                                const next = !prev;
                                if (!next) {
                                  setRecolorUploadInk(false);
                                }
                                return next;
                              })
                            }
                            className={`px-3 py-1.5 rounded font-mono text-[10px] font-bold uppercase border cursor-pointer transition-all shrink-0 ${
                              removeBg
                                ? "bg-white text-black border-white"
                                : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500"
                            }`}
                          >
                            {removeBg ? "REMOVE BG: ON" : "REMOVE BG: OFF"}
                          </button>
                        </div>

                        {/* Only show extractor sliders, Recolor Signature toggle, and Ink Color below it when Remove BG is ON */}
                        {removeBg && (
                          <div className="space-y-3 pt-2 border-t border-zinc-900">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                                <span>INK SENSITIVITY:</span>
                                <span className="text-white font-bold">
                                  {bgThreshold}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={bgThreshold}
                                onChange={(e) =>
                                  setBgThreshold(Number(e.target.value))
                                }
                                className="w-full accent-white cursor-pointer"
                                aria-label="Ink Sensitivity"
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                                <span>STROKE THICKNESS:</span>
                                <span className="text-white font-bold">
                                  {strokeBoost > 0
                                    ? `+${strokeBoost} PX`
                                    : `${strokeBoost} PX`}
                                </span>
                              </div>
                              <input
                                type="range"
                                min={-2}
                                max={2}
                                step={1}
                                value={strokeBoost}
                                onChange={(e) =>
                                  setStrokeBoost(Number(e.target.value))
                                }
                                className="w-full accent-white cursor-pointer"
                                aria-label="Stroke Thickness"
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                                <span>NOISE &amp; SPECK REMOVAL:</span>
                                <span className="text-white font-bold">
                                  {inkContrast}
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={inkContrast}
                                onChange={(e) =>
                                  setInkContrast(Number(e.target.value))
                                }
                                className="w-full accent-white cursor-pointer"
                                aria-label="Noise and speck removal"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setThresholdMethod((m) =>
                                    m === "otsu" ? "adaptive" : "otsu"
                                  )
                                }
                                className={`p-1.5 border rounded font-mono text-[10px] uppercase font-bold cursor-pointer ${
                                  thresholdMethod === "adaptive"
                                    ? "bg-white border-white text-black"
                                    : "bg-zinc-950 border-zinc-800 text-zinc-300"
                                }`}
                              >
                                MODE:{" "}
                                {thresholdMethod === "otsu"
                                  ? "OTSU GLOBAL"
                                  : "ADAPTIVE"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setMorphClose((v) => !v)}
                                className={`p-1.5 border rounded font-mono text-[10px] uppercase font-bold cursor-pointer ${
                                  morphClose
                                    ? "bg-white border-white text-black"
                                    : "bg-zinc-950 border-zinc-800 text-zinc-400"
                                }`}
                              >
                                HEAL STROKES: {morphClose ? "ON" : "OFF"}
                              </button>
                            </div>

                            {/* Recolor Signature Toggle (Only visible when Remove BG is ON) */}
                            <div className="pt-2 border-t border-zinc-900 space-y-2.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setRecolorUploadInk((prev) => !prev)
                                }
                                className="flex items-center gap-2 text-[11px] font-mono text-zinc-200 cursor-pointer"
                              >
                                <span
                                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                    recolorUploadInk
                                      ? "bg-white border-white text-black"
                                      : "bg-black border-zinc-600"
                                  }`}
                                >
                                  {recolorUploadInk && (
                                    <Check className="w-3 h-3" />
                                  )}
                                </span>
                                <span className="font-bold uppercase">
                                  RECOLOR SIGNATURE INK
                                </span>
                              </button>

                              {/* Ink Color Selector shown directly below Recolor Signature */}
                              {recolorUploadInk && (
                                <div className="space-y-1.5 pl-6">
                                  <label className="block text-[10px] font-mono font-bold uppercase text-zinc-400">
                                    INK COLOR:
                                  </label>
                                  <div className="grid grid-cols-4 gap-1.5">
                                    {INK_COLOR_LABELS.map((item) => (
                                      <button
                                        key={item.color}
                                        type="button"
                                        onClick={() => setInkColor(item.color)}
                                        className={`py-1.5 px-2 rounded border font-mono text-[10px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                                          inkColor === item.color
                                            ? "bg-zinc-900 border-white text-white"
                                            : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-600"
                                        }`}
                                      >
                                        <span
                                          className={`w-2.5 h-2.5 rounded-full border shrink-0 ${item.dotClass}`}
                                        />
                                        <span>
                                          {item.label.replace("_INK", "")}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {signatureDataUrl && (
                          <div
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                "application/x-monotranscoder-studio-sig",
                                "true"
                              );
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            onDragEnd={() => setIsPageDropOver(false)}
                            onClick={handleDeselectSignature}
                            className="space-y-1 cursor-grab active:cursor-grabbing"
                            title="Drag onto PDF page or click to deselect"
                          >
                            <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 uppercase">
                              <span>SIGNATURE PREVIEW (DRAG ONTO PDF):</span>
                              <span>
                                {removeBg ? "TRANSPARENT_INK" : "CROPPED_IMAGE"}
                              </span>
                            </div>
                            <div className="p-3 rounded border border-zinc-700 bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] [background-size:10px_10px] bg-white flex items-center justify-center">
                              <img
                                src={signatureDataUrl}
                                alt="Processed Signature Preview"
                                referrerPolicy="no-referrer"
                                draggable={false}
                                className="max-h-20 w-auto object-contain"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* SAVE SIGNATURE BUTTON (Closes Studio & Shows Recent Signatures) */}
                <button
                  type="button"
                  onClick={handleSaveSignatureFromStudio}
                  disabled={!signatureDataUrl}
                  className="w-full py-2.5 px-4 bg-white text-black hover:bg-zinc-200 border-2 border-white rounded-lg font-mono text-xs font-bold uppercase flex items-center justify-center gap-2 cursor-pointer transition-all shadow-[2px_2px_0px_0px_#ffffff] active:translate-y-0.5 disabled:opacity-35 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" />
                  <span>DONE // SAVE SIGNATURE</span>
                </button>
              </div>
            ) : (
              /* =========================================================
               * CLOSED STUDIO STATE: RECENTLY MADE SIGNATURES (1-CLICK OR DRAG & DROP)
               * ========================================================= */
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold uppercase text-zinc-300">
                    RECENT SIGNATURES (CLICK OR DRAG ONTO PAGE {currentPage}):
                  </span>
                </div>

                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {savedSignatures.map((item) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/x-monotranscoder-sig-id",
                          item.id
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onDragEnd={() => setIsPageDropOver(false)}
                      onClick={() => handlePlaceSavedSignatureOnCurrentPage(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handlePlaceSavedSignatureOnCurrentPage(item);
                        }
                      }}
                      className="group bg-black border-2 border-zinc-800 hover:border-white rounded-lg p-3 cursor-grab active:cursor-grabbing transition-all flex items-center justify-between gap-3 shadow-[2px_2px_0px_0px_#27272a] hover:shadow-[2px_2px_0px_0px_#ffffff]"
                      title={`Click or drag ${item.label} onto Page ${currentPage}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-28 h-12 rounded border border-zinc-700 bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] [background-size:8px_8px] bg-white flex items-center justify-center p-1.5 shrink-0">
                          <img
                            src={item.dataUrl}
                            alt={item.label}
                            referrerPolicy="no-referrer"
                            draggable={false}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="font-mono text-[11px] font-bold uppercase text-white truncate">
                            {item.label}
                          </div>
                          <div className="font-mono text-[10px] text-zinc-400 group-hover:text-white uppercase flex items-center gap-1 mt-0.5">
                            <Plus className="w-3 h-3" />
                            <span>CLICK OR DRAG TO PAGE {currentPage}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-2.5 py-1.5 bg-white text-black font-mono text-[10px] font-bold uppercase rounded">
                          + ADD
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSavedSignature(e, item.id)}
                          title="Delete saved signature"
                          className="p-1.5 bg-zinc-900 hover:!bg-red-600 text-zinc-400 hover:!text-white border border-zinc-700 hover:!border-red-500 rounded cursor-pointer transition-colors"
                          aria-label={`Remove ${item.label}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-current" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Option to Make Another Signature (Re-opens Studio) */}
                <button
                  type="button"
                  onClick={handleOpenStudioForNewSignature}
                  className="w-full py-2.5 px-3 bg-black hover:bg-white text-white hover:text-black border-2 border-zinc-700 hover:border-white rounded-lg font-mono text-xs font-bold uppercase flex items-center justify-center gap-2 cursor-pointer transition-all shadow-[2px_2px_0px_0px_#27272a] hover:shadow-[2px_2px_0px_0px_#ffffff] active:translate-y-0.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>MAKE ANOTHER SIGNATURE</span>
                </button>
              </div>
            )}

            {/* Signature Scale Control — ONLY shown and active when a signature is selected */}
            {selectedSignature && (
              <div className="space-y-3 pt-3 border-t border-zinc-800">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-mono font-bold uppercase text-zinc-400">
                      SIGNATURE SCALE (EXTEND / RESIZE):
                    </label>
                    <span className="font-mono text-xs font-bold text-white tabular-nums">
                      {Math.round(selectedSignature.widthRatio * 100)}% OF PAGE WIDTH
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleScaleSelectedSignature(
                          selectedSignature.widthRatio - 0.03
                        )
                      }
                      className="p-1.5 bg-black hover:bg-zinc-900 text-zinc-300 border border-zinc-700 rounded cursor-pointer"
                      aria-label="Decrease Signature Scale"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min={8}
                      max={80}
                      step={1}
                      value={Math.round(selectedSignature.widthRatio * 100)}
                      onChange={(e) =>
                        handleScaleSelectedSignature(
                          Number(e.target.value) / 100
                        )
                      }
                      className="w-full accent-white cursor-pointer"
                      aria-label="Signature Scale Percentage"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleScaleSelectedSignature(
                          selectedSignature.widthRatio + 0.03
                        )
                      }
                      className="p-1.5 bg-black hover:bg-zinc-900 text-zinc-300 border border-zinc-700 rounded cursor-pointer"
                      aria-label="Increase Signature Scale"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleApplySignatureAndExport}
              disabled={validPlacedSignatures.length === 0 || isProcessing}
              aria-label="Sign and Export PDF Now"
              className="w-full py-3.5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-sans font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#ffffff] active:translate-y-0.5 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Zap className="w-4 h-4" />
              <span>
                {validPlacedSignatures.length > 0
                  ? `SIGN & EXPORT PDF NOW (${validPlacedSignatures.length} SIG${
                      validPlacedSignatures.length > 1 ? "S" : ""
                    })`
                  : "CREATE SIGNATURE ABOVE FIRST"}
              </span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
