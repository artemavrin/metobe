"use client";

import { proxyTypes } from "@metobe/contracts/proxies";
import type { ProxyType } from "@metobe/contracts/proxies";
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

// A new proxy is its address: saved and checked in one step, then its page opens with the result.
export const NewProxyForm = () => {
  const t = useTranslations("proxies");
  const router = useRouter();
  const [type, setType] = useState<ProxyType>("http");
  const [address, setAddress] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setInvalid(false);
      const result = await create(address, type);
      if (result.ok) {
        router.push(`/settings/proxies/${result.id}`);
      } else {
        setInvalid(true);
      }
    });
  return (
    <>
      <SettingsHeader description={t("new.text")} title={t("new.title")} />
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
          <FieldLabel>{t("detail.type")}</FieldLabel>
          <Select onValueChange={(v) => setType(v as ProxyType)} value={type}>
            <SelectTrigger className="w-full md:w-72">
              <SelectValue>{t(`types.${type}.label`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {proxyTypes.map((x) => (
                <SelectItem key={x} value={x}>
                  <span className="flex flex-col">
                    {t(`types.${x}.label`)}
                    <span className="text-muted-foreground text-xs">
                      {t(`types.${x}.hint`)}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field data-invalid={invalid}>
          <FieldLabel htmlFor="proxy-address">{t("detail.address")}</FieldLabel>
          <Input
            aria-invalid={invalid}
            autoComplete="off"
            autoFocus
            className="font-mono"
            data-1p-ignore
            data-lpignore="true"
            id="proxy-address"
            onChange={(e) => setAddress(e.target.value)}
            placeholder="proxy.corp.local:3128"
            readOnly={pending}
            spellCheck={false}
            value={address}
          />
          {invalid ? (
            <FieldError>{t("detail.addressInvalid")}</FieldError>
          ) : (
            <FieldDescription>{t("detail.addressHint")}</FieldDescription>
          )}
        </Field>
        <Button
          aria-disabled={pending}
          className="w-fit"
          disabled={!address.trim()}
          type="submit"
        >
          {pending && <Spinner />}
          {pending ? t("new.checking") : t("new.create")}
        </Button>
      </form>
    </>
  );
};
