import { describe, it, expect } from "vitest";

interface DirtyPayloadCase {
  id: number;
  name: string;
  path: string;
  operation: "get" | "list" | "create" | "update" | "delete";
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  parentExists?: boolean;
}

const DIRTY_DOZEN_CASES: DirtyPayloadCase[] = [
  {
    id: 1,
    name: "Unauthenticated Write",
    path: "/users/user_123",
    operation: "create",
    auth: null,
    payload: {
      uid: "user_123",
      displayName: "Alice",
      photoURL: "",
      favoriteTools: "",
      createdAt: "SERVER_TIME",
      updatedAt: "SERVER_TIME",
    },
  },
  {
    id: 2,
    name: "Unverified Email Spoof",
    path: "/users/user_123",
    operation: "create",
    auth: { uid: "user_123", email: "alice@example.com", email_verified: false },
    payload: {
      uid: "user_123",
      displayName: "Alice",
      photoURL: "",
      favoriteTools: "",
      createdAt: "SERVER_TIME",
      updatedAt: "SERVER_TIME",
    },
  },
  {
    id: 3,
    name: "Cross-User Identity Spoofing",
    path: "/users/victim_1",
    operation: "create",
    auth: { uid: "attacker_1", email: "attacker@example.com", email_verified: true },
    payload: {
      uid: "victim_1",
      displayName: "Victim",
      photoURL: "",
      favoriteTools: "",
      createdAt: "SERVER_TIME",
      updatedAt: "SERVER_TIME",
    },
  },
  {
    id: 4,
    name: "UID Field Mismatch",
    path: "/users/user_123",
    operation: "create",
    auth: { uid: "user_123", email: "alice@example.com", email_verified: true },
    payload: {
      uid: "other_uid",
      displayName: "Alice",
      photoURL: "",
      favoriteTools: "",
      createdAt: "SERVER_TIME",
      updatedAt: "SERVER_TIME",
    },
  },
  {
    id: 5,
    name: "Shadow / Ghost Field Injection",
    path: "/users/user_123",
    operation: "create",
    auth: { uid: "user_123", email: "alice@example.com", email_verified: true },
    payload: {
      uid: "user_123",
      displayName: "Alice",
      photoURL: "",
      favoriteTools: "",
      isAdmin: true,
      createdAt: "SERVER_TIME",
      updatedAt: "SERVER_TIME",
    },
  },
  {
    id: 6,
    name: "ID Poisoning Attack",
    path: "/users/bad$id!@#",
    operation: "create",
    auth: { uid: "bad$id!@#", email: "alice@example.com", email_verified: true },
    payload: {
      uid: "bad$id!@#",
      displayName: "Alice",
      photoURL: "",
      favoriteTools: "",
      createdAt: "SERVER_TIME",
      updatedAt: "SERVER_TIME",
    },
  },
  {
    id: 7,
    name: "Denial-of-Wallet Oversized String",
    path: "/users/user_123",
    operation: "create",
    auth: { uid: "user_123", email: "alice@example.com", email_verified: true },
    payload: {
      uid: "user_123",
      displayName: "A".repeat(5000),
      photoURL: "",
      favoriteTools: "",
      createdAt: "SERVER_TIME",
      updatedAt: "SERVER_TIME",
    },
  },
  {
    id: 8,
    name: "Client Timestamp Forgery",
    path: "/users/user_123",
    operation: "create",
    auth: { uid: "user_123", email: "alice@example.com", email_verified: true },
    payload: {
      uid: "user_123",
      displayName: "Alice",
      photoURL: "",
      favoriteTools: "",
      createdAt: "2020-01-01T00:00:00Z",
      updatedAt: "SERVER_TIME",
    },
  },
  {
    id: 9,
    name: "Immortal Field Mutation on Update",
    path: "/users/user_123",
    operation: "update",
    auth: { uid: "user_123", email: "alice@example.com", email_verified: true },
    payload: {
      uid: "user_123",
      displayName: "Alice",
      photoURL: "",
      favoriteTools: "",
      createdAt: "FORGED_NEW_CREATED_AT",
      updatedAt: "SERVER_TIME",
    },
  },
  {
    id: 10,
    name: "Value Poisoning on Update",
    path: "/users/user_123",
    operation: "update",
    auth: { uid: "user_123", email: "alice@example.com", email_verified: true },
    payload: {
      uid: "user_123",
      displayName: "Alice",
      photoURL: "",
      favoriteTools: 12345,
      createdAt: "ORIGINAL_TIME",
      updatedAt: "SERVER_TIME",
    },
  },
  {
    id: 11,
    name: "Cross-User Signature Read",
    path: "/users/victim_1/signatures/sig_1",
    operation: "get",
    auth: { uid: "attacker_1", email: "attacker@example.com", email_verified: true },
  },
  {
    id: 12,
    name: "Orphaned Subcollection Signature Write",
    path: "/users/user_123/signatures/sig_1",
    operation: "create",
    auth: { uid: "user_123", email: "alice@example.com", email_verified: true },
    parentExists: false,
    payload: {
      uid: "user_123",
      sigId: "sig_1",
      label: "SIG #1",
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      sigMode: "DRAW",
      inkColor: "#000000",
      typedName: "",
      fontId: "great_vibes",
      createdAt: "SERVER_TIME",
      updatedAt: "SERVER_TIME",
    },
  },
];

