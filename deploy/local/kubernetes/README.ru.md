# Kubernetes в Docker Desktop

Отдельная установка использует namespace `collaborative` и один PostgreSQL с
PVC на 5 GiB. Core/UI работают независимо от других продуктов. Данные из
базы разработки автоматически не переносятся.

Нужны PowerShell 7.4+, Docker Desktop Linux/kind, `kubectl`, Helm 3,
CloudNativePG и Traefik. Операторы должны наблюдать `collaborative`, ingress
class — `asmblyr`, HTTP-порт 80 должен быть доступен на loopback. Проверяемые
версии: CNPG 1.30.1/chart 0.29.1 и Traefik 3.7.14/chart 42.0.0. Можно использовать
существующие общие операторы без установки второго экземпляра.

Из корня репозитория:

```powershell
./scripts/Deploy-LocalKubernetes.ps1
# Если Helm не в PATH: -Helm C:/tools/helm.exe
```

Сценарий проверяет loopback API `docker-desktop` и локальные kind-ноды, не меняет
текущий контекст, создаёт PostgreSQL, сохраняет существующие секреты настройки
и шифрования, собирает два образа из одних исходников и импортирует точные
manifest на все ноды. Helm выполняет миграции перед обновлением приложения.
Подключение к БД проверяет серверный сертификат; приложению монтируется только
публичный CA без закрытого ключа.

Храните приватную копию `collaborative-runtime`, особенно `SECRETS_LOCAL_KEY`.
При существующей БД/PVC сценарий не создаёт отсутствующий ключ: сначала нужно
восстановить исходный Secret. Замена ключа без расшифровки и повторного шифрования
данных делает их нечитаемыми. Изменение resourceVersion секретов вызывает rollout
даже при повторном использовании тех же образов.

Откройте `http://collaborative.localhost/setup`. Токен первоначальной настройки
хранится в Kubernetes Secret `collaborative-runtime`, ключ `ASMBLYR_SETUP_TOKEN`.
Используйте доверенный локальный просмотр секретов, не переносите токен в Git.
Chromium разрешает `*.localhost`; проверка из командной строки без изменения DNS:

```powershell
curl.exe --noproxy '*' --resolve collaborative.localhost:80:127.0.0.1 http://collaborative.localhost/api/health
```

Для обновления готовыми образами: `-SkipBuild -ImageTag <local-tag>`.
Чтобы сохранить существующий адрес `http://collaborative.asmblyr.localhost`,
задайте его через `-PublicUrl`; старый `collaborative.localhost` будет перенаправлять
на него. Пользователи не меняются, браузерные credentials между хостами не переносятся.
PVC и
секреты сохраняются. Перед миграцией сделайте копию нужных данных. Удаление
namespace/PVC или Docker VM уничтожает локальную БД; Helm rollback не откатывает
PostgreSQL. HTTP, одна реплика базы и локальный диск предназначены для разработки;
они не дают production HA или резервного копирования. S3 и внешние провайдеры
настраиваются отдельно.

[English](README.md)
