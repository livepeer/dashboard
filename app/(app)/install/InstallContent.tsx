"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/console/AuthContext";
import { AUTH_SIGNIN_HREF } from "@/lib/console/auth-login";
import CopyButton from "@/components/console/CopyButton";
import HarnessLogo from "@/components/console/HarnessLogo";
import SectionHeader from "@/components/console/SectionHeader";
import { MCP_SERVER_URL } from "@/lib/constants";

type HarnessKey = "claude" | "claude-code" | "chatgpt" | "hermes";

type CopyValue = {
  value: string;
  ariaLabel: string;
};

type InstallStepConfig = {
  title: string;
  body: string;
  copy?: CopyValue;
};

type InstallTarget = {
  key: HarnessKey;
  label: string;
  steps: InstallStepConfig[];
};

type WheelImage = {
  src: string;
  alt: string;
};

const CLAUDE_CODE_COMMAND = `claude mcp add --transport http livepeer ${MCP_SERVER_URL}`;
const CHATGPT_CODEX_PROMPT = `Codex, add the Livepeer MCP connector to ChatGPT desktop. Name it Livepeer and use this server URL: ${MCP_SERVER_URL}`;
const HERMES_CODEX_PROMPT = `Codex, add the Livepeer MCP connector to Hermes. Name it Livepeer and use this server URL: ${MCP_SERVER_URL}`;
const WHEEL_IMAGE_REPEAT = 1;
const WHEEL_CARD_WIDTH = 118;
const WHEEL_CARD_HEIGHT = WHEEL_CARD_WIDTH * (4 / 3);
const WHEEL_RADIUS_X = 226;
const WHEEL_RADIUS_Y = 54;
const WHEEL_SPIN_SPEED = 9;
const WHEEL_SCROLL_BOOST_FACTOR = 0.8;
const WHEEL_SCROLL_BOOST_MAX = 180;
const WHEEL_SCROLL_BOOST_DECAY = 0.92;
const WHEEL_CARD_TILT_DEGREES = 5;

const WHEEL_IMAGES: WheelImage[] = [
  {
    src: "/images/console/explore/stable-video-diffusion.webp",
    alt: "Stable Video Diffusion preview",
  },
  {
    src: "/images/console/explore/img2img-sdxl.webp",
    alt: "Image editing preview",
  },
  {
    src: "/images/console/explore/live-video-to-video.webp",
    alt: "Live video preview",
  },
  {
    src: "/images/console/explore/flux-schnell.webp",
    alt: "Flux Schnell preview",
  },
  {
    src: "/images/console/daydream.png",
    alt: "Daydream preview",
  },
  {
    src: "/images/console/explore/sdxl-turbo.webp",
    alt: "SDXL Turbo preview",
  },
  {
    src: "/images/console/explore/real-esrgan-4x.webp",
    alt: "Image upscale preview",
  },
];

const TARGETS: InstallTarget[] = [
  {
    key: "claude",
    label: "Claude",
    steps: [
      {
        title: "Add the Livepeer MCP URL",
        body: "Open Claude connector settings, name the server Livepeer, and paste this URL.",
        copy: {
          value: MCP_SERVER_URL,
          ariaLabel: "Copy Claude MCP server URL",
        },
      },
      {
        title: "Connect and start",
        body: "Sign in when the browser opens, then ask Claude to create or edit production media.",
      },
    ],
  },
  {
    key: "claude-code",
    label: "Claude Code",
    steps: [
      {
        title: "Run the Claude Code command",
        body: "Paste this into your terminal once to add Livepeer as an MCP server. Use /mcp inside Claude Code if it asks you to finish sign-in.",
        copy: {
          value: CLAUDE_CODE_COMMAND,
          ariaLabel: "Copy Claude Code install command",
        },
      },
      {
        title: "Connect and start",
        body: "Start a Claude Code session and ask Livepeer for image, video, audio, or rendering work.",
      },
    ],
  },
  {
    key: "chatgpt",
    label: "ChatGPT",
    steps: [
      {
        title: "Copy and run the Codex prompt",
        body: "ChatGPT MCP connector setup works in the desktop app only. Open ChatGPT desktop, start Codex, paste the prompt, and approve the connector changes.",
        copy: {
          value: CHATGPT_CODEX_PROMPT,
          ariaLabel: "Copy ChatGPT Codex connector prompt",
        },
      },
      {
        title: "Connect and start",
        body: "Sign in, then bring Livepeer production tools into your ChatGPT workflows.",
      },
    ],
  },
  {
    key: "hermes",
    label: "Hermes",
    steps: [
      {
        title: "Copy and run the Codex prompt",
        body: "This asks Codex to add the Livepeer MCP server for you. Open Hermes, start Codex, paste the prompt, and approve the connector changes.",
        copy: {
          value: HERMES_CODEX_PROMPT,
          ariaLabel: "Copy Hermes Codex connector prompt",
        },
      },
      {
        title: "Connect and start",
        body: "Sign in, then start generating production assets from Hermes.",
      },
    ],
  },
];

