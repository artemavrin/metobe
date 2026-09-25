import {
  getSource,
  listChatModels,
  listSources,
} from "@metobe/core/sources-read";
import { redirect } from "next/navigation";

import { getSettingsViewer } from "@/lib/settings-access";

import { Onboarding } from "./onboarding";

// First run (M2 6d, prototype P7 «Колода»): source → key → models → «Metobe готов». Picking and the key live in
// the page; a connected source and the finish are in the address, so a reload lands on the same step.

const OnboardingPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; done?: string }>;
}) => {
  const { admin } = await getSettingsViewer();
  if (!admin) {
    redirect("/");
  }
  const params = await searchParams;

  if (params.done !== undefined) {
    const chat = await listChatModels();
    if (chat.length === 0) {
      redirect("/onboarding");
    }
    return (
      <Onboarding step={{ id: "done", names: chat.map((m) => m.title) }} />
    );
  }

  if (params.source) {
    const detail = await getSource(params.source).catch(() => null);
    if (!detail) {
      redirect("/onboarding");
    }
    return (
      <Onboarding
        step={{
          id: "models",
          models: detail.models,
          source: {
            baseUrl: detail.source.baseUrl,
            id: detail.source.id,
            kind: detail.source.kind,
            logo: detail.source.logo,
            title: detail.source.title,
          },
        }}
      />
    );
  }

  const sources = await listSources();
  return (
    <Onboarding step={{ connected: sources.map((s) => s.kind), id: "pick" }} />
  );
};

export default OnboardingPage;
