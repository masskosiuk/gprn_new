# Загрузка GPRN на Debian 12

Домен: `photoapp.metarp.top`. Прокси: существующий Caddy на сервере.
Папка приложения на сервере: `/opt/gprn`.

## Важно о готовности

Аккаунты, публикации, комментарии, обращения и модерация работают через
серверные API, PostgreSQL и объектное хранилище. При обновлении сохраняйте
существующий `.env.production` и Docker volumes: их замена не требуется.
Успешная сборка исходников не означает, что рабочий сайт уже обновлён.
Инструкции для новых разделов и демо-контента:
[обновление сообщества](docs/COMMUNITY_RELEASE_RU.md).
Приём внешних платежей и удержание средств для защищённых сделок пока
не подключены. Назначение Pro в админке не списывает деньги.

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

Если в логах `web`, `api` и `worker` одновременно появилась ошибка
`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, был запущен локальный
`docker-compose.yml`, а не production-конфигурация. Данные и тома не удаляйте.
Из `/opt/gprn` выполните production-команды с явным именем файла:

```bash
sudo docker compose --env-file .env.production -f docker-compose.production.yml build web
sudo docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-build --remove-orphans
sudo docker compose --env-file .env.production -f docker-compose.production.yml ps -a
sudo docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=100 migrate api worker web
```

Ключ `--remove-orphans` здесь удаляет только контейнеры прежней dev-конфигурации;
именованные тома PostgreSQL и MinIO он не удаляет.

## 7. Демо-батлы

Отдельная команда создаёт пять батлов из десяти работ шести демо-мастеров.
Она не запускается автоматически при старте сайта. Перед обновлением сделайте
резервную копию по разделу 6, затем выполните:

```bash
cd /opt/gprn
git pull --ff-only origin master
sudo docker compose --env-file .env.production -f docker-compose.production.yml build web
sudo docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-build
sudo docker compose --env-file .env.production -f docker-compose.production.yml exec -T api pnpm db:seed:demo-battles
curl -fsS https://photoapp.metarp.top/api/v1/battles/open
```

API должен иметь исходящий доступ к `images.unsplash.com`: изображения
скачиваются один раз и сохраняются в публичном бакете MinIO под `demo/battles/v1/`.
Для демо используются отдельные профили `demo.*` с адресами в домене `.invalid`
без паролей, предложений услуг и утверждений о подтверждённом авторстве.
Это образцы, а не реальные авторы. Батлы отмечены как демонстрационные.

В обоих слотах работы одобрены, поэтому батлы сразу доступны всем через API.
Голоса настоящие: требуется вход, один голос на пользователя, действуют обычные
правила завершения батла. Начальные голоса и подписчики не накручиваются.
Повторный запуск не сбрасывает результаты, сроки и решения модерации,
не открывает завершённые или отменённые батлы. Общий `db:seed` на рабочей базе
повторно запускать не нужно. Миграция для демо-батлов не требуется.

## 8. Демо-челленджи и видео

После резервного копирования (раздел 6) обновите приложение:

```bash
cd /opt/gprn
git pull --ff-only origin master
sudo docker compose --env-file .env.production -f docker-compose.production.yml build web
sudo docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-build
sudo docker compose --env-file .env.production -f docker-compose.production.yml exec -T api pnpm db:seed:demo-challenges
curl -fsS https://photoapp.metarp.top/api/v1/challenges
```

Команда создаёт «Кино без бюджета» (видео), «Один цвет» (фото) и
«Тень — главный герой» (фото). В каждой теме два одобренных стоковых
демо-примера, всего шесть работ шести демо-мастеров. Она работает независимо
от команды демо-батлов. Обложки берутся из соответствующих материалов;
дедлайн новых челленджей через 30 дней, но не позднее конца активного сезона.
Старые челленджи не удаляются: их можно закрыть в админке.

Файлы скачиваются из Mixkit, Unsplash, Pexels и ISO Republic и сохраняются
в MinIO под `demo/challenges/v1/`. Нужен исходящий HTTPS-доступ к этим источникам.
Источники и лицензии перечислены в `DEMO_CHALLENGE_SOURCES.md`, ссылки есть
также у примеров на сайте. Демо-профили не заявляют авторство стоковых файлов,
их геолокация скрыта, голоса и подписчики не создаются.

Повторный запуск сохраняет названия, обложки, сроки, закрытые челленджи,
решения модерации и отменённое участие. Общий `db:seed` повторно не запускайте.
Миграция БД не требуется. Для обработки видео нужен FFmpeg/FFprobe;
они устанавливаются в новый Docker-образ при сборке. В локальной среде
установите их отдельно или задайте `FFMPEG_PATH` и `FFPROBE_PATH`.
Загрузка с устройства поддерживает MP4/WebM до 18 МБ и 60 секунд;
видео преобразуется в MP4/H.264 с постером и проходит ту же модерацию, что фото.
Фотобатлы принимают только фото. «Кино без бюджета» принимает ролики 10–60 секунд.

### Замена второго демо-видео и ссылки на челленджи

На уже заполненной онлайн-базе повторный `db:seed:demo-challenges` не меняет
материалы. Для замены только старого ролика Lucas Meyer используйте отдельную
команду после обновления образа:

```bash
cd /opt/gprn
git pull --ff-only origin master
sudo docker compose --env-file .env.production -f docker-compose.production.yml build api
sudo docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-build --no-deps --force-recreate api web
sudo docker compose --env-file .env.production -f docker-compose.production.yml exec -T api pnpm db:refresh:demo-challenge-video
curl -fsS https://photoapp.metarp.top/api/v1/challenges
```

`REPLACED` означает успешную замену на «Свой саундтрек»: мужчина в кафе,
другая локация и герой. `UPDATED` означает, что новый материал уже установлен.
`UNAVAILABLE` сохраняет удалённый, скрытый или отклонённый материал. Если исходник
или файлы изменены администратором, команда откажется их перезаписывать.
Участники, названия/обложки/сроки челленджей, аккаунты и батлы не пересоздаются.
Старые файлы остаются в хранилище; новые адреса исключают старый кеш.
Кнопка «Поделиться» использует ссылку `/<язык>/challenges?challenge=<id>`;
по ней страница выделяет и открывает нужную карточку, включая гостевой просмотр.
Карточки батлов и челленджей на главной ведут к конкретному соревнованию:
`/<язык>/battles?battle=<id>` и `/<язык>/challenges?challenge=<id>`.
На главной кнопки предпросмотра работ и «Поделиться» остаются независимыми от
перехода по карточке. Выбранный батл открывается независимо от прежнего фильтра.

## 9. Карточки LUT и пресетов

Галочки в настройках профиля включают разделы, но не создают товары.
В каждом включённом разделе автор создаёт отдельные карточки: название,
описание, обложка, один или несколько файлов, цена или бесплатная раздача.
Обложки: JPG/PNG/WebP/AVIF до 5 МБ. LUT: CUBE. Пресеты: XMP/LRTEMPLATE.
До 20 файлов, до 8 МБ каждый и до 12 МБ суммарно. ZIP не поддерживается.
Файлы проверяются по содержимому и хранятся в закрытом бакете; обложка
преобразуется в WebP. Палитра рассчитывается из пикселей обложки.

Покупка использует серверный кошелёк и сохраняет заказ. Повторный запрос
не списывает деньги второй раз. Покупки доступны для скачивания в профиле,
включая товары, которые продавец скрыл или снял с продажи. Галочки не удаляют
сохранённые товары. Удаление карточки архивирует её, сохраняя купленные файлы.

Баланс и операции берутся с сервера. Старое фиктивное пополнение удалено:
без платёжного провайдера сервер возвращает ошибку, а не начисляет деньги.
Платная покупка доступна при достаточном подтверждённом серверном балансе;
платёжный провайдер для пополнения нужно подключить отдельно. Уже сохранённые
балансы, заказы и административные права этим обновлением не сбрасываются.

После резервного копирования (раздел 6) выполните в PuTTY на сервере:

```bash
cd /opt/gprn
git pull --ff-only origin master
sudo docker compose --env-file .env.production -f docker-compose.production.yml build api
sudo docker compose --env-file .env.production -f docker-compose.production.yml run --rm --no-deps migrate
sudo docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-build --no-deps --force-recreate api web
sudo docker compose --env-file .env.production -f docker-compose.production.yml exec -T -e NODE_OPTIONS=--max-old-space-size=384 api timeout -k 5 300 pnpm db:seed:demo-products
```

Миграция `0010_digital_product_cards` добавляет поля в существующую таблицу
товаров, без сброса пользователей, кошельков, портфолио и соревнований.
Команда подготовки демо сохраняет 34 существующие демонстрационные карточки
восемью коллекциями авторов: 24 пресета и 10 LUT. Для каждой используется
разная стоковая фотография из Unsplash, отдельная обработанная обложка и
рассчитанные цвета. Создаются настоящие примерные XMP/CUBE-файлы.
Иллюстративная цена не списывается за демо; кнопка скачивает демо-файл.

Команда изменяет только зарезервированные демонстрационные аккаунты и товары.
Для трёх демонстрационных экспертов без серверного профиля создаётся
неавторизуемый профиль без пароля. Существующие реальные и административные
аккаунты не меняются. Повторный запуск сохраняет редактирование/скрытие
демо-товаров и готовит только отсутствующие карточки. Основные демо-мастера
должны уже существовать; общий `db:seed` на рабочей базе не запускайте.

Подготовка выполняется одноразово без временных файлов: один поток Sharp,
32 МБ его кеша, лимит JS-кучи 384 МБ и 300 секунд с принудительной остановкой.
После прерывания можно повторить ту же команду; созданные товары сохраняются.
Обложки остаются в публичном хранилище `demo/products/v1/`, файлы в закрытом:
это материалы сайта, а не временные диагностические артефакты.
