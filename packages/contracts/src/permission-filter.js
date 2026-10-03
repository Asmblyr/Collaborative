export const permissionContextParameters = Object.freeze([
  {
    path: "user.id",
    label: "Текущий пользователь",
    description: "ID пользователя. Недоступен для сервисов.",
    type: "uuid",
  },
  {
    path: "user.email",
    label: "Почта пользователя",
    description: "Email текущего пользователя. Недоступен для сервисов.",
    type: "email",
  },
  {
    path: "service.id",
    label: "Текущий сервис",
    description: "ID сервиса. Недоступен для пользователей.",
    type: "uuid",
  },
  {
    path: "actor.id",
    label: "Участник запроса",
    description: "ID пользователя или сервиса, выполняющего запрос.",
    type: "uuid",
  },
  {
    path: "request.now",
    label: "Время запроса",
    description: "Время на сервере в начале запроса (UTC).",
    type: "datetime",
  },
]);
