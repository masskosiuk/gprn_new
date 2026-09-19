# Загрузка GPRN на Debian 12

Домен: `photoapp.metarp.top`. Прокси: существующий Caddy на сервере.
Папка приложения на сервере: `/opt/gprn`.

## Важно о готовности

Этот пакет предназначен для серверного тестирования текущей версии.
Веб-интерфейс пока использует localStorage для аккаунта, фотографий и действий,
а не добавленные серверные API. Эти данные не станут общими для пользователей
после загрузки на сервер и не перенесутся из локального браузера автоматически.
Обработчики фоновых очередей пока являются заготовками; автоматизированных
интеграционных тестов нет. Не открывайте регистрацию реальным пользователям,
пока клиент не подключён к API и полный сценарий не проверен с PostgreSQL/MinIO.
Успешная сборка контейнеров сама по себе этого не исправляет.

На компьютере подготовки нет Docker: полная сборка и запуск Docker-стека
должны быть проверены на сервере. Секреты в этот пакет не включены.

## 1. Что загружать

В `server-upload/gprn` находятся только исходники, зависимости в виде
манифестов и lock-файла, Prisma, production Docker Compose, Dockerfile и инструкции.
`node_modules`, `.next`, `dist`, `.turbo`, `.git`, резервные копии и локальные
`.env` не включены. Не загружайте исходную папку целиком.

Подготовьте каталог в PuTTY:

```bash
sudo mkdir -p /opt/gprn
sudo chown "$USER":"$USER" /opt/gprn
```

Через WinSCP загрузите СОДЕРЖИМОЕ `server-upload/gprn` в `/opt/gprn`.
В результате файл должен находиться по адресу `/opt/gprn/package.json`,
а не `/opt/gprn/gprn/package.json`. Включите показ скрытых файлов в WinSCP,
чтобы `.dockerignore` и `.env.production.example` тоже были переданы.
Исходники должны принадлежать вашему SSH-пользователю; приложение запускается
в контейнерах и не требует Node.js или pnpm на самом Debian.

Альтернатива: загрузите `gprn-server.tar.gz` в домашний каталог и, только при
первом развёртывании в пустой `/opt/gprn`, распакуйте:

```bash
tar -xzf ~/gprn-server.tar.gz --strip-components=1 -C /opt/gprn
```

## 2. Проверка Docker

```bash
docker --version
docker compose version
```

