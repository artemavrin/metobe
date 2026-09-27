"use client";

import { credentialModes, mcpAuthKinds } from "@metobe/contracts/catalog";
import type { CredentialMode, McpAuthKind } from "@metobe/contracts/catalog";
import { Button } from "@metobe/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { Spinner } from "@metobe/ui/components/spinner";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { SettingsHeader } from "@/components/settings/settings-shell";

import { create } from "./actions";

// A new MCP server is its name, address and way to sign in; its page opens next — credentials, check, tools.
export const NewServerForm = () => {
  const t = useTranslations("connections");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState<McpAuthKind>("none");
  const [mode, setMode] = useState<CredentialMode>("shared");
  const [invalid, setInvalid] = useState(false);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setInvalid(false);
      const result = await create({ auth, credentialMode: mode, title, url });
      if (result.ok) {
        router.push(`/settings/mcp/${result.id}`);
      } else {
        setInvalid(true);
      }
    });
  return (
    <>
      <SettingsHeader description={t("meta")} title={t("new.title")} />
      <form
        className="flex max-w-xl flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!pending) {
            submit();
          }
        }}
      >
        <Field>
          <FieldLabel htmlFor="mcp-name">{t("new.name")}</FieldLabel>
          <Input
            autoComplete="off"
            autoFocus
            id="mcp-name"
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("new.namePlaceholder")}
            readOnly={pending}
            value={title}
          />
        </Field>
        <Field data-invalid={invalid}>
          <FieldLabel htmlFor="mcp-url">{t("new.url")}</FieldLabel>
          <Input
            aria-invalid={invalid}
            autoComplete="off"
            className="font-mono"
            data-1p-ignore
            data-lpignore="true"
            id="mcp-url"
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/mcp"
            readOnly={pending}
            spellCheck={false}
            value={url}
          />
          {invalid ? (
            <FieldError>{t("new.invalid")}</FieldError>
          ) : (
            <FieldDescription>{t("new.urlHint")}</FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel>{t("new.auth")}</FieldLabel>
          <Select onValueChange={(v) => setAuth(v as McpAuthKind)} value={auth}>
            <SelectTrigger className="w-full md:w-72">
              <SelectValue>{t(`auth.${auth}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {mcpAuthKinds.map((x) => (
                <SelectItem key={x} value={x}>
                  {t(`auth.${x}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {auth !== "none" && (
          <Field>
            <FieldLabel>{t("detail.mode")}</FieldLabel>
            <Select
              onValueChange={(v) => setMode(v as CredentialMode)}
              value={mode}
            >
              <SelectTrigger className="w-full md:w-72">
                <SelectValue>{t(`detail.modes.${mode}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {credentialModes.map((x) => (
                  <SelectItem key={x} value={x}>
                    {t(`detail.modes.${x}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{t(`detail.modeHints.${mode}`)}</FieldDescription>
          </Field>
        )}
        <Button
          aria-disabled={pending}
          className="w-fit"
          disabled={!title.trim() || !url.trim()}
          type="submit"
        >
          {pending && <Spinner />}
          {t("new.create")}
        </Button>
      </form>
    </>
  );
};
