"use client";

import {
  type ComponentProps,
  type CSSProperties,
  type FormEvent,
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";

import { LivepeerWordmark } from "@/components/brand";
import { authModalMedia } from "@/components/livepeer-ui/frozen-content";
import { useWaitlistSession } from "@/components/livepeer-ui/waitlist-session";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const WaitlistEmailInput = forwardRef<
  HTMLInputElement,
  Omit<ComponentProps<typeof Input>, "size"> & { smoothTheme?: boolean }
>(function WaitlistEmailInput(
  { className, smoothTheme = false, ...props },
  ref
) {
  return (
    <Input
      ref={ref}
      size="xs"
      className={cn(
        "min-w-0 rounded-sm bg-muted pr-9 ease-out aria-invalid:border-transparent aria-invalid:ring-destructive dark:aria-invalid:border-transparent dark:aria-invalid:ring-destructive",
        smoothTheme
          ? "transition-colors duration-[900ms] ease-in-out"
          : "duration-100",
        className
      )}
      {...props}
    />
  );
});

function useEmailValidationBump() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [bumping, setBumping] = useState(false);

  function focusAndBump() {
    inputRef.current?.focus();
    setBumping(false);
    window.setTimeout(() => setBumping(true), 0);
  }

  return { inputRef, bumping, focusAndBump, stopBump: () => setBumping(false) };
}

