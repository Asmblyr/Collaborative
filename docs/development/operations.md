# Эксплуатация первой беты

Одна команда — отдельная установка, PostgreSQL и приватный bucket. Workspaces не служат изоляцией компаний. SMTP не обязателен: администратор вручную передаёт приглашение или ссылку восстановления.

## Сборка и выпуск

Dockerfile собирает Core/UI с закреплённым Node image digest, pnpm и lockfile; runtime работает от `node`. `.dockerignore` исключает secrets и локальные данные. GitLab CI запускает `pnpm check` и production build с временным PostgreSQL. Тесты создают/удаляют случайную тестовую БД; CI-hostname `postgres` допускается только при `CI=true` и явном `TEST_DATABASE_ADMIN_URL`. Другие удалённые БД запрещены.

После проверок ручной job для Git tag публикует образы с полным commit SHA. Закрепите registry digest в `CORE_IMAGE`/`UI_IMAGE`, путь к приватному Core env в `CORE_ENV_FILE` и используйте `infra/release/compose.yaml`. Миграции выполняются до Core. UI слушает loopback за HTTPS reverse proxy; Core, БД и bucket не публикуются. `AUTH_UI_URL` — точный внешний HTTPS origin. Bucket создаётся инфраструктурой. Signing keys OAuth резервируются отдельно и не пересоздаются при выпуске.

До обновления — копия данных и проверка миграций на восстановленной копии. Откат образа возможен только при совместимой схеме; разрушительный rollback миграций не является восстановлением.

## Локальная установка и проверка

Заполните приватную копию `infra/beta/env.example` случайными значениями без URL-спецсимволов в DB password. Храните env вне Git.

```sh
docker compose --env-file /private/beta.env -p asmblyr-beta -f infra/beta/compose.yaml up -d --build --wait
node scripts/beta-status.mjs /private/beta.env asmblyr-beta
```

UI — `http://localhost:3300`, отдельный cookie prefix. Тестовый S3 собран из закреплённого официального MinIO release source, не публикует порт; лицензия AGPL относится к этому компоненту. Для внешнего S3 Core использует HTTPS и официальный credential chain, включая Yandex federation.

`beta-smoke.mjs` запускается внутри Core с `ASMBLYR_BETA_SMOKE=fresh-install`: до любых изменений проверяет отсутствие пользователей. Создаёт тестовую команду, политику, файл, конфликт правки и 50 000 записей. В `/tmp` сохраняет отдельно приватные credentials и доказательства без secrets. Не запускать на рабочей установке.

## Копии и восстановление

```sh
node scripts/beta-backup.mjs /private/beta.env asmblyr-beta /private/backups/new-copy
node scripts/beta-restore.mjs /private/restore.env asmblyr-restore-check /private/backups/new-copy
node scripts/beta-status.mjs /private/restore.env asmblyr-restore-check
```

Локальный backup останавливает UI/Core, затем S3, делает `pg_dump -Fc` и архив offline object volume, записывает SHA-256 и ID образов; затем поднимает сервисы даже при ошибке копирования. Каталог должен быть новым. Не допускайте других авторов БД/S3 или отдельно запущенных реплик.

Restore проверяет hashes и разрешён только в новый проект `asmblyr-restore-NAME` без существующих volumes. Выполняет `pg_restore --exit-on-error`, восстанавливает object volume и запускает миграции/Core/UI. Используйте те же версии образов и отдельный UI port. Исходная установка не перезаписывается. Проверяйте число записей, вход, права и checksum скачанного файла. Копии содержат личные данные и credential hashes: храните приватно и шифруйте средствами backup-системы.

Для внешних PostgreSQL/S3 эту процедуру выполняет инфраструктура: остановка всех авторов, DB dump/snapshot, полная копия объектов, сохранение конфигурации/signing keys; восстановление в новые ресурсы и проверка. Скрипты локального compose не копируют произвольный облачный bucket. Перед публичным запуском выполните эту процедуру на выбранном хостинге, настройте расписание копий и алерт ошибки.

## Восстановление администратора

Оператор на сервере запускает `node scripts/admin-recover.mjs admin@example.com /private/new-credential.json` из собранного репозитория/runtime-контейнера с серверным `DATABASE_URL`. Команда требует существующего активного superuser и нового приватного файла без перезаписи. Записывает случайный пароль, затем атомарно отзывает прежние сессии, способы входа и OAuth-согласия и устанавливает пароль; credentials не печатаются. После входа измените пароль и удалите временный файл средствами оператора. Публичного endpoint нет.

JWT внешних OAuth-приложений могут приниматься до истечения пяти минут: отзыв локальной сессии не удаляет внешнюю копию JWT.

## Диагностика и ограничения

`/health` проверяет процесс; `/ready` — БД и обязательные миграции. Compose проверяет health и перезапускает завершившиеся процессы. `beta-status.mjs` возвращает ненулевой exit code при проблеме. Для реального хостинга подключите `/ready` и UI к uptime monitor и укажите канал алертов: локальный health сам уведомлений не отправляет.

Core log содержит request ID, метод и путь без query; не сохраняет body, cookies/Authorization и сырой текст внутренних исключений. 500 возвращает нейтральный текст с requestId. Docker ротирует logs по 10 MiB, три файла. Origin-проверка BFF дополняет HttpOnly/SameSite cookies; произвольным forwarded headers доверять нельзя. Reverse proxy/observability тоже не должны сохранять secrets или query.

Общий PostgreSQL credential bucket: 100 POST запросов/минуту на источник Core; за BFF это общий источник UI. Дополнительные ограничения маршрутов локальны. Ассистент: по умолчанию 100 запросов/сутки UTC и два одновременно на пользователя, максимум восемь обращений к модели/запрос и 100 000 байт контекста/обращение. Lease после сбоя истекает. Настройки — в Core `.env.example`; денежный предел дополнительно задаёт аккаунт провайдера.

Worker раз в минуту удаляет истёкшие WebAuthn challenges/buckets/AI leases и сессии, истёкшие более семи дней назад, пачками до 1000 строк/таблицу. При `HISTORY_RETENTION_DAYS=0` бизнес-история сохраняется; явные 1..3650 включают очистку AI turns/requests, истории записей/файлов по возрасту. Security events, комментарии и бизнес-записи worker не удаляет. Плагины должны быть доверенными: capability contract не является песочницей.

Live IAM/ACL, TLS, расписание внешних копий и доставка алертов проверяются на выбранном хостинге. [Beta-проверка](../security/beta-2026-10-03.md) отделяет локальный результат от этого шага.
