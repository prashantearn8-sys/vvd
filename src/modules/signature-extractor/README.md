# Client-Side Handwritten Signature Extractor (`src/modules/signature-extractor`)

A zero-upload, 100% client-side handwritten signature extraction module that converts smartphone photos or scans of signatures on paper into clean, anti-aliased, tightly cropped transparent PNGs (and optional vector SVGs).

---

## Folder Structure

```text
src/modules/signature-extractor/
├── index.ts                      # Public barrel exports (<SignatureExtractor />, processSignature, hooks, types)
├── types.ts                      # TypeScript interfaces (ProcessingParams, SignatureResult, SignatureExtractorProps)
├── signatureProcessor.ts         # Pure TypeScript 9-step typed-array pipeline + headless processSignature()
├── signature.worker.ts           # Web Worker using Transferable ArrayBuffers so the UI thread never blocks
├── useSignatureExtractor.ts      # React hook (~150ms debounce, stale job cancellation, ~800px preview / 2500px final)
├── SignatureExtractor.tsx        # 3-step accessible React UI (Upload/Camera -> Crop -> Result Editor)
├── svgTracer.ts                  # Lazy-loaded SVG scanline contour tracer
└── __tests__/
    ├── signatureProcessor.test.ts    # Vitest unit tests on synthetic shadowed signature images
    └── SignatureExtractor.test.tsx   # Testing Library flow test (upload -> adjust -> onComplete PNG Blob)
```

---

## Bundler & Vite Web Worker Setup

The hook spawns the module worker using Vite's native standard URL constructor:

```ts
const worker = new Worker(
  new URL("./signature.worker.ts", import.meta.url),
  { type: "module" }
);
```

No special Vite plugins are required for Vite 5/6+.

---

## Content Security Policy (CSP) Requirements

Because all processing happens locally inside a bundled Web Worker and uses `Blob` URLs for downloads/previews, ensure your HTTP `Content-Security-Policy` includes:

```http
Content-Security-Policy:
  default-src 'self';
  img-src 'self' data: blob:;
  worker-src 'self' blob:;
```

*(Note: `script-src 'wasm-unsafe-eval'` is only needed if you enable an external WebAssembly OpenCV build; the default pure TypeScript TypedArray pipeline requires zero WASM or external scripts.)*

---

## Usage 1: Mounting `<SignatureExtractor />` Inside a Page or Modal

```tsx
import React, { useState } from "react";
import { SignatureExtractor, SignatureResult } from "./modules/signature-extractor";

export function SignatureModalDemo() {
  const [isOpen, setIsOpen] = useState(false);
  const [signature, setSignature] = useState<SignatureResult | null>(null);

  return (
    <div>
      <button onClick={() => setIsOpen(true)}>Extract Handwritten Signature</button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl">
            <SignatureExtractor
              initialParams={{
                sensitivity: 50,
                inkColor: "#0A2463", // Archival Dark Blue
                padding: 16,
              }}
              onComplete={(result) => {
                setSignature(result);
                setIsOpen(false);
                // result.blob (image/png), result.dataUrl, result.width, result.height
              }}
              onCancel={() => setIsOpen(false)}
            />
          </div>
        </div>
      )}

      {signature && (
        <img
          src={signature.dataUrl}
          width={signature.width}
          height={signature.height}
          alt="Extracted signature"
        />
      )}
    </div>
  );
}
```

---

## Usage 2: Headless Pipeline (`processSignature`)

Other parts of the application can run the exact same 9-step extraction pipeline without mounting any UI:

```ts
import { processSignature } from "./modules/signature-extractor";

async function extractHeadless(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const imageData = await processSignature(bitmap, {
      sensitivity: 55,
      thresholdMethod: "otsu",
      thickness: 0,
      minComponentAreaRatio: 0.0001,
      inkColor: "#000000",
      padding: 16,
    });
    return imageData;
  } finally {
    bitmap.close();
  }
}
```
