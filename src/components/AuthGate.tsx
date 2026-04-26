"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { LogIn, LogOut, ShieldAlert } from "lucide-react";
import { auth, googleProvider, initAnalytics } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin";

interface AuthGateProps {
  children: (props: { user: User; isAdminHint: boolean }) => React.ReactNode;
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

  if (loading) {
    return (
      <main className="app-loading">
        <div className="loading-card">
          <span className="scanline" />
          <p>Warming the evidence lamp...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <p className="kicker">Private review board</p>
          <h1>The Red String Project</h1>
          <p>
            Sign in with Google to open the evidence board. Publishing and cleanup tools are
            available only to the approved reviewer.
          </p>
          <button className="primary-button" onClick={signIn}>
            <LogIn size={18} />
            Continue with Google
          </button>
          {authError ? <p className="error-text">{authError}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <>
      {!isAdminHint ? (
        <div className="admin-warning">
          <ShieldAlert size={16} />
          <span>
            Signed in as {user.email}. This account can inspect records, but only the approved
            reviewer can add or publish evidence.
          </span>
        </div>
      ) : null}
      {children({ user, isAdminHint })}
      <button className="floating-signout" onClick={() => void signOut(auth)} title="Sign out">
        <LogOut size={17} />
      </button>
    </>
  );
}
