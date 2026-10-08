<a id="sdk-packages"></a>

# Пакеты SDK

В npm доступны четыре MIT-пакета версии 0.1.0-beta.1:

| Пакет                            | Назначение                                                        | Файлы             |
| -------------------------------- | ----------------------------------------------------------------- | ----------------- |
| @asmblyr-collaborative/contracts | Общие HTTP-контракты и каталоги переводов                         | src, locales      |
| @asmblyr-collaborative/sdk       | HTTP-клиент, fluent-запросы, методы плагинов, отдельный генератор | dist              |
| @asmblyr-collaborative/cli       | asm connect, generate, schema pull/check                          | src               |
| @asmblyr-collaborative/kit       | Плагины, model-контракты, UI и сборщик                            | dist, bin, styles |

Архивы также содержат package metadata, README и MIT-лицензию. Явные списки файлов
исключают тесты, локальную конфигурацию и промежуточную работу. Используйте тег beta.
Первая бета также находится под latest; это не означает стабильный релиз.

```sh
pnpm install --frozen-lockfile
pnpm build:packages
pnpm packages:check
```

Проверка сохраняет архивы в игнорируемой .local-data/packages, проверяет содержимое
и устанавливает их в одноразовый проект вне workspace. Локальные overrides связывают
упакованные зависимости; настоящие package metadata содержат обычные версии.
Проверяются генерация CLI, offline-сверка, стандартная компиляция TypeScript,
fluent/плагинные вызовы и экспорты Kit. Проверка не обращается к установке Collaborative
и ничего не публикует. Для внешних зависимостей нужен npm registry. Убедитесь, что
CI запускает эту проверку.

Для потребителя:

```sh
npm install @asmblyr-collaborative/sdk@beta
npm install --save-dev @asmblyr-collaborative/cli@beta
npx asm connect --url https://asmblyr.example.test
npx asm generate
npx asm schema check --offline
```

Для локальной разработки используйте workspace-команды или проверенные архивы.
[CLI](cli-guide.md) описывает согласие в браузере, CI-креды и файлы,
[SDK](sdk-guide.md) — рабочий клиент. Особый компилятор или плагин сборщика не нужен.

<a id="release-procedure"></a>

## Публикация

Это отдельное действие сопровождающего. Выполните проверки и сборку, изучите архивы,
опубликуйте contracts, затем sdk/kit, затем cli с тегом beta. Обновляйте четыре версии
и lockfile вместе до упаковки. Не публикуйте бету как latest.

Для автоматизации настройте trusted publisher каждого пакета на точный GitHub
Actions workflow с id-token:write. Механизм npm требует Node 22.14+ и npm 11.5.1+
и создаёт provenance для поддержанных запусков. Ручной publish-packages.yml
проверяет и публикует согласованную бету по зависимостям из main; он не запускается
при push/PR. Настройте доверие к Asmblyr/Collaborative и этому имени workflow для
всех четырёх пакетов. Настройка доверия registry здесь не подтверждена; доступом
организации управляет сопровождающий.

Частично опубликованный выпуск автоматически не откатывается: версии неизменяемы.
Перед повтором проверьте npm. См. [trusted publishers](https://docs.npmjs.com/trusted-publishers/).
