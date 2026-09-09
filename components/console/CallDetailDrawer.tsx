"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Info } from "lucide-react";
import { formatCallMetric } from "@/lib/console/utils";
import ModalityChip from "@/components/console/ModalityChip";
import { LivepeerSymbol } from "@/components/design-system/LivepeerLogo";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  mediaSpecForRow,
  STATUS_LABEL,
  type MediaSpec,
} from "@/lib/console/activity-media";
import type { AccountActivityRow } from "@/lib/console/types";
import type {
  RunDetail,
  RunInputFieldSchema,
  RunInputSchema,
} from "@/lib/runs/types";
import { requestFeeDisplay } from "@/lib/console/request-fee-display";
import { capabilityPresentation } from "@/lib/console/capability-modality";

function safeMediaUrl(value: string | undefined): string | undefined {
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "https:" || url.username || url.password)
      return undefined;
    if (
      process.env.NODE_ENV !== "production" &&
      typeof window !== "undefined" &&
      ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
      url.hostname === "earlyaccess.livepeer.org"
    ) {
      return new URL(`${url.pathname}${url.search}`, window.location.origin)
        .href;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-4 border-b border-hairline py-3 text-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-fg">{children}</dd>
    </div>
  );
}

function CapabilityChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-[5px] bg-foreground/5 px-2 py-0.5 text-sm text-fg">
      <span className="truncate">{children}</span>
    </span>
  );
}

function MediaUnavailable() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-foreground/[0.015] text-fg-muted">
      <LivepeerSymbol
        className="h-14 w-auto text-foreground/15"
        aria-hidden="true"
      />
      <p className="text-sm">Media unavailable</p>
    </div>
  );
}

function MediaLoading() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-foreground/[0.015] text-fg-muted">
      <LivepeerSymbol
        className="h-14 w-auto text-foreground/15"
        aria-hidden="true"
      />
      <p className="text-sm">Loading media…</p>
    </div>
  );
}

function PreviewLoader() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      aria-busy="true"
      aria-label="Loading preview"
    >
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70 motion-reduce:animate-none"
        aria-hidden="true"
      />
    </div>
  );
}

