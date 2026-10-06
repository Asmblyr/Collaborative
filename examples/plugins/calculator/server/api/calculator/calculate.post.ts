import {
  AccessGate,
  defineModelAnnotation,
  defineModelContext,
  defineHandler,
} from "@asmblyr-collaborative/kit";
import { readBody } from "h3";
import type {
  CalculationInput,
  CalculationOutput,
} from "../../../shared/calculation.ts";

const annotate = defineModelAnnotation({
  title: "Расчёт стоимости",
  description:
    "Рассчитать стоимость подписки: пользователи × цена за пользователя в месяц × число месяцев, затем скидка. Цена в рублях, скидка в процентах. Только расчёт: не оформляет заказ и не списывает деньги. Все параметры указывает пользователь; не выдумывай цену и скидку.",
  middleware: AccessGate.authenticated,
  page: "home",
  readOnly: true,
});

export default defineModelContext<CalculationInput>(
  defineHandler(async (event): Promise<CalculationOutput> => {
    const input = await readBody<CalculationInput>(event);

    if (!input) {
      throw new Error("Validated model input is missing");
    }

    const { users, monthlyPrice, months, discount } = input;

    const priceKopecks = BigInt(Math.round(monthlyPrice * 100));
    const subtotal = BigInt(users) * BigInt(months) * priceKopecks;

    const discountBasisPoints = BigInt(Math.round(discount * 100));
    const deduction = (subtotal * discountBasisPoints + 5_000n) / 10_000n;

    return {
      subtotalKopecks: Number(subtotal),
      discountKopecks: Number(deduction),
      totalKopecks: Number(subtotal - deduction),
      currency: "RUB",
    };
  }),
  annotate,
);