function AuthModalMedia({ media }: { media: { src: string; alt: string } }) {
  return (
    <div className="relative order-2 hidden min-h-0 overflow-hidden bg-muted md:order-1 md:block">
      {media.src.endsWith(".mp4") ? (
        <video
          src={media.src}
          aria-label={media.alt}
          autoPlay
          muted
          loop
          playsInline
          className="size-full object-cover"
        />
      ) : (
        <Image
          src={media.src}
          alt={media.alt}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent md:bg-gradient-to-b md:from-black/25 md:to-transparent" />
    </div>
  );
}

function AuthPanel({
  children,
  formId,
  showContinue,
  submitting,
}: {
  children: React.ReactNode;
  formId: string;
  showContinue: boolean;
  submitting: boolean;
}) {
  return (
    <div className="order-1 grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] p-[var(--auth-panel-padding)] md:order-2">
      <div className="flex items-start justify-between">
        <div className="text-foreground" aria-label="Livepeer">
          <LivepeerWordmark className="h-4 w-auto" aria-hidden="true" />
        </div>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              className="-mt-2 -mr-2 bg-transparent hover:bg-transparent"
            />
          }
        >
          <XIcon className="size-5" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogClose>
      </div>

      <div className="flex min-h-0 items-center justify-center">
        <div className="w-full max-w-md text-center">{children}</div>
      </div>

      <div className="flex min-h-8 items-center justify-between gap-4">
        <a
          href="https://livepeer.org"
          target="_blank"
          rel="noreferrer"
          className="text-left text-[10px] leading-none font-semibold text-foreground underline-offset-4 hover:underline"
        >
          livepeer.org{" "}
          <span className="font-sans" aria-hidden="true">
            ↗
          </span>
        </a>
        {showContinue && (
          <Button
            type="submit"
            form={formId}
            size="sm"
            disabled={submitting}
            className="rounded-sm"
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

function NewsletterConsent({
  id,
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 pl-2.5 text-left", className)}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
      />
      <Label
        htmlFor={id}
        className="cursor-pointer text-[10px] leading-5 font-normal text-muted-foreground"
      >
        Subscribe for updates
      </Label>
    </div>
  );
}

function ReferralControl({
  compact = false,
  smoothTheme = false,
}: {
  compact?: boolean;
  smoothTheme?: boolean;
}) {
  const { state } = useWaitlistSession();
  const [copied, setCopied] = useState(false);
  if (state.status !== "signed-in") return null;

  const inviteUrl = state.data.member.referralUrl;
  async function copyInviteUrl() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-2 transition-colors",
        smoothTheme ? "duration-[900ms] ease-in-out" : "duration-100 ease-out"
      )}
    >
      {!compact && (
        <div className="flex flex-col items-center gap-1.5">
          <span className="font-display text-2xl leading-none font-light tracking-tight">
            You’re on the waitlist
          </span>
          <span className="text-[10px] leading-none font-semibold">
            Invite a friend
          </span>
        </div>
      )}
      <div
        role="textbox"
        aria-label="Your referral link"
        aria-readonly="true"
        className={cn(
          "relative inline-flex h-8 w-fit min-w-0 items-center rounded-sm bg-muted px-2.5 pr-9 text-xs transition-colors dark:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_5%)]",
          smoothTheme
            ? "duration-[900ms] ease-in-out"
            : "duration-100 ease-out",
          compact ? "max-w-[min(62vw,28rem)]" : "max-w-[min(60vw,22rem)]"
        )}
      >
        <span className="max-w-full truncate">{inviteUrl}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={copyInviteUrl}
          aria-label={copied ? "Referral link copied" : "Copy referral link"}
          className={cn(
            "absolute top-0 right-0 rounded-sm transition-colors",
            smoothTheme
              ? "duration-[900ms] ease-in-out"
              : "duration-100 ease-out"
          )}
        >
          {copied ? (
            <CheckIcon className="size-3.5" aria-hidden="true" />
          ) : (
            <CopyIcon className="size-3.5" aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  );
}

function SubmittedEmailLock({
  email,
  smoothTheme = false,
}: {
  email: string;
  smoothTheme?: boolean;
}) {
  return (
    <div
      className={cn(
        "animate-lock-submitted-email inline-flex h-8 max-w-[min(60vw,22rem)] items-center overflow-hidden rounded-sm bg-muted px-3 text-xs font-normal whitespace-nowrap text-muted-foreground transition-colors",
        smoothTheme ? "duration-[900ms] ease-in-out" : "duration-100 ease-out"
      )}
      style={
        {
          "--submitted-email-width": `min(60vw, max(8rem, calc(${email.length}ch + 1.5rem)))`,
        } as CSSProperties
      }
      aria-label={`Submitted email ${email}`}
    >
      <span className="truncate">{email}</span>
    </div>
  );
}

function VerificationPendingContent({ email }: { email: string }) {
  return (
    <div className="text-center" role="status" aria-live="polite">
      <h2 className="font-display text-display-sm text-balance sm:text-display-md">
        Verify your email
      </h2>
      <div className="mt-3 flex justify-center">
        <SubmittedEmailLock email={email} />
      </div>
      <p className="mx-auto mt-3 max-w-xs text-xs leading-5 text-muted-foreground text-balance">
        Open your inbox and click the verification link from Livepeer to
        continue.{" "}
        <span className="text-foreground">The link expires in 15 minutes.</span>
      </p>
    </div>
  );
}

function useSystemDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setIsDark(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isDark;
}

function VerificationPendingDialog({
  open,
  onOpenChange,
  email,
  signInImage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  signInImage?: { src: string; alt: string };
}) {
  const isSystemDark = useSystemDarkMode();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={`${isSystemDark ? "dark" : ""} h-[calc(100dvh-var(--verification-gutter))] min-h-0 w-[calc(100vw-var(--verification-gutter))] max-w-none gap-0 overflow-hidden rounded-sm bg-background p-0 text-foreground [--auth-panel-padding:1.5rem] [--verification-gutter:clamp(2rem,10vw,6rem)] sm:max-w-none`}
      >
        <div className="grid h-full min-h-0 grid-rows-1 md:grid-cols-2">
          <AuthPanel
            formId="verification-pending-form"
            showContinue={false}
            submitting={false}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Verify your email</DialogTitle>
              <DialogDescription>
                Check your email to continue.
              </DialogDescription>
            </DialogHeader>
            <VerificationPendingContent email={email} />
          </AuthPanel>
          {signInImage && <AuthModalMedia media={signInImage} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function JoinWaitlistControl({
  defaultExpanded = false,
  smoothTheme = false,
  showVerificationDialog = false,
}: {
  defaultExpanded?: boolean;
  smoothTheme?: boolean;
  showVerificationDialog?: boolean;
}) {
  const { state, join } = useWaitlistSession();
  const [email, setEmail] = useState("");
  const [verificationDismissed, setVerificationDismissed] = useState(false);
  const [company, setCompany] = useState("");
  const [newsletterOptIn, setNewsletterOptIn] = useState(true);
  const [localError, setLocalError] = useState("");
  const [expanded, setExpanded] = useState(defaultExpanded);
  const {
    inputRef: emailInputRef,
    bumping,
    focusAndBump,
    stopBump,
  } = useEmailValidationBump();
  const helperId = useId();
  const canSubmitEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const expandedWidth = defaultExpanded
    ? "w-[min(60vw,22rem)]"
    : "w-[clamp(10rem,40vw,20rem)]";

  if (state.status === "signed-in") {
    if (!defaultExpanded)
      return <ReferralControl compact smoothTheme={smoothTheme} />;

    return (
      <div className="flex h-20 w-[min(60vw,22rem)] flex-col items-center">
        <ReferralControl smoothTheme={smoothTheme} />
      </div>
    );
  }

  if (state.status === "verification-pending") {
    if (!defaultExpanded) return null;

    return (
      <>
        {showVerificationDialog && (
          <VerificationPendingDialog
            open={!verificationDismissed}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) setVerificationDismissed(true);
            }}
            email={state.email}
            signInImage={authModalMedia}
          />
        )}
        <div className="flex h-20 w-[min(60vw,22rem)] flex-col items-center gap-2 text-center">
          <span className="text-[10px] leading-none font-semibold">
            Check your email
          </span>
          <SubmittedEmailLock email={state.email} smoothTheme={smoothTheme} />
        </div>
      </>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitEmail) {
      setLocalError(
        email.trim()
          ? "Enter a valid email address."
          : "Enter your email address."
      );
      focusAndBump();
      return;
    }
    setLocalError("");
    setVerificationDismissed(false);
    try {
      await join(email, { company, newsletterOptIn });
    } catch {
      // Shared state renders the server error below every waitlist surface.
    }
  }

  const error = localError || (state.status === "error" ? state.message : "");
  const pending = state.status === "submitting";

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col items-center gap-2.5",
        defaultExpanded && "h-20 w-[min(60vw,22rem)]"
      )}
    >
      {defaultExpanded && (
        <span className="text-[10px] leading-none font-semibold">
          Sign up for early access
        </span>
      )}
      <div
        className={`relative h-9 min-w-0 shrink transition-[width] duration-300 ease-out ${expanded ? `${expandedWidth} overflow-visible` : "w-[5.75rem] overflow-hidden"}`}
      >
        <Button
          type="button"
          variant="muted"
          size="sm"
          onClick={() => {
            setExpanded(true);
            window.setTimeout(() => {
              const input = emailInputRef.current;
              if (!input) return;
              input.style.fontSize = "1rem";
              input.focus();
            }, 180);
          }}
          aria-expanded={expanded}
          className={`absolute inset-y-0 left-0 h-8 w-full px-2 text-[10px] transition-[background-color,color,opacity,transform] duration-100 ease-out dark:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_5%)] ${expanded ? "pointer-events-none translate-x-2 opacity-0" : "opacity-100"}`}
        >
          Join waitlist
        </Button>
        <form
          onSubmit={submit}
          noValidate
          className={`absolute inset-x-0 top-0 min-w-0 p-0.5 transition-[opacity,transform] duration-200 ${expanded ? "translate-x-0 opacity-100 delay-100" : "pointer-events-none -translate-x-2 opacity-0"}`}
        >
          <div
            className={cn("relative min-w-0", bumping && "animate-input-bump")}
            onAnimationEnd={stopBump}
          >
            <WaitlistEmailInput
              smoothTheme={smoothTheme}
              ref={emailInputRef}
              type="email"
              aria-label="Email address"
              aria-describedby={error ? helperId : undefined}
              aria-invalid={error ? true : undefined}
              placeholder="you@example.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (localError) setLocalError("");
              }}
              required
              autoComplete="email"
              tabIndex={expanded ? 0 : -1}
            />
            <input
              type="text"
              name="company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[10000px] size-px opacity-0"
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon-sm"
              aria-label="Join waitlist"
              disabled={pending}
              className={cn(
                "absolute top-0 right-0 rounded-sm transition-colors",
                smoothTheme
                  ? "duration-[900ms] ease-in-out"
                  : "duration-100 ease-out"
              )}
            >
              {pending ? (
                <LoaderCircleIcon
                  className="size-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <ArrowUpIcon className="size-3.5" aria-hidden="true" />
              )}
            </Button>
          </div>
          {error && (
            <p id={helperId} role="alert" className="sr-only">
              {error}
            </p>
          )}
        </form>
      </div>
      {expanded && (
        <NewsletterConsent
          id={`${helperId}-newsletter`}
          checked={newsletterOptIn}
          onCheckedChange={setNewsletterOptIn}
          disabled={pending}
          className={cn(
            "absolute left-1/2 z-10 mt-2 -translate-x-1/2",
            defaultExpanded
              ? "top-14 w-[min(60vw,22rem)]"
              : "top-full w-[clamp(10rem,40vw,20rem)]"
          )}
        />
      )}
    </div>
  );
}