function ImagePreview({
  src,
  title,
  onUnavailable,
}: {
  src: string;
  title: string;
  onUnavailable: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  if (failed) {
    return <MediaUnavailable />;
  }

  return (
    <div className="relative h-full w-full">
      {!loaded && <PreviewLoader />}
      <img
        src={src}
        alt={title}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          onUnavailable();
        }}
        className={`h-full w-full object-contain object-top lg:object-center ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

function VideoPreview({
  src,
  onUnavailable,
}: {
  src?: string;
  onUnavailable: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  if (!src || failed) return <MediaUnavailable />;
  return (
    <div className="relative h-full w-full">
      {!loaded && <MediaLoading />}
      <video
        src={src}
        controls={loaded}
        playsInline
        onCanPlay={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          onUnavailable();
        }}
        className={`absolute inset-0 h-full w-full bg-background object-contain ${
          loaded ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
    </div>
  );
}

function AudioPreview({
  src,
  onUnavailable,
}: {
  src?: string;
  onUnavailable: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  if (!src || failed) return <MediaUnavailable />;
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {!loaded && <MediaLoading />}
      <audio
        src={src}
        controls={loaded}
        onCanPlay={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          onUnavailable();
        }}
        className={`absolute w-full max-w-3xl rounded-[6px] bg-black/20 px-8 py-7 ${
          loaded ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
    </div>
  );
}

function TextPreview({ text }: { text: string }) {
  return (
    <pre className="max-h-full w-full max-w-3xl overflow-auto whitespace-pre-wrap rounded-[6px] bg-foreground/3 p-6 text-left text-sm leading-6 text-fg">
      {text}
    </pre>
  );
}

function JsonPreview({ value }: { value: unknown }) {
  return (
    <pre className="max-h-full w-full max-w-3xl overflow-auto whitespace-pre-wrap rounded-[6px] bg-foreground/3 p-6 text-left font-mono text-xs leading-6 text-fg">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function remainingTime(expiresAt: string, now: number): string | null {
  const remaining = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const seconds = Math.ceil(remaining / 1000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const trailingSeconds = seconds % 60;
  return [days, hours, minutes, trailingSeconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function MediaExpiry({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = remainingTime(expiresAt, now);
  if (!remaining) return null;
  return (
    <p className="absolute left-1/2 top-3 w-fit -translate-x-1/2 whitespace-nowrap rounded-md bg-background/90 px-3 py-2 text-center text-xs tabular-nums text-muted-foreground shadow-sm backdrop-blur-sm">
      Expires in {remaining}
    </p>
  );
}

type DisplayField = {
  label: string;
  value: string;
  path?: string;
  kind?: "text" | "asset" | "setting";
  href?: string;
  timestamp?: string;
};

const FIELD_HELP: Array<[RegExp, string]> = [
  [/^Modality$/, "The input and output media category for this capability."],
  [/^Agent prompt$/, "The enriched instruction submitted by the agent."],
  [
    /^Agent negative prompt$/,
    "What the render should avoid. Leave empty when the capability does not require one.",
  ],
  [
    /^Keyframe \d+$/,
    "A referenced image placed at this elapsed timestamp. Other keyframes may be added when supported.",
  ],
  [
    /^(Image|Video|Audio|Mask)$/,
    "Existing media supplied to this run. It may come from an upload or an earlier platform result.",
  ],
  [
    /^Duration$/,
    "Requested output length. Available values depend on the selected capability.",
  ],
  [
    /^Aspect Ratio$/,
    "Sets the shape of the generated frame. Available values depend on the selected capability.",
  ],
  [
    /^Image Size$/,
    "Output dimensions or preset. Alternatives are defined by the selected image capability.",
  ],
  [
    /^Num Images$/,
    "Number of outputs requested, when batch generation is supported.",
  ],
  [
    /^Seed$/,
    "Controls repeatability. Use another integer for a different variation.",
  ],
  [
    /^Generate Audio$/,
    "Adds model-generated sound to the video. When set to true, describe any important sounds in the agent prompt. You can select true or false.",
  ],
  [
    /^Loop$/,
    "Makes the video repeat continuously. When set to true, the final frame transitions back to the first, so the first and last keyframes should describe a compatible scene. You can select true or false.",
  ],
  [
    /^Diarize$/,
    "Separates different speakers in the transcript. When set to true, each detected speaker receives its own label. You can select true or false.",
  ],
  [
    /^Include Streams$/,
    "Includes details about each audio, video, and subtitle stream found in the media. You can select true or false.",
  ],
  [
    /^Include Format$/,
    "Includes details about the media container, such as its duration and file format. You can select true or false.",
  ],
  [
    /^Generate Texture$/,
    "Adds surface color and material detail to the generated 3D model. When set to true, the result also includes texture data. You can select true or false.",
  ],
  [
    /^Interpolation · Easing$/,
    "Controls how motion speeds up and slows down between keyframes. Available values depend on the selected capability.",
  ],
  [
    /^Interpolation · Motion Strength$/,
    "How strongly motion is introduced between frames, typically from 0 to 1.",
  ],
  [
    /^Fps$/,
    "Output frames per second. Available values depend on the selected capability.",
  ],
  [
    /^Language$/,
    "Spoken-language hint. Available values depend on the selected capability.",
  ],
  [
    /^Timestamp Granularity$/,
    "Sets how precisely the transcript is timed. You can select segment or word timestamps.",
  ],
  [
    /^Batch Size$/,
    "Items processed together. Larger values may use more memory.",
  ],
  [
    /^Topology$/,
    "The requested mesh structure. Available topology modes depend on the 3D capability.",
  ],
  [
    /^Target Face Count$/,
    "Approximate polygon budget requested for the generated mesh.",
  ],
  [
    /^Texture Resolution$/,
    "Requested texture size, subject to capability limits.",
  ],
  [/^Price$/, "The final network charge recorded for this run."],
  [
    /^Render status$/,
    "Amount of time it took the model to generate your request.",
  ],
];

function readableOption(value: string | number | boolean | null): string {
  return value === null ? "null" : String(value);
}

function readableList(values: string[]): string {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} or ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, or ${values.at(-1)}`;
}

function matchingSchemaField(
  path: string | undefined,
  schema: RunInputSchema | null | undefined
): RunInputFieldSchema | null {
  if (!path || !schema) return null;
  const normalized = path.replace(/\.\d+(?=\.|$)/g, ".*");
  const candidates = [normalized];
  let parent = normalized;
  while (parent.includes(".")) {
    parent = parent.slice(0, parent.lastIndexOf("."));
    candidates.push(parent);
  }
  for (const candidate of candidates) {
    const field = schema.fields.find((item) => item.path === candidate);
    if (
      field &&
      (field.description ||
        field.options.length ||
        field.types.includes("boolean") ||
        field.minimum !== undefined ||
        field.maximum !== undefined ||
        field.exclusiveMinimum !== undefined ||
        field.exclusiveMaximum !== undefined ||
        field.defaultValue !== undefined)
    ) {
      return field;
    }
  }
  return null;
}

function schemaFieldHelp(
  field: DisplayField,
  schema: RunInputSchema | null | undefined
): FieldHelp | null {
  const metadata = matchingSchemaField(field.path, schema);
  if (!metadata) return null;
  const sentences: string[] = [];
  if (metadata.description) {
    sentences.push(
      /[.!?]$/.test(metadata.description)
        ? metadata.description
        : `${metadata.description}.`
    );
  }

  const options = metadata.options.map(readableOption);
  if (!options.length && metadata.types.includes("boolean")) {
    options.push("true", "false");
  }

  const minimum = metadata.minimum ?? metadata.exclusiveMinimum;
  const maximum = metadata.maximum ?? metadata.exclusiveMaximum;
  if (minimum !== undefined && maximum !== undefined) {
    sentences.push(`Enter a value from ${minimum} to ${maximum}.`);
  } else if (minimum !== undefined) {
    sentences.push(`Enter a value greater than or equal to ${minimum}.`);
  } else if (maximum !== undefined) {
    sentences.push(`Enter a value less than or equal to ${maximum}.`);
  }

  if (metadata.types.includes("object") && field.path && schema) {
    const prefix = `${metadata.path}.`;
    const customFields = schema.fields
      .filter(
        (candidate) =>
          candidate.path.startsWith(prefix) &&
          !candidate.path.slice(prefix.length).includes(".")
      )
      .map(
        (candidate) =>
          candidate.title?.trim().toLowerCase() ||
          candidate.path.slice(prefix.length).replace(/_/g, " ")
      );
    if (customFields.length) {
      const customList =
        customFields.length === 2
          ? `${customFields[0]} and ${customFields[1]}`
          : readableList(customFields);
      sentences.push(`You can also provide custom ${customList} values.`);
    }
  }

  if (metadata.required) sentences.push("This input is required.");
  if (metadata.defaultValue !== undefined) {
    sentences.push(`The default is ${String(metadata.defaultValue)}.`);
  }
  const description = sentences.join(" ");
  return description || options.length ? { description, options } : null;
}

type FieldHelp = { description: string; options: string[] };

function fieldHelp(
  field: DisplayField,
  schema?: RunInputSchema | null
): FieldHelp {
  const dynamic = schemaFieldHelp(field, schema);
  if (dynamic) return dynamic;
  const description =
    FIELD_HELP.find(([pattern]) => pattern.test(field.label))?.[1] ??
    `A submitted ${field.label.toLowerCase()} value. Available alternatives depend on the selected capability.`;
  const boolean = field.value === "true" || field.value === "false";
  return {
    description: boolean
      ? description.replace(/\s*You can select true or false\.$/, "")
      : description,
    options: boolean ? ["true", "false"] : [],
  };
}

function FieldLabel({
  field,
  schema,
}: {
  field: DisplayField;
  schema?: RunInputSchema | null;
}) {
  const help = fieldHelp(field, schema);
  return (
    <div className="flex items-center gap-1.5">
      <p className="text-xs text-fg-muted">{field.label}</p>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`About ${field.label}`}
            className="inline-flex items-center justify-center text-foreground/25 transition-colors hover:text-foreground/45 focus-visible:rounded-full focus-visible:text-foreground/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={8}
          className="z-[120] max-h-[min(70vh,28rem)] w-64 overflow-y-auto text-left leading-4 text-pretty"
        >
          {help.description && <p>{help.description}</p>}
          {help.options.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1" aria-label="Options">
              {help.options.map((option) => (
                <Badge
                  key={option}
                  variant="secondary"
                  className="h-5 bg-white/10 px-1.5 text-[11px] font-normal text-white hover:bg-white/10"
                >
                  {option}
                </Badge>
              ))}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function fieldLabel(path: string[]): string {
  return path
    .map((part) =>
      part
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    )
    .join(" · ");
}

function assetFieldLabel(path: string[]): string {
  const assetPath = [...path];
  const last = assetPath.at(-1);
  if (last) assetPath[assetPath.length - 1] = last.replace(/_?urls?$/i, "");
  return fieldLabel(assetPath);
}

type AssetReference = { id: string; displayName: string | null };

function assetReferenceFromUrl(
  value: string,
  assets: Map<string, AssetReference>
): AssetReference | null {
  const known = assets.get(value);
  if (known) return known;
  try {
    const url = new URL(value);
    if (url.hostname !== "earlyaccess.livepeer.org") return null;
    const match = url.pathname.match(/^\/api\/assets\/([^/]+)$/);
    return match
      ? { id: decodeURIComponent(match[1]!), displayName: null }
      : null;
  } catch {
    return null;
  }
}

function mediaTimestamp(value: unknown): string | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const totalSeconds = Math.floor(numeric);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ];
  if (hours) parts.unshift(String(hours).padStart(2, "0"));
  return parts.join(":");
}

function promptFields(value: unknown): DisplayField[] {
  const fields: DisplayField[] = [];
  const seen = new Set<string>();
  const visit = (item: unknown, path: string[]) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    for (const [key, child] of Object.entries(item)) {
      const next = [...path, key];
      if (/prompt$/i.test(key) && typeof child === "string" && child.trim()) {
        const signature = `${key.toLowerCase()}:${child}`;
        if (!seen.has(signature)) {
          seen.add(signature);
          fields.push({
            label: fieldLabel([key]),
            value: child,
            path: next.join("."),
          });
        }
      } else {
        visit(child, next);
      }
    }
  };
  visit(value, []);
  return fields;
}

function dataFields(
  value: unknown,
  assets: Map<string, AssetReference>,
  root: string[] = []
): DisplayField[] {
  const fields: DisplayField[] = [];
  const visit = (item: unknown, path: string[]) => {
    if (/prompt$/i.test(path.at(-1) ?? "")) return;
    if (typeof item === "string") {
      const asset = assetReferenceFromUrl(item, assets);
      if (asset) {
        fields.push({
          label: assetFieldLabel(path),
          value: asset.displayName ?? asset.id,
          path: path.join("."),
          kind: "asset",
          href: item,
        });
        return;
      }
    }
    if (Array.isArray(item)) {
      const visible = item;
      if (!visible.length) return;
      if (
        /keyframes?$/i.test(path.at(-1) ?? "") &&
        visible.every(
          (child) => child && typeof child === "object" && !Array.isArray(child)
        )
      ) {
        visible.forEach((child, index) => {
          const keyframe = child as Record<string, unknown>;
          const timestamp = mediaTimestamp(
            keyframe.timestamp_seconds ?? keyframe.timestamp ?? keyframe.time
          );
          const assetUrl = [
            keyframe.image_url,
            keyframe.imageUrl,
            keyframe.url,
          ].find(
            (candidate): candidate is string => typeof candidate === "string"
          );
          const asset = assetUrl
            ? assetReferenceFromUrl(assetUrl, assets)
            : null;
          if (timestamp && asset) {
            fields.push({
              label: `Keyframe ${index + 1}`,
              value: asset.displayName ?? asset.id,
              path: [...path, "*"].join("."),
              kind: "asset",
              href: assetUrl,
              timestamp,
            });
          } else {
            visit(child, [...path, String(index + 1)]);
          }
        });
        return;
      }
      if (
        visible.every((child) => child === null || typeof child !== "object")
      ) {
        const assetItems = visible.map((child) =>
          typeof child === "string"
            ? { url: child, asset: assetReferenceFromUrl(child, assets) }
            : null
        );
        const allAssets = assetItems.every((item) => Boolean(item?.asset));
        if (allAssets) {
          assetItems.forEach((item, index) => {
            if (!item?.asset) return;
            fields.push({
              label:
                assetItems.length > 1
                  ? `${assetFieldLabel(path)} ${index + 1}`
                  : assetFieldLabel(path),
              value: item.asset.displayName ?? item.asset.id,
              path: path.join("."),
              kind: "asset",
              href: item.url,
            });
          });
          return;
        }
        const values = visible.map((child) =>
          typeof child === "string"
            ? (assetReferenceFromUrl(child, assets)?.displayName ??
              assetReferenceFromUrl(child, assets)?.id ??
              child)
            : String(child)
        );
        fields.push({
          label: fieldLabel(path),
          value: values.join(", "),
          path: path.join("."),
          kind: "text",
        });
      } else {
        visible.forEach((child, index) =>
          visit(child, [...path, String(index + 1)])
        );
      }
      return;
    }
    if (item && typeof item === "object") {
      for (const [key, child] of Object.entries(item)) {
        if (path.length === 0 && key === "capability") continue;
        visit(child, [...path, key]);
      }
      return;
    }
    if (path.length) {
      const milliseconds =
        /(?:inference|processing).*(?:time|duration).*ms$/i.test(
          path.join("_")
        );
      const numeric = typeof item === "number" ? item : Number.NaN;
      fields.push({
        label: milliseconds ? "Inference time" : fieldLabel(path),
        path: path.join("."),
        value:
          milliseconds && Number.isFinite(numeric)
            ? `${(numeric / 1000).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })} seconds`
            : item === null
              ? "None"
              : String(item),
      });
    }
  };
  visit(value, root);
  return fields;
}

function FieldSection({
  title,
  fields,
}: {
  title: string;
  fields: DisplayField[];
}) {
  if (!fields.length) return null;
  return (
    <section className="mt-5" aria-label={title}>
      <h3 className="text-xs font-medium text-fg-muted">{title}</h3>
      <dl className="mt-2 overflow-hidden rounded-md border border-hairline bg-foreground/[0.02]">
        {fields.map((field, index) => (
          <div
            key={`${field.label}-${index}`}
            className="border-b border-hairline px-3 py-2.5 last:border-b-0"
          >
            <dt className="text-[11px] text-fg-muted">{field.label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-fg">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function UserHistoryDetails({
  row,
  cost,
  prompts,
  parameters,
  inference,
  loading,
  error,
  onRetry,
  errorCode,
  errorMessage,
  inputSchema,
}: {
  row: AccountActivityRow;
  cost: string | undefined;
  prompts: DisplayField[];
  parameters: DisplayField[];
  inference: DisplayField[];
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  errorCode?: string | null;
  errorMessage?: string | null;
  inputSchema?: RunInputSchema | null;
}) {
  const primaryPrompts = prompts.filter(
    (field) => !/negative/i.test(field.label)
  );
  const negativePrompts = prompts.filter((field) =>
    /negative/i.test(field.label)
  );
  const inferenceValue = inference[0]?.value;
  const capability = capabilityPresentation(row.model, row.modality);
  const fields = [
    ...primaryPrompts.map((field) => ({ ...field, label: "Agent prompt" })),
    ...negativePrompts.map((field) => ({
      ...field,
      label: "Agent negative prompt",
    })),
    ...parameters.map((field) =>
      field.kind === "asset" || field.href
        ? field
        : { ...field, kind: "setting" as const }
    ),
    ...(cost ? [{ label: "Price", value: cost }] : []),
    ...(inferenceValue
      ? [{ label: "Render status", value: inferenceValue }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-medium leading-6 text-fg">
            {capability.title}
          </h2>
          <ModalityChip>{row.modality}</ModalityChip>
        </div>
      </div>

      {loading && (
        <p role="status" className="text-sm text-fg-muted">
          Loading run details…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-fg-muted">
          {error}{" "}
          <button type="button" onClick={onRetry} className="underline">
            Retry
          </button>
        </p>
      )}

      {fields.map((field, index) => (
        <div key={`${field.label}-${index}`}>
          <FieldLabel field={field} schema={inputSchema} />
          {field.href && safeMediaUrl(field.href) ? (
            <div className="mt-1 flex min-w-0 items-center gap-2">
              {field.timestamp && (
                <Badge
                  variant="secondary"
                  className="h-5 shrink-0 px-1.5 font-mono text-[11px] tabular-nums text-fg-muted"
                >
                  {field.timestamp}
                </Badge>
              )}
              <a
                href={safeMediaUrl(field.href)}
                target="_blank"
                rel="noopener noreferrer"
                title={field.value}
                className="inline-flex min-w-0 items-center gap-1 text-xs leading-5 text-fg underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground/70"
              >
                <span className="min-w-0 truncate">{field.value}</span>
                <ArrowUpRight
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
              </a>
            </div>
          ) : (
            <>
              {field.timestamp && (
                <Badge
                  variant="secondary"
                  className="mt-1 h-5 px-1.5 font-mono text-[11px] tabular-nums text-fg-muted"
                >
                  {field.timestamp}
                </Badge>
              )}
              {field.kind === "setting" ? (
                <Badge
                  variant="secondary"
                  title={field.value}
                  className="mt-1 h-5 max-w-full px-1.5 text-xs text-fg-muted"
                >
                  {field.value}
                </Badge>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-[15px] leading-6 text-fg">
                  {field.value}
                </p>
              )}
            </>
          )}
        </div>
      ))}

      {errorCode && (
        <div>
          <FieldLabel field={{ label: "Render status", value: "" }} />
          <p
            role="alert"
            className="mt-1 whitespace-pre-wrap text-[15px] leading-6 text-red-400"
          >
            {errorMessage ?? errorCode}
          </p>
        </div>
      )}
    </div>
  );
}

function MediaStage({
  media,
  expiresAt,
  unavailable,
  allowDataPreview,
  loading,
}: {
  media: MediaSpec;
  expiresAt?: string | null;
  unavailable?: boolean;
  allowDataPreview: boolean;
  loading: boolean;
}) {
  const [mediaFailed, setMediaFailed] = useState(false);
  const expired = expiresAt ? !remainingTime(expiresAt, Date.now()) : false;
  const hasRenderableSource =
    (media.kind === "image" && Boolean(media.imageUrl)) ||
    (media.kind === "video" && Boolean(media.videoUrl)) ||
    (media.kind === "audio" && Boolean(media.audioUrl)) ||
    (allowDataPreview &&
      ((media.kind === "text" && Boolean(media.text)) ||
        media.kind === "json"));
  const canRender =
    !unavailable && !expired && !mediaFailed && hasRenderableSource;

  return (
    <div className="relative flex aspect-video w-full min-h-0 min-w-0 items-start justify-center overflow-auto bg-background lg:aspect-auto lg:h-full lg:items-center">
      {loading && <MediaLoading />}
      {!loading && !canRender && <MediaUnavailable />}
      {!loading &&
        canRender &&
        media.kind === "image" &&
        (media.imageUrl ? (
          <ImagePreview
            src={media.imageUrl}
            title={media.title}
            onUnavailable={() => setMediaFailed(true)}
          />
        ) : (
          <MediaUnavailable />
        ))}
      {!loading && canRender && media.kind === "video" && (
        <VideoPreview
          src={media.videoUrl}
          onUnavailable={() => setMediaFailed(true)}
        />
      )}
      {!loading && canRender && media.kind === "audio" && (
        <AudioPreview
          src={media.audioUrl}
          onUnavailable={() => setMediaFailed(true)}
        />
      )}
      {!loading && canRender && media.kind === "text" && media.text && (
        <TextPreview text={media.text} />
      )}
      {!loading && canRender && media.kind === "json" && (
        <JsonPreview value={media.json} />
      )}
      {!loading && canRender && expiresAt && (
        <MediaExpiry expiresAt={expiresAt} />
      )}
    </div>
  );
}

function isWithinDetailPanel(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest<HTMLElement>("[data-detail-scroll]"));
}

function mediaSpecForAsset(
  media: MediaSpec,
  asset: RunDetail["assets"][number] | undefined
): MediaSpec {
  const url = safeMediaUrl(asset?.url);
  if (!asset || !url) return media;
  const type = asset.mediaType?.toLowerCase() ?? "";
  if (type === "image" || type.startsWith("image/")) {
    return { ...media, kind: "image", imageUrl: url };
  }
  if (type === "video" || type.startsWith("video/")) {
    return { ...media, kind: "video", videoUrl: url };
  }
  if (type === "audio" || type.startsWith("audio/")) {
    return { ...media, kind: "audio", audioUrl: url };
  }
  return media;
}

function HistoryEntryRail({
  rows,
  activeId,
  onSelect,
}: {
  rows: AccountActivityRow[];
  activeId: string;
  onSelect?: (row: AccountActivityRow) => void;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeId, rows.length]);

  if (!onSelect || rows.length <= 1) return null;

  return (
    <aside
      className="hidden h-full w-10 shrink-0 overflow-y-auto py-1 lg:block"
      aria-label="History entries"
    >
      <div className="flex min-h-full flex-col items-end gap-px">
        {rows.map((entry, index) => {
          const active = entry.id === activeId;
          return (
            <button
              key={entry.id}
              ref={active ? activeRef : undefined}
              type="button"
              onClick={() => onSelect(entry)}
              aria-label={`Open history entry ${index + 1}`}
              aria-current={active ? "true" : undefined}
              title={`${entry.model} ${entry.costDisplay}`}
              className="group grid h-3 w-9 shrink-0 place-items-center justify-items-end rounded-[3px] focus:outline-none"
            >
              <span
                className={`h-0.5 rounded-full transition-all ${
                  active
                    ? "w-7 bg-white"
                    : "w-5 bg-white/40 group-hover:w-6 group-hover:bg-white/70"
                }`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export default function CallDetailDrawer({
  row,
  rows = [],
  open,
  onClose,
  onSelectRow,
  detail,
  detailLoading = false,
  detailError,
  onRetryDetail,
  variant = "user",
}: {
  row: AccountActivityRow | null;
  rows?: AccountActivityRow[];
  open: boolean;
  onClose: () => void;
  onSelectRow?: (row: AccountActivityRow) => void;
  detail?: RunDetail | null;
  detailLoading?: boolean;
  detailError?: string | null;
  onRetryDetail?: () => void;
  variant?: "user" | "admin";
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const wheelDeltaRef = useRef(0);
  const lastWheelNavigationRef = useRef(0);
  const [selectedAsset, setSelectedAsset] = useState<{
    runId: string;
    id: string;
  } | null>(null);
  const activeDetail = detail?.id === row?.id ? detail : null;
  const asset =
    activeDetail?.assets.find(
      (item) =>
        selectedAsset &&
        selectedAsset.runId === row?.id &&
        item.id === selectedAsset.id
    ) ?? activeDetail?.assets[0];
  let media = row
    ? mediaSpecForRow({
        ...row,
        status: asset ? "unknown" : row.status,
        outputUrl: safeMediaUrl(asset?.url ?? row.outputUrl),
      })
    : null;
  if (media) media = mediaSpecForAsset(media, asset);
  if (row && activeDetail && !asset) {
    media = {
      kind: "json",
      title: `${row.model} result`,
      label: "Result",
      format: "JSON",
      metricLabel: "Output",
      metricValue: activeDetail.result ? "Recorded" : "Not available",
      source: row.signerLabel,
      json:
        activeDetail.result?.value ??
        (activeDetail.errorCode
          ? {
              error: activeDetail.errorCode,
              message: activeDetail.errorMessage,
            }
          : { status: activeDetail.status, result: null }),
    };
  }
  const assetReferences = new Map(
    activeDetail?.assets.map(
      (item) =>
        [
          item.url,
          { id: item.id, displayName: item.displayName ?? null },
        ] as const
    ) ?? []
  );
  const submittedPrompts = promptFields(activeDetail?.submittedArguments);
  const submittedInputs = activeDetail?.submittedArguments?.inputs;
  const submittedFields = dataFields(
    submittedInputs && typeof submittedInputs === "object"
      ? submittedInputs
      : activeDetail?.submittedArguments,
    assetReferences
  );
  const returnedFields = dataFields(
    activeDetail?.result?.value,
    assetReferences
  );
  const inferenceFields = returnedFields.filter(
    (field) => field.label === "Inference time"
  );
  const billingEvent = activeDetail
    ? [...activeDetail.events]
        .reverse()
        .find((event) => event.metadata.kind === "billing_usage")
    : undefined;
  const billedCost =
    typeof billingEvent?.metadata.networkFeeUsdMicros === "string"
      ? requestFeeDisplay({
          networkFeeUsdMicros: billingEvent.metadata.networkFeeUsdMicros,
          feeWei:
            typeof billingEvent.metadata.feeWei === "string"
              ? billingEvent.metadata.feeWei
              : undefined,
          ethUsdPrice:
            typeof billingEvent.metadata.ethUsdPrice === "string"
              ? billingEvent.metadata.ethUsdPrice
              : undefined,
        })
      : null;
  const costDisplay = billedCost?.display ?? row?.costDisplay;
  const costExact = billedCost?.exact ?? row?.costExact;

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      previousActiveRef.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() =>
        panelRef.current?.focus({ preventScroll: true })
      );
    } else if (previousActiveRef.current) {
      previousActiveRef.current.focus?.({ preventScroll: true });
      previousActiveRef.current = null;
    }
  }, [open]);

  const selectAdjacentRow = useCallback(
    (offset: number) => {
      if (!row || !onSelectRow || rows.length <= 1) return;
      const currentIndex = rows.findIndex((entry) => entry.id === row.id);
      if (currentIndex === -1) return;

      const nextIndex = Math.max(
        0,
        Math.min(rows.length - 1, currentIndex + offset)
      );
      if (nextIndex === currentIndex) return;

      const nextRow = rows[nextIndex];
      if (nextRow) onSelectRow(nextRow);
    },
    [onSelectRow, row, rows]
  );

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (
      !onSelectRow ||
      rows.length <= 1 ||
      window.matchMedia("(max-width: 1023px)").matches ||
      isWithinDetailPanel(event.target)
    ) {
      return;
    }

    event.preventDefault();
    wheelDeltaRef.current += event.deltaY;
    if (Math.abs(wheelDeltaRef.current) < 28) return;

    const now = performance.now();
    if (now - lastWheelNavigationRef.current < 90) return;

    lastWheelNavigationRef.current = now;
    selectAdjacentRow(wheelDeltaRef.current > 0 ? 1 : -1);
    wheelDeltaRef.current = 0;
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black p-3 pt-14 transition-opacity duration-200 sm:p-6 sm:pt-16 ${
        open ? "visible opacity-100" : "invisible opacity-0"
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close detail"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-transparent"
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute left-1/2 top-3 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 text-sm font-medium text-white transition-colors hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:top-4"
      >
        <span aria-hidden="true">&larr;</span>
        Return to dashboard
      </button>

      {row && media && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${row.model} detail`}
          tabIndex={-1}
          onWheel={handleWheel}
          className={`relative z-10 flex max-h-[calc(100dvh-68px)] w-[min(1240px,calc(100vw-32px))] items-stretch gap-3 overflow-y-auto outline-none transition-[opacity,transform] duration-200 ease-out sm:max-h-[calc(100dvh-96px)] lg:h-[calc(100dvh-96px)] lg:max-h-[760px] lg:overflow-visible ${
            open ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
          }`}
        >
          <div className="grid h-auto min-w-0 flex-1 grid-rows-[auto_auto] overflow-hidden rounded-sm bg-background shadow-2xl shadow-black/55 lg:h-full lg:grid-cols-[minmax(0,1fr)_350px] lg:grid-rows-none">
            <MediaStage
              key={`${row.id}-${asset?.id ?? "none"}`}
              media={media}
              expiresAt={asset?.expiresAt ?? asset?.availableUntil}
              unavailable={Boolean(asset?.unavailableAt)}
              allowDataPreview={variant === "admin"}
              loading={detailLoading}
            />

            <aside className="flex min-h-0 flex-col border-t border-hairline bg-background lg:border-l lg:border-t-0">
              <dl
                className="min-h-0 overflow-y-auto px-5 py-5"
                data-detail-scroll
              >
                {variant === "user" && (
                  <UserHistoryDetails
                    row={row}
                    cost={costDisplay}
                    prompts={submittedPrompts}
                    parameters={submittedFields}
                    inference={inferenceFields}
                    loading={detailLoading}
                    error={detailError}
                    onRetry={onRetryDetail}
                    errorCode={activeDetail?.errorCode}
                    errorMessage={activeDetail?.errorMessage}
                    inputSchema={activeDetail?.inputSchema}
                  />
                )}
                {variant === "admin" && (
                  <>
                    <DetailRow label="Capability">
                      <CapabilityChip>{row.model}</CapabilityChip>
                    </DetailRow>
                    <DetailRow label="Modality">
                      <CapabilityChip>{row.modality}</CapabilityChip>
                    </DetailRow>
                    {variant === "admin" && (
                      <DetailRow label="Job">
                        <span className="font-mono text-[13px] tabular-nums">
                          {row.gatewayRequestId ?? row.id}
                        </span>
                      </DetailRow>
                    )}
                    {variant === "admin" && row.providerRequestId ? (
                      <DetailRow label="Request">
                        <span className="font-mono text-[13px] tabular-nums">
                          {row.providerRequestId}
                        </span>
                      </DetailRow>
                    ) : null}
                    {variant === "admin" && (
                      <>
                        <DetailRow label="Format">{media.format}</DetailRow>
                        <DetailRow label={media.metricLabel}>
                          {media.metricValue}
                        </DetailRow>
                        <DetailRow label="Source">{media.source}</DetailRow>
                        <DetailRow label="Status">
                          {STATUS_LABEL[row.status]}
                        </DetailRow>
                        <DetailRow
                          label={row.kind === "live" ? "Duration" : "Latency"}
                        >
                          {formatCallMetric(row)}
                        </DetailRow>
                      </>
                    )}
                    <DetailRow label="Cost">
                      {costExact && costExact !== costDisplay ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help font-mono tabular-nums">
                              {costDisplay}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <span className="font-mono tabular-nums">
                              {costExact}
                            </span>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        costDisplay
                      )}
                    </DetailRow>
                    {variant === "admin" && (
                      <DetailRow label="Time">
                        {formatTimestamp(row.timestamp)}
                      </DetailRow>
                    )}
                    {row.recordKind === "usage" && (
                      <p className="mt-4 text-xs text-fg-muted">
                        Usage-only record. Execution outcome and submitted
                        arguments were not captured.
                      </p>
                    )}
                    {detailLoading && (
                      <p role="status" className="mt-4 text-xs text-fg-muted">
                        Loading run details…
                      </p>
                    )}
                    {detailError && (
                      <p role="alert" className="mt-4 text-xs text-fg-muted">
                        {detailError}{" "}
                        <button
                          type="button"
                          onClick={onRetryDetail}
                          className="underline"
                        >
                          Retry
                        </button>
                      </p>
                    )}
                    {activeDetail && (
                      <>
                        {variant === "admin" && (
                          <DetailRow label="Run">
                            <span className="break-all font-mono text-xs">
                              {activeDetail.id}
                            </span>
                          </DetailRow>
                        )}
                        {variant === "admin" &&
                          activeDetail.assets.length > 0 && (
                            <div className="mt-4 space-y-2">
                              <p className="text-xs font-medium text-fg-muted">
                                Assets
                              </p>
                              {activeDetail.assets.map((item, index) => (
                                <div
                                  key={item.id}
                                  className="rounded-md border border-hairline bg-foreground/[0.02] p-3 text-xs"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <button
                                      type="button"
                                      aria-pressed={asset?.id === item.id}
                                      onClick={() =>
                                        setSelectedAsset({
                                          runId: activeDetail.id,
                                          id: item.id,
                                        })
                                      }
                                      className="min-w-0 truncate font-mono text-fg underline-offset-2 hover:underline"
                                    >
                                      {item.id}
                                    </button>
                                    <span className="shrink-0 text-fg-muted">
                                      Output {index + 1}
                                    </span>
                                  </div>
                                  {safeMediaUrl(item.url) && (
                                    <a
                                      href={safeMediaUrl(item.url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="mt-2 block truncate font-mono text-[11px] text-fg-muted underline"
                                    >
                                      {item.url}
                                    </a>
                                  )}
                                  {item.hiddenAt && (
                                    <span className="text-fg-muted">
                                      Hidden from library
                                    </span>
                                  )}
                                </div>
                              ))}
                              {asset?.expiresAt && (
                                <p className="text-xs text-fg-muted">
                                  Provider expiry:{" "}
                                  {formatTimestamp(asset.expiresAt)}
                                </p>
                              )}
                              {asset?.unavailableAt && (
                                <p className="text-xs text-fg-muted">
                                  Media unavailable; reference retained.
                                </p>
                              )}
                            </div>
                          )}
                        <FieldSection
                          title="Submitted prompts"
                          fields={submittedPrompts}
                        />
                        <FieldSection
                          title="Request parameters"
                          fields={submittedFields}
                        />
                        <FieldSection
                          title={variant === "admin" ? "Response" : "Inference"}
                          fields={
                            variant === "admin"
                              ? returnedFields
                              : inferenceFields
                          }
                        />
                        {variant === "admin" &&
                          activeDetail.events.some(
                            (event) => event.metadata.kind === "billing_usage"
                          ) && (
                            <details className="mt-5 text-xs" open>
                              <summary className="cursor-pointer font-medium">
                                Observed usage
                              </summary>
                              <p className="mt-2 text-fg-muted">
                                Billing receipts matched by gateway ID, not
                                additional executions. These may not represent
                                the final total.
                              </p>
                              <ul className="mt-2 space-y-2">
                                {activeDetail.events
                                  .filter(
                                    (event) =>
                                      event.metadata.kind === "billing_usage"
                                  )
                                  .map((event) => (
                                    <li key={event.id} className="break-all">
                                      {typeof event.metadata
                                        .networkFeeUsdMicros === "string"
                                        ? requestFeeDisplay({
                                            networkFeeUsdMicros:
                                              event.metadata
                                                .networkFeeUsdMicros,
                                            feeWei:
                                              typeof event.metadata.feeWei ===
                                              "string"
                                                ? event.metadata.feeWei
                                                : undefined,
                                            ethUsdPrice:
                                              typeof event.metadata
                                                .ethUsdPrice === "string"
                                                ? event.metadata.ethUsdPrice
                                                : undefined,
                                          }).exact
                                        : "Amount unavailable"}{" "}
                                      · {formatTimestamp(event.createdAt)}
                                    </li>
                                  ))}
                              </ul>
                            </details>
                          )}
                        {activeDetail.captureRedactedPaths.length > 0 && (
                          <p className="mt-2 break-words text-xs text-fg-muted">
                            Redacted or omitted:{" "}
                            {activeDetail.captureRedactedPaths.join(", ")}
                          </p>
                        )}
                        {activeDetail.errorCode && (
                          <p className="mt-4 break-words text-xs text-fg-muted">
                            {activeDetail.errorCode}
                            {activeDetail.errorMessage
                              ? `: ${activeDetail.errorMessage}`
                              : ""}
                          </p>
                        )}
                        <details className="mt-5 text-xs">
                          <summary className="cursor-pointer font-medium">
                            Run timeline
                          </summary>
                          <ol className="mt-2 space-y-2">
                            {activeDetail.events.map((event) => (
                              <li key={event.id}>
                                {event.metadata.kind === "billing_usage"
                                  ? "Usage receipt recorded"
                                  : event.status}{" "}
                                · {formatTimestamp(event.createdAt)}
                              </li>
                            ))}
                          </ol>
                        </details>
                      </>
                    )}
                  </>
                )}
              </dl>
            </aside>
          </div>
          <HistoryEntryRail
            rows={rows}
            activeId={row.id}
            onSelect={onSelectRow}
          />
        </div>
      )}
    </div>,
    document.body
  );
}
