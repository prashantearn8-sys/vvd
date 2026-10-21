/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ThresholdMethod = "otsu" | "adaptive";

export interface ProcessingParams {
  /** Threshold shift sensitivity (0 = strict/dark ink only, 50 = balanced Otsu, 100 = faint ink recovery) */
  sensitivity: number;
  /** Thresholding strategy: global Otsu ('otsu') or local-mean adaptive ('adaptive') */
  thresholdMethod: ThresholdMethod;
  /** Stroke thickness adjustment in pixels (-2 to +2) via morphological erosion/dilation on alpha */
  thickness: number;
  /** Minimum connected-component area as a fraction of total image pixels (default 0.0001 = 0.01%) */
  minComponentAreaRatio: number;
  /** Apply a light morphological close to rejoin broken thin pen strokes */
  morphClose: boolean;
  /** Output ink color in hex format (e.g. '#000000' black, '#0A2463' dark blue, or custom) */
  inkColor: string;
  /** Transparent padding in pixels added around the auto-cropped signature bounding box (default 16) */
  padding: number;
  /** Automatically crop to the tight bounding box of pixels with alpha > 10 (default true) */
  autoCrop: boolean;
  /** Optional lazy-loaded OpenCV.js pipeline execution behind the same interface (default false) */
  useOpenCv?: boolean;
}

export const DEFAULT_PROCESSING_PARAMS: ProcessingParams = {
  sensitivity: 50,
  thresholdMethod: "otsu",
  thickness: 0,
  minComponentAreaRatio: 0.0001, // 0.01% of image area
  morphClose: false,
  inkColor: "#000000",
  padding: 16,
  autoCrop: true,
  useOpenCv: false,
};

export interface SignatureResult {
  /** Transparent PNG Blob ('image/png') */
  blob: Blob;
  /** Data URL ('data:image/png;base64,...') for immediate preview/embedding */
  dataUrl: string;
  /** Cropped output width in pixels */
  width: number;
  /** Cropped output height in pixels */
  height: number;
  /** Exact parameters used to produce this output */
  params: ProcessingParams;
  /** Optional vectorized SVG string if SVG contour tracing was requested */
  svgString?: string;
}

export interface SignatureExtractorProps {
  /** Fired when the user clicks "Use Signature" with the final full-resolution PNG Blob & metadata */
  onComplete: (result: SignatureResult) => void;
  /** Fired when the user cancels or closes the extractor */
  onCancel: () => void;
  /** Optional overrides for default processing parameters */
  initialParams?: Partial<ProcessingParams>;
  /** Optional pre-selected file to load directly into the pipeline */
  initialFile?: File | null;
  /** Maximum allowed upload file size in bytes (default: 15 MB) */
  maxFileSizeBytes?: number;
  /** Compact embedded mode when mounted inside a modal or tab */
  compact?: boolean;
}

export interface NormalizedCropRect {
  /** Normalized X (0..1) */
  x: number;
  /** Normalized Y (0..1) */
  y: number;
  /** Normalized Width (0..1) */
  width: number;
  /** Normalized Height (0..1) */
  height: number;
}

export interface WorkerProcessRequest {
  jobId: number;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  params: ProcessingParams;
}

export interface WorkerProcessResponse {
  jobId: number;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  empty: boolean;
  error?: string;
}
