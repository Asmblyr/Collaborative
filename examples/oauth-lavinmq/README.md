# LavinMQ и OAuth/OIDC

Опциональный пример подключения внешнего приложения к OAuth/OIDC provider Asmblyr.
Он не запускается вместе с Core и не требуется для админки.

Нужны Docker Compose, настроенный OAuth provider Core, постоянные signing keys
и зарегистрированное приложение. Настройки протокола описаны в
[интеграциях](../../docs/features/integrations.md).

Из корня репозитория:

```sh
node examples/oauth-lavinmq/setup.mjs
```

Команда создаст `.local-data/oauth-lavinmq/lavinmq.ini`, не заменяя существующий файл.
Заполните его параметрами зарегистрированного приложения, затем запустите:

```sh
docker compose -f examples/oauth-lavinmq/compose.yaml up -d
```

Gateway доступен на `http://localhost:15673`; настройки и данные брокера приватны.
Разрешение HTTP для localhost относится к этому примеру. Публичная установка
требует HTTPS и корректных issuer, origins и redirect URI.

Live-тест `core-lavinmq` запускается отдельно через `scripts/test.mjs` с переменными,
описанными в `apps/core/test/oauth-lavinmq.integration.test.ts`. Обычный набор тестов
пропускает его без настроенного брокера.
