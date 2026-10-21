/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Web Worker for non-blocking signature extraction using Transferable ArrayBuffers.
 * Bundled via Vite: new Worker(new URL('./signature.worker.ts', import.meta.url), { type: 'module' })
 */

import { processSignatureBuffer } from "./signatureProcessor";
import { WorkerProcessRequest, WorkerProcessResponse } from "./types";

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerProcessRequest>) => void) | null;
  postMessage: (message: WorkerProcessResponse, transfer: Transferable[]) => void;
}

const ctx = self as unknown as WorkerScope;

ctx.onmessage = (event: MessageEvent<WorkerProcessRequest>) => {
  const { jobId, buffer, width, height, params } = event.data;

  try {
    const rgbaInput = new Uint8ClampedArray(buffer);
    const result = processSignatureBuffer(rgbaInput, width, height, params);

    const outBuffer = result.data.buffer.slice(
      result.data.byteOffset,
      result.data.byteOffset + result.data.byteLength
    );

    const response: WorkerProcessResponse = {
      jobId,
      buffer: outBuffer,
      width: result.width,
      height: result.height,
      empty: result.empty,
    };

    ctx.postMessage(response, [outBuffer]);
  } catch (err) {
    const emptyBuf = new ArrayBuffer(0);
    const response: WorkerProcessResponse = {
      jobId,
      buffer: emptyBuf,
      width: 0,
      height: 0,
      empty: true,
      error: err instanceof Error ? err.message : "WORKER_PROCESSING_ERROR",
    };
    ctx.postMessage(response, [emptyBuf]);
  }
};
