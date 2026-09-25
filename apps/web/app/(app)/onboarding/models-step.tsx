"use client";

import { Button } from "@metobe/ui/components/button";
import { Checkbox } from "@metobe/ui/components/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@metobe/ui/components/input-group";
import { Badge } from "@metobe/ui/components/reui/badge";
import {
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@metobe/ui/components/reui/frame";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@metobe/ui/components/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { Brain, Eye, LoaderCircle, Search, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { contextLabel, isNew, priceLabel } from "@/lib/model-format";
import { sourceLogo } from "@/lib/source-logo";

import { chooseModels } from "./actions";
import type { OnboardingStep } from "./onboarding";

// The models step (ARCH §7.1): nothing is ticked in advance — sources don't say what to recommend, and we don't
// guess. Newest first; a long list gets search, a maker filter and capability filters, and scrolls inside the card.

type Step = Extract<OnboardingStep, { id: "models" }>;
type Model = Step["models"][number];

const CAP_FILTERS = [
  { icon: Wrench, key: "tools" },
  { icon: Eye, key: "vision" },
  { icon: Brain, key: "reasoning" },
] as const;
type CapKey = (typeof CAP_FILTERS)[number]["key"];

/** Past this many models the list gets search and filters. */
const MANY = 8;

const enter = (i: number) => ({
  className:
    "animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:slide-in-from-bottom-0",
  style: { animationDelay: `${Math.min(i, 8) * 35}ms` },
});

const ModelRow = ({
  model,
  checked,
  index,
  showMaker,
  onChange,
}: {
  model: Model;
  checked: boolean;
  index: number;
  showMaker: boolean;
  onChange: (on: boolean) => void;
}) => {
  const t = useTranslations("sources.detail.models");
  const id = `ob-${model.id}`;
  const e = enter(index);
  return (
    <li className={e.className} style={e.style}>
      <label
        className="hover:bg-muted/40 flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors duration-150"
        htmlFor={id}
      >
        <Checkbox checked={checked} id={id} onCheckedChange={onChange} />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate font-medium">{model.title}</span>
          {isNew(model.releasedAt) && (
            <Badge size="sm" variant="info-light">
              {t("new")}
            </Badge>
          )}
          {showMaker && (
            <span className="text-muted-foreground truncate text-xs">
              {model.provider.title}
            </span>
          )}
        </span>
        <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:inline">
          {contextLabel(model.contextWindow)}
        </span>
        <span className="text-muted-foreground w-28 shrink-0 text-right text-xs tabular-nums">
          {priceLabel(model)}
        </span>
      </label>
    </li>
  );
};

export const ModelsStep = ({ source, models }: Omit<Step, "id">) => {
  const t = useTranslations("onboarding.models");
  const tc = useTranslations("sources.detail.models.caps");
  const router = useRouter();
  // What is already on stays on after a reload; on the first visit that is nothing.
  const [chosen, setChosen] = useState(
    () => new Set(models.filter((m) => m.enabled).map((m) => m.id))
  );
  const [q, setQ] = useState("");
  const [maker, setMaker] = useState("all");
  const [caps, setCaps] = useState<CapKey[]>([]);
  const [pending, start] = useTransition();

  const makers = useMemo(
    () =>
      [...new Map(models.map((m) => [m.provider.id, m.provider])).values()]
        // oxlint-disable-next-line no-array-sort -- a fresh array
        .sort((a, b) => a.title.localeCompare(b.title)),
    [models]
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return models.filter(
      (m) =>
        (maker === "all" || m.provider.id === maker) &&
        caps.every((k) => m.capabilities[k] === true) &&
        `${m.title} ${m.modelId} ${m.provider.title}`
          .toLowerCase()
          .includes(needle)
    );
  }, [models, maker, caps, q]);

  const toggle = (id: string, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });

  const submit = () =>
    start(async () => {
      await chooseModels(source.id, [...chosen]);
      router.push("/onboarding?done");
    });

  if (models.length === 0) {
    return (
      <FrameHeader className="gap-1 pt-4!">
        <FrameTitle className="text-xl">
          {t("empty", { title: source.title })}
        </FrameTitle>
        <FrameDescription>{t("emptyText")}</FrameDescription>
      </FrameHeader>
    );
  }

  const many = models.length > MANY;
  const makerTitle = makers.find((m) => m.id === maker)?.title;

  return (
    <>
      <FrameHeader className="gap-1 pt-4!">
        <FrameTitle className="text-xl">
          {t("title", { count: models.length })}
        </FrameTitle>
        <FrameDescription>{t("text")}</FrameDescription>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <BrandLogo
              label={source.title}
              logo={sourceLogo(source)}
              size={20}
            />
            <span className="truncate">{source.title}</span>
          </span>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {t("selected", { count: chosen.size })}
          </span>
        </div>

        {many && (
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="min-w-40 flex-1">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                aria-label={t("search")}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("search")}
                value={q}
              />
            </InputGroup>
            {makers.length > 1 && (
              <Select onValueChange={(v) => setMaker(String(v))} value={maker}>
                <SelectTrigger className="w-44">
                  <SelectValue>
                    {maker === "all" ? t("allMakers") : makerTitle}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allMakers")}</SelectItem>
                  {makers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <ToggleGroup
              multiple
              onValueChange={(v) => setCaps(v as CapKey[])}
              spacing={0}
              value={caps}
              variant="outline"
            >
              {CAP_FILTERS.map(({ key, icon: Icon }) => (
                <Tooltip key={key}>
                  <TooltipTrigger
                    render={
                      <ToggleGroupItem aria-label={tc(key)} value={key} />
                    }
                  >
                    <Icon />
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("only", { cap: tc(key).toLowerCase() })}
                  </TooltipContent>
                </Tooltip>
              ))}
            </ToggleGroup>
          </div>
        )}

        {/* Capped height: a source with hundreds of models scrolls inside the card, the card stays put */}
        <div className="max-h-80 overflow-y-auto overscroll-contain rounded-xl border">
          {shown.length === 0 ? (
            <p className="text-muted-foreground px-4 py-10 text-center text-sm">
              {t("nothing")}
            </p>
          ) : (
            <ul className="divide-y">
              {shown.map((m, i) => (
                <ModelRow
                  checked={chosen.has(m.id)}
                  index={i}
                  key={m.id}
                  model={m}
                  onChange={(on) => toggle(m.id, on)}
                  showMaker={makers.length > 1}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-1">
          <Button
            disabled={shown.length === 0}
            onClick={() =>
              setChosen(new Set([...chosen, ...shown.map((m) => m.id)]))
            }
            size="xs"
            variant="ghost"
          >
            {t("selectShown", { count: shown.length })}
          </Button>
          {chosen.size > 0 && (
            <Button
              onClick={() => setChosen(new Set())}
              size="xs"
              variant="ghost"
            >
              {t("clear")}
            </Button>
          )}
        </div>

        <Button
          aria-disabled={pending}
          className="mt-1 h-10"
          disabled={chosen.size === 0}
          onClick={() => !pending && submit()}
        >
          {pending && <LoaderCircle className="animate-spin" />}
          {pending && t("enabling")}
          {!pending &&
            (chosen.size === 0
              ? t("none")
              : t("enable", { count: chosen.size }))}
        </Button>
      </FramePanel>
    </>
  );
};
