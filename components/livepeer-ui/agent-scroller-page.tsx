"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  LivepeerForegroundGradientWordmark,
  LivepeerSymbol,
} from "@/components/brand";
import { AgentCapabilitiesSection } from "@/components/livepeer-ui/agent-capabilities-section";
import {
  authModalMedia,
  compatibilityMarks,
  featuredMedia,
} from "@/components/livepeer-ui/frozen-content";
import { LivepeerHeader } from "@/components/livepeer-ui/livepeer-header";
import { getCapabilityFamilyLogos } from "@/components/livepeer-ui/model-family-logos";
import {
  JoinWaitlistControl,
  WaitlistHeaderAuth,
} from "@/components/livepeer-ui/waitlist-header-auth";
import { cn } from "@/lib/utils";
import {
  fitLogoOrbitRadius,
  logoOrbitPose,
  ORBIT_PERSPECTIVE,
} from "./logo-orbit";

type MediaItem = {
  id: string;
  src: string;
  alt: string;
  kind?: "image" | "video";
  fit?: "portrait";
  accentFrame?: boolean;
  coverBottomEdge?: boolean;
};
type SceneTheme = "base" | "inverse";
type SceneLayout = "hero" | "split" | "capabilities" | "footer";

type StoryScene = {
  id: string;
  title: string;
  body?: string;
  theme: SceneTheme;
  layout: SceneLayout;
  compatibility?: boolean;
  media: readonly MediaItem[];
};

type TransitionState = {
  from: number;
  to: number;
  direction: "down" | "up";
  token: number;
};

type InputPhase = "ready" | "collecting" | "transitioning" | "cooldown";
type FrameAnimation =
  | "exit-up"
  | "exit-down"
  | "reveal-up"
  | "reveal-down"
  | "reveal-up-synced"
  | "reveal-down-synced";
type ContentAnimation = "exit-up" | "enter-down" | "exit-down" | "enter-up";

const SCENE_TOP_OFFSET = 0;
const TRANSITION_DURATION = 760;
const THEME_HANDOFF_DELAY = 365;
const WHEEL_THRESHOLD = 48;
const WHEEL_GESTURE_WINDOW = 160;
const INPUT_QUIET_WINDOW = 120;

const nonShowcaseCapabilities = new Set([
  "create_media",
  "critique-batch",
  "describe_capability",
  "director_export",
  "generate_project",
  "get_cost_report",
  "get_creative_job",
  "list_capabilities",
  "set_active_brand_kit",
  "submit_creative_job",
]);

const storyContent = [
  {
    id: "studio",
    title: "Livepeer Agent turns any harness into your dream production studio",
    body: "Brings image, video, audio, 3D, editing, rendering, and production tools into your agent’s workflows with Livepeer Agent.",
    theme: "base",
    layout: "hero",
  },
  {
    id: "routing",
    title: "The right model for every request",
    body: "Livepeer Agent understands the work you’re asking for and routes it to the model best suited to handle it.",
    theme: "inverse",
    layout: "split",
  },
  {
    id: "pricing",
    title: "Pay for the work, not a subscription",
    body: "Livepeer Agent shows the real price of every render before it runs. Keep a balance in USD and pay only for the compute you use—no credits, plans, or hidden conversion.",
    theme: "base",
    layout: "split",
  },
  {
    id: "workflow",
    title: "Run any part of your workflow",
    body: "Send one step or an entire production through Livepeer Agent while keeping the files, applications, and processes you already use.",
    theme: "inverse",
    layout: "split",
  },
  {
    id: "compatible",
    title: "Compatible with",
    theme: "base",
    layout: "split",
    compatibility: true,
  },
] as const;

