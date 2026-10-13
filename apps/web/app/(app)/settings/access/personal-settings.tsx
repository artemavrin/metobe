"use client";

import { personalApprovals, personalModes } from "@metobe/contracts/access";
import type { PersonalApproval, PersonalMode } from "@metobe/contracts/access";
import { mailTools, policyOf } from "@metobe/contracts/email";
import type { MailDefaults, MailTool } from "@metobe/contracts/email";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";

import { changePersonalApproval, changePersonalMode } from "./actions";

// What people may connect by themselves (ARCH §17.1): off, internet addresses only, or any — and «ask first?» by
// default for their own mail, which each person may change in their box. Saved at once, as every select of settings.

export const PersonalSettings = ({
  approvals,
  mode,
}: {
  approvals: MailDefaults;
  mode: PersonalMode;
}) => {
  const t = useTranslations("access.personal");
  const tp = useTranslations("mail.policy");
  const [, start] = useTransition();
  const [shownMode, setShownMode] = useOptimistic(mode);
  const [shown, setShown] = useOptimistic(
    approvals,
    (current, change: { tool: MailTool; value: PersonalApproval }) => ({
      ...current,
      [change.tool]: change.value,
    })
  );
  return (
    <>
      <Section title={t("title")}>
        <Rows>
          <Row hint={t(`modes.${shownMode}.hint`)} label={t("mode")}>
            <Select
              onValueChange={(v) =>
                start(async () => {
                  setShownMode(v as PersonalMode);
                  await changePersonalMode(String(v));
                })
              }
              value={shownMode}
            >
              <SelectTrigger aria-label={t("mode")} className="w-full md:w-52">
                <SelectValue>{t(`modes.${shownMode}.label`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {personalModes.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`modes.${m}.label`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </Rows>
      </Section>
      {shownMode !== "off" && (
        <Section title={t("approvals.title")}>
          <p className="text-muted-foreground -mt-1 text-sm">
            {t("approvals.description")}
          </p>
          <Rows>
            {mailTools.map((tool) => {
              const value = policyOf({}, tool, shown);
              return (
                <Row
                  hint={tp(`tools.${tool}.hint`)}
                  key={tool}
                  label={tp(`tools.${tool}.label`)}
                >
                  <Select
                    onValueChange={(v) =>
                      start(async () => {
                        setShown({ tool, value: v as PersonalApproval });
                        await changePersonalApproval(tool, String(v));
                      })
                    }
                    value={value}
                  >
                    <SelectTrigger
                      aria-label={tp(`tools.${tool}.label`)}
                      className="w-full md:w-44"
                    >
                      <SelectValue>{tp(`values.${value}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {personalApprovals.map((a) => (
                        <SelectItem key={a} value={a}>
                          {tp(`values.${a}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>
              );
            })}
          </Rows>
        </Section>
      )}
    </>
  );
};
