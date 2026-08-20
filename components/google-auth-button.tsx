"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { profileAvatarDataUrl } from "@/lib/avatar";

const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export type GoogleAuthButtonRole = "customer" | "producer";

interface GoogleAuthButtonProps {
  label?: string;
  className?: string;
  expectedRole?: GoogleAuthButtonRole;
  referralCode?: string;
  loginContext?: "admin";
  onAuthenticated?: (data: { redirectPath?: string }) => Promise<void> | void;
  appearance?: "default" | "quiet";
}

export function GoogleAuthButton({
  label = "Continue with Google",
  className,
  expectedRole,
  referralCode,
  loginContext,
  onAuthenticated,
  appearance = "default"
}: GoogleAuthButtonProps) {
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [buttonError, setButtonError] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const useLocalGoogleDemo = !GOOGLE_CLIENT_ID && process.env.NODE_ENV !== "production";

  const handleCredentialResponse = useCallback(
    async (response: GoogleCredentialResponse) => {
      if (!response.credential) {
        setButtonError("Google did not return a credential. Please try again.");
        return;
      }

      setProcessing(true);
      setButtonError(null);

      try {
        const payload: Record<string, string> = {
          credential: response.credential
        };
        if (expectedRole) {
          payload.expectedRole = expectedRole;
        }
        if (referralCode) {
          payload.referralCode = referralCode;
        }
        if (loginContext) {
          payload.loginContext = loginContext;
        }

        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error ?? "Google authentication failed.");
        }

        if (onAuthenticated) {
          await onAuthenticated(data);
          return;
        }

        if (data?.redirectPath) {
          router.push(data.redirectPath);
          router.refresh();
          return;
        }

        router.refresh();
      } catch (error) {
        setButtonError(error instanceof Error ? error.message : "Authentication failed.");
      } finally {
        setProcessing(false);
      }
    },
    [expectedRole, loginContext, onAuthenticated, referralCode, router]
  );

  const handleScriptLoad = useCallback(() => {
    setScriptReady(true);
    setScriptError(null);
  }, []);

  const handleScriptError = useCallback(() => {
    setScriptReady(false);
    setScriptError("Google authentication library could not be loaded. Please try again later.");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const googleWindow = window as Window & GoogleGlobal;
    const selector = `script[src="${GOOGLE_SCRIPT_SRC}"]`;
    const existing = document.querySelector<HTMLScriptElement>(selector);

    if (existing) {
      if (googleWindow.google?.accounts?.id) {
        handleScriptLoad();
        return;
      }

      existing.addEventListener("load", handleScriptLoad);
      existing.addEventListener("error", handleScriptError);

      return () => {
        existing.removeEventListener("load", handleScriptLoad);
        existing.removeEventListener("error", handleScriptError);
      };
    }

    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = handleScriptLoad;
    script.onerror = handleScriptError;
    document.head.appendChild(script);

    return () => {
      script.removeEventListener("load", handleScriptLoad);
      script.removeEventListener("error", handleScriptError);
    };
  }, [handleScriptError, handleScriptLoad]);

  useEffect(() => {
    if (typeof window === "undefined" || !scriptReady || initializedRef.current || !GOOGLE_CLIENT_ID) return;

    const googleWindow = window as Window & GoogleGlobal;
    const accountsId = googleWindow.google?.accounts?.id;
    if (!accountsId) return;

    accountsId.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      ux_mode: "popup"
    });
    accountsId.disableAutoSelect();

    initializedRef.current = true;
  }, [handleCredentialResponse, scriptReady]);

  const handleButtonClick = useCallback(() => {
    if (processing || typeof window === "undefined") return;

    if (!GOOGLE_CLIENT_ID) {
      if (!useLocalGoogleDemo) {
        setButtonError("Google login is not configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID and restart the server.");
        return;
      }

      const name = loginContext === "admin" ? "HYMN Google Admin" : expectedRole === "producer" ? "HYMN Google Producer" : "HYMN Google Artist";
      const email = loginContext === "admin" ? "admin@hymnmusic.in" : expectedRole === "producer" ? "google.producer@test.com" : "google.artist@test.com";
      const demoProfile = {
        sub: `local-google-${expectedRole}`,
        email,
        name,
        picture: profileAvatarDataUrl(name, expectedRole)
      };
      const credential = toBase64Url(JSON.stringify(demoProfile));
      void handleCredentialResponse({ credential });
      return;
    }

    if (!scriptReady) return;

    const googleWindow = window as Window & GoogleGlobal;
    const accountsId = googleWindow.google?.accounts?.id;
    if (!accountsId) {
      setButtonError("Google authentication is still loading. Please try again in a moment.");
      return;
    }

    setButtonError(null);
    accountsId.prompt();
  }, [expectedRole, handleCredentialResponse, loginContext, processing, scriptReady, useLocalGoogleDemo]);

  const helperText = buttonError || scriptError || (useLocalGoogleDemo ? "Local Google demo mode is active. Add Google client IDs for the real popup." : null);
  const helperTone = buttonError || scriptError ? "error" : "info";
  const disabled = processing || Boolean(scriptError) || (!useLocalGoogleDemo && (!scriptReady || !GOOGLE_CLIENT_ID));

  return (
    <div className="flex flex-col gap-3 text-center">
      <button
        type="button"
        className={clsx(
          "group relative inline-flex w-full items-center justify-center gap-3 overflow-hidden border text-sm font-semibold transition duration-300 focus:outline-none focus:ring-2 focus:ring-[#59dfe0]/45 focus:ring-offset-2 focus:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-70",
          appearance === "quiet" ? "min-h-12 rounded-xl px-5 py-3 shadow-[0_8px_24px_rgba(0,0,0,.12)] hover:brightness-[1.03] active:scale-[.995]" : "min-h-14 rounded-2xl px-6 py-4 shadow-[0_22px_70px_rgba(0,0,0,0.22)] hover:-translate-y-0.5 hover:shadow-[0_28px_90px_rgba(89,223,224,0.18)] active:translate-y-0",
          className
        )}
        style={{ borderColor: "color-mix(in srgb, var(--border) 72%, #ffffff)", background: "linear-gradient(180deg, #ffffff, #f5f8fb 54%, #e9eef6)", color: "#121722" }}
        disabled={disabled}
        onClick={handleButtonClick}
      >
        <span className="absolute inset-0 translate-x-[-120%] bg-gradient-to-r from-transparent via-[#59dfe0]/25 to-transparent transition duration-700 group-hover:translate-x-[120%]" />
        <span className="relative grid h-7 w-7 place-items-center rounded-full bg-white shadow-[0_8px_22px_rgba(17,24,39,0.12)] ring-1 ring-black/5">
          <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z" />
          </svg>
        </span>
        <span className="relative">{processing ? "Signing in..." : label}</span>
      </button>
      {helperText ? (
        <p
          className={clsx(
            "mx-auto max-w-full items-center justify-center text-xs",
            appearance === "quiet" ? "block px-2 leading-5" : "inline-flex rounded-full border px-3 py-1.5",
            helperTone === "error" ? "" : "font-medium"
          )}
          style={appearance === "quiet" ? { color: helperTone === "error" ? "var(--danger)" : "var(--text-soft)" } : helperTone === "error"
            ? { borderColor: "rgba(248,113,113,0.28)", background: "rgba(248,113,113,0.08)", color: "var(--danger)" }
            : { borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text-muted)" }}
          aria-live="polite"
        >
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

function toBase64Url(value: string) {
  return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

interface GoogleCredentialResponse {
  credential?: string;
}

type GoogleAccountsId = {
  initialize: (settings: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode?: "popup" | "redirect";
    auto_select?: boolean;
  }) => void;
  prompt: () => void;
  disableAutoSelect: () => void;
};

interface GoogleGlobal {
  google?: {
    accounts?: {
      id?: GoogleAccountsId;
    };
  };
}

declare global {
  interface Window extends GoogleGlobal {}
}

// vercel trigger 2

// vercel trigger 3

// vercel trigger 12