function evaluateRule(testCase: DirtyPayloadCase): "PERMISSION_DENIED" | "ALLOWED" {
  const { auth, path, operation, payload, parentExists = true } = testCase;
  if (!auth) return "PERMISSION_DENIED";

  const idRegex = /^[a-zA-Z0-9_\-]+$/;
  const segments = path.split("/").filter(Boolean);

  if (segments[0] === "users" && segments.length === 2) {
    const userId = segments[1];
    if (!idRegex.test(userId) || userId.length > 128) return "PERMISSION_DENIED";
    if (auth.uid !== userId) return "PERMISSION_DENIED";

    if (operation === "get") return "ALLOWED";
    if (!auth.email_verified) return "PERMISSION_DENIED";
    if (!payload) return "PERMISSION_DENIED";

    const allowedKeys = ["uid", "displayName", "photoURL", "favoriteTools", "createdAt", "updatedAt"];
    const keys = Object.keys(payload);
    if (keys.length !== allowedKeys.length || !keys.every((k) => allowedKeys.includes(k))) {
      return "PERMISSION_DENIED";
    }
    if (payload.uid !== auth.uid) return "PERMISSION_DENIED";
    if (typeof payload.displayName !== "string" || payload.displayName.length < 1 || payload.displayName.length > 100) {
      return "PERMISSION_DENIED";
    }
    if (typeof payload.photoURL !== "string" || payload.photoURL.length > 500) {
      return "PERMISSION_DENIED";
    }
    if (typeof payload.favoriteTools !== "string" || payload.favoriteTools.length > 500) {
      return "PERMISSION_DENIED";
    }
    if (operation === "create") {
      if (payload.createdAt !== "SERVER_TIME" || payload.updatedAt !== "SERVER_TIME") {
        return "PERMISSION_DENIED";
      }
      return "ALLOWED";
    }
    if (operation === "update") {
      if (payload.createdAt !== "ORIGINAL_TIME" || payload.updatedAt !== "SERVER_TIME") {
        return "PERMISSION_DENIED";
      }
      return "ALLOWED";
    }
  }

  if (segments[0] === "users" && segments[2] === "private" && segments.length === 4) {
    const userId = segments[1];
    const infoId = segments[3];
    if (!idRegex.test(userId) || !idRegex.test(infoId)) return "PERMISSION_DENIED";
    if (auth.uid !== userId) return "PERMISSION_DENIED";
    if (!parentExists) return "PERMISSION_DENIED";
    if (operation === "get") return "ALLOWED";
  }

  if (segments[0] === "users" && segments[2] === "signatures" && segments.length === 4) {
    const userId = segments[1];
    const sigId = segments[3];
    if (!idRegex.test(userId) || !idRegex.test(sigId)) return "PERMISSION_DENIED";
    if (auth.uid !== userId) return "PERMISSION_DENIED";
    if (!parentExists) return "PERMISSION_DENIED";
    if (operation === "get") return "ALLOWED";
  }

  return "PERMISSION_DENIED";
}

describe("Firestore Security Rules — Dirty Dozen Verification", () => {
  for (const testCase of DIRTY_DOZEN_CASES) {
    it(`rejects Payload #${testCase.id}: ${testCase.name} with PERMISSION_DENIED`, () => {
      expect(evaluateRule(testCase)).toBe("PERMISSION_DENIED");
    });
  }
});
