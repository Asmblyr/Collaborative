<a id="public-surfaces-and-access-controls"></a>

# Что открыто и чем защищено

«Публичный endpoint» означает отсутствие Core Bearer, но не отсутствие проверки учётных данных в его протоколе.

| Поверхность                                 | Допуск                            | Дополнительная граница                                          |
| ------------------------------------------- | --------------------------------- | --------------------------------------------------------------- |
| health/ready, setup status, provider labels | Анонимный                         | Без паролей/ключей/данных коллекций                             |
| setup/login/invite/refresh                  | Без Bearer                        | Setup secret/пароль/одноразовый токен, rate limit               |
| SSO start/callback                          | Протокол провайдера               | Flow, state, PKCE; связывание из собственной сессии             |
| service/federation exchange                 | Ключ/JWT assertion                | Подпись, claims, срок, replay protection                        |
| OAuth discovery/JWKS                        | Публичный                         | Остальные OAuth endpoints имеют protocol checks                 |
| Collections/items/search/history            | Активный user/service             | Grants действия/полей; проекция истории и связей                |
| DDL, folders, формы/метаданные схемы        | superuser                         | Reserved prefixes, ownership, impact checks                     |
| Профиль, sessions, consent                  | Человек                           | Только собственный ресурс                                       |
| Участники страницы/карточки                 | Человек + доступ просмотра        | Свежий read строки/раздела; leave только своей сессии           |
| Просмотр настроек                           | Человек + section read/update     | Свежие политики из БД; без выдачи секретов                      |
| Изменение настроек                          | Человек + section update          | Политики и сервисы имеют отдельные ограничения ниже             |
| Состав политик и permissions                | Человек-superuser                 | Менеджер может просматривать готовые права                      |
| Назначения политик пользователям            | Человек + policies/update         | Явный личный набор; без своих назначений и superuser            |
| Настройка разрешённого набора               | Человек-superuser                 | Отдельная настройка пользователя, не permission                 |
| Сервисы, их ключи и федерации               | Человек + services/update         | Все текущие и новые политики входят в личный набор              |
| Повторные приглашения                       | Человек + users/update            | Политики в наборе; без собственных/делегирующих аккаунтов       |
| File read/resolve                           | Активный principal                | Readable reference, files/read/update у человека либо superuser |
| File management                             | Человек + files/update; superuser | Размер, тип выдачи/preview, metadata validation                 |
| Workspaces                                  | Человек                           | Видимые коллекции; изменения superuser                          |
| Presets/views                               | Человек + collection access       | Владение; shared изменения superuser                            |
| Assistant                                   | Человек + data eligibility        | Caller permissions, MCP enable, tool validation                 |
| Plugin HTTP                                 | Активный principal и handler gate | Capabilities Kit + caller/domain authorization                  |

Superuser не ограничен набором. Сервисные токены не управляют настройками. Отзыв набора запрещает будущие операции, но автоматически не отзывает уже выданные ключи и назначения. Подробности — [права и политики](../features/access.md#ограниченное-назначение-политик).

Полный перечень деклараций — [матрица маршрутов](../reference/routes.md).

<a id="what-does-not-provide-isolation"></a>

## Что не обеспечивает изоляцию

Workspace, скрытие меню/коллекции, default-фильтр опубликованных, metadata readonly в UI, описание инструмента для модели. Доступ обеспечивают проверки сервера. Knex и обычные SQL-запросы не получают права человека автоматически.

Доверенные server plugins и администратор БД могут выйти за прикладные проверки. В проекте нет песочницы для произвольного кода плагина и нет общей PostgreSQL RLS-модели.