Если обе команды работают, переходите к следующему разделу.
Если Docker не установлен, используйте официальный репозиторий Docker
для Debian: https://docs.docker.com/engine/install/debian/ .
Команды ниже предназначены для Debian без другой установленной версии Docker:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl openssl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: bookworm
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker compose version
```

При конфликте с существующей установкой Docker/containerd не удаляйте пакеты
вслепую: другие сервисы сервера могут от них зависеть.

## 3. Настройка секретов

Для ПЕРВОГО запуска:

```bash
cd /opt/gprn
bash infra/deploy/init-env.sh photoapp.metarp.top
```

Скрипт создаёт `.env.production` с новыми случайными ключами, паролями и доменом.
Права файла будут `600`. Пароль PostgreSQL и пароль в DATABASE_URL совпадают.
Скрипт откажется перезаписывать уже существующий файл.

При ОБНОВЛЕНИИ сохраняйте прежний серверный `.env.production`, не запускайте
генерацию заново. Замена пароля в env не меняет пароль уже созданной базы.
При необходимости изменить домен или порты:

```bash
nano .env.production
```

Порты по умолчанию: `127.0.0.1:13000` (веб), `14000` (API),
`19000/19001` (MinIO). PostgreSQL и Redis не выставлены наружу.
Если эти порты уже заняты, поменяйте соответствующие `*_BIND_PORT` в env
и upstream-порты в конфигурации Caddy. Не останавливайте чужие сервисы.

## 4. Сборка и запуск

Команды из `/opt/gprn`:

```bash
sudo docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
sudo docker compose --env-file .env.production -f docker-compose.production.yml build web
sudo docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-build
sudo docker compose --env-file .env.production -f docker-compose.production.yml ps -a
sudo docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=100 migrate api web
curl -fsS http://127.0.0.1:14000/api/v1/health
curl -I http://127.0.0.1:13000/ru
```

Все приложения используют один образ `gprn-app:local`, поэтому достаточно
собрать `web` один раз. Внутри сборки устанавливаются зависимости по lock-файлу,
генерируется Prisma Client и выполняется production build всех пакетов.
Compose ждёт PostgreSQL, Redis, создания бакетов и успешных миграций перед
запуском API/worker. `migrate` и `create-buckets` со статусом `Exited (0)`
после выполнения являются нормой. Рабочие сервисы остаются в фоне после выхода
из PuTTY и имеют политику перезапуска `unless-stopped`.

При первом старте дождитесь готовности API, затем выполните проверки curl ещё
раз, если они были запущены до готовности контейнера. Проверка `/health`
подтверждает только доступность процесса API, а не весь пользовательский сценарий.

ТОЛЬКО для новой пустой базы можно один раз заполнить роли, категории,
географию, достижения, первый сезон и челленджи:

```bash
sudo docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate pnpm --filter @gprn/db db:seed
```

Seed не создаёт пользователей или фотографии. Не повторяйте его на рабочей
базе без проверки: он сбрасывает feature flags и некоторые настройки сезонов.
При ошибке миграции существующей базы остановитесь, сохраните логи и сделайте
резервную копию. Не используйте `prisma migrate reset` или `db push --accept-data-loss`.
Начальная миграция этой версии переработана; обновление уже существующей базы
может потребовать отдельной миграции, а не повторного применения начальной.

## 5. Подключение домена в Caddy

DNS домена `photoapp.metarp.top` должен указывать на этот сервер. Порты 80/443
должны быть доступны извне. Существующие сайты и блоки Caddy оставьте на месте.

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.gprn-backup-$(date +%Y%m%d-%H%M%S)
cat /opt/gprn/infra/caddy/photoapp.metarp.top.caddy
sudo nano /etc/caddy/Caddyfile
```

Добавьте блок из `infra/caddy/photoapp.metarp.top.caddy`. Если блок именно
`photoapp.metarp.top` уже есть, обновите его, а не создавайте второй.
Не заменяйте весь Caddyfile. `/api/*` проксируется в API, `/media/*` только
в публичный бакет MinIO, остальные пути в Next.js. Консоль и приватный бакет
MinIO не публикуются.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -I https://photoapp.metarp.top/ru
curl -fsS https://photoapp.metarp.top/api/v1/health
```

Перезагружайте Caddy только после успешной валидации.
Официальное описание маршрута media: https://caddyserver.com/docs/caddyfile/directives/handle_path .
Если установленная версия Caddy не поддерживает директиву из примера,
валидация сообщит об этом; до исправления не перезагружайте Caddy.

## 6. Обновления и диагностика

Перед обновлением сохраните БД и отдельно оригиналы фотографий/MinIO:

```bash
cd /opt/gprn
umask 077
mkdir -p backups
sudo docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres pg_dump -U gprn -d gprn -Fc > backups/gprn-$(date +%Y%m%d-%H%M%S).dump
```

Проверьте код завершения команды, перенесите бэкап на другое хранилище и
проверяйте восстановление. Дамп БД не содержит файлы MinIO.
Затем загрузите новые исходники, сохраняя `.env.production`, и повторите
`build web` и `up -d --no-build` из раздела 4. Домен из APP_URL учитывается
именно при сборке, в том числе в sitemap и canonical URL.

Логи и перезапуск:

```bash
sudo docker compose --env-file .env.production -f docker-compose.production.yml logs -f --tail=100 api web worker
sudo docker compose --env-file .env.production -f docker-compose.production.yml restart api web worker
```

Ctrl+C при просмотре логов останавливает только их просмотр.
Не используйте `docker compose down -v`: это удалит тома с базой и фото.
Не выполняйте глобальную очистку Docker на сервере с другими приложениями.