function mobileThemeForScene(index: number): SceneTheme {
  return index > 0 && index < storyContent.length - 1 ? "inverse" : "base";
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function Media({ item, eager = false }: { item: MediaItem; eager?: boolean }) {
  if (item.kind === "video") {
    return (
      <>
        <video
          src={item.src}
          aria-label={item.alt}
          autoPlay
          muted
          loop
          playsInline
          preload={eager ? "auto" : "metadata"}
          className="absolute inset-0 size-full object-cover"
        />
        {item.coverBottomEdge && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-3 bg-[#d1d3dc]"
          />
        )}
      </>
    );
  }

  return (
    <Image
      src={item.src}
      alt={item.alt}
      width={1600}
      height={900}
      loading={eager ? "eager" : "lazy"}
      sizes="(min-width: 768px) 22rem, 65vw"
      className={cn(
        item.fit === "portrait"
          ? "absolute inset-0 size-full object-cover"
          : "absolute top-1/2 left-1/2 h-[46.154%] w-[216.667%] max-w-none -translate-x-1/2 -translate-y-1/2 rotate-90 object-cover"
      )}
    />
  );
}

function ProductMediaFrame({
  scene,
  frameAnimation,
  large = false,
}: {
  scene: StoryScene;
  frameAnimation?: FrameAnimation;
  large?: boolean;
}) {
  const currentItem = scene.media[0];

  if (!currentItem) return null;
  const hasAccentFrame =
    currentItem.kind === "video" || currentItem.accentFrame;

  return (
    <div
      data-testid="scroller-media-frame"
      className={cn(
        "relative h-[var(--scene-frame-height)] aspect-[9/19.5] shrink-0 overflow-hidden rounded-[var(--scene-frame-radius)] [--scene-frame-shell:4px] [transform:translateZ(0)] [will-change:clip-path] [contain:paint] [backface-visibility:hidden]",
        large
          ? "[--scene-frame-height:min(62svh,39rem)] [--scene-frame-radius:clamp(1.5rem,calc(var(--scene-frame-height)*0.075),2.75rem)] md:[--scene-frame-height:min(74svh,46rem)]"
          : "[--scene-frame-height:min(48svh,27rem)] [--scene-frame-radius:clamp(1.25rem,calc(var(--scene-frame-height)*0.075),2.375rem)] md:[--scene-frame-height:min(58svh,36rem)]",
        hasAccentFrame
          ? "animated-emerald-radial-frame [padding:var(--scene-frame-shell)]"
          : "bg-muted",
        frameAnimation === "exit-up" && "animate-scene-frame-exit-up",
        frameAnimation === "exit-down" && "animate-scene-frame-exit-down",
        frameAnimation === "reveal-up" && "animate-scene-frame-reveal-up",
        frameAnimation === "reveal-down" && "animate-scene-frame-reveal-down",
        frameAnimation === "reveal-up-synced" &&
          "animate-scene-frame-reveal-up-synced",
        frameAnimation === "reveal-down-synced" &&
          "animate-scene-frame-reveal-down-synced"
      )}
    >
      <div
        className={cn(
          "relative z-10 size-full overflow-hidden bg-muted",
          hasAccentFrame
            ? "rounded-[max(0px,calc(var(--scene-frame-radius)-var(--scene-frame-shell)))]"
            : "rounded-[var(--scene-frame-radius)]"
        )}
      >
        <Media item={currentItem} eager={large} />
      </div>
    </div>
  );
}

function CompatibilityMarks({ theme }: { theme: SceneTheme }) {
  return (
    <ul className="mx-auto mt-8 flex max-w-[38rem] flex-wrap items-center justify-center gap-8 md:mx-0 md:justify-start">
      {compatibilityMarks.map((mark) => (
        <li
          key={mark.name}
          className="flex size-14 items-center justify-center"
        >
          <Image
            src={mark.src}
            alt={`${mark.name} logo`}
            width={56}
            height={56}
            className={cn(
              "size-14 object-contain brightness-0 transition-[filter] duration-[900ms] ease-in-out",
              theme === "inverse" && "invert"
            )}
          />
        </li>
      ))}
    </ul>
  );
}

function ContentScene({
  scene,
  frameAnimation,
  contentAnimation,
}: {
  scene: StoryScene;
  frameAnimation?: FrameAnimation;
  contentAnimation?: ContentAnimation;
}) {
  const isHero = scene.layout === "hero";

  return (
    <div
      className={cn(
        "flex h-full w-full overflow-hidden px-4 text-current sm:px-6",
        isHero
          ? "flex-col items-center justify-start gap-[var(--hero-content-gap)] pt-[calc(4rem+clamp(0.75rem,2svh,2rem))] text-center [--hero-content-gap:clamp(1.5rem,4svh,3rem)]"
          : "flex-col items-center justify-center gap-7 py-10 md:grid md:grid-cols-[minmax(16rem,0.8fr)_minmax(20rem,1fr)] md:gap-[clamp(3rem,8vw,9rem)] md:px-[clamp(2rem,6vw,7rem)] md:py-12"
      )}
    >
      {!isHero && (
        <div className="pointer-events-none order-2 justify-self-end md:order-1">
          <ProductMediaFrame scene={scene} frameAnimation={frameAnimation} />
        </div>
      )}

      <div
        data-testid={isHero ? "scroller-intro-copy" : undefined}
        className={cn(
          "order-1 max-w-[38rem] md:order-2",
          isHero
            ? "flex max-w-[64rem] flex-col items-center gap-[var(--hero-content-gap)]"
            : "text-center md:text-left",
          contentAnimation && `animate-scene-content-${contentAnimation}`
        )}
      >
        {isHero ? (
          <>
            <div className="min-h-40 sm:min-h-52">
              <h1 className="font-display text-display-sm text-balance sm:text-display-lg">
                {scene.title}
              </h1>
              <p className="mx-auto mt-5 max-w-[42rem] text-sm leading-relaxed text-balance text-current">
                {scene.body}
              </p>
            </div>
            <div className="flex justify-center md:-translate-y-[clamp(0.75rem,1.5svh,1rem)]">
              <JoinWaitlistControl
                defaultExpanded
                showVerificationDialog={isHero}
              />
            </div>
          </>
        ) : (
          <>
            <h2 className="font-display text-display-sm text-balance sm:text-display-md">
              {scene.title}
            </h2>
            {scene.compatibility ? (
              <CompatibilityMarks theme={scene.theme} />
            ) : (
              <p className="mx-auto mt-5 max-w-[34rem] text-sm leading-relaxed text-balance text-current md:mx-0">
                {scene.body}
              </p>
            )}
          </>
        )}
      </div>

      {isHero && (
        <div className="pointer-events-none order-2 mt-4 shrink-0 sm:mt-6">
          <ProductMediaFrame
            scene={scene}
            frameAnimation={frameAnimation}
            large
          />
        </div>
      )}
    </div>
  );
}

function CapabilityFamilyLogoAnimation({
  capabilities,
  theme,
}: {
  capabilities: readonly string[];
  theme: SceneTheme;
}) {
  const logos = useMemo(
    () => getCapabilityFamilyLogos(capabilities),
    [capabilities]
  );
  const orbitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const orbit = orbitRef.current;
    if (!orbit || logos.length === 0) return;

    const logoElements = Array.from(
      orbit.querySelectorAll<HTMLElement>("[data-capability-family-logo]")
    );
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    let animationFrame = 0;
    let lastTime = 0;
    let radius = 0;
    const measureOrbit = () => {
      radius = fitLogoOrbitRadius(
        orbit.clientWidth,
        orbit.clientHeight,
        logoElements[0]?.offsetWidth ?? 48
      );
    };

    const renderOrbit = (time: number) => {
      const elapsed = reducedMotion ? 0 : time * 0.000095;

      logoElements.forEach((element, index) => {
        const angle = elapsed + (index / logoElements.length) * Math.PI * 2;
        const { x, y, z, depth, blur, scale } = logoOrbitPose(angle, radius);

        element.style.zIndex = String(Math.round(depth * 100));
        element.style.opacity = String(0.28 + depth * 0.72);
        element.style.filter = `blur(${blur.toFixed(2)}px)`;
        element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) scale(${scale.toFixed(3)})`;
      });
    };

    measureOrbit();
    renderOrbit(0);
    const tick = (time: number) => {
      lastTime = time;
      renderOrbit(time);
      animationFrame = requestAnimationFrame(tick);
    };
    if (!reducedMotion) animationFrame = requestAnimationFrame(tick);

    const resizeObserver = new ResizeObserver(() => {
      measureOrbit();
      renderOrbit(lastTime);
    });
    resizeObserver.observe(orbit);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [logos]);

  return (
    <div
      ref={orbitRef}
      className="relative h-[16rem] w-full max-w-4xl overflow-hidden [transform-style:preserve-3d] sm:h-[21rem]"
      style={{ perspective: ORBIT_PERSPECTIVE }}
      aria-label="Model and tool families available through Livepeer Agent"
    >
      {logos.map((logo) => (
        <div
          key={logo.id}
          data-capability-family-logo
          className="absolute top-1/2 left-1/2 -mt-5 -ml-5 flex size-10 items-center justify-center will-change-[transform,filter,opacity] sm:-mt-6 sm:-ml-6 sm:size-12"
        >
          <Image
            src={logo.src}
            alt={`${logo.name} logo`}
            width={64}
            height={56}
            className={cn(
              "max-h-8 w-auto max-w-9 object-contain brightness-0 transition-[filter] duration-[900ms] ease-in-out sm:max-h-9 sm:max-w-10",
              theme === "inverse" && "invert"
            )}
          />
        </div>
      ))}
    </div>
  );
}

function CapabilitiesScene({
  scene,
  capabilities,
  contentAnimation,
}: {
  scene: StoryScene;
  capabilities: string[];
  contentAnimation?: ContentAnimation;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center overflow-hidden px-4 py-8 text-current sm:px-6",
        contentAnimation && `animate-scene-content-${contentAnimation}`
      )}
    >
      <div className="pointer-events-none flex w-full shrink-0 justify-center">
        <CapabilityFamilyLogoAnimation
          capabilities={capabilities}
          theme={scene.theme}
        />
      </div>
      <div className="mt-5 w-full sm:mt-7">
        <AgentCapabilitiesSection
          capabilities={capabilities}
          content={{
            heading: scene.title,
            cta: {
              label: "Join waitlist",
              href: "/mockups/private-beta/earlyaccess",
            },
          }}
          showCta={false}
          className="bg-transparent py-0 text-current sm:py-0"
          headingClassName="max-w-6xl font-display sm:text-display-lg"
          badgesClassName="max-h-[30svh] overflow-hidden [mask-image:linear-gradient(to_bottom,black_90%,transparent)] sm:max-h-[34svh]"
        />
      </div>
    </div>
  );
}

function FooterScene({
  contentAnimation,
}: {
  contentAnimation?: ContentAnimation;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col px-4 pt-12 pb-4 text-current sm:px-6 sm:pt-16 sm:pb-6 md:px-10",
        contentAnimation && `animate-scene-content-${contentAnimation}`
      )}
    >
      <div className="flex flex-1 items-center justify-center">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-center gap-10 text-center">
          <LivepeerSymbol className="h-16 w-auto" />
          <h2 className="max-w-6xl font-display text-display-sm text-balance sm:text-display-lg">
            Livepeer Agent. Keep creating.
          </h2>
          <JoinWaitlistControl defaultExpanded />
        </div>
      </div>
      <LivepeerForegroundGradientWordmark className="h-auto w-full opacity-10" />
    </div>
  );
}

function SceneComposition({
  scene,
  capabilities,
  frameAnimation,
  contentAnimation,
}: {
  scene: StoryScene;
  capabilities: string[];
  frameAnimation?: FrameAnimation;
  contentAnimation?: ContentAnimation;
}) {
  if (scene.layout === "capabilities") {
    return (
      <CapabilitiesScene
        scene={scene}
        capabilities={capabilities}
        contentAnimation={contentAnimation}
      />
    );
  }

  if (scene.layout === "footer") {
    return <FooterScene contentAnimation={contentAnimation} />;
  }

  return (
    <ContentScene
      scene={scene}
      frameAnimation={frameAnimation}
      contentAnimation={contentAnimation}
    />
  );
}

function DesktopAgentScrollerPage({
  capabilities,
  networkImages,
}: {
  capabilities: readonly string[];
  networkImages: MediaItem[];
}) {
  const scenes = useMemo<StoryScene[]>(() => {
    const contentScenes = storyContent.map((scene, sceneIndex) => ({
      ...scene,
      media: Array.from({ length: 3 }, (_, mediaIndex) => {
        const featured =
          mediaIndex === 0
            ? featuredMedia[scene.id as keyof typeof featuredMedia]
            : undefined;
        if (featured) return featured;
        const image =
          networkImages[(sceneIndex * 3 + mediaIndex) % networkImages.length];

        return {
          ...image,
          id: `${scene.id}-${image.id}-${mediaIndex}`,
        };
      }),
    }));
    const capabilityMedia = contentScenes.at(-1)?.media ?? [];

    return [
      ...contentScenes,
      {
        id: "capabilities",
        title: "Everything your production needs, within reach",
        theme: "base",
        layout: "capabilities",
        media: capabilityMedia,
      },
      {
        id: "footer",
        title: "Livepeer Agent. Keep creating.",
        theme: "base",
        layout: "footer",
        media: [],
      },
    ];
  }, [networkImages]);
  const showcaseCapabilities = useMemo(
    () =>
      capabilities.filter(
        (capability) => !nonShowcaseCapabilities.has(capability)
      ),
    [capabilities]
  );
  const scrollerRef = useRef<HTMLDivElement>(null);
  const gestureSurfaceRef = useRef<HTMLDivElement>(null);
  const activeSceneIndexRef = useRef(0);
  const transitionRef = useRef<TransitionState | null>(null);
  const transitionTokenRef = useRef(0);
  const transitionStartRef = useRef<((targetIndex: number) => void) | null>(
    null
  );
  const requestedSceneRef = useRef<number | null>(null);
  const suppressScrollRef = useRef(false);
  const initializedRef = useRef(false);
  const wheelAccumulatorRef = useRef(0);
  const wheelDirectionRef = useRef<"down" | "up" | null>(null);
  const lastWheelAtRef = useRef(0);
  const wheelWindowRef = useRef<number | null>(null);
  const midpointTimerRef = useRef<number | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const inputPhaseRef = useRef<InputPhase>("ready");
  const touchStartRef = useRef<number | null>(null);
  const touchCurrentRef = useRef<number | null>(null);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [visualSceneIndex, setVisualSceneIndex] = useState(0);
  const [transition, setTransition] = useState<TransitionState | null>(null);
  const [inputPhase, setInputPhase] = useState<InputPhase>("ready");
  const [reducedMotion, setReducedMotion] = useState(false);

  const maximumSceneIndex = scenes.length - 1;
  const activeScene = scenes[visualSceneIndex];

  const setPhase = useCallback((phase: InputPhase) => {
    inputPhaseRef.current = phase;
    setInputPhase(phase);
  }, []);

  const placeScrollAtScene = useCallback((sceneIndex: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const sceneHeight = Math.max(1, scroller.clientHeight - SCENE_TOP_OFFSET);
    suppressScrollRef.current = true;
    scroller.scrollTop = sceneIndex * sceneHeight;
    window.requestAnimationFrame(() => {
      suppressScrollRef.current = false;
    });
  }, []);

  const clearTransitionTimers = useCallback(() => {
    if (midpointTimerRef.current !== null) {
      window.clearTimeout(midpointTimerRef.current);
      midpointTimerRef.current = null;
    }
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
  }, []);

  const scheduleReadyAfterQuiet = useCallback(() => {
    if (cooldownTimerRef.current !== null) {
      window.clearTimeout(cooldownTimerRef.current);
    }

    const waitForQuiet = () => {
      const remaining =
        INPUT_QUIET_WINDOW - (performance.now() - lastWheelAtRef.current);
      if (remaining > 0) {
        cooldownTimerRef.current = window.setTimeout(waitForQuiet, remaining);
        return;
      }

      cooldownTimerRef.current = null;
      wheelAccumulatorRef.current = 0;
      wheelDirectionRef.current = null;
      setPhase("ready");
    };

    const remaining = Math.max(
      0,
      INPUT_QUIET_WINDOW - (performance.now() - lastWheelAtRef.current)
    );
    if (remaining === 0) {
      waitForQuiet();
      return;
    }

    cooldownTimerRef.current = window.setTimeout(waitForQuiet, remaining);
  }, [setPhase]);

  const finishTransition = useCallback(
    (token: number) => {
      const currentTransition = transitionRef.current;
      if (!currentTransition || currentTransition.token !== token) return;

      clearTransitionTimers();
      const nextIndex = currentTransition.to;
      transitionRef.current = null;
      activeSceneIndexRef.current = nextIndex;
      setActiveSceneIndex(nextIndex);
      setVisualSceneIndex(nextIndex);
      setTransition(null);
      placeScrollAtScene(nextIndex);

      const requestedIndex = requestedSceneRef.current;
      if (requestedIndex !== null && requestedIndex !== nextIndex) {
        setPhase("cooldown");
        window.setTimeout(() => {
          transitionStartRef.current?.(
            nextIndex + (requestedIndex > nextIndex ? 1 : -1)
          );
        }, 80);
        return;
      }

      requestedSceneRef.current = null;
      setPhase("cooldown");
      scheduleReadyAfterQuiet();
    },
    [
      clearTransitionTimers,
      placeScrollAtScene,
      scheduleReadyAfterQuiet,
      setPhase,
    ]
  );

  const startTransition = useCallback(
    (requestedIndex: number) => {
      if (transitionRef.current) return;

      const from = activeSceneIndexRef.current;
      const to = clamp(requestedIndex, 0, maximumSceneIndex);
      if (to === from) {
        setPhase("ready");
        return;
      }

      if (reducedMotion) {
        activeSceneIndexRef.current = to;
        setActiveSceneIndex(to);
        setVisualSceneIndex(to);
        placeScrollAtScene(to);
        setPhase("ready");
        return;
      }

      const nextTransition: TransitionState = {
        from,
        to,
        direction: to > from ? "down" : "up",
        token: ++transitionTokenRef.current,
      };
      transitionRef.current = nextTransition;
      setTransition(nextTransition);
      setPhase("transitioning");
      wheelAccumulatorRef.current = 0;
      wheelDirectionRef.current = null;

      midpointTimerRef.current = window.setTimeout(() => {
        if (transitionRef.current?.token === nextTransition.token) {
          setVisualSceneIndex(to);
        }
      }, THEME_HANDOFF_DELAY);
      completionTimerRef.current = window.setTimeout(
        () => finishTransition(nextTransition.token),
        TRANSITION_DURATION + 80
      );
    },
    [
      finishTransition,
      maximumSceneIndex,
      placeScrollAtScene,
      reducedMotion,
      setPhase,
    ]
  );

  useEffect(() => {
    transitionStartRef.current = startTransition;
  }, [startTransition]);

  const moveByScene = useCallback(
    (direction: "down" | "up") => {
      startTransition(
        activeSceneIndexRef.current + (direction === "down" ? 1 : -1)
      );
    },
    [startTransition]
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReducedMotion(mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);

    return () => {
      mediaQuery.removeEventListener("change", updateMotionPreference);
    };
  }, []);

  useEffect(
    () => () => {
      clearTransitionTimers();
      if (wheelWindowRef.current !== null)
        window.clearTimeout(wheelWindowRef.current);
      if (cooldownTimerRef.current !== null)
        window.clearTimeout(cooldownTimerRef.current);
    },
    [clearTransitionTimers]
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const updateForViewport = () => {
      const sceneHeight = Math.max(1, scroller.clientHeight - SCENE_TOP_OFFSET);
      if (!initializedRef.current) {
        const restoredIndex = clamp(
          Math.round(scroller.scrollTop / sceneHeight),
          0,
          maximumSceneIndex
        );
        initializedRef.current = true;
        activeSceneIndexRef.current = restoredIndex;
        setActiveSceneIndex(restoredIndex);
        setVisualSceneIndex(restoredIndex);
        placeScrollAtScene(restoredIndex);
        return;
      }

      placeScrollAtScene(activeSceneIndexRef.current);
    };
    const request = window.requestAnimationFrame(updateForViewport);
    window.addEventListener("resize", updateForViewport);

    return () => {
      window.cancelAnimationFrame(request);
      window.removeEventListener("resize", updateForViewport);
    };
  }, [maximumSceneIndex, placeScrollAtScene]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const gestureSurface = gestureSurfaceRef.current;
    if (!scroller || !gestureSurface) return;

    const handleWheelGesture = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      event.preventDefault();

      if (transitionRef.current) {
        lastWheelAtRef.current = performance.now();
        return;
      }
      if (inputPhaseRef.current === "cooldown") {
        return;
      }

      lastWheelAtRef.current = performance.now();

      const multiplier =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? scroller.clientHeight
            : 1;
      const delta = event.deltaY * multiplier;
      if (Math.abs(delta) < 1) return;

      const direction = delta > 0 ? "down" : "up";
      if (wheelDirectionRef.current !== direction) {
        wheelAccumulatorRef.current = 0;
        wheelDirectionRef.current = direction;
      }
      setPhase("collecting");
      wheelAccumulatorRef.current += Math.abs(delta);

      if (wheelWindowRef.current !== null)
        window.clearTimeout(wheelWindowRef.current);
      wheelWindowRef.current = window.setTimeout(() => {
        wheelAccumulatorRef.current = 0;
        wheelDirectionRef.current = null;
        setPhase("ready");
      }, WHEEL_GESTURE_WINDOW);

      if (wheelAccumulatorRef.current >= WHEEL_THRESHOLD) {
        if (wheelWindowRef.current !== null)
          window.clearTimeout(wheelWindowRef.current);
        wheelWindowRef.current = null;
        moveByScene(direction);
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (transitionRef.current) return;
      const startY = event.touches[0]?.clientY ?? null;
      touchStartRef.current = startY;
      touchCurrentRef.current = startY;
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (touchCurrentRef.current === null || transitionRef.current) return;
      event.preventDefault();

      const currentY = event.touches[0]?.clientY;
      if (currentY === undefined) return;
      touchCurrentRef.current = currentY;
    };
    const settleTouch = () => {
      const startY = touchStartRef.current;
      const currentY = touchCurrentRef.current;

      if (startY !== null && currentY !== null) {
        const distance = startY - currentY;
        if (Math.abs(distance) >= 32) moveByScene(distance > 0 ? "down" : "up");
      }

      touchStartRef.current = null;
      touchCurrentRef.current = null;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.matches("input, textarea, select, button")
      ) {
        return;
      }

      const down = ["ArrowDown", "PageDown", " "].includes(event.key);
      const up = ["ArrowUp", "PageUp"].includes(event.key);
      if (!down && !up) return;

      event.preventDefault();
      moveByScene(down ? "down" : "up");
    };

    scroller.addEventListener("wheel", handleWheelGesture, {
      passive: false,
      capture: true,
    });
    scroller.addEventListener("touchstart", handleTouchStart, {
      passive: true,
      capture: true,
    });
    scroller.addEventListener("touchmove", handleTouchMove, {
      passive: false,
      capture: true,
    });
    scroller.addEventListener("touchend", settleTouch, {
      passive: true,
      capture: true,
    });
    scroller.addEventListener("touchcancel", settleTouch, {
      passive: true,
      capture: true,
    });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      scroller.removeEventListener("wheel", handleWheelGesture, true);
      scroller.removeEventListener("touchstart", handleTouchStart, true);
      scroller.removeEventListener("touchmove", handleTouchMove, true);
      scroller.removeEventListener("touchend", settleTouch, true);
      scroller.removeEventListener("touchcancel", settleTouch, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [moveByScene, scheduleReadyAfterQuiet, setPhase]);

  function handleScroll() {
    const scroller = scrollerRef.current;
    if (!scroller || suppressScrollRef.current || transitionRef.current) return;

    const sceneHeight = Math.max(1, scroller.clientHeight - SCENE_TOP_OFFSET);
    const requestedIndex = clamp(
      Math.round(scroller.scrollTop / sceneHeight),
      0,
      maximumSceneIndex
    );
    if (requestedIndex === activeSceneIndexRef.current) return;

    requestedSceneRef.current = requestedIndex;
    placeScrollAtScene(activeSceneIndexRef.current);
    startTransition(
      activeSceneIndexRef.current +
        (requestedIndex > activeSceneIndexRef.current ? 1 : -1)
    );
  }

  const renderedSceneIndexes = transition
    ? [transition.from, transition.to]
    : [activeSceneIndex];

  function returnToFirstScene() {
    if (!transitionRef.current && activeSceneIndexRef.current === 0) {
      requestedSceneRef.current = null;
      placeScrollAtScene(0);
      return;
    }

    requestedSceneRef.current = 0;
    if (!transitionRef.current) startTransition(0);
  }

  return (
    <div
      ref={scrollerRef}
      onScroll={handleScroll}
      className={cn(
        "h-dvh overflow-x-hidden overflow-y-auto overscroll-y-contain transition-[background-color,color] duration-[900ms] ease-in-out",
        activeScene.theme === "base"
          ? "bg-background text-foreground"
          : "dark bg-background text-foreground"
      )}
    >
      <div className="fixed inset-x-0 top-0 z-50 h-16 bg-transparent">
        <LivepeerHeader
          utility={
            <WaitlistHeaderAuth
              theme={activeScene.theme}
              signInImage={authModalMedia}
              smoothTheme
            />
          }
          onLogoClick={returnToFirstScene}
          transparent
        />
      </div>

      <main
        className="relative"
        style={{
          height: `calc(${scenes.length} * (100dvh - ${SCENE_TOP_OFFSET}px))`,
        }}
      >
        <div className="sticky top-0 z-20 h-dvh overflow-hidden">
          <div
            key="persistent-gesture-surface"
            ref={gestureSurfaceRef}
            aria-hidden="true"
            data-gesture-surface
            className={cn(
              "absolute inset-0 z-40 touch-none",
              (activeScene.layout === "footer" ||
                activeScene.layout === "hero") &&
                "pointer-events-none"
            )}
            data-input-phase={inputPhase}
          />
          {renderedSceneIndexes.map((sceneIndex) => {
            const scene = scenes[sceneIndex];
            const isOutgoing = transition?.from === sceneIndex;
            const isIncoming = transition?.to === sceneIndex;
            const boundaryKey = transition
              ? [scenes[transition.from]?.id, scenes[transition.to]?.id]
                  .sort()
                  .join(":")
              : "";
            const isHeroRevealBoundary = boundaryKey === "routing:studio";
            const frameAnimation: FrameAnimation | undefined = transition
              ? isOutgoing
                ? transition.direction === "down"
                  ? "exit-up"
                  : "exit-down"
                : isHeroRevealBoundary
                  ? transition.direction === "down"
                    ? "reveal-up"
                    : "reveal-down"
                  : transition.direction === "down"
                    ? "reveal-up-synced"
                    : "reveal-down-synced"
              : undefined;
            const contentAnimation: ContentAnimation | undefined = transition
              ? isOutgoing
                ? transition.direction === "down"
                  ? "exit-up"
                  : "exit-down"
                : transition.direction === "down"
                  ? "enter-down"
                  : "enter-up"
              : undefined;

            return (
              <section
                key={scene.id}
                data-scene={scene.id}
                data-scene-index={sceneIndex}
                data-scroll-direction={transition?.direction}
                data-transition-role={
                  transition ? (isOutgoing ? "outgoing" : "incoming") : "idle"
                }
                aria-hidden={sceneIndex !== visualSceneIndex}
                inert={sceneIndex !== visualSceneIndex}
                onAnimationEnd={(event) => {
                  if (
                    isIncoming &&
                    transition &&
                    event.animationName.startsWith("scene-content")
                  ) {
                    finishTransition(transition.token);
                  }
                }}
                className={cn(
                  "absolute inset-0 bg-transparent text-current",
                  !transition && "z-10",
                  isOutgoing && "z-20",
                  isIncoming && "z-10"
                )}
              >
                <div className="size-full">
                  <SceneComposition
                    scene={scene}
                    capabilities={showcaseCapabilities}
                    frameAnimation={frameAnimation}
                    contentAnimation={contentAnimation}
                  />
                </div>
              </section>
            );
          })}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0"
        >
          {scenes.map((scene) => (
            <div
              key={scene.id}
              data-scene-spacer={scene.id}
              className="h-dvh"
            />
          ))}
        </div>
      </main>

      <div className="sr-only">
        {scenes.map((scene) => (
          <section key={scene.id}>
            <h2>{scene.title}</h2>
            {scene.body && <p>{scene.body}</p>}
          </section>
        ))}
      </div>
    </div>
  );
}

function MobileAgentScrollerPage({
  capabilities,
  networkImages,
}: {
  capabilities: readonly string[];
  networkImages: MediaItem[];
}) {
  const [activeTheme, setActiveTheme] = useState<SceneTheme>("base");
  const scenes = useMemo<StoryScene[]>(
    () =>
      storyContent.map((scene, sceneIndex) => ({
        ...scene,
        media: Array.from({ length: 3 }, (_, mediaIndex) => {
          const featured =
            mediaIndex === 0
              ? featuredMedia[scene.id as keyof typeof featuredMedia]
              : undefined;
          if (featured) return featured;
          const image =
            networkImages[(sceneIndex * 3 + mediaIndex) % networkImages.length];
          return { ...image, id: `${scene.id}-${image.id}-${mediaIndex}` };
        }),
      })),
    [networkImages]
  );
  const showcaseCapabilities = capabilities.filter(
    (capability) => !nonShowcaseCapabilities.has(capability)
  );

  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-mobile-theme]")
    );
    let frame = 0;

    const updateTheme = () => {
      frame = 0;
      let current = sections[0];
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= 1) {
          current = section;
        } else {
          break;
        }
      }
      const theme = current?.getAttribute("data-mobile-theme");
      if (theme === "base" || theme === "inverse") setActiveTheme(theme);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateTheme);
    };

    updateTheme();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  return (
    <div
      className={cn(
        "relative isolate min-h-dvh bg-transparent text-foreground transition-colors duration-[900ms] ease-in-out",
        activeTheme === "inverse" && "dark"
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-background transition-colors duration-[900ms] ease-in-out"
      />
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-50 h-16 bg-transparent text-foreground transition-colors duration-[900ms] ease-in-out",
          activeTheme === "inverse" && "dark"
        )}
      >
        <LivepeerHeader
          utility={
            <WaitlistHeaderAuth
              theme={activeTheme}
              signInImage={authModalMedia}
              smoothTheme
            />
          }
          onLogoClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          transparent
        />
      </div>

      <main>
        {scenes.map((scene, index) => {
          const media = scene.media[0];
          return (
            <section
              key={scene.id}
              data-mobile-theme={mobileThemeForScene(index)}
              className={cn(
                "bg-transparent px-4 py-16 text-current sm:px-6 sm:py-20",
                index === 0 && "pt-24"
              )}
            >
              <div className="mx-auto flex max-w-xl flex-col gap-8">
                <div className="text-center">
                  <h1 className="font-display text-display-sm text-balance">
                    {scene.title}
                  </h1>
                  {scene.body && (
                    <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-balance text-current/75">
                      {scene.body}
                    </p>
                  )}
                  {scene.compatibility && (
                    <CompatibilityMarks theme={activeTheme} />
                  )}
                  {index === 0 && (
                    <div className="mt-8 flex justify-center">
                      <JoinWaitlistControl
                        defaultExpanded
                        showVerificationDialog={index === 0}
                        smoothTheme
                      />
                    </div>
                  )}
                </div>

                {media && (
                  <div
                    className={cn(
                      "pointer-events-none mx-auto",
                      index === 0 && "mt-4 sm:mt-6"
                    )}
                  >
                    <ProductMediaFrame scene={scene} large={index === 0} />
                  </div>
                )}
              </div>
            </section>
          );
        })}

        <section
          data-mobile-theme="base"
          className="bg-transparent px-4 py-16 text-current sm:px-6 sm:py-20"
        >
          <div className="mx-auto max-w-xl">
            <div className="mb-8 flex w-full justify-center">
              <CapabilityFamilyLogoAnimation
                capabilities={showcaseCapabilities}
                theme="base"
              />
            </div>
            <AgentCapabilitiesSection
              capabilities={showcaseCapabilities}
              content={{
                heading: "Everything your production needs, within reach",
                cta: { label: "Join waitlist", href: "#top" },
              }}
              showCta={false}
              className="bg-transparent py-0 text-current sm:py-0"
              badgeClassName="transition-colors duration-[900ms] ease-in-out"
              headingClassName="font-display text-[2rem]"
            />
          </div>
        </section>

        <section
          data-mobile-theme="base"
          className="bg-transparent px-4 pt-20 pb-6 text-current sm:px-6"
        >
          <div className="mx-auto flex max-w-xl flex-col items-center gap-10 text-center">
            <LivepeerSymbol className="h-16 w-auto" />
            <h2 className="font-display text-display-sm text-balance">
              Livepeer Agent. Keep creating.
            </h2>
            <JoinWaitlistControl defaultExpanded smoothTheme />
          </div>
          <LivepeerForegroundGradientWordmark className="mt-20 h-auto w-full opacity-10" />
        </section>
      </main>
    </div>
  );
}

function subscribeToDesktopBreakpoint(callback: () => void) {
  const query = window.matchMedia("(min-width: 768px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getDesktopBreakpoint() {
  return window.matchMedia("(min-width: 768px)").matches;
}

function getServerDesktopBreakpoint() {
  return false;
}

export function AgentScrollerPage(props: {
  capabilities: readonly string[];
  networkImages: MediaItem[];
}) {
  const desktop = useSyncExternalStore(
    subscribeToDesktopBreakpoint,
    getDesktopBreakpoint,
    getServerDesktopBreakpoint
  );

  return desktop ? (
    <DesktopAgentScrollerPage {...props} />
  ) : (
    <MobileAgentScrollerPage {...props} />
  );
}
