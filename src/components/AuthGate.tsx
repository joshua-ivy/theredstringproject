"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider, initAnalytics } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin";

interface AuthGateProps {
  children: (props: {
    user: User | null;
    isAdminHint: boolean;
    authLoading: boolean;
    authError: string | null;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
  }) => React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    void initAnalytics();
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const isAdminHint = useMemo(() => isAdminEmail(user?.email), [user?.email]);

  async function signIn() {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign-in failed.");
    }
  }

  return (
    children({
      user,
      isAdminHint,
      authLoading: loading,
      authError,
      signIn,
      signOut: () => signOut(auth)
    })
  );
}
