"use client";

import { Bubble, BubbleContent } from "@metobe/ui/components/bubble";
import { Button } from "@metobe/ui/components/button";
import { Message, MessageContent } from "@metobe/ui/components/message";
import {
  Questionnaire,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@metobe/ui/components/questionnaire";
import { cn } from "@metobe/ui/lib/utils";

import { answersOf } from "./data";
import type { Ask } from "./state";

// The questions as a form — shadcn's Questionnaire: one question at a time with «1 из 2» when there are several,
// number keys for the choices, a written answer where the model welcomes one, and «Решите сами» to let the model go
// on with its best guess. Variants differ in where this sits.

export const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
export const ENTER = `animate-in fade-in slide-in-from-bottom-1 motion-reduce:slide-in-from-bottom-0 fill-mode-both duration-200 ${EASE}`;

export const AskForm = ({ a, className }: { a: Ask; className?: string }) => {
  const { scenario } = a;
  const several = scenario.questions.length > 1;
  return (
    <Questionnaire
      className={className}
      items={scenario.questions.map((q) => ({ choices: q.choices, name: q.name, required: !q.optional }))}
      onSubmit={(e) => {
        e.preventDefault();
        a.answer(answersOf(scenario, new FormData(e.currentTarget)));
      }}
      shortcuts="numbers"
    >
      {several && (
        <QuestionnaireProgress
          render={(props, state) => (
            <div {...props}>
              {state.current} из {state.total}
            </div>
          )}
        />
      )}
      {scenario.questions.map((q) => (
        <QuestionnaireItem key={q.name} multiple={q.multiple} name={q.name} required={!q.optional}>
          <QuestionnaireTitle className="text-base font-medium">
            {q.prompt}
            {q.multiple && <span className="text-muted-foreground font-normal"> · можно несколько</span>}
          </QuestionnaireTitle>
          <QuestionnaireChoices>
            {q.choices.map((c) => (
              <QuestionnaireChoice key={c.value} value={c.value}>
                <span>{c.label}</span>
                {c.description && <QuestionnaireChoiceDescription>{c.description}</QuestionnaireChoiceDescription>}
              </QuestionnaireChoice>
            ))}
            {q.other && <QuestionnaireInput aria-label={q.other} placeholder={q.other} />}
          </QuestionnaireChoices>
        </QuestionnaireItem>
      ))}
      <div className="flex items-center gap-2">
        <QuestionnairePrevious size="sm" variant="ghost">
          Назад
        </QuestionnairePrevious>
        <Button className="text-muted-foreground" onClick={a.skip} size="sm" type="button" variant="ghost">
          Решите сами
        </Button>
        <span className="flex-1" />
        <QuestionnaireSkip size="sm" variant="ghost">
          Пропустить
        </QuestionnaireSkip>
        <QuestionnaireNext size="sm">Далее</QuestionnaireNext>
        <QuestionnaireSubmit size="sm">Ответить</QuestionnaireSubmit>
      </div>
    </Questionnaire>
  );
};

/** The card once answered: each question and what was said, folded to lines. */
export const Folded = ({ a, className }: { a: Ask; className?: string }) => (
  <dl className={cn("text-muted-foreground flex max-w-xl flex-col gap-1 text-sm", className)}>
    {a.phase === "skipped" ? (
      <div className="flex gap-2">
        <dt>Решение за моделью</dt>
      </div>
    ) : (
      a.scenario.questions.map((q) => (
        <div className="flex min-w-0 gap-2" key={q.name}>
          <dt className="shrink-0">{q.prompt}</dt>
          <dd className="text-foreground truncate">{(a.answers[q.name] ?? []).join(", ") || "—"}</dd>
        </div>
      ))
    )}
  </dl>
);

/**
 * What the user said, as their own message in the thread — the bubble of `UserMessage`, on the right. Each answer
 * under its question in small grey, so the reply reads on its own; an optional question left alone is not shown.
 */
export const AnswerMessage = ({ a }: { a: Ask }) => {
  const said = a.scenario.questions.filter((q) => (a.answers[q.name] ?? []).length > 0);
  return (
    <Message align="end" className={ENTER}>
      <MessageContent className="gap-1">
        <Bubble align="end" variant="muted">
          <BubbleContent className="flex flex-col gap-2 rounded-2xl rounded-br-md px-4 py-2.5">
            {a.phase === "skipped" ? (
              <span>Решите сами</span>
            ) : (
              said.map((q) => (
                <span className="flex flex-col" key={q.name}>
                  <span className="text-muted-foreground text-xs">{q.prompt}</span>
                  <span>{(a.answers[q.name] ?? []).join(", ")}</span>
                </span>
              ))
            )}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
};
