/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { User } from "firebase/auth";
import {
  AUTH_SESSION_STORAGE_KEY,
  getFirebaseServices,
  hasStoredAuthSession,
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
  const [isAuthReady, setIsAuthReady] = useState<boolean>(() => !hasStoredAuthSession());
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const { showToast: addToast } = useToast();

  // Ensure user documents exist in Firestore on sign-in
  const ensureUserRecords = useCallback(async (firebaseUser: User) => {
    const uid = firebaseUser.uid;
    if (!uid || uid.length > UID_MAX_LENGTH || !UID_PATTERN.test(uid)) {
      return;
    }

    const { db, firestoreMod } = await getFirebaseServices();
    const { doc, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp } = firestoreMod;

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

  // Only initialize Firebase Auth on boot if a previous session exists in storage
  useEffect(() => {
    if (!hasStoredAuthSession()) {
      setIsAuthReady(true);
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void getFirebaseServices().then(({ auth, authMod }) => {
      if (cancelled) return;
      unsubscribe = authMod.onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          try {
            window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, "1");
          } catch {
            // ignore storage errors
          }
          await ensureUserRecords(currentUser);
          setUser(currentUser);
          setIsAuthReady(true);
        } else {
          try {
            window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
          } catch {
            // ignore storage errors
          }
          setUser(null);
          setProfile(null);
          setPrivateInfo(null);
          setIsAuthReady(true);
        }
      });
    });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [ensureUserRecords]);

  // Attach real-time listeners only when user is authenticated
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

    let unsubProfile: (() => void) | null = null;
    let unsubPrivate: (() => void) | null = null;
    let cancelled = false;

    void getFirebaseServices().then(({ db, firestoreMod }) => {
      if (cancelled) return;
      const { doc, onSnapshot } = firestoreMod;
      const userDocPath = `users/${uid}`;
      const privateDocPath = `users/${uid}/private/info`;

      unsubProfile = onSnapshot(
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

      unsubPrivate = onSnapshot(
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
    });

    return () => {
      cancelled = true;
      if (unsubProfile) unsubProfile();
      if (unsubPrivate) unsubPrivate();
    };
  }, [isAuthReady, user]);

  const signInWithGoogle = useCallback(async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const { auth, googleProvider, authMod } = await getFirebaseServices();
      const result = await authMod.signInWithPopup(auth, googleProvider);
      if (result.user) {
        try {
          window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, "1");
        } catch {
          // ignore storage errors
        }
        await ensureUserRecords(result.user);
        setUser(result.user);
        setIsAuthReady(true);
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
  }, [isSigningIn, addToast, ensureUserRecords]);

  const signOutUser = useCallback(async () => {
    try {
      const { auth, authMod } = await getFirebaseServices();
      await authMod.signOut(auth);
      try {
        window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      } catch {
        // ignore storage errors
      }
      setUser(null);
      setProfile(null);
      setPrivateInfo(null);
      addToast("Signed out of MONO-TRANSCODER", "info");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to sign out.";
      addToast(message, "error");
    }
  }, [addToast]);

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
