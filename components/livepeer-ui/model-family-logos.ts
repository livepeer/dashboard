import type { capabilities } from "@/components/livepeer-ui/frozen-content";

type Capability = (typeof capabilities)[number];

export const modelFamilyLogos = {
  anthropic: {
    name: "Anthropic",
    src: "/model-family-logos-2026-08-08-182324/anthropic.svg",
  },
  "black-forest-labs": {
    name: "Black Forest Labs",
    src: "/model-family-logos-2026-08-08-182324/black-forest-labs.svg",
  },
  blender: {
    name: "Blender",
    src: "/model-family-logos-2026-08-08-182324/blender.svg",
  },
  bytedance: {
    name: "ByteDance",
    src: "/model-family-logos-2026-08-08-182324/bytedance.svg",
  },
  claude: {
    name: "Claude",
    src: "/model-family-logos-2026-08-08-182324/claude.svg",
  },
  "claude-code": {
    name: "Claude Code",
    src: "/model-family-logos-2026-08-08-182324/claude-code.svg",
  },
  ffmpeg: {
    name: "FFmpeg",
    src: "/model-family-logos-2026-08-08-182324/ffmpeg.svg",
  },
  flux: { name: "FLUX", src: "/model-family-logos-2026-08-08-182324/flux.svg" },
  gemini: {
    name: "Gemini",
    src: "/model-family-logos-2026-08-08-182324/gemini.svg",
  },
  grok: { name: "Grok", src: "/model-family-logos-2026-08-08-182324/grok.svg" },
  ideogram: {
    name: "Ideogram",
    src: "/model-family-logos-2026-08-08-182324/ideogram.svg",
  },
  kling: {
    name: "Kling AI",
    src: "/model-family-logos-2026-08-08-182324/kling.svg",
  },
  krea: { name: "Krea", src: "/model-family-logos-2026-08-08-182324/krea.svg" },
  lightricks: {
    name: "Lightricks",
    src: "/model-family-logos-2026-08-08-182324/lightricks.svg",
  },
  meta: { name: "Meta", src: "/model-family-logos-2026-08-08-182324/meta.svg" },
  microsoft: {
    name: "Microsoft",
    src: "/model-family-logos-2026-08-08-182324/microsoft.svg",
  },
  minimax: {
    name: "MiniMax",
    src: "/model-family-logos-2026-08-08-182324/minimax.svg",
  },
  "nous-research": {
    name: "Nous Research",
    src: "/model-family-logos-2026-08-08-182324/nous-research.svg",
  },
  nvidia: {
    name: "NVIDIA",
    src: "/model-family-logos-2026-08-08-182324/nvidia.svg",
  },
  openai: {
    name: "OpenAI",
    src: "/model-family-logos-2026-08-08-182324/openai.svg",
  },
  pixverse: {
    name: "PixVerse",
    src: "/model-family-logos-2026-08-08-182324/pixverse.svg",
  },
  qwen: { name: "Qwen", src: "/model-family-logos-2026-08-08-182324/qwen.svg" },
  recraft: {
    name: "Recraft",
    src: "/model-family-logos-2026-08-08-182324/recraft.svg",
  },
  sensenova: {
    name: "SenseNova",
    src: "/model-family-logos-2026-08-08-182324/sensenova.svg",
  },
  tripo: {
    name: "Tripo",
    src: "/model-family-logos-2026-08-08-182324/tripo.svg",
  },
  ultralytics: {
    name: "Ultralytics",
    src: "/model-family-logos-2026-08-08-182324/ultralytics.svg",
  },
  veed: { name: "VEED", src: "/model-family-logos-2026-08-08-182324/veed.svg" },
} as const;

export type ModelFamilyLogoId = keyof typeof modelFamilyLogos;

export const capabilityLogoIds = {
  "blender-headless": "blender",
  "cosmos-3-image": "nvidia",
  "ffmpeg-audio-mix": "ffmpeg",
  "ffmpeg-burn-subtitles": "ffmpeg",
  "ffmpeg-colorgrade": "ffmpeg",
  "ffmpeg-concat": "ffmpeg",
  "ffmpeg-export": "ffmpeg",
  "ffmpeg-grid": "ffmpeg",
  "ffmpeg-loop": "ffmpeg",
  "ffmpeg-mux": "ffmpeg",
  "ffmpeg-overlay": "ffmpeg",
  "flux-3-draft-enhance": "flux",
  "flux-3-draft-extend": "flux",
  "flux-3-draft-i2v": "flux",
  "flux-3-draft-t2v": "flux",
  "flux-3-extend": "flux",
  "flux-3-i2v": "flux",
  "flux-3-keyframes": "flux",
  "flux-3-t2v": "flux",
  "flux-dev": "flux",
  "flux-erase": "flux",
  "gemini-text": "gemini",
  "gemini-tts": "gemini",
  "gpt-image": "openai",
  "gpt-image-edit": "openai",
  "grok-imagine-video": "grok",
  "grok-imagine-video-ref2v": "grok",
  "grok-imagine-video-t2v": "grok",
  "ideogram-v4": "ideogram",
  "kling-o3-i2v": "kling",
  "kling-o3-ref2v": "kling",
  "kling-v3-turbo-i2v": "kling",
  "kling-v3-turbo-pro-t2v": "kling",
  "kling-v3-turbo-t2v": "kling",
  "kontext-edit": "black-forest-labs",
  "krea-2-large": "krea",
  "krea-2-lora": "krea",
  "krea-2-lora-training": "krea",
  "krea-2-os": "krea",
  "ltx-i2v": "lightricks",
  "ltx-q-i2v": "lightricks",
  "ltx-q-ref2v": "lightricks",
  "ltx-q-t2v": "lightricks",
  "mai-image-2.5": "microsoft",
  "minimax-h3-i2v": "minimax",
  "minimax-h3-ref2v": "minimax",
  "minimax-h3-t2v": "minimax",
  "nano-banana": "gemini",
  "nemotron-asr": "nvidia",
  "pixverse-i2v": "pixverse",
  "pixverse-t2v": "pixverse",
  "pixverse-transition": "pixverse",
  "qwen-image-3-edit": "qwen",
  "qwen-image-3-t2i": "qwen",
  "recraft-v4": "recraft",
  sam3: "meta",
  "seed-audio": "bytedance",
  "seedance-i2v": "bytedance",
  "seedance-mini-i2v": "bytedance",
  "seedance-mini-t2v": "bytedance",
  "seedream-5-lite": "bytedance",
  "sensenova-u1-infographic": "sensenova",
  "tripo-i3d": "tripo",
  "veed-lipsync-v2": "veed",
  "veo-transition": "gemini",
  "whisper-word": "openai",
  "yolo-segment": "ultralytics",
} satisfies Partial<Record<Capability, ModelFamilyLogoId>>;

export function getCapabilityLogo(capability: Capability) {
  const logoId =
    capabilityLogoIds[capability as keyof typeof capabilityLogoIds];
  return logoId ? modelFamilyLogos[logoId] : null;
}

export function getCapabilityFamilyLogos(capabilities: readonly string[]) {
  const logoIds = new Set<ModelFamilyLogoId>();

  for (const capability of capabilities) {
    const logoId =
      capabilityLogoIds[capability as keyof typeof capabilityLogoIds];
    if (logoId) logoIds.add(logoId);
  }

  return Array.from(logoIds, (logoId) => ({
    id: logoId,
    ...modelFamilyLogos[logoId],
  }));
}
