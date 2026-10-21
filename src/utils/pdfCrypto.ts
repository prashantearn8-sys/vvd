/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFString,
  PDFHexString,
  PDFRawStream,
  PDFStream,
  PDFNumber,
} from "pdf-lib";

/**
 * Standard 32-byte PDF encryption padding string defined in ISO 32000-1 (Table 20 / Algorithm 1)
 */
const PDF_PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
  0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

/**
 * Pure TypeScript MD5 implementation (RFC 1321) for PDF Standard Security Handler
 */
export function md5(input: Uint8Array): Uint8Array {
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  }

  const origLenBits = input.length * 8;
  const padLen = ((56 - ((input.length + 1) % 64)) + 64) % 64;
  const totalLen = input.length + 1 + padLen + 8;
  const msg = new Uint8Array(totalLen);
  msg.set(input, 0);
  msg[input.length] = 0x80;

  const view = new DataView(msg.buffer);
  view.setUint32(totalLen - 8, origLenBits >>> 0, true);
  view.setUint32(totalLen - 4, Math.floor(origLenBits / 0x100000000) >>> 0, true);

  let a0 = 0x67452301 >>> 0;
  let b0 = 0xefcdab89 >>> 0;
  let c0 = 0x98badcfe >>> 0;
  let d0 = 0x10325476 >>> 0;

  const M = new Uint32Array(16);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(offset + j * 4, true);
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F = 0;
      let g = 0;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }

      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      const rotated = ((F << s[i]) | (F >>> (32 - s[i]))) >>> 0;
      B = (B + rotated) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return out;
}

/**
 * Pure TypeScript RC4 symmetric stream cipher
 */
export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;

  let j = 0;
  const keyLen = key.length;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % keyLen]) & 0xff;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
  }

  const out = new Uint8Array(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
    const rnd = S[(S[i] + S[j]) & 0xff];
    out[k] = data[k] ^ rnd;
  }
  return out;
}

function padOrTruncatePassword(password: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < password.length && bytes.length < 32; i++) {
    bytes.push(password.charCodeAt(i) & 0xff);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    if (i < bytes.length) {
      out[i] = bytes[i];
    } else {
      out[i] = PDF_PADDING[i - bytes.length];
    }
  }
  return out;
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0").toUpperCase();
  }
  return hex;
}

/**
 * Algorithm 3: Computing the encryption dictionary's O (owner password) value (Revision 3, 128-bit)
 */
function computeOwnerValueR3(userPwd: string, ownerPwd: string): Uint8Array {
  const effectiveOwner = ownerPwd || userPwd;
  const paddedOwner = padOrTruncatePassword(effectiveOwner);
  let digest = md5(paddedOwner);
  for (let i = 0; i < 50; i++) {
    digest = md5(digest.slice(0, 16));
  }
  const rc4Key = digest.slice(0, 16);
  let encrypted = rc4(rc4Key, padOrTruncatePassword(userPwd));
  const tempKey = new Uint8Array(16);
  for (let i = 1; i <= 19; i++) {
    for (let j = 0; j < 16; j++) {
      tempKey[j] = rc4Key[j] ^ i;
    }
    encrypted = rc4(tempKey, encrypted);
  }
  return encrypted;
}

/**
 * Algorithm 2: Computing an encryption key (Revision 3, 128-bit)
 */
function computeEncryptionKeyR3(
  userPwd: string,
  ownerValue: Uint8Array,
  permissions: number,
  fileId: Uint8Array
): Uint8Array {
  const paddedUser = padOrTruncatePassword(userPwd);
  const permBytes = new Uint8Array(4);
  permBytes[0] = permissions & 0xff;
  permBytes[1] = (permissions >>> 8) & 0xff;
  permBytes[2] = (permissions >>> 16) & 0xff;
  permBytes[3] = (permissions >>> 24) & 0xff;

  let digest = md5(concatUint8Arrays([paddedUser, ownerValue, permBytes, fileId]));
  for (let i = 0; i < 50; i++) {
    digest = md5(digest.slice(0, 16));
  }
  return digest.slice(0, 16);
}

