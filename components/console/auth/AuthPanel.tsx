"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useRef } from "react";
import { AuthCard } from "./AuthCard";
import {
  authLoginHref,
  consoleSignInHref,
  consoleSignUpHref,
} from "@/lib/console/auth-login";

export type AuthMode = "signin" | "signup";

interface AuthPanelProps {
  mode: AuthMode;
  returnTo?: string;
}

const COPY = {
  signin: {
    submit: "Continue with email",
    footer: "Don't have an account?",
    footerAction: "Sign up",
  },
  signup: {
    submit: "Continue with email",
    footer: "Already have an account?",
    footerAction: "Log in",
  },
} as const;

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function AuthPanel({ mode, returnTo = "/home" }: AuthPanelProps) {
  const emailRef = useRef<HTMLInputElement>(null);
  const copy = COPY[mode];
  const isSignup = mode === "signup";
  const footerHref = isSignup
    ? consoleSignInHref({ returnTo })
    : consoleSignUpHref({ returnTo });

  const providerButtonClass =
    "inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-sm border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/35";
  const primaryButtonClass =
    "inline-flex h-11 w-full items-center justify-center rounded-sm bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/35";
  const inputClass =
    "h-11 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-muted-foreground focus-visible:ring-1 focus-visible:ring-green-bright/30";

  function handleEmailSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = emailRef.current?.value.trim();
    window.location.assign(
      authLoginHref({
        signup: isSignup,
        returnTo,
        loginHint: email || undefined,
      })
    );
  }

  const googleHref = authLoginHref({
    signup: isSignup,
    returnTo,
    connection: "google-oauth2",
  });
  const githubHref = authLoginHref({
    signup: isSignup,
    returnTo,
    connection: "github",
  });

  return (
    <AuthCard label={isSignup ? "Sign up" : "Sign in"}>
      <form className="mt-7 space-y-3" onSubmit={handleEmailSubmit}>
        <label className="block">
          <span className="sr-only">Email address</span>
          <input
            ref={emailRef}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            className={inputClass}
            placeholder="Email address"
          />
        </label>
        <button type="submit" className={primaryButtonClass}>
          {copy.submit}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-3">
        <a href={googleHref} className={providerButtonClass}>
          <GoogleIcon className="h-4 w-4 shrink-0" />
          {isSignup ? "Sign up with Google" : "Sign in with Google"}
        </a>
        <a href={githubHref} className={providerButtonClass}>
          <GitHubIcon className="h-4 w-4 shrink-0" />
          {isSignup ? "Sign up with GitHub" : "Sign in with GitHub"}
        </a>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {copy.footer}{" "}
        <Link
          href={footerHref}
          className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
        >
          {copy.footerAction}
        </Link>
      </p>

      {isSignup ? (
        <p className="mt-3 text-balance text-center text-[11px] leading-relaxed text-muted-foreground">
          By creating an account, you agree to our{" "}
          <a
            href="https://livepeer.org/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-border underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            href="https://livepeer.org/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-border underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
          >
            Privacy Policy
          </a>
          .
        </p>
      ) : null}
    </AuthCard>
  );
}
