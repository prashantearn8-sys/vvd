/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * @vitest-environment jsdom
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { SignatureExtractor } from "../SignatureExtractor";

describe("<SignatureExtractor /> end-to-end flow", () => {
  beforeEach(() => {
    // Mock createImageBitmap in JSDOM to return a synthetic 200x100 ImageBitmap-like object
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({
        width: 200,
        height: 100,
        close: vi.fn(),
      }))
    );

    // Mock HTMLCanvasElement.prototype.getContext for JSDOM
    HTMLCanvasElement.prototype.getContext = vi.fn(function (
      this: HTMLCanvasElement
    ) {
      const w = this.width || 200;
      const h = this.height || 100;
      return {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        setLineDash: vi.fn(),
        drawImage: vi.fn(),
        putImageData: vi.fn(),
        getImageData: vi.fn(() => {
          const data = new Uint8ClampedArray(w * h * 4);
          // Fill paper background (240)
          for (let i = 0; i < w * h * 4; i += 4) {
            data[i] = 240;
            data[i + 1] = 240;
            data[i + 2] = 240;
            data[i + 3] = 255;
          }
          // Draw dark ink signature block in center
          for (let y = Math.floor(h * 0.35); y < Math.floor(h * 0.55); y++) {
            for (let x = Math.floor(w * 0.25); x < Math.floor(w * 0.75); x++) {
              const idx = (y * w + x) * 4;
              data[idx] = 15;
              data[idx + 1] = 15;
              data[idx + 2] = 15;
              data[idx + 3] = 255;
            }
          }
          return { data, width: w, height: h };
        }),
      } as unknown as CanvasRenderingContext2D;
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.toDataURL = vi.fn(
      () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    );

    HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) => {
      cb(new Blob(["PNG_BINARY_DATA"], { type: "image/png" }));
    });
  });

  it("uploads an image, crops, adjusts sensitivity slider, and fires onComplete with a PNG Blob", async () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();

    const { getByTestId } = render(
      <SignatureExtractor onComplete={onComplete} onCancel={onCancel} />
    );

    // Step 1: Upload synthetic image file
    const fileInput = getByTestId("sigx-file-input") as HTMLInputElement;
    const fakeFile = new File(["synthetic-image-bytes"], "handwritten-sig.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    // Step 2: Wait for Crop step and click Extract Signature
    const applyCropBtn = await waitFor(() => getByTestId("sigx-apply-crop-btn"));
    fireEvent.click(applyCropBtn);

    // Step 3: Adjust Sensitivity slider in Result Editor
    const sensitivitySlider = await waitFor(() =>
      getByTestId("sigx-sensitivity-slider")
    );
    fireEvent.change(sensitivitySlider, { target: { value: "65" } });

    // Click Use Signature and assert onComplete payload
    const useSignatureBtn = getByTestId("sigx-use-signature-btn");
    fireEvent.click(useSignatureBtn);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    const result = onComplete.mock.calls[0][0];
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe("image/png");
    expect(result.dataUrl).toMatch(/^data:image\/png/);
    expect(result.width).toBeGreaterThan(10);
    expect(result.height).toBeGreaterThan(10);
    expect(result.params.sensitivity).toBe(65);
  });
});