function FixedWaitlistSignIn({
  theme,
  signInImage,
  smoothTheme,
}: {
  theme: "base" | "inverse";
  signInImage?: { src: string; alt: string };
  smoothTheme?: boolean;
}) {
  const { state, join, signOut, signOutError, signingOut } =
    useWaitlistSession();
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const { inputRef, bumping, focusAndBump, stopBump } =
    useEmailValidationBump();
  const formId = useId();
  const canSubmit = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  if (state.status === "signed-in") {
    return (
      <div
        className={cn(
          "fixed right-4 bottom-4 z-[60] flex items-center gap-3 text-[10px] leading-none font-semibold text-foreground transition-colors sm:right-6 sm:bottom-6",
          smoothTheme ? "duration-[900ms] ease-in-out" : "duration-100 ease-out"
        )}
      >
        {signOutError && (
          <span role="alert" className="text-destructive">
            {signOutError}
          </span>
        )}
        {state.data.member.accountRole === "admin" && (
          <Link href="/admin" className="underline-offset-4 hover:underline">
            Admin
          </Link>
        )}
        <Button
          type="button"
          variant="link"
          size="xs"
          disabled={signingOut}
          onClick={() => void signOut()}
          className="h-auto p-0 text-[10px] leading-none font-semibold text-inherit transition-none"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<button type="button" />}
        className="fixed right-4 bottom-4 z-[60] text-[10px] leading-none font-semibold text-current underline-offset-4 transition-colors duration-[900ms] ease-in-out hover:underline sm:right-6 sm:bottom-6"
      >
        Sign in
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className={`${theme === "inverse" ? "dark" : ""} h-[calc(100dvh-var(--sign-in-gutter))] min-h-0 w-[calc(100vw-var(--sign-in-gutter))] max-w-none gap-0 overflow-hidden rounded-sm bg-background p-0 text-foreground [--auth-panel-padding:1.5rem] [--sign-in-gutter:clamp(2rem,10vw,6rem)] sm:max-w-none`}
      >
        <div className="grid h-full min-h-0 grid-rows-1 md:grid-cols-2">
          <AuthPanel
            formId={formId}
            showContinue={state.status !== "verification-pending"}
            submitting={state.status === "submitting"}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Sign in to Livepeer Agent</DialogTitle>
              <DialogDescription>
                Enter the email you used to join the waitlist.
              </DialogDescription>
            </DialogHeader>
            {state.status === "verification-pending" ? (
              <VerificationPendingContent email={state.email} />
            ) : (
              <>
                <h2 className="font-display text-display-sm text-balance sm:text-display-md">
                  Sign in to Livepeer Agent
                </h2>
                <form
                  id={formId}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!canSubmit) {
                      focusAndBump();
                      return;
                    }
                    void join(email, { authOnly: true });
                  }}
                  noValidate
                  className="mx-auto mt-6 max-w-[22rem]"
                >
                  <div
                    className={cn(
                      "relative min-w-0",
                      bumping && "animate-input-bump"
                    )}
                    onAnimationEnd={stopBump}
                  >
                    <WaitlistEmailInput
                      ref={inputRef}
                      smoothTheme={smoothTheme}
                      className="rounded-sm"
                      aria-label="Email address"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                    />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Continue"
                      disabled={state.status === "submitting"}
                      className={cn(
                        "absolute top-0 right-0 rounded-sm transition-colors",
                        smoothTheme
                          ? "duration-[900ms] ease-in-out"
                          : "duration-100 ease-out"
                      )}
                    >
                      {state.status === "submitting" ? (
                        <LoaderCircleIcon
                          className="size-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <ArrowUpIcon className="size-3.5" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </AuthPanel>
          {signInImage && <AuthModalMedia media={signInImage} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WaitlistJoinDialog({
  theme,
  signInImage,
  smoothTheme,
}: {
  theme: "base" | "inverse";
  signInImage?: { src: string; alt: string };
  smoothTheme?: boolean;
}) {
  const { state, join } = useWaitlistSession();
  const [email, setEmail] = useState("");
  const [newsletterOptIn, setNewsletterOptIn] = useState(true);
  const [open, setOpen] = useState(false);
  const { inputRef, bumping, focusAndBump, stopBump } =
    useEmailValidationBump();
  const formId = useId();
  const canSubmit = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  if (state.status === "signed-in") {
    return (
      <span className="flex h-8 shrink-0 items-center text-[10px] leading-none font-semibold">
        Invite a friend
      </span>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<button type="button" />}
        className="flex h-8 shrink-0 items-center text-[10px] leading-none font-semibold underline-offset-4 hover:underline"
      >
        Livepeer Agent Early Access
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className={`${theme === "inverse" ? "dark" : ""} h-[calc(100dvh-var(--sign-up-gutter))] min-h-0 w-[calc(100vw-var(--sign-up-gutter))] max-w-none gap-0 overflow-hidden rounded-sm bg-background p-0 text-foreground [--auth-panel-padding:1.5rem] [--sign-up-gutter:clamp(2rem,10vw,6rem)] sm:max-w-none`}
      >
        <div className="grid h-full min-h-0 grid-rows-1 md:grid-cols-2">
          <AuthPanel
            formId={formId}
            showContinue={state.status !== "verification-pending"}
            submitting={state.status === "submitting"}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Sign up for early access</DialogTitle>
              <DialogDescription>
                Enter your email to join the Livepeer Agent waitlist.
              </DialogDescription>
            </DialogHeader>
            {state.status === "verification-pending" ? (
              <VerificationPendingContent email={state.email} />
            ) : (
              <>
                <h2 className="font-display text-display-sm text-balance sm:text-display-md">
                  <span className="block">Sign up for</span>
                  <span className="block">early access</span>
                </h2>
                <form
                  id={formId}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!canSubmit) {
                      focusAndBump();
                      return;
                    }
                    void join(email, { newsletterOptIn });
                  }}
                  noValidate
                  className="mx-auto mt-6 max-w-[22rem]"
                >
                  <div
                    className={cn(
                      "relative min-w-0",
                      bumping && "animate-input-bump"
                    )}
                    onAnimationEnd={stopBump}
                  >
                    <WaitlistEmailInput
                      ref={inputRef}
                      smoothTheme={smoothTheme}
                      className="rounded-sm"
                      aria-label="Email address"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                    />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Continue"
                      disabled={state.status === "submitting"}
                      className={cn(
                        "absolute top-0 right-0 rounded-sm transition-colors",
                        smoothTheme
                          ? "duration-[900ms] ease-in-out"
                          : "duration-100 ease-out"
                      )}
                    >
                      {state.status === "submitting" ? (
                        <LoaderCircleIcon
                          className="size-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <ArrowUpIcon className="size-3.5" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                  <NewsletterConsent
                    id="waitlist-modal-newsletter"
                    checked={newsletterOptIn}
                    onCheckedChange={setNewsletterOptIn}
                    disabled={state.status === "submitting"}
                    className="mt-2"
                  />
                  {state.status === "error" && (
                    <p
                      role="alert"
                      className="mt-2 text-xs text-muted-foreground"
                    >
                      {state.message}
                    </p>
                  )}
                </form>
              </>
            )}
          </AuthPanel>
          {signInImage && <AuthModalMedia media={signInImage} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WaitlistHeaderAuth({
  theme = "base",
  signInImage,
  smoothTheme = false,
}: {
  theme?: "base" | "inverse";
  signInImage?: { src: string; alt: string };
  smoothTheme?: boolean;
}) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <WaitlistJoinDialog
          theme={theme}
          signInImage={signInImage}
          smoothTheme={smoothTheme}
        />
        <div className="hidden sm:block">
          <JoinWaitlistControl smoothTheme={smoothTheme} />
        </div>
      </div>
      <FixedWaitlistSignIn
        theme={theme}
        signInImage={signInImage}
        smoothTheme={smoothTheme}
      />
    </>
  );
}