function TargetIcon({ target }: { target: HarnessKey }) {
  if (target === "claude" || target === "claude-code") {
    return <HarnessLogo id="claude" className="h-4 w-4" />;
  }
  if (target === "chatgpt") {
    return <HarnessLogo id="codex" className="h-4 w-4" />;
  }
  return <HarnessLogo id="hermes" className="h-4 w-4" />;
}

function InstallImageWheel() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const rotationRef = useRef(0);
  const momentumRef = useRef(0);
  const scrollBoostRef = useRef(0);
  const previousScrollYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dragPointerIdRef = useRef(-1);
  const previousPointerXRef = useRef(0);
  const inViewRef = useRef(true);
  const wheelItems = useMemo(
    () =>
      Array.from({ length: WHEEL_IMAGE_REPEAT }).flatMap(() => WHEEL_IMAGES),
    []
  );

  const renderWheel = useCallback(
    (rotation: number) => {
      const root = rootRef.current;
      const itemCount = wheelItems.length;
      if (!root || itemCount === 0) return;

      const viewportScale = Math.min(1, Math.max(0.66, root.clientWidth / 760));
      const cardWidth = WHEEL_CARD_WIDTH * viewportScale;
      const cardHeight = WHEEL_CARD_HEIGHT * viewportScale;
      const radiusX = WHEEL_RADIUS_X * viewportScale;
      const radiusY = WHEEL_RADIUS_Y * viewportScale;

      itemRefs.current.forEach((node, index) => {
        if (!node) return;
        const radians =
          (index / itemCount) * Math.PI * 2 + (rotation * Math.PI) / 180;
        const depth = (Math.sin(radians) + 1) / 2;
        const x = Math.cos(radians) * radiusX * (0.74 + depth * 0.26);
        const y = Math.sin(radians) * radiusY * (0.88 + depth * 0.12);
        const scale = 0.72 + depth * 0.28;
        const shadowY = 4 + depth * 8;
        const shadowBlur = 14 + depth * 18;

        node.style.width = `${cardWidth}px`;
        node.style.height = `${cardHeight}px`;
        node.style.marginLeft = `${-cardWidth / 2}px`;
        node.style.marginTop = `${-cardHeight / 2}px`;
        node.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${WHEEL_CARD_TILT_DEGREES}deg)`;
        node.style.removeProperty("opacity");
        node.style.zIndex = `${Math.round(depth * 1000)}`;
        node.style.boxShadow = `0 ${shadowY}px ${shadowBlur}px rgba(0,0,0,${0.05 + depth * 0.08})`;
      });
    },
    [wheelItems.length]
  );

  useEffect(() => {
    itemRefs.current.length = wheelItems.length;
    renderWheel(rotationRef.current);
  }, [renderWheel, wheelItems.length]);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    let animationFrame = 0;
    let lastTime = 0;
    let running = false;

    const tick = (now: number) => {
      if (!lastTime) lastTime = now;
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      if (!isDraggingRef.current && inViewRef.current && !reducedMotion) {
        rotationRef.current += WHEEL_SPIN_SPEED * delta;
        rotationRef.current += scrollBoostRef.current * delta;
        rotationRef.current += momentumRef.current;
        momentumRef.current *= 0.95;
        scrollBoostRef.current *= WHEEL_SCROLL_BOOST_DECAY;
      }

      renderWheel(rotationRef.current);
      if (inViewRef.current) {
        animationFrame = window.requestAnimationFrame(tick);
      } else {
        animationFrame = 0;
        running = false;
      }
    };

    const start = () => {
      if (reducedMotion || running || !inViewRef.current) return;
      window.cancelAnimationFrame(animationFrame);
      lastTime = 0;
      running = true;
      animationFrame = window.requestAnimationFrame(tick);
    };

    const stop = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      running = false;
    };

    const handleScroll = () => {
      if (!inViewRef.current || reducedMotion) return;
      const scrollY = window.scrollY;
      const delta = Math.abs(scrollY - previousScrollYRef.current);
      previousScrollYRef.current = scrollY;
      if (delta > 0) {
        scrollBoostRef.current = Math.min(
          scrollBoostRef.current + delta * WHEEL_SCROLL_BOOST_FACTOR,
          WHEEL_SCROLL_BOOST_MAX
        );
        start();
      }
    };

    const handleResize = () => renderWheel(rotationRef.current);

    previousScrollYRef.current = window.scrollY;
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    const observer =
      rootRef.current && "IntersectionObserver" in window
        ? new IntersectionObserver(
            ([entry]) => {
              inViewRef.current = entry.isIntersecting;
              if (entry.isIntersecting) {
                start();
              } else {
                stop();
              }
            },
            { threshold: 0.1 }
          )
        : null;

    if (observer && rootRef.current) observer.observe(rootRef.current);

    renderWheel(rotationRef.current);
    start();

    return () => {
      stop();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      observer?.disconnect();
    };
  }, [renderWheel]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch") return;
      isDraggingRef.current = true;
      dragPointerIdRef.current = event.pointerId;
      previousPointerXRef.current = event.clientX;
      momentumRef.current = 0;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.style.cursor = "grabbing";
    },
    []
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        !isDraggingRef.current ||
        dragPointerIdRef.current !== event.pointerId
      ) {
        return;
      }

      const delta = event.clientX - previousPointerXRef.current;
      previousPointerXRef.current = event.clientX;
      rotationRef.current += delta * 0.28;
      momentumRef.current = delta * 0.03;
      renderWheel(rotationRef.current);
    },
    [renderWheel]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      isDraggingRef.current = false;
      dragPointerIdRef.current = -1;
      event.currentTarget.style.cursor = "grab";
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    []
  );

  return (
    <section
      className="w-full max-w-[900px] overflow-visible py-2"
      aria-hidden="true"
    >
      <div
        ref={rootRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative mx-auto h-[185px] w-full cursor-grab touch-pan-y select-none overflow-visible sm:h-[240px] md:h-[260px]"
        style={{ perspective: "900px" }}
      >
        {wheelItems.map((image, index) => (
          <div
            key={`${image.src}-${index}`}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            className="absolute left-1/2 top-1/2 aspect-[3/4] overflow-hidden rounded-[12px] bg-muted ring-1 ring-border/40 will-change-transform sm:rounded-[18px] md:rounded-[22px]"
            style={{
              width: WHEEL_CARD_WIDTH,
              height: WHEEL_CARD_HEIGHT,
              marginLeft: -WHEEL_CARD_WIDTH / 2,
              marginTop: -WHEEL_CARD_HEIGHT / 2,
              transformStyle: "preserve-3d",
              backfaceVisibility: "hidden",
            }}
          >
            <img
              src={image.src}
              alt={image.alt}
              draggable={false}
              loading={index < WHEEL_IMAGES.length ? "eager" : "lazy"}
              decoding="async"
              className="pointer-events-none block h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function InstallStep({
  n,
  title,
  body,
  children,
}: {
  n: number;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <section className="flex min-h-[190px] flex-col px-5 py-5">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-foreground/10 text-sm font-bold text-fg">
        {n}
      </span>
      <h3 className="mt-7 text-base font-bold leading-tight text-fg">
        {title}
      </h3>
      <p className="mt-3 max-w-sm text-sm leading-[1.5] text-fg-muted">
        {body}
      </p>
      {children && <div className="mt-auto pt-8">{children}</div>}
    </section>
  );
}

function CopyValueBlock({ copy }: { copy: CopyValue }) {
  return (
    <div
      className="inline-flex max-w-full rounded-lg border bg-transparent px-6 py-5 text-left"
      style={{
        borderColor:
          "color-mix(in oklch, var(--color-fg-muted) 45%, transparent)",
      }}
    >
      <div className="flex min-w-0 items-center gap-4">
        <code
          title={copy.value}
          className="block min-w-0 flex-1 truncate font-sans text-sm leading-5 text-fg"
        >
          {copy.value}
        </code>
        <CopyButton
          value={copy.value}
          iconOnly
          size="sm"
          feedback="toast"
          ariaLabel={copy.ariaLabel}
        />
      </div>
    </div>
  );
}

function InstallGuide() {
  const [activeKey, setActiveKey] = useState<HarnessKey>("claude");
  const active = TARGETS.find((target) => target.key === activeKey)!;
  const gridCols =
    active.steps.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3";

  return (
    <div
      data-install-guide
      className="w-full overflow-hidden rounded-lg border border-hairline bg-muted text-left"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-background/40 px-3 py-3 light:bg-foreground/6">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="tablist"
          aria-label="Install target"
        >
          {TARGETS.map((target) => {
            const selected = target.key === activeKey;
            return (
              <button
                key={target.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveKey(target.key)}
                className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm transition-colors ${
                  selected
                    ? "bg-background text-fg"
                    : "text-fg-muted hover:bg-foreground/3 hover:text-fg"
                }`}
              >
                <TargetIcon target={target.key} />
                {target.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`grid overflow-hidden ${gridCols}`}>
        {active.steps.map((step, index) => (
          <InstallStep
            key={step.title}
            n={index + 1}
            title={step.title}
            body={step.body}
          >
            {step.copy && <CopyValueBlock copy={step.copy} />}
          </InstallStep>
        ))}
      </div>
    </div>
  );
}

