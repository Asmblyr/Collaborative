# Матрица HTTP-маршрутов

Сгенерировано из Core и проверенного каталога доступа. 162 деклараций.

Это описание границ; их исполнение проверяют интеграционные тесты. Динамические маршруты плагинов и внутренние endpoints oidc-provider не перечисляются отдельно.

| Метод и путь | Доступ | Источник в репозитории |
| --- | --- | --- |
| `POST /assistant/filter/validate` | Человек: superuser ИЛИ хотя бы один grant read/create/update; инструменты проверяют права отдельно | `apps/core/src/assistant/routes.ts` |
| `POST /assistant/messages` | Человек: superuser ИЛИ хотя бы один grant read/create/update; инструменты проверяют права отдельно | `apps/core/src/assistant/routes.ts` |
| `POST /assistant/messages/:id/cancel` | Человек: superuser ИЛИ хотя бы один grant read/create/update; инструменты проверяют права отдельно | `apps/core/src/assistant/routes.ts` |
| `POST /assistant/selection/validate` | Человек: superuser ИЛИ хотя бы один grant read/create/update; инструменты проверяют права отдельно | `apps/core/src/assistant/routes.ts` |
| `GET /assistant/status` | Человек: superuser ИЛИ хотя бы один grant read/create/update; инструменты проверяют права отдельно | `apps/core/src/assistant/routes.ts` |
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
| `PATCH /collections/:name/navigation` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `POST /collections/:name/relations` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `PUT /collections/:name/relations/:field/search` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `PATCH /collections/:name/settings` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/collections/routes.ts` |
| `GET /collections/:name/terms` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/terms/routes.ts` |
| `PUT /collections/:name/terms` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/terms/routes.ts` |
| `DELETE /collections/:name/terms/:id` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/terms/routes.ts` |
| `PUT /collections/:name/terms/:id` | Человек: superuser; системная и plugin-owned структура дополнительно защищена | `apps/core/src/terms/routes.ts` |
| `GET /extensions` | Активный principal; метаданные включённых UI-плагинов | `apps/core/src/plugins/ui-routes.ts` |
| `GET /extensions/:namespace/drafts/:id` | Активный principal; подготовленный черновик только своего principal и namespace, с TTL | `apps/core/src/plugins/action-draft-routes.ts` |
| `GET /files` | Человек + files/read либо update; superuser bypass. Общая библиотека команды | `apps/core/src/files/routes.ts` |
| `POST /files` | Человек + files/update; superuser bypass. Загрузка до 25 MiB, валидация метаданных, защита используемых ссылок | `apps/core/src/files/routes.ts` |
| `DELETE /files/:id` | Человек + files/update; superuser bypass. Загрузка до 25 MiB, валидация метаданных, защита используемых ссылок | `apps/core/src/files/routes.ts` |
| `GET /files/:id` | Активный principal: superuser, человек с files/read/update либо доступная ссылка в разрешённом поле записи; чужие файлы скрыты | `apps/core/src/files/routes.ts` |
| `PATCH /files/:id` | Человек + files/update; superuser bypass. Загрузка до 25 MiB, валидация метаданных, защита используемых ссылок | `apps/core/src/files/routes.ts` |
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
| `GET /ready` | Публичная проверка готовности, без секретов | `apps/core/src/health/readiness.ts` |
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
| `GET /settings/options/collections` | Человек: policies; только проекция схемы без записей; read ИЛИ update соответствующего раздела | `apps/core/src/settings/access-routes.ts` |
| `GET /settings/options/policies` | Человек: users ИЛИ policies ИЛИ services; только ID/названия; read ИЛИ update соответствующего раздела | `apps/core/src/settings/access-routes.ts` |
| `GET /settings/options/users` | Человек: oauth; только ID/email; read ИЛИ update соответствующего раздела | `apps/core/src/settings/access-routes.ts` |
| `GET /settings/plugins` | Человек: plugins/read ИЛИ update; superuser bypass | `apps/core/src/plugins/settings-routes.ts` |
| `GET /settings/plugins/:namespace` | Человек: plugins/read ИЛИ update; superuser bypass | `apps/core/src/plugins/settings-routes.ts` |
| `PUT /settings/plugins/:namespace` | Человек: plugins/update; superuser bypass | `apps/core/src/plugins/settings-routes.ts` |
| `GET /settings/terms` | Человек: terms/read ИЛИ update; superuser bypass | `apps/core/src/terms/routes.ts` |
| `POST /settings/terms` | Человек: terms/update; superuser bypass | `apps/core/src/terms/routes.ts` |
| `PUT /settings/terms/:id` | Человек: terms/update; superuser bypass | `apps/core/src/terms/routes.ts` |
| `GET /table-views/:collection` | Человек и доступ к коллекции; личный владелец, общие виды изменяет superuser | `apps/core/src/preferences/table-view-routes.ts` |
| `POST /table-views/:collection` | Человек и доступ к коллекции; личный владелец, общие виды изменяет superuser | `apps/core/src/preferences/table-view-routes.ts` |
| `DELETE /table-views/:collection/:id` | Человек и доступ к коллекции; личный владелец, общие виды изменяет superuser | `apps/core/src/preferences/table-view-routes.ts` |
| `PUT /table-views/:collection/:id` | Человек и доступ к коллекции; личный владелец, общие виды изменяет superuser | `apps/core/src/preferences/table-view-routes.ts` |
| `GET /table-views/:collection/default` | Человек и доступ к коллекции; личный владелец, общие виды изменяет superuser | `apps/core/src/preferences/table-view-routes.ts` |
| `GET /users` | Человек: users/read или update ИЛИ policies/read или update; superuser bypass | `apps/core/src/auth/user-routes.ts` |
| `POST /users` | Человек: users/update; superuser bypass | `apps/core/src/auth/user-routes.ts` |
| `GET /users/:id/access` | Человек: users/read ИЛИ update; superuser bypass | `apps/core/src/auth/user-routes.ts` |
| `PUT /users/:id/delegation` | Только человек-superuser: явный набор готовых политик, которые пользователь вправе назначать | `apps/core/src/auth/user-routes.ts` |
| `POST /users/:id/invitation` | Человек: superuser ИЛИ users/update; повторное приглашение только в пределах разрешённого набора, без доступа к аккаунтам с собственным делегированием | `apps/core/src/auth/user-routes.ts` |
| `POST /users/:id/recovery` | Свежий человек-superuser; только другой активный обычный пользователь. Одноразовая ссылка на 30 минут, аудит; не делегируется | `apps/core/src/auth/user-routes.ts` |
| `GET /users/me` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/auth/profile-routes.ts` |
| `PATCH /users/me` | Человек, только собственный профиль/ресурс; workspace дополнительно проверяет видимость | `apps/core/src/auth/profile-routes.ts` |
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
| `GET /workspaces` | Человек; только пространства с доступными коллекциями (superuser видит все) | `apps/core/src/workspaces/routes.ts` |
| `POST /workspaces` | Человек: superuser | `apps/core/src/workspaces/routes.ts` |
| `DELETE /workspaces/:id` | Человек: superuser | `apps/core/src/workspaces/routes.ts` |
| `PUT /workspaces/:id` | Человек: superuser | `apps/core/src/workspaces/routes.ts` |