/**
 * Algorithm 5: Computing the encryption dictionary's U (user password) value (Revision 3, 128-bit)
 */
function computeUserValueR3(encryptionKey: Uint8Array, fileId: Uint8Array): Uint8Array {
  const digest = md5(concatUint8Arrays([PDF_PADDING, fileId]));
  let encrypted = rc4(encryptionKey, digest);
  const tempKey = new Uint8Array(16);
  for (let i = 1; i <= 19; i++) {
    for (let j = 0; j < 16; j++) {
      tempKey[j] = encryptionKey[j] ^ i;
    }
    encrypted = rc4(tempKey, encrypted);
  }
  const out = new Uint8Array(32);
  out.set(encrypted, 0);
  // Pad remaining 16 bytes with deterministic padding bytes per Algorithm 5
  out.set(PDF_PADDING.slice(0, 16), 16);
  return out;
}

/**
 * Algorithm 1: Derives the per-object RC4 key from the 16-byte file encryption key
 */
function deriveObjectRc4Key(
  encryptionKey: Uint8Array,
  objectNumber: number,
  generationNumber: number
): Uint8Array {
  const extra = new Uint8Array(5);
  extra[0] = objectNumber & 0xff;
  extra[1] = (objectNumber >>> 8) & 0xff;
  extra[2] = (objectNumber >>> 16) & 0xff;
  extra[3] = generationNumber & 0xff;
  extra[4] = (generationNumber >>> 8) & 0xff;

  const digest = md5(concatUint8Arrays([encryptionKey, extra]));
  const keyLen = Math.min(encryptionKey.length + 5, 16);
  return digest.slice(0, keyLen);
}

function encryptPdfObjectInPlace(
  context: any,
  ref: any,
  obj: any,
  objKey: Uint8Array
): void {
  if (!obj) return;

  if (obj instanceof PDFRawStream) {
    const rawBytes = obj.getContents();
    const encBytes = rc4(objKey, rawBytes);
    (obj as any).contents = encBytes;
    obj.dict.set(PDFName.of("Length"), PDFNumber.of(encBytes.length));
    encryptPdfContainer(obj.dict, objKey);
    return;
  }

  if (obj instanceof PDFStream) {
    const rawBytes = obj.getContents();
    const encBytes = rc4(objKey, rawBytes);
    obj.dict.set(PDFName.of("Length"), PDFNumber.of(encBytes.length));
    encryptPdfContainer(obj.dict, objKey);
    context.assign(ref, PDFRawStream.of(obj.dict, encBytes));
    return;
  }

  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    const plainBytes = obj.asBytes();
    const encBytes = rc4(objKey, plainBytes);
    context.assign(ref, PDFHexString.of(bytesToHex(encBytes)));
    return;
  }

  if (obj instanceof PDFDict || obj instanceof PDFArray) {
    encryptPdfContainer(obj, objKey);
  }
}

function encryptPdfContainer(obj: any, objKey: Uint8Array): void {
  if (!obj) return;

  if (obj instanceof PDFDict) {
    const entries = obj.entries();
    for (const [key, val] of entries) {
      if (val instanceof PDFString || val instanceof PDFHexString) {
        const plainBytes = val.asBytes();
        const encBytes = rc4(objKey, plainBytes);
        obj.set(key, PDFHexString.of(bytesToHex(encBytes)));
      } else if (val instanceof PDFDict || val instanceof PDFArray) {
        encryptPdfContainer(val, objKey);
      }
    }
    return;
  }

  if (obj instanceof PDFArray) {
    const size = obj.size();
    for (let i = 0; i < size; i++) {
      const el = obj.get(i);
      if (el instanceof PDFString || el instanceof PDFHexString) {
        const plainBytes = el.asBytes();
        const encBytes = rc4(objKey, plainBytes);
        obj.set(i, PDFHexString.of(bytesToHex(encBytes)));
      } else if (el instanceof PDFDict || el instanceof PDFArray) {
        encryptPdfContainer(el, objKey);
      }
    }
  }
}

export interface PdfLockOptions {
  userPassword: string;
  ownerPassword?: string;
  allowPrinting?: boolean;
  allowCopying?: boolean;
  allowModifying?: boolean;
}