function McpServerUrl() {
  return (
    <div className="mt-5 inline-flex max-w-full rounded-lg bg-muted px-6 py-5 text-left">
      <div className="flex min-w-0 items-center gap-4">
        <code
          title={MCP_SERVER_URL}
          className="block min-w-0 flex-1 truncate font-sans text-sm leading-5 text-fg"
        >
          {MCP_SERVER_URL}
        </code>
        <CopyButton
          value={MCP_SERVER_URL}
          iconOnly
          size="sm"
          feedback="toast"
          ariaLabel="Copy MCP server URL"
        />
      </div>
    </div>
  );
}

export default function InstallPage() {
  const { isConnected, isLoading } = useAuth();

  // Middleware already sends signed-out requests to /login before this page
  // is served (see middleware.ts). This client-side fallback only fires if
  // the session lapses while the console is open.
  useEffect(() => {
    if (!isLoading && !isConnected) {
      window.location.replace(AUTH_SIGNIN_HREF);
    }
  }, [isLoading, isConnected]);

  if (isLoading) return null;

  // Redirect is in flight; render nothing while it takes effect.
  if (!isConnected) return null;

  return (
    <main id="main-content" className="relative flex-1 bg-dark">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-3 pb-20 pt-8 text-center md:px-7 md:pt-12">
        <InstallImageWheel />
        <h1 className="mt-2 max-w-[720px] text-5xl font-normal leading-[0.98] tracking-normal text-fg">
          Turn your agent into a full suite production studio.
        </h1>
        <p className="mt-4 max-w-[560px] text-sm leading-[1.55] tracking-normal text-fg-muted">
          Bring image, video, audio, 3D, editing, rendering, and production
          tools into your agent’s workflows with Livepeer.
        </p>
        <McpServerUrl />

        <section
          className="w-full max-w-5xl py-28 text-left md:py-32"
          aria-label="Install guide"
        >
          <SectionHeader
            variant="default"
            className="mb-3 flex items-end justify-between gap-3"
            title="Install Guide"
          />
          <InstallGuide />
        </section>
      </div>
    </main>
  );
}
