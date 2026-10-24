/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from "../firebase";
import { useToast } from "./ToastContext";

// Validation constants synchronized verbatim with firebase-blueprint.json
export const UID_MAX_LENGTH = 128;
export const UID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 100;
export const PHOTO_URL_MAX_LENGTH = 500;
export const FAVORITE_TOOLS_MAX_LENGTH = 500;
export const EMAIL_MIN_LENGTH = 3;
export const EMAIL_MAX_LENGTH = 254;

export interface UserProfileData {
  uid: string;
  displayName: string;
  photoURL: string;
  favoriteTools: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivateInfoData {
  uid: string;
  email: string;
  updatedAt?: unknown;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfileData | null;
  privateInfo: UserPrivateInfoData | null;
  isAuthReady: boolean;
  isSigningIn: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  updateDisplayName: (newName: string) => Promise<void>;
  toggleFavoriteTool: (toolId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function sanitizeDisplayName(raw: string | null | undefined): string {
  const cleaned = (raw || "Operator").trim().slice(0, DISPLAY_NAME_MAX_LENGTH);
  return cleaned.length >= DISPLAY_NAME_MIN_LENGTH ? cleaned : "Operator";
}

function sanitizePhotoURL(raw: string | null | undefined): string {
  return (raw || "").trim().slice(0, PHOTO_URL_MAX_LENGTH);
}

function sanitizeEmail(raw: string | null | undefined): string {
  return (raw || "").trim().slice(0, EMAIL_MAX_LENGTH);
}

function extractGooglePhotoURL(firebaseUser: User): string {
  const providerPhoto = firebaseUser.providerData?.find((p) => p?.photoURL)?.photoURL;
  return sanitizePhotoURL(firebaseUser.photoURL || providerPhoto);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [privateInfo, setPrivateInfo] = useState<UserPrivateInfoData | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const { addToast } = useToast();

  // Ensure user documents exist in Firestore on sign-in
  const ensureUserRecords = useCallback(async (firebaseUser: User) => {
    const uid = firebaseUser.uid;
    if (!uid || uid.length > UID_MAX_LENGTH || !UID_PATTERN.test(uid)) {
      return;
    }

    const userDocPath = `users/${uid}`;
    const userDocRef = doc(db, "users", uid);
    const privateDocRef = doc(db, "users", uid, "private", "info");

    try {
      const existingSnap = await getDoc(userDocRef);
      const safePhotoURL = extractGooglePhotoURL(firebaseUser);

      if (!existingSnap.exists()) {
        if (!firebaseUser.emailVerified) {
          return;
        }
        const batch = writeBatch(db);
        const safeDisplayName = sanitizeDisplayName(
          firebaseUser.displayName || firebaseUser.email?.split("@")[0]
        );
        const safeEmail = sanitizeEmail(firebaseUser.email);

        batch.set(userDocRef, {
          uid,
          displayName: safeDisplayName,
          photoURL: safePhotoURL,
          favoriteTools: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (safeEmail.length >= EMAIL_MIN_LENGTH) {
          batch.set(privateDocRef, {
            uid,
            email: safeEmail,
            updatedAt: serverTimestamp(),
          });
        }

        await batch.commit();
      } else {
        const existingData = existingSnap.data() as Partial<UserProfileData>;
        if (safePhotoURL && existingData.photoURL !== safePhotoURL) {
          await updateDoc(userDocRef, {
            photoURL: safePhotoURL,
            updatedAt: serverTimestamp(),
          });
        }

        // Ensure private email record exists if verified
        const privSnap = await getDoc(privateDocRef);
        const safeEmail = sanitizeEmail(firebaseUser.email);
        if (!privSnap.exists() && firebaseUser.emailVerified && safeEmail.length >= EMAIL_MIN_LENGTH) {
          await setDoc(privateDocRef, {
            uid,
            email: safeEmail,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, userDocPath);
      } catch {
        // Logged by handleFirestoreError
      }
    }
  }, []);

  // Track Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        await ensureUserRecords(currentUser);
        setUser(currentUser);
        setIsAuthReady(true);
      } else {
        setUser(null);
        setProfile(null);
        setPrivateInfo(null);
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, [ensureUserRecords]);

  // Attach real-time listeners only when auth is ready and user is authenticated
  useEffect(() => {
    if (!isAuthReady || !user) {
      setProfile(null);
      setPrivateInfo(null);
      return;
    }

    const uid = user.uid;
    if (!uid || uid.length > UID_MAX_LENGTH || !UID_PATTERN.test(uid)) {
      return;
    }

    const userDocPath = `users/${uid}`;
    const privateDocPath = `users/${uid}/private/info`;

    const unsubProfile = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfileData);
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, userDocPath);
        } catch {
          // Handled and logged
        }
      }
    );

    const unsubPrivate = onSnapshot(
      doc(db, "users", uid, "private", "info"),
      (snap) => {
        if (snap.exists()) {
          setPrivateInfo(snap.data() as UserPrivateInfoData);
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, privateDocPath);
        } catch {
          // Handled and logged
        }
      }
    );

    return () => {
      unsubProfile();
      unsubPrivate();
    };
  }, [isAuthReady, user]);

  const signInWithGoogle = useCallback(async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        addToast(
          `Signed in as ${result.user.displayName || result.user.email || "Operator"}`,
          "success"
        );
      }
    } catch (error: unknown) {
      const errCode = (error as { code?: string })?.code || "";
      if (errCode !== "auth/popup-closed-by-user" && errCode !== "auth/cancelled-popup-request") {
        const message =
          error instanceof Error ? error.message : "Google Sign-In could not be completed.";
        addToast(message, "error");
      }
    } finally {
      setIsSigningIn(false);
    }
  }, [isSigningIn, addToast]);

  const signOutUser = useCallback(async () => {
    try {
      await signOut(auth);
      addToast("Signed out of MONO-TRANSCODER", "info");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to sign out.";
      addToast(message, "error");
    }
  }, [addToast]);

  const updateDisplayName = useCallback(
    async (newName: string) => {
      if (!user || !profile) return;
      const sanitized = sanitizeDisplayName(newName);
      const userDocPath = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, "users", user.uid), {
          displayName: sanitized,
          photoURL: sanitizePhotoURL(profile.photoURL),
          favoriteTools: (profile.favoriteTools || "").slice(0, FAVORITE_TOOLS_MAX_LENGTH),
          updatedAt: serverTimestamp(),
        });
        addToast("Display name updated", "success");
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, userDocPath);
      }
    },
    [user, profile, addToast]
  );

  const toggleFavoriteTool = useCallback(
    async (toolId: string) => {
      if (!user || !profile) return;
      const currentList = (profile.favoriteTools || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const exists = currentList.includes(toolId);
      const nextList = exists
        ? currentList.filter((id) => id !== toolId)
        : [...currentList, toolId];
      const serialized = nextList.join(",").slice(0, FAVORITE_TOOLS_MAX_LENGTH);

      const userDocPath = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, "users", user.uid), {
          displayName: sanitizeDisplayName(profile.displayName),
          photoURL: sanitizePhotoURL(profile.photoURL),
          favoriteTools: serialized,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, userDocPath);
      }
    },
    [user, profile]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        privateInfo,
        isAuthReady,
        isSigningIn,
        signInWithGoogle,
        signOutUser,
        updateDisplayName,
        toggleFavoriteTool,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
