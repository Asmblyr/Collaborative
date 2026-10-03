"use client";

import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { useAction } from "@asmblyr/kit/ui/use-action";
import type { PluginPageProps } from "@asmblyr/kit/ui";
import type {
  CalculationInput,
  CalculationOutput,
} from "../../shared/calculation.ts";
import calculation from "../../.asmblyr/models/calculator/calculate.post.json" with { type: "json" };
import { modelField } from "@asmblyr/kit/model";

const initialInput: CalculationInput = {
  users: 1,
  monthlyPrice: 990,
  months: 12,
  discount: 0,
};
const fields = Object.keys(
  calculation.inputSchema.properties,
) as (keyof CalculationInput)[];
const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
});

export function CalculatorPage(props: PluginPageProps) {
  const form = useAction<CalculationInput, CalculationOutput>(
    calculation,
    props,
    {
      path: "/calculate",
      initialInput,
    },
  );
  return (
    <section className="mx-auto w-full max-w-5xl space-y-6 py-4">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Планирование затрат
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Калькулятор стоимости
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Оцените стоимость подписки для команды. Измените параметры или
          попросите ассистента подготовить расчёт.
        </p>
      </header>
      {props.preparedAction && (
        <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm">
          Параметры подготовлены ассистентом. Их можно изменить и пересчитать.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <form
          className="space-y-5 rounded-2xl border bg-card p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void form.run();
          }}
        >
          <h2 className="font-medium">Параметры подписки</h2>
          <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
            {fields.map((key) => {
              const meta = modelField(calculation.inputSchema, key);
              return (
                <div
                  key={key}
                  className="row-span-3 mb-3 grid grid-rows-subgrid gap-2"
                >
                  <label
                    htmlFor={`calculator-${key}`}
                    className="text-sm font-medium"
                  >
                    {meta?.title}
                  </label>
                  <Input
                    id={`calculator-${key}`}
                    aria-describedby={`calculator-${key}-hint`}
                    type="number"
                    step={key === "users" || key === "months" ? 1 : 0.01}
                    disabled={form.busy}
                    value={form.input[key] ?? ""}
                    required
                    onChange={(event) =>
                      form.setField(
                        key,
                        event.target.value === ""
                          ? undefined
                          : Number(event.target.value),
                      )
                    }
                  />
                  <p
                    id={`calculator-${key}-hint`}
                    className="text-xs leading-5 text-muted-foreground"
                  >
                    {meta?.description}
                  </p>
                </div>
              );
            })}
          </div>
          {form.error && (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {form.error}
            </p>
          )}
          <div className="flex gap-2 border-t pt-5">
            <Button
              type="submit"
              disabled={form.busy}
            >
              {form.busy ? "Рассчитываем…" : "Рассчитать"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={form.busy || !form.dirty}
              onClick={form.reset}
            >
              Отменить изменения
            </Button>
          </div>
        </form>
        <aside
          className="flex flex-col rounded-2xl border bg-muted/30 p-6"
          aria-label="Результат расчёта"
          aria-live="polite"
        >
          <h2 className="font-medium">Итоговая стоимость</h2>
          {form.output ? (
            <>
              <p className="my-6 text-3xl font-semibold tracking-tight tabular-nums">
                {money.format(form.output.totalKopecks / 100)}
              </p>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Без скидки</dt>
                  <dd className="tabular-nums">
                    {money.format(form.output.subtotalKopecks / 100)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Экономия</dt>
                  <dd className="tabular-nums">
                    {money.format(form.output.discountKopecks / 100)}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="my-8 text-sm leading-6 text-muted-foreground">
              Укажите параметры и нажмите «Рассчитать». Здесь появятся итоговая
              сумма и размер скидки.
            </p>
          )}
          <p className="mt-auto pt-8 text-xs leading-5 text-muted-foreground">
            Предварительная оценка. Расчёт не оформляет подписку и не списывает
            деньги.
          </p>
        </aside>
      </div>
    </section>
  );
}
