# Asmblyr Collaborative

Открытая платформа для работы с данными в PostgreSQL. Админка объединяет структуру
коллекций, редакторы записей, права команды, файлы и интеграции.
Проект находится в ранней бете; одна команда использует отдельную установку.

[Сайт и демо](https://asmblyr.io/) · [Рабочая консоль](https://console.asmblyr.io/)

## Начать

- [Возможности и ограничения](./guide/features.md)
- [Первый запуск](./guide/getting-started.md)
- [Docker, production и обновления](./guide/deployment.md)
- [HTTP API](./reference/http.md)
- [TypeScript SDK](./reference/sdk-guide.md) и [CLI](./reference/cli-guide.md)

## Работа с продуктом

Руководства по [данным](./features/data.md), [правам](./features/access.md),
[пользователям](./features/identity.md), [файлам](./features/files.md),
[настройкам](./features/settings.md), [пространствам](./features/workspaces.md),
[мониторингу](./features/monitoring.md),
[интеграциям](./features/integrations.md), [ассистенту](./features/assistant.md),
[обсуждениям и уведомлениям](./features/notifications.md),
[локализации](./features/localization.md) и [расширениям](./features/plugins.md)
описывают текущие контракты и их границы.
[Личные подключения Google Drive и Sheets](./features/google-workspace.md) описаны отдельно.
[Совместная работа в реальном времени](./features/realtime.md) описывает
присутствие, изменения записей, блокировки полей и ограничения транспорта.

| Задача                                              | Где читать                                                    |
| --------------------------------------------------- | ------------------------------------------------------------- |
| Коллекции, поля, связи, записи, фильтры и поиск     | [Данные](./features/data.md)                                  |
| Виды таблицы и рабочие пространства                 | [Пространства](./features/workspaces.md)                      |
| Пользователи, вход и сессии                         | [Авторизация](./features/identity.md)                         |
| Политики, разрешения и условия строк                | [Права](./features/access.md)                                 |
| Файлы и S3                                          | [Файлы](./features/files.md)                                  |
| Аутентификация API, страницы, ошибки и примеры кода | [HTTP](./reference/http.md) и [SDK](./reference/sdk-guide.md) |

## Разработка и эксплуатация

- [Локальная разработка и проверки](./development/local-development.md)
- [Архитектура](./development/architecture.md)
- [Архитектура Collaborative Live](./architecture/realtime.md)
- [Первое расширение](./development/first-extension.md)
- [Архитектура ассистента и model context](./development/assistant-architecture.md)
- [Опубликованные пакеты](./reference/packages.md)
- [Сопровождение документации](./development/documentation.md)
- [Эксплуатация и восстановление](./development/operations.md)
- [Границы безопасности](./security/overview.md)
- [Визуальная идентичность и публичные assets](./assets/brand/README.md)
- [Участие в проекте](https://github.com/Asmblyr/Collaborative/blob/main/CONTRIBUTING.md)

Руководства по Kit и SDK поддерживаются в исходных пакетах и копируются в
`reference` при генерации сайта. Технические детали размещаются рядом с
контрактом; эта главная страница служит маршрутом к ним. Основной язык сейчас
русский; при добавлении других языков следует сохранить общие исходные
контракты и отдельную навигацию для каждого языка.
