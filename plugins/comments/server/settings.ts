import { defineSettings } from "@asmblyr/kit";

export default defineSettings({
  title: "Комментарии",
  description: "Обсуждения записей доступны пользователям с правом их чтения.",
  fields: {
    allowNewComments: {
      type: "boolean",
      label: "Разрешить новые комментарии",
      description:
        "Отключение сохраняет обсуждения и возможность редактировать свои комментарии.",
      default: true,
    },
    maxLength: {
      type: "number",
      label: "Максимальная длина комментария",
      description:
        "Применяется к новым комментариям и при сохранении изменений.",
      default: 10000,
      min: 100,
      max: 10000,
      integer: true,
    },
  },
});
