/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export { SignatureExtractor, default } from "./SignatureExtractor";
export {
  processSignature,
  processSignatureBuffer,
  computeGrayscaleLuminance,
  normalizeIllumination,
  autoLevelsStretch,
  computeOtsuThreshold,
  computeSoftAlphaMask,
  cleanNoiseConnectedComponents,
  adjustStrokeThickness,
} from "./signatureProcessor";
export { useSignatureExtractor } from "./useSignatureExtractor";
export { traceSignatureToSvg } from "./svgTracer";
export * from "./types";
