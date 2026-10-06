# Матрица HTTP-маршрутов

Сгенерировано из Core и проверенного каталога доступа. 206 деклараций.

Это описание границ; их исполнение проверяют интеграционные тесты. Динамические маршруты плагинов и внутренние endpoints oidc-provider не перечисляются отдельно.

| Метод и путь | Доступ | Источник в репозитории |
| --- | --- | --- |
| `GET /assistant/conversations` | Активный человек с доступом к чату; только собственные сессии | `apps/core/src/assistant/history-routes.ts` |
| `POST /assistant/conversations` | Активный человек с доступом к чату; создаёт собственную сессию с пустым контекстом | `apps/core/src/assistant/history-routes.ts` |
| `DELETE /assistant/conversations/:id` | Активный человек с доступом к чату; только собственная неактивная сессия | `apps/core/src/assistant/history-routes.ts` |
| `GET /assistant/conversations/:id` | Активный человек с доступом к чату; только собственная история, включая superuser | `apps/core/src/assistant/history-routes.ts` |
| `POST /assistant/filter/validate` | Человек: superuser ИЛИ хотя бы один grant read/create/update; инструменты проверяют права отдельно | `apps/core/src/assistant/routes.ts` |
| `POST /assistant/messages` | Человек: superuser ИЛИ хотя бы один grant read/create/update; инструменты проверяют права отдельно | `apps/core/src/assistant/routes.ts` |
| `POST /assistant/messages/:id/cancel` | Человек: superuser ИЛИ хотя бы один grant read/create/update; инструменты проверяют права отдельно | `apps/core/src/assistant/routes.ts` |
| `POST /assistant/selection/validate` | Человек: superuser ИЛИ хотя бы один grant read/create/update; инструменты проверяют права отдельно | `apps/core/src/assistant/routes.ts` |
| `GET /assistant/status` | Человек: superuser ИЛИ хотя бы один grant read/create/update; инструменты проверяют права отдельно | `apps/core/src/assistant/routes.ts` |
| `POST /auth/cli/authorize` | Active human session approves a 60-second one-use PKCE S256 code for an exact loopback callback. | `apps/core/src/auth/cli/routes.ts` |
| `GET /auth/cli/config` | Public CLI discovery; configured admin consent URL only. No credential. | `apps/core/src/auth/cli/routes.ts` |
| `POST /auth/cli/token` | One-use code + PKCE verifier + exact callback. Issues 10-minute schema:read access only; rate-limited. | `apps/core/src/auth/cli/routes.ts` |
| `POST /auth/federation-token` | Подписанный GitLab CI assertion и активная федерация | `apps/core/src/services/federation-routes.ts` |
| `POST /auth/invitations/accept` | Одноразовый invitation token и новый пароль | `apps/core/src/auth/routes.ts` |
| `POST /auth/invitations/claim` | Одноразовый invitation/recovery token; создаёт человеческую сессию. Recovery отзывает прежние сеансы и способы входа | `apps/core/src/auth/routes.ts` |
| `POST /auth/login` | Проверка email и пароля; ограничение частоты | `apps/core/src/auth/routes.ts` |
| `POST /auth/logout` | Refresh token в теле либо Bearer сессии | `apps/core/src/auth/routes.ts` |
| `GET /auth/me` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/auth/routes.ts` |
| `POST /auth/passkeys/login` | Одноразовый challenge, подпись сохранённого passkey, точный origin/RP ID и user verification; активный пользователь | `apps/core/src/auth/passkeys/routes.ts` |
| `POST /auth/passkeys/options` | Публичный WebAuthn challenge, пять минут; общий credential rate limit | `apps/core/src/auth/passkeys/routes.ts` |
| `GET /auth/providers` | Публичные ID и подписи провайдеров | `apps/core/src/auth/sso/routes.ts` |
| `POST /auth/refresh` | Действительный refresh token; ротация и защита от повторного использования | `apps/core/src/auth/routes.ts` |
| `POST /auth/service-token` | Действительный сервисный ключ | `apps/core/src/services/routes.ts` |
| `POST /auth/setup` | Setup secret и отсутствие созданных пользователей; ограничение частоты | `apps/core/src/auth/routes.ts` |
| `GET /auth/setup/status` | Публичный статус первой настройки | `apps/core/src/auth/routes.ts` |
| `POST /auth/sso/:provider/callback` | Проверка SSO flow, state/PKCE и ответа провайдера | `apps/core/src/auth/sso/routes.ts` |
| `POST /auth/sso/:provider/start` | Начало SSO; привязка требует действующей пользовательской сессии | `apps/core/src/auth/sso/routes.ts` |
| `GET /collections` | Активный principal; только доступные коллекции и поля | `apps/core/src/collections/routes.ts` |
| `POST /collections` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `DELETE /collections/:name` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/lifecycle-routes.ts` |
| `PUT /collections/:name/display` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `POST /collections/:name/fields` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `DELETE /collections/:name/fields/:field` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/lifecycle-routes.ts` |
| `PATCH /collections/:name/fields/:field` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `POST /collections/:name/fields/:field/configuration` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `PUT /collections/:name/fields/:field/configuration` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `GET /collections/:name/fields/:field/impact` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/lifecycle-routes.ts` |
| `PUT /collections/:name/fields/:field/presentation` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `PUT /collections/:name/fields/:field/search` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `PATCH /collections/:name/folder` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `PUT /collections/:name/form` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `GET /collections/:name/impact` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/lifecycle-routes.ts` |
| `DELETE /collections/:name/materialized-view` | Человек-superuser; отключает MV из каталога с проверкой зависимостей, удаляет метаданные/права; сохраняет PostgreSQL объект и данные | `apps/core/src/collections/materialized-routes.ts` |
| `PATCH /collections/:name/navigation` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `POST /collections/:name/relations` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `PUT /collections/:name/relations/:field/search` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `PATCH /collections/:name/settings` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `GET /collections/:name/terms` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/terms/routes.ts` |
| `PUT /collections/:name/terms` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/terms/routes.ts` |
| `DELETE /collections/:name/terms/:id` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/terms/routes.ts` |
| `PUT /collections/:name/terms/:id` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/terms/routes.ts` |
| `DELETE /connections/google` | Активная человеческая сессия; удаляет собственные токены, flows и предложения, пытается отозвать Google grant | `apps/core/src/connections/routes.ts` |
| `GET /connections/google` | Активная человеческая сессия; состояние только собственного подключения, без токенов | `apps/core/src/connections/routes.ts` |
| `POST /connections/google/callback` | Активная человеческая сессия; собственный flow, browser proof, state/nonce/PKCE и та же конфигурация клиента | `apps/core/src/connections/routes.ts` |
| `POST /connections/google/start` | Активная человеческая сессия; одноразовый OAuth flow владельца с browser proof и PKCE | `apps/core/src/connections/routes.ts` |
| `DELETE /connections/google/writes/:id` | Активная человеческая сессия; отмена собственного ожидающего предложения | `apps/core/src/connections/routes.ts` |
| `GET /connections/google/writes/:id` | Активная человеческая сессия; собственное неистекшее предложение и то же активное подключение | `apps/core/src/connections/routes.ts` |
| `POST /connections/google/writes/:id/confirm` | Активная человеческая сессия; однократное подтверждение собственного предложения, перепроверка подключения и исходных данных; не MCP-инструмент | `apps/core/src/connections/routes.ts` |
| `GET /extensions` | Активный principal; метаданные включённых UI-плагинов | `apps/core/src/plugins/ui-routes.ts` |
| `GET /extensions/:namespace/drafts/:id` | Активный principal; подготовленный черновик только своего principal и namespace, с TTL | `apps/core/src/plugins/action-draft-routes.ts` |
| `GET /files` | Человек + files/read либо update; superuser bypass. Общая библиотека команды | `apps/core/src/files/routes.ts` |
| `POST /files` | Человек + files/update; superuser bypass. Загрузка до 25 MiB, валидация метаданных, защита используемых ссылок | `apps/core/src/files/routes.ts` |
| `DELETE /files/:id` | Человек + files/update; superuser bypass. Загрузка до 25 MiB, валидация метаданных, защита используемых ссылок | `apps/core/src/files/routes.ts` |
| `GET /files/:id` | Активный principal: superuser, человек с files/read/update либо доступная ссылка в разрешённом поле записи; чужие файлы скрыты | `apps/core/src/files/routes.ts` |
| `PATCH /files/:id` | Человек + files/update; superuser bypass. Изменение title/description и visibility private/public одного ready-файла; публикация и отзыв ссылки записываются в историю. | `apps/core/src/files/routes.ts` |
| `GET /files/:id/content` | Активный principal: superuser, человек с files/read/update либо доступная ссылка в разрешённом поле записи; чужие файлы скрыты | `apps/core/src/files/routes.ts` |
| `GET /files/:id/events` | Человек + files/read либо update; superuser bypass. Общая библиотека команды | `apps/core/src/files/routes.ts` |
| `GET /files/resolve` | Активный principal: superuser, человек с files/read/update либо доступная ссылка в разрешённом поле записи; чужие файлы скрыты | `apps/core/src/files/routes.ts` |
| `GET /filter-presets/:collection` | Человек и доступ к коллекции; личный владелец, общие виды изменяет superuser | `apps/core/src/items/filter-preset-routes.ts` |
| `POST /filter-presets/:collection` | Человек и доступ к коллекции; личный владелец, общие виды изменяет superuser | `apps/core/src/items/filter-preset-routes.ts` |
| `DELETE /filter-presets/:collection/:id` | Человек и доступ к коллекции; личный владелец, общие виды изменяет superuser | `apps/core/src/items/filter-preset-routes.ts` |
| `PUT /filter-presets/:collection/:id` | Человек и доступ к коллекции; личный владелец, общие виды изменяет superuser | `apps/core/src/items/filter-preset-routes.ts` |
| `POST /folders` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `DELETE /folders/:id` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `PATCH /folders/:id` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `PATCH /folders/:id/order` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `GET /health` | Публичная проверка процесса | `apps/core/src/app.ts` |
| `GET /item-events/:collection` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/routes.ts` |
| `GET /items/:collection` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/routes.ts` |
| `PATCH /items/:collection` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/routes.ts` |
| `POST /items/:collection` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/routes.ts` |
| `DELETE /items/:collection/:id` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/routes.ts` |
| `GET /items/:collection/:id` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/routes.ts` |
| `PATCH /items/:collection/:id` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/routes.ts` |
| `GET /items/:collection/:id/related` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/routes.ts` |
| `GET /items/:collection/:id/relations/:field` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/relation-routes.ts` |
| `PATCH /items/:collection/:id/relations/:field` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/relation-routes.ts` |
| `POST /items/:collection/:id/relations/:field` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/relation-routes.ts` |
| `GET /items/:collection/:id/relations/:field/candidates` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/relation-routes.ts` |
| `GET /items/:collection/:id/relations/:field/links/:linkId` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/relation-link-routes.ts` |
| `PATCH /items/:collection/:id/relations/:field/links/:linkId` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/relation-link-routes.ts` |
| `POST /items/:collection/:id/relations/:field/links/to/:targetId` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/relation-link-routes.ts` |
| `POST /items/:collection/:id/relations/:field/records` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/relation-link-routes.ts` |
| `POST /items/:collection/commit` | Активный principal; личные read/create/update и поля всех затронутых записей. expectedValues требует чтения обновляемых полей; конфликт откатывает весь commit | `apps/core/src/items/relation-routes.ts` |
| `GET /materialized-views` | Человек-superuser; обнаружение существующих materialized views в public без регистрации/REFRESH; Core/plugin объекты исключены | `apps/core/src/collections/materialized-routes.ts` |
| `POST /materialized-views` | Человек-superuser; атомарное подключение заполненного public MV с поддерживаемыми полями и устойчивым уникальным ключом. Только метаданные отображения/расположения, без SQL/DDL/REFRESH; права другим пользователям не выдаются | `apps/core/src/collections/materialized-routes.ts` |
| `GET /monitoring/browser` | Активная человеческая сессия; только публичный браузерный DSN и разрешённые флаги, без серверного DSN. Сервисные токены не допускаются | `apps/core/src/monitoring/routes.ts` |
| `GET /notifications` | Активная человеческая сессия; собственные уведомления включённых плагинов, доступ к каждой записи проверяется заново | `apps/core/src/notifications/routes.ts` |
| `POST /notifications/:id/read` | Активная человеческая сессия; собственное уведомление и текущий доступ к записи | `apps/core/src/notifications/routes.ts` |
| `POST /notifications/read-all` | Активная человеческая сессия; только собственные уведомления до границы снимка списка | `apps/core/src/notifications/routes.ts` |
| `GET /oauth-apps` | Человек: oauth/read ИЛИ update; superuser bypass | `apps/core/src/oauth/routes.ts` |
| `POST /oauth-apps` | Человек: oauth/update; superuser bypass | `apps/core/src/oauth/routes.ts` |
| `PUT /oauth-apps/:id` | Человек: oauth/update; superuser bypass | `apps/core/src/oauth/routes.ts` |
| `POST /oauth-apps/:id/secret` | Человек: oauth/update; superuser bypass | `apps/core/src/oauth/routes.ts` |
| `GET /oauth-apps/status` | Человек: oauth/read ИЛИ update; superuser bypass | `apps/core/src/oauth/routes.ts` |
| `GET /oauth-interactions/:uid` | Человек; UID, собственная сессия, правила приложения и согласие | `apps/core/src/oauth/interactions.ts` |
| `POST /oauth-interactions/:uid` | Человек; UID, собственная сессия, правила приложения и согласие | `apps/core/src/oauth/interactions.ts` |
| `ALL /oauth/*` | Протокольные endpoints oidc-provider: discovery/JWKS публичны, остальные используют проверки OAuth/OIDC | `apps/core/src/oauth/routes.ts` |
| `GET /permissions` | Человек: policies/read ИЛИ update; superuser bypass | `apps/core/src/permissions/routes.ts` |
| `POST /permissions` | Только человек-superuser: изменение состава политик и permissions | `apps/core/src/permissions/routes.ts` |
| `DELETE /permissions/:id` | Только человек-superuser: изменение состава политик и permissions | `apps/core/src/permissions/routes.ts` |
| `GET /permissions/:id` | Человек: policies/read ИЛИ update; superuser bypass | `apps/core/src/permissions/routes.ts` |
| `PATCH /permissions/:id` | Только человек-superuser: изменение состава политик и permissions | `apps/core/src/permissions/routes.ts` |
| `GET /permissions/me` | Активный principal; только собственные права | `apps/core/src/permissions/routes.ts` |
| `GET /policies` | Человек: policies/read ИЛИ update; superuser bypass | `apps/core/src/policies/routes.ts` |
| `POST /policies` | Только человек-superuser: изменение состава политик и permissions | `apps/core/src/policies/routes.ts` |
| `DELETE /policies/:id` | Только человек-superuser: изменение состава политик и permissions | `apps/core/src/policies/routes.ts` |
| `GET /policies/:id` | Человек: policies/read ИЛИ update; superuser bypass | `apps/core/src/policies/routes.ts` |
| `PATCH /policies/:id` | Только человек-superuser: изменение состава политик и permissions | `apps/core/src/policies/routes.ts` |
| `DELETE /policies/:id/permissions/:permissionId` | Только человек-superuser: изменение состава политик и permissions | `apps/core/src/policies/routes.ts` |
| `PUT /policies/:id/permissions/:permissionId` | Только человек-superuser: изменение состава политик и permissions | `apps/core/src/policies/routes.ts` |
| `PUT /policies/:id/users` | Человек: superuser ИЛИ policies/update + политика в разрешённом наборе; атомарная замена назначений без изменения себя и superuser | `apps/core/src/policies/routes.ts` |
| `DELETE /policies/:id/users/:userId` | Человек: superuser ИЛИ policies/update + политика в разрешённом наборе; менеджер не меняет себя и superuser | `apps/core/src/policies/routes.ts` |
| `PUT /policies/:id/users/:userId` | Человек: superuser ИЛИ policies/update + политика в разрешённом наборе; менеджер не меняет себя и superuser | `apps/core/src/policies/routes.ts` |
| `POST /presence` | Активная человеческая сессия; каждый heartbeat проверяет read коллекции/строки или доступ раздела. /files требует files/read либо update у человека, или superuser. Возвращает только ID, имя, аватар и число окон; без email/сессий/значений записи | `apps/core/src/presence/routes.ts` |
| `DELETE /presence/:clientId` | Активная человеческая сессия; удаляет только собственное окно этой сессии, без требования сохраняющегося read | `apps/core/src/presence/routes.ts` |
| `GET /public/files/:id/content` | Без авторизации: только явно опубликованный ready-файл (visibility=public). Приватный/удалённый файл — 404; no-store/CSP/nosniff. Без списка и метаданных. | `apps/core/src/files/public-routes.ts` |
| `GET /ready` | Публичная проверка готовности, без секретов | `apps/core/src/health/readiness.ts` |
| `GET /schema` | Активный пользователь или сервисный аккаунт: доступные коллекции, wire-типы и разрешения на поля. Без записей, defaults и условий политик; private/no-store; accepts scoped CLI schema:read access and includes permission-gated generated plugin model contracts | `apps/core/src/schema/routes.ts` |
| `GET /search` | Активный principal; действие и поля коллекции, связанные данные и история проверяются отдельно | `apps/core/src/items/routes.ts` |
| `GET /service-accounts` | Человек: services/read ИЛИ update; superuser bypass | `apps/core/src/services/routes.ts` |
| `POST /service-accounts` | Человек: superuser ИЛИ services/update; все текущие и запрошенные политики сервиса в разрешённом наборе, включая ключи и федерации | `apps/core/src/services/routes.ts` |
| `GET /service-accounts/:id` | Человек: services/read ИЛИ update; superuser bypass | `apps/core/src/services/routes.ts` |
| `PUT /service-accounts/:id` | Человек: superuser ИЛИ services/update; все текущие и запрошенные политики сервиса в разрешённом наборе, включая ключи и федерации | `apps/core/src/services/routes.ts` |
| `POST /service-accounts/:id/federations` | Человек: superuser ИЛИ services/update; все текущие и запрошенные политики сервиса в разрешённом наборе, включая ключи и федерации | `apps/core/src/services/federation-routes.ts` |
| `DELETE /service-accounts/:id/federations/:federationId` | Человек: superuser ИЛИ services/update; все текущие и запрошенные политики сервиса в разрешённом наборе, включая ключи и федерации | `apps/core/src/services/federation-routes.ts` |
| `POST /service-accounts/:id/keys` | Человек: superuser ИЛИ services/update; все текущие и запрошенные политики сервиса в разрешённом наборе, включая ключи и федерации | `apps/core/src/services/routes.ts` |
| `DELETE /service-accounts/:id/keys/:keyId` | Человек: superuser ИЛИ services/update; все текущие и запрошенные политики сервиса в разрешённом наборе, включая ключи и федерации | `apps/core/src/services/routes.ts` |
| `GET /settings/access` | Активный человек; разделы, режим изменения и разрешённый набор назначаемых политик из актуальной БД | `apps/core/src/settings/access-routes.ts` |
| `GET /settings/assistant` | Человек: assistant/read ИЛИ update; superuser bypass | `apps/core/src/settings/routes.ts` |
| `PUT /settings/assistant` | Человек: assistant/update; superuser bypass | `apps/core/src/settings/routes.ts` |
| `GET /settings/assistant/telemetry` | Человек: assistant/read ИЛИ update; superuser bypass | `apps/core/src/settings/routes.ts` |
| `GET /settings/integrations` | Только активная человеческая сессия superuser; безопасные параметры и наличие ключей, без значений секретов | `apps/core/src/integrations/routes.ts` |
| `PUT /settings/integrations/:section` | Только superuser; полный запрет изменения env-группы, revision, атомарное перешифрование при смене защиты | `apps/core/src/integrations/routes.ts` |
| `POST /settings/integrations/:section/test` | Только superuser; credential rate limit, проверка соединения без сохранения настроек | `apps/core/src/integrations/routes.ts` |
| `GET /settings/monitoring` | Только human superuser; локальные метрики текущего экземпляра Core, без DSN и пользовательских данных | `apps/core/src/monitoring/routes.ts` |
| `GET /settings/options/collections` | Человек: policies; только проекция схемы без записей; read ИЛИ update соответствующего раздела | `apps/core/src/settings/access-routes.ts` |
| `GET /settings/options/policies` | Человек: users ИЛИ policies ИЛИ services; только ID/названия; read ИЛИ update соответствующего раздела | `apps/core/src/settings/access-routes.ts` |
| `GET /settings/options/users` | Человек: oauth; только ID/email; read ИЛИ update соответствующего раздела | `apps/core/src/settings/access-routes.ts` |
| `GET /settings/plugins` | Человек: plugins/read ИЛИ update; superuser bypass | `apps/core/src/plugins/settings-routes.ts` |
| `GET /settings/plugins/:namespace` | Человек: plugins/read ИЛИ update; superuser bypass | `apps/core/src/plugins/settings-routes.ts` |
| `PUT /settings/plugins/:namespace` | Человек: plugins/update; superuser bypass | `apps/core/src/plugins/settings-routes.ts` |
| `GET /settings/terms` | Человек: terms/read ИЛИ update; superuser bypass | `apps/core/src/terms/routes.ts` |
| `POST /settings/terms` | Человек: terms/update; superuser bypass | `apps/core/src/terms/routes.ts` |
| `PUT /settings/terms/:id` | Человек: terms/update; superuser bypass | `apps/core/src/terms/routes.ts` |
| `GET /system-collections` | Активная человеческая сессия суперпользователя. Только разрешённые системные сущности и зарегистрированные пользовательские поля; встроенные колонки защищены | `apps/core/src/system-collections/routes.ts` |
| `DELETE /system-collections/:name/fields/:field` | Активная человеческая сессия суперпользователя. Только разрешённые системные сущности и зарегистрированные пользовательские поля; встроенные колонки защищены | `apps/core/src/system-collections/routes.ts` |
| `POST /system-collections/:name/fields/:field/configuration` | Активная человеческая сессия суперпользователя. Только разрешённые системные сущности и зарегистрированные пользовательские поля; встроенные колонки защищены | `apps/core/src/system-collections/routes.ts` |
| `PUT /system-collections/:name/fields/:field/configuration` | Активная человеческая сессия суперпользователя. Только разрешённые системные сущности и зарегистрированные пользовательские поля; встроенные колонки защищены | `apps/core/src/system-collections/routes.ts` |
| `GET /system-collections/:name/records` | Активная человеческая сессия суперпользователя. Только разрешённые системные сущности и зарегистрированные пользовательские поля; встроенные колонки защищены | `apps/core/src/system-collections/routes.ts` |
| `GET /system-collections/:name/records/:id` | Активная человеческая сессия суперпользователя. Только разрешённые системные сущности и зарегистрированные пользовательские поля; встроенные колонки защищены | `apps/core/src/system-collections/routes.ts` |
| `PATCH /system-collections/:name/records/:id` | Активная человеческая сессия суперпользователя. Только разрешённые системные сущности и зарегистрированные пользовательские поля; встроенные колонки защищены | `apps/core/src/system-collections/routes.ts` |
| `GET /table-views/:collection` | Человек и доступ к коллекции; личный владелец, общие виды изменяет superuser | `apps/core/src/preferences/table-view-routes.ts` |
| `POST /table-views/:collection` | Человек и доступ к коллекции; личный владелец, общие виды изменяет superuser | `apps/core/src/preferences/table-view-routes.ts` |
| `DELETE /table-views/:collection/:id` | Человек и доступ к коллекции; личный владелец, общие виды изменяет superuser | `apps/core/src/preferences/table-view-routes.ts` |
| `PUT /table-views/:collection/:id` | Человек и доступ к коллекции; личный владелец, общие виды изменяет superuser | `apps/core/src/preferences/table-view-routes.ts` |
| `GET /table-views/:collection/default` | Человек и доступ к коллекции; личный владелец, общие виды изменяет superuser | `apps/core/src/preferences/table-view-routes.ts` |
| `GET /translations` | Активный пользователь или сервисный аккаунт; схема ограничена доступными вызывающему коллекциями и полями, статические каталоги активных плагинов, без записей и defaults | `apps/core/src/translations/routes.ts` |
| `GET /users` | Человек: users/read или update ИЛИ policies/read или update; superuser bypass | `apps/core/src/auth/user-routes.ts` |
| `POST /users` | Человек: users/update; superuser bypass | `apps/core/src/auth/user-routes.ts` |
| `GET /users/:id/access` | Человек: users/read ИЛИ update; superuser bypass | `apps/core/src/auth/user-routes.ts` |
| `PUT /users/:id/delegation` | Только человек-superuser: явный набор готовых политик, которые пользователь вправе назначать | `apps/core/src/auth/user-routes.ts` |
| `GET /users/:id/extension` | Активный пользователь с users/read и обычными read-правами коллекции | `apps/core/src/auth/profile-extension-routes.ts` |
| `PATCH /users/:id/extension` | Активный пользователь с users/update и обычными read/create/update-правами коллекции | `apps/core/src/auth/profile-extension-routes.ts` |
| `POST /users/:id/invitation` | Человек: superuser ИЛИ users/update; повторное приглашение только в пределах разрешённого набора, без доступа к аккаунтам с собственным делегированием | `apps/core/src/auth/user-routes.ts` |
| `GET /users/:id/profile` | Активный пользователь с users/read; публичные сведения профиля без credentials | `apps/core/src/auth/profile-extension-routes.ts` |
| `PATCH /users/:id/profile` | Активный пользователь с users/update; только поля профиля, без изменения статуса и привилегий | `apps/core/src/auth/profile-extension-routes.ts` |
| `POST /users/:id/recovery` | Свежий человек-superuser; только другой активный обычный пользователь. Одноразовая ссылка на 30 минут, аудит; не делегируется | `apps/core/src/auth/user-routes.ts` |
| `GET /users/me` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/auth/profile-routes.ts` |
| `PATCH /users/me` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/auth/profile-routes.ts` |
| `POST /users/me/avatar` | Собственная человеческая сессия; приватное растровое изображение до 2 MiB, настроенное файловое хранилище и credential rate limit | `apps/core/src/auth/profile-avatar-routes.ts` |
| `GET /users/me/extension` | Собственная человеческая сессия и обычные read-права коллекции; скрытые поля и строки не раскрываются | `apps/core/src/auth/profile-extension-routes.ts` |
| `PATCH /users/me/extension` | Собственная человеческая сессия; read и create/update, обычные правила строк, полей, связей и файлов | `apps/core/src/auth/profile-extension-routes.ts` |
| `GET /users/me/identities` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/auth/sso/routes.ts` |
| `DELETE /users/me/identities/:id` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/auth/sso/routes.ts` |
| `GET /users/me/oauth-apps` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/oauth/consent-routes.ts` |
| `DELETE /users/me/oauth-apps/:id` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/oauth/consent-routes.ts` |
| `GET /users/me/passkeys` | Собственная активная человеческая сессия; только публичные сведения о ключах | `apps/core/src/auth/passkeys/routes.ts` |
| `POST /users/me/passkeys` | Собственный session-bound challenge, свежий вход и WebAuthn verification; до десяти ключей | `apps/core/src/auth/passkeys/routes.ts` |
| `DELETE /users/me/passkeys/:id` | Собственный ключ, свежий человеческий вход; нельзя удалить последний способ входа | `apps/core/src/auth/passkeys/routes.ts` |
| `POST /users/me/passkeys/options` | Собственная активная человеческая сессия не старше пяти минут | `apps/core/src/auth/passkeys/routes.ts` |
| `POST /users/me/password` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/auth/profile-routes.ts` |
| `POST /users/me/password/setup` | Собственная свежая человеческая сессия; только если пароля ещё нет | `apps/core/src/auth/profile-routes.ts` |
| `GET /users/me/preferences` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/preferences/routes.ts` |
| `PATCH /users/me/preferences` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/preferences/routes.ts` |
| `GET /users/me/sessions` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/auth/profile-routes.ts` |
| `DELETE /users/me/sessions/:id` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/auth/profile-routes.ts` |
| `GET /users/me/table-preferences/:collection` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/preferences/routes.ts` |
| `PATCH /users/me/table-preferences/:collection` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/preferences/routes.ts` |
| `PUT /users/me/workspace` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/workspaces/routes.ts` |
| `GET /users/profile-extension` | Активный пользователь с users/read; имя выбранной коллекции и ключа | `apps/core/src/auth/profile-extension-routes.ts` |
| `PUT /users/profile-extension` | Только human superuser; связывает обычную UUID-коллекцию, не выдаёт права и не удаляет данные | `apps/core/src/auth/profile-extension-routes.ts` |
| `GET /workspaces` | Человек; только пространства с доступными коллекциями (superuser видит все) | `apps/core/src/workspaces/routes.ts` |
| `POST /workspaces` | Человек: superuser | `apps/core/src/workspaces/routes.ts` |
| `DELETE /workspaces/:id` | Человек: superuser | `apps/core/src/workspaces/routes.ts` |
| `PUT /workspaces/:id` | Человек: superuser | `apps/core/src/workspaces/routes.ts` |
