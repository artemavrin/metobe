"use client";

// Logos of model providers (who made the model) and sources (who gives access), from @lobehub/icons-static-svg (MIT).
// Mono icons are drawn as a CSS mask in the text colour, so they follow the theme; colour icons are plain images.
import alibaba from "@lobehub/icons-static-svg/icons/qwen-color.svg";
import anthropicMono from "@lobehub/icons-static-svg/icons/anthropic.svg";
import arcee from "@lobehub/icons-static-svg/icons/arcee-color.svg";
import bytedance from "@lobehub/icons-static-svg/icons/bytedance-color.svg";
import claude from "@lobehub/icons-static-svg/icons/claude-color.svg";
import cohere from "@lobehub/icons-static-svg/icons/cohere-color.svg";
import deepseek from "@lobehub/icons-static-svg/icons/deepseek-color.svg";
import gemini from "@lobehub/icons-static-svg/icons/gemini-color.svg";
import grok from "@lobehub/icons-static-svg/icons/grok.svg";
import inception from "@lobehub/icons-static-svg/icons/inception.svg";
import kimi from "@lobehub/icons-static-svg/icons/kimi-color.svg";
import longcat from "@lobehub/icons-static-svg/icons/longcat-color.svg";
import meta from "@lobehub/icons-static-svg/icons/meta-color.svg";
import minimax from "@lobehub/icons-static-svg/icons/minimax-color.svg";
import mistral from "@lobehub/icons-static-svg/icons/mistral-color.svg";
import nova from "@lobehub/icons-static-svg/icons/nova-color.svg";
import ollama from "@lobehub/icons-static-svg/icons/ollama.svg";
import openai from "@lobehub/icons-static-svg/icons/openai.svg";
import perplexity from "@lobehub/icons-static-svg/icons/perplexity-color.svg";
import vercel from "@lobehub/icons-static-svg/icons/vercel.svg";
import yandex from "@lobehub/icons-static-svg/icons/yandex.svg";
import zhipu from "@lobehub/icons-static-svg/icons/zhipu-color.svg";
import { cn } from "@purr/ui/lib/utils";

import type { ProviderKind } from "./mock";

type Asset = { src: string } | string;
type Logo = { src: string; mono: boolean };
const L = (a: Asset, mono = false): Logo => ({ mono, src: typeof a === "string" ? a : a.src });

/** Built-in logo set: what the admin can pick from for a provider. */
export const LOGOS: Record<string, Logo & { label: string }> = {
  alibaba: { ...L(alibaba), label: "Qwen" },
  anthropic: { ...L(claude), label: "Claude" },
  "anthropic-mono": { ...L(anthropicMono, true), label: "Anthropic" },
  arcee: { ...L(arcee), label: "Arcee" },
  bytedance: { ...L(bytedance), label: "ByteDance" },
  cohere: { ...L(cohere), label: "Cohere" },
  deepseek: { ...L(deepseek), label: "DeepSeek" },
  google: { ...L(gemini), label: "Gemini" },
  inception: { ...L(inception, true), label: "Inception" },
  meituan: { ...L(longcat), label: "LongCat" },
  meta: { ...L(meta), label: "Meta" },
  minimax: { ...L(minimax), label: "MiniMax" },
  mistral: { ...L(mistral), label: "Mistral" },
  moonshot: { ...L(kimi), label: "Kimi" },
  nova: { ...L(nova), label: "Amazon Nova" },
  ollama: { ...L(ollama, true), label: "Ollama" },
  openai: { ...L(openai, true), label: "OpenAI" },
  perplexity: { ...L(perplexity), label: "Perplexity" },
  vercel: { ...L(vercel, true), label: "Vercel" },
  xai: { ...L(grok, true), label: "Grok" },
  yandex: { ...L(yandex, true), label: "Яндекс" },
  zai: { ...L(zhipu), label: "GLM" },
};

/** Model vendor name (as discovery reports it) → provider slug. */
const VENDOR_SLUG: Record<string, string> = {
  Alibaba: "alibaba",
  Amazon: "nova",
  Anthropic: "anthropic",
  Arcee: "arcee",
  ByteDance: "bytedance",
  Cohere: "cohere",
  DeepSeek: "deepseek",
  Google: "google",
  Inception: "inception",
  Meituan: "meituan",
  Meta: "meta",
  MiniMax: "minimax",
  Mistral: "mistral",
  Moonshot: "moonshot",
  OpenAI: "openai",
  Perplexity: "perplexity",
  "Z.ai": "zai",
  xAI: "xai",
  Яндекс: "yandex",
};
export const providerSlug = (vendor: string) => VENDOR_SLUG[vendor] ?? vendor.toLowerCase().replace(/\W+/g, "-");

export const SOURCE_LOGO: Record<ProviderKind, string> = {
  anthropic: "anthropic-mono",
  compatible: "ollama",
  gateway: "vercel",
  openai: "openai",
  yandex: "yandex",
};

/**
 * A logo on a neutral tile. `logo` is a slug from LOGOS or a custom image (data URL / uploaded file URL);
 * unknown slugs fall back to the first letter.
 */
export const BrandLogo = ({
  logo,
  label,
  size = 28,
  tile = true,
  className,
}: {
  logo: string | undefined;
  label: string;
  size?: number;
  tile?: boolean;
  className?: string;
}) => {
  const known = logo ? LOGOS[logo] : undefined;
  const custom = logo && !known && (logo.startsWith("data:") || logo.startsWith("http") || logo.startsWith("/"));
  const glyph = Math.round(size * 0.62);
  const inner = known ? (
    known.mono ? (
      <span
        aria-hidden
        className="bg-foreground block"
        style={{ height: glyph, mask: `url(${known.src}) center / contain no-repeat`, WebkitMask: `url(${known.src}) center / contain no-repeat`, width: glyph }}
      />
    ) : (
      <img alt="" height={glyph} src={known.src} width={glyph} />
    )
  ) : custom ? (
    <img alt="" className="size-full rounded-[inherit] object-cover" src={logo} />
  ) : (
    <span className="text-muted-foreground font-semibold" style={{ fontSize: size * 0.42 }}>
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
  return (
    <span
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        tile && "bg-background rounded-[28%] shadow-[0_0_0_1px_rgba(0,0,0,0.07),0_1px_2px_-1px_rgba(0,0,0,0.08)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]",
        className
      )}
      role="img"
      style={{ height: size, width: size }}
    >
      {inner}
    </span>
  );
};
