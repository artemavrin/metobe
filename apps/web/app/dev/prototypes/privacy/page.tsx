"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { Params, ProtoProvider } from "../memory/frame";
import { InputAbove, InputFlip } from "./s-input";
import { SettingsScene } from "./s-settings";
import { ThreadBeside, ThreadFlip } from "./s-thread";

// P31 · «Защита данных» (PII-GUARD-PLAN, З5–З7): Metobe маскирует личные данные перед каждым вызовом внешней модели
// и показывает, что модель получила на самом деле. Вторая редакция: не одна панель на ответ, а свой значок — щит
// с числом скрытого — у каждого сообщения, шага и у поля ввода; он показывает только свою часть обмена. Сцены:
//   1–2 «Лента» — сообщение человека (что ушло в модель), шаг (что модель отправила в тул и получила), ответ (что
//       модель написала): текст меняется на месте / версия модели раскрывается рядом;
//   3–4 «Ввод» — подчёркивание скрываемого при вводе и текст поля глазами модели на месте / версия над текстом;
//   5 «Настройки» — раздел администратора и песочница.
// В адресе: `?scene=thread|composer|settings&var=1|2&sc=desktop|phone&theme=dark|light`, или `?v=1..5`;
// ручки: `mark=hover|always`, `st=done|stream`, `src=cloud|local`, `att=no|yes`, `model=cloud|local`, `svc=ok|down`,
// `open=1`. Первая редакция (панель под ответом и сбоку, окно над полем, вкладка у шага) — в `s-answer.tsx`,
// `s-composer.tsx`, `s-tool.tsx`, в пикере её нет.

const SCENES: Record<string, number> = { composer: 3, settings: 5, thread: 1 };

/** Короткие адреса → ключи пикера и рамки; тема — классом на `<html>` и обратно при уходе. */
const Boot = ({ children }: { children: React.ReactNode }) => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams;
    const scene = q.get("scene");
    if (scene && SCENES[scene]) {
      const second = q.get("var") === "2" && scene !== "settings";
      q.set("v", String((SCENES[scene] as number) + (second ? 1 : 0)));
    }
    if (q.get("sc") === "phone") q.set("sz", "phone");
    window.history.replaceState(null, "", url);
    const theme = q.get("theme");
    const root = document.documentElement;
    const was = root.classList.contains("dark");
    if (theme === "dark" || theme === "light") {
      root.classList.toggle("dark", theme === "dark");
      root.style.colorScheme = theme;
    }
    setReady(true);
    return () => {
      if (theme) {
        root.classList.toggle("dark", was);
        root.style.colorScheme = "";
      }
    };
  }, []);
  return ready ? children : null;
};

const PrivacyPage = () => (
  <Boot>
    <ProtoProvider defaults={{ att: "no", mark: "hover", model: "cloud", open: "0", src: "cloud", st: "done", svc: "ok" }}>
      <style>{"@media (max-width: 760px) { .proto-picker { max-width: calc(100vw - 16px); overflow-x: auto; scrollbar-width: none; } }"}</style>
      <Picker
        params={
          <Params
            rows={[
              ["mark", "значок в ленте", [["hover", "при наведении"], ["always", "всегда"]]],
              ["open", "взгляд модели", [["0", "выключен"], ["1", "включён"]]],
              ["st", "ответ", [["done", "готов"], ["stream", "поток"]]],
              ["src", "модель ответа", [["cloud", "внешняя"], ["local", "локальная"]]],
              ["model", "модель в поле", [["cloud", "внешняя"], ["local", "локальная"]]],
              ["att", "вложение", [["no", "нет"], ["yes", "есть"]]],
              ["svc", "служба", [["ok", "отвечает"], ["down", "недоступна"]]],
            ]}
          />
        }
        variants={[
          { Component: ThreadFlip, name: "Лента · на месте", pickerTop: true },
          { Component: ThreadBeside, name: "Лента · рядом", pickerTop: true },
          { Component: InputFlip, name: "Ввод · на месте", pickerTop: true },
          { Component: InputAbove, name: "Ввод · над текстом", pickerTop: true },
          { Component: SettingsScene, name: "Настройки" },
        ]}
      />
    </ProtoProvider>
  </Boot>
);

export default PrivacyPage;
