/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FirebaseApp } from "firebase/app";
import type { Auth, GoogleAuthProvider } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

export const AUTH_SESSION_STORAGE_KEY = "monotranscoder_auth_active";

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  googleProvider: GoogleAuthProvider;
  authMod: typeof import("firebase/auth");
  firestoreMod: typeof import("firebase/firestore");
}

let servicesPromise: Promise<FirebaseServices> | null = null;
let cachedAuthInstance: Auth | null = null;

/**
 * Checks whether the browser has a stored Firebase sign-in session so we only
 * load Firebase on boot for returning signed-in users—keeping anonymous page loads
 * 100% free of outbound Google/Firebase network requests.
 */
export function hasStoredAuthSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY) === "1") {
      return true;
    }
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("firebase:authUser:")) {
        return true;
      }
    }
  } catch {
    // localStorage inaccessible in strict privacy mode
  }
  return false;
}

/**
 * Lazily imports and initializes Firebase Auth & Firestore only when needed
 * (at sign-in or when restoring an existing authenticated session).
 * No boot ping is ever executed.
 */
export function getFirebaseServices(): Promise<FirebaseServices> {
  if (!servicesPromise) {
    servicesPromise = (async () => {
      const [appMod, authMod, firestoreMod] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
        import("firebase/firestore"),
      ]);

      const app =
        appMod.getApps().length > 0
          ? appMod.getApp()
          : appMod.initializeApp(firebaseConfig);

      let db: Firestore;
      try {
        db = firestoreMod.initializeFirestore(
          app,
          {
            experimentalForceLongPolling: true,
          },
          firebaseConfig.firestoreDatabaseId
        );
      } catch {
        db = firestoreMod.getFirestore(app, firebaseConfig.firestoreDatabaseId);
      }

      firestoreMod.setLogLevel("silent");

      const auth = authMod.getAuth(app);
      cachedAuthInstance = auth;
      const googleProvider = new authMod.GoogleAuthProvider();

      return {
        app,
        auth,
        db,
        googleProvider,
        authMod,
        firestoreMod,
      };
    })();
  }
  return servicesPromise;
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const errCode = (error as { code?: string })?.code || "";
  const errMsg = error instanceof Error ? error.message : String(error);

  if (
    errCode === "unavailable" ||
    errMsg.includes("the client is offline") ||
    errMsg.includes("Could not reach Cloud Firestore backend")
  ) {
    console.warn(`Firestore transient network state (${operationType} ${path}):`, errMsg);
    return;
  }

  const currentUser = cachedAuthInstance?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