/**
 * Encrypts a PDF document with a Document Open Password using ISO 32000-1 Standard Security Handler (128-bit RC4, V=2, R=3)
 * Rebuilds a clean sequential cross-reference table so all PDF readers prompt for the password on open.
 */
export async function encryptPdfBuffer(
  sourceBuffer: ArrayBuffer,
  options: PdfLockOptions
): Promise<Uint8Array> {
  const {
    userPassword,
    ownerPassword,
    allowPrinting = true,
    allowCopying = true,
    allowModifying = false,
  } = options;

  // 1. Copy all pages into a brand-new PDFDocument so object numbers are strictly 1..N with zero XRefStm/ObjStm remnants
  const srcDoc = await PDFDocument.load(sourceBuffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const cleanDoc = await PDFDocument.create();
  const pageIndices = srcDoc.getPageIndices();
  const copiedPages = await cleanDoc.copyPages(srcDoc, pageIndices);
  for (const page of copiedPages) {
    cleanDoc.addPage(page);
  }

  const normalizedBytes = await cleanDoc.save({
    useObjectStreams: false,
    objectsPerTick: Infinity,
  });

  const pdfDoc = await PDFDocument.load(normalizedBytes, { updateMetadata: false });

  // Remove any unencrypted XMP /Metadata stream reference on Catalog if present
  try {
    pdfDoc.catalog.delete(PDFName.of("Metadata"));
  } catch {
    // Ignore if absent
  }

  // 2. Build 32-bit PDF Permissions bitmask (Table 22 in ISO 32000-1)
  // Bits 1-2 must be 0, Bits 7-8 must be 1, Bits 13-32 must be 1 -> base = 0xFFFFF0C0 (-3904)
  let permissions = 0xfffff0c0;
  if (allowPrinting) {
    permissions |= (1 << 2) | (1 << 11);
  }
  if (allowModifying) {
    permissions |= (1 << 3) | (1 << 5) | (1 << 8) | (1 << 10);
  }
  if (allowCopying) {
    permissions |= (1 << 4) | (1 << 9);
  }
  const signedPermissions = permissions | 0;

  // 3. Generate 16-byte document ID
  const fileId = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(fileId);
  } else {
    for (let i = 0; i < 16; i++) fileId[i] = (Date.now() + i * 37) & 0xff;
  }
  const fileIdHex = bytesToHex(fileId);

  // 4. Compute O, encryptionKey, and U for the Document Open Password
  const effectiveOwner =
    ownerPassword && ownerPassword.trim() ? ownerPassword : `${userPassword}#owner`;
  const ownerVal = computeOwnerValueR3(userPassword, effectiveOwner);
  const encryptionKey = computeEncryptionKeyR3(
    userPassword,
    ownerVal,
    signedPermissions,
    fileId
  );
  const userVal = computeUserValueR3(encryptionKey, fileId);

  // 5. Encrypt all indirect objects in the document
  const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
  for (const [ref, obj] of indirectObjects) {
    const objKey = deriveObjectRc4Key(
      encryptionKey,
      ref.objectNumber,
      ref.generationNumber
    );
    encryptPdfObjectInPlace(pdfDoc.context, ref, obj, objKey);
  }

  // 6. Register /Encrypt dictionary (unencrypted) and attach /Encrypt + /ID to trailerInfo
  const encryptDict = pdfDoc.context.obj({
    Filter: PDFName.of("Standard"),
    V: PDFNumber.of(2),
    R: PDFNumber.of(3),
    Length: PDFNumber.of(128),
    P: PDFNumber.of(signedPermissions),
    O: PDFHexString.of(bytesToHex(ownerVal)),
    U: PDFHexString.of(bytesToHex(userVal)),
  });
  const encryptRef = pdfDoc.context.register(encryptDict);

  pdfDoc.context.trailerInfo.Encrypt = encryptRef;
  pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([
    PDFHexString.of(fileIdHex),
    PDFHexString.of(fileIdHex),
  ]);

  return await pdfDoc.save({
    useObjectStreams: false,
    objectsPerTick: Infinity,
    updateFieldAppearances: false,
  });
}
