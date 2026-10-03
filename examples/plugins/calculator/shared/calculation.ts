export interface CalculationInput {
  /**
   * Количество пользователей, от 1 до 100 000.
   * @title Пользователи
   * @integer
   * @minimum 1
   * @maximum 100000
   */
  users: number;
  /**
   * Цена в рублях, до двух знаков после запятой.
   * @title Цена за пользователя в месяц, ₽
   * @minimum 0
   * @maximum 1000000
   * @multipleOf 0.01
   */
  monthlyPrice: number;
  /**
   * Длительность подписки в месяцах; один год = 12.
   * @title Срок, месяцев
   * @integer
   * @minimum 1
   * @maximum 120
   */
  months: number;
  /**
   * Процент скидки от 0 до 100, до двух знаков после запятой.
   * @title Скидка, %
   * @minimum 0
   * @maximum 100
   * @multipleOf 0.01
   */
  discount: number;
}

export interface CalculationOutput {
  /**
   * Стоимость до скидки, в копейках.
   * @integer
   * @minimum 0
   */
  subtotalKopecks: number;
  /**
   * Скидка, в копейках. Округляется до ближайшей копейки, половина вверх.
   * @integer
   * @minimum 0
   */
  discountKopecks: number;
  /**
   * Итог к оплате, в копейках.
   * @integer
   * @minimum 0
   */
  totalKopecks: number;
  currency: "RUB";
}
