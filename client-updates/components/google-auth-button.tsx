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
}

export function GoogleAuthButton({
  label = "Continue with Google",
  className,
  expectedRole = "customer",
  referralCode
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
          credential: response.credential,
          expectedRole
        };
        if (referralCode) {
          payload.referralCode = referralCode;
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
    [expectedRole, referralCode, router]
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

      const name = expectedRole === "producer" ? "HYMN Google Producer" : "HYMN Google Artist";
      const email = expectedRole === "producer" ? "google.producer@test.com" : "google.artist@test.com";
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
  }, [expectedRole, handleCredentialResponse, processing, scriptReady, useLocalGoogleDemo]);

  const helperText = buttonError || scriptError || (useLocalGoogleDemo ? "Local Google demo mode is active. Add Google client IDs for the real popup." : null);
  const disabled = processing || Boolean(scriptError) || (!useLocalGoogleDemo && (!scriptReady || !GOOGLE_CLIENT_ID));

  return (
    <div className="flex flex-col gap-2 text-center">
      <button
        type="button"
        className={clsx(
          "group relative inline-flex min-h-12 w-full items-center justify-center gap-3 overflow-hidden rounded-full border px-6 py-3 text-sm font-semibold shadow-[0_18px_50px_rgba(0,0,0,0.18)] transition duration-300 hover:translate-y-[-2px] hover:shadow-[0_24px_70px_rgba(125,183,255,0.18)] focus:outline-none focus:ring-2 focus:ring-[#7db7ff]/50 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0",
          className
        )}
        style={{ borderColor: "color-mix(in srgb, var(--border) 72%, #ffffff)", background: "linear-gradient(180deg, #ffffff, #f4f7fb)", color: "#1f1f1f" }}
        disabled={disabled}
        onClick={handleButtonClick}
      >
        <span className="absolute inset-0 translate-x-[-120%] bg-gradient-to-r from-transparent via-[#7db7ff]/25 to-transparent transition duration-700 group-hover:translate-x-[120%]" />
        <span className="relative grid h-6 w-6 place-items-center rounded-full bg-white shadow-sm">
          <span className="text-[15px] font-black" style={{ color: "#4285f4" }}>G</span>
        </span>
        <span className="relative">{processing ? "Signing in..." : label}</span>
      </button>
      {helperText ? (
        <p className="text-xs" style={{ color: "var(--danger)" }} aria-live="polite">
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
