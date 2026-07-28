# TuneCloud

**Self-hosted music browser & player** — кросс между Filebrowser и Navidrome.
Сканирует локальную музыкальную библиотеку, парсит теги, подтягивает обложки и фото артистов через Spotify.

---

## Архитектура

```
┌──────────────┐     ┌──────────────────┐     ┌────────────┐
│   Browser    │ ──→ │   Fastify :4000  │ ──→ │ PostgreSQL │
│  React/Vite  │     │  Node.js 22      │     │    16      │
│  Tailwind 3  │ ←── │  music-metadata  │ ←── │            │
└──────────────┘     │  node-id3        │     └────────────┘
                     │  Spotify OAuth   │
                     │  JWT auth        │
                     │  /metrics        │
                     └──────────────────┘
                              │
                     ┌───────┴───────┐
                     │  /home/music/  │
                     │  (FLAC/MP3/…)  │
                     └───────────────┘
```

### Стек

| Слой | Технология |
|------|-----------|
| **Backend** | Node.js 22 + Fastify 4 |
| **Парсинг медиа** | music-metadata 7 (20+ форматов), node-id3 (ID3v2 запись) |
| **База данных** | PostgreSQL 16 |
| **Фронтенд** | React 18 + Vite 5 + Tailwind CSS 3 |
| **Изображения** | Spotify Web API (Client Credentials), CDN с кэшированием |
| **Авторизация** | JWT (bcrypt + jsonwebtoken), роли admin/user |
| **Метрики** | fastify-metrics → Prometheus `/metrics` |
| **Деплой** | Docker Compose / Kubernetes (ArgoCD GitOps) |

---

## Возможности

- **Сканирование** — рекурсивный обход директории, парсинг метаданных (MP3, FLAC, Ogg, Wav, M4A, AAC, WMA, Opus)
- **Дедупликация** — `mainArtist()` нормализует имена артистов (feat./ft./&/vs → основное имя), постсканировочный merge дублей альбомов и артистов
- **Обложки** — извлекаются из тегов аудиофайлов, из `cover.jpg`/`folder.jpg` в папке альбома
- **Стриминг** — HTML5 Audio с Range-запросами (seek, прогресс)
- **Браузер файлов** — навигация по директориям музыки с breadcrumbs
- **Альбомы** — сетка с обложками, клик → страница альбома (треки, метаданные)
- **Артисты** — список с фотографиями из Spotify (кэшируются в localStorage), треки сгруппированы по альбомам
- **Поиск** — полнотекстовый по трекам, альбомам, артистам (ILIKE)
- **Плеер** — кастомный UI: обложка, прогресс-бар, Prev/Next, Repeat (none/all/one), Shuffle, громкость (slider + mouse wheel), Mute
- **Очередь** — двойной клик или кнопка play запускает весь текущий список
- **Редактирование тегов** — запись ID3 для MP3 (title, artist, album, trackNumber, year, genre), non-MP3 — read-only
- **Spotify** — поиск артистов с точным совпадением имени, подгрузка фото
- **Авторизация** — JWT, роли admin/user, admin-only эндпоинты (scan, register)
- **Аватарки артистов** — загружаются при открытии вкладки, кэшируются в localStorage
- **Метрики** — Prometheus-совместимый эндпоинт `/metrics` (request duration, rate, etc.)

---

## Быстрый старт

### 1. Зависимости

```bash
# Arch Linux
sudo pacman -S nodejs npm postgresql

# или через Docker (только БД)
docker compose up -d
```

### 2. PostgreSQL

```bash
sudo -u postgres initdb -D /var/lib/postgres/data
sudo systemctl start postgresql

sudo -u postgres psql -c "CREATE USER tunecloud WITH PASSWORD 'tunecloud';"
sudo -u postgres psql -c "CREATE DATABASE tunecloud OWNER tunecloud;"
```

### 3. Настройка

```bash
git clone <url> tunecloud
cd tunecloud

cp server/.env.example server/.env
```

**`server/.env`**:
```env
DATABASE_URL=postgresql://tunecloud:tunecloud@localhost:5432/tunecloud
MUSIC_DIR=/home/username/music
PORT=4000
HOST=0.0.0.0
SPOTIFY_CLIENT_ID=your_spotify_id
SPOTIFY_CLIENT_SECRET=your_spotify_secret
JWT_SECRET=your-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-admin-password
```

Spotify API ключи: [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → Create App → Client Credentials.

### 4. Установка

```bash
npm install              # корневые зависимости (concurrently)
cd server && npm install
cd ../client && npm install && npm run build
cd ..
```

### 5. Запуск

```bash
# Всё сразу (сервер + клиент)
npm run dev

# Или по отдельности:
cd server && npm run dev     # API на :4000
cd client && npm run dev     # Vite dev на :5173 (прокси на :4000)
```

### 6. Первое сканирование

Открой `http://localhost:4000` (или `http://localhost:5173` в dev-режиме).
Залогинься под admin → нажми **Rescan Library** в сайдбаре.

---

## API Endpoints

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| POST | `/api/auth/register` | Регистрация пользователя | admin |
| POST | `/api/auth/login` | Логин, возвращает JWT | public |
| GET | `/api/auth/me` | Текущий пользователь | public |
| GET | `/api/auth/users` | Список пользователей | admin |
| GET | `/api/browse/dirs?dir=...` | Файловый браузер | auth |
| GET | `/api/browse/tree` | Дерево альбомов/треков | auth |
| GET | `/api/tracks?sort=&limit=&offset=` | Треки с пагинацией | auth |
| GET | `/api/tracks/:id` | Детально трек | auth |
| GET | `/api/albums` | Все альбомы | auth |
| GET | `/api/albums/:id` | Треки альбома | auth |
| GET | `/api/artists` | Все артисты (track_count, album_count) | auth |
| GET | `/api/search?q=` | Полнотекстовый поиск | auth |
| GET | `/api/stream/:id` | Стрим трека (Range) | auth |
| POST | `/api/scan` | Запуск сканирования | admin |
| POST | `/api/scan/file` | Сканирование одного файла | admin |
| GET | `/api/scan/status` | Статус библиотеки (totalFiles vs indexed) | auth |
| PUT | `/api/tags/:id` | Запись ID3 (MP3) | auth |
| GET | `/api/tags/:id` | Чтение ID3 | auth |
| GET | `/api/cover/:filename` | Обложка по имени файла | public |
| GET | `/api/cover/album/:id` | Обложка альбома | public |
| GET | `/api/spotify/artist?name=` | Поиск артиста в Spotify | auth |
| GET | `/metrics` | Prometheus метрики | public |

---

## Структура проекта

```
tunecloud/                          # Основной репозиторий
├── package.json                    # корневые скрипты (dev, build, db:migrate)
├── docker-compose.yml              # PostgreSQL + API + Client
├── .github/workflows/main.yml      # CI: build → push ghcr.io → update gitops
├── .gitignore
├── PROJECT_CONTEXT.md
│
├── server/
│   ├── package.json
│   ├── .env                        # DATABASE_URL, MUSIC_DIR, SPOTIFY_*, JWT_SECRET
│   ├── Dockerfile                  # Multi-stage build (node:22-alpine)
│   └── src/
│       ├── index.js                # Fastify entry, cors, static, fastify-metrics, routes, admin seed
│       ├── db.js                   # pg pool + initDb (применение schema.sql)
│       ├── schema.sql              # artists / albums / tracks / users + индексы
│       ├── auth.js                 # bcrypt + JWT + requireAuth/requireAdmin
│       ├── scanner.js              # glob → parseFile → upsertTrack + mainArtist dedup + merge
│       ├── cover.js                # извлечение обложек из тегов + cover.jpg
│       ├── spotify.js              # OAuth2 + searchArtist + getArtistImage + кэш
│       └── routes/
│           ├── auth.js             # register, login, me, users
│           ├── browse.js           # /browse/dirs, /browse/tree
│           ├── stream.js           # /stream/:id (Range + hijack)
│           ├── tracks.js           # /tracks, /albums, /artists, /search
│           ├── scan.js             # /scan, /scan/file, /scan/status
│           ├── tags.js             # GET/PUT /tags/:id (node-id3 для MP3)
│           ├── cover.js            # /cover/:filename, /cover/album/:id
│           └── spotify.js          # /spotify/artist?name=
│
└── client/
    ├── package.json
    ├── vite.config.js              # proxy /api → :4000
    ├── tailwind.config.js          # surface palette, glass shadows
    ├── nginx.conf                  # SPA + proxy_pass /api/ → server:4000
    ├── Dockerfile                  # Multi-stage build (node → nginx)
    └── src/
        ├── main.jsx                # React entry
        ├── index.css               # Tailwind + кастомные классы
        ├── api.js                  # fetchJson + все эндпоинты + JWT
        └── App.jsx                 # всё приложение (SFC)
```

GitOps манифесты в отдельном репозитории `egorpirkov/TuneCloud-GitOps`:
```
TuneCloud-GitOps/
├── client-deployment.yaml          # Deployment Nginx (ghcr.io image)
├── client-service.yaml             # NodePort :30080
├── server-deployment.yaml          # Deployment API (ghcr.io image, secrets)
├── server-service.yaml             # ClusterIP :4000
├── server-monitor.yaml             # Service + ServiceMonitor для Prometheus
├── postgres-deployment.yaml        # PostgreSQL 16 + init script + readinessProbe
├── postgres-service.yaml           # ClusterIP :5432
├── postgres-configmap.yaml         # init.sql (схема БД)
├── postgres-pvc.yaml               # PersistentVolumeClaim 2Gi (данные)
└── covers-pvc.yaml                 # PersistentVolumeClaim 2Gi (обложки)
```

---

## Деплой

### Docker Compose

```bash
# Запуск всего стека
docker compose up -d

# Сборка
docker compose build

# Логи
docker compose logs -f api
```

Сервисы:
- **db** — PostgreSQL 16 (port 5432)
- **api** — Fastify сервер (port 4000)
- **web** — Nginx + статика (port 80)

### Kubernetes (ArgoCD GitOps)

Кластер: **k3s** (Arch Linux, `/mnt/HDD/Muzl0` — музыка).

| Ресурс | Описание |
|--------|----------|
| `server-deployment.yaml` | Deployment API (ghcr.io image, env: DATABASE_URL, MUSIC_DIR, ADMIN_*, secrets) |
| `server-service.yaml` | ClusterIP Service :4000 |
| `server-monitor.yaml` | Service + ServiceMonitor (Prometheus, `/metrics`) |
| `client-deployment.yaml` | Deployment Nginx (ghcr.io image) |
| `client-service.yaml` | NodePort :30080 |
| `postgres-deployment.yaml` | PostgreSQL 16 + init script + readinessProbe |
| `postgres-service.yaml` | ClusterIP Service :5432 |
| `postgres-configmap.yaml` | init.sql (схема БД) |
| `postgres-pvc.yaml` | PersistentVolumeClaim 2Gi (данные) |
| `covers-pvc.yaml` | PersistentVolumeClaim 2Gi (обложки) |

Деплой:
1. Push в `main` → GitHub Actions собирает образы → пушит в `ghcr.io/egorpirkov/` с тегами `sha-XXXXXXX`
2. GitHub Actions обновляет image tags в GitOps репозитории и пушит
3. ArgoCD синхронизирует кластер с GitOps репозиторием
4. Секреты (`spotify-secret`, `jwt-secret`, `ghcr-secret`) — Kubernetes Secrets

---

## База данных

```sql
artists   (id, name UNIQUE, created_at)
albums    (id, title, artist_id FK, year, genre, cover_path, UNIQUE title+artist_id)
tracks    (id, file_path UNIQUE, file_name, file_size, duration, title, artist_id FK,
           album_id FK, track_number, disc_number, genre, year, bitrate, sample_rate,
           format, cover_path, timestamps)
users     (id, username UNIQUE, password_hash, is_admin, created_at)
```

Индексы: `tracks.artist_id`, `tracks.album_id`, `tracks.file_path`, `tracks.title`.

---

## Особенности

- **mainArtist()** — нормализация имён артистов: `feat.`, `ft.`, `featuring`, `vs.`, `&`, `, ` → отбрасывается всё после. Используется для дедупликации и при сканировании, и при merge
- **Дедупликация альбомов** — `mergeDuplicateAlbums()` после сканирования: одинаковые title → merge, приоритет — артист без feat/vs
- **Дедупликация артистов** — `mergeDuplicateArtists()`: артист "A (feat. B)" → перенаправляется на "A"
- **Stale cleanup** — при сканировании удаляются треки, которых нет на диске + пустые альбомы/артисты
- **FLAC**: битрейт во float (до 1 Mbps) — `toInt()` хелпер приводит к integer для PostgreSQL
- **Обложки**: если в тегах нет картинки, ищется `cover.jpg`/`folder.jpg`/`front.jpg` в директории трека
- **Spotify**: точный поиск `artist:"${name}"`, фильтр exact match (регистронезависимый)
- **Очередь**: при клике на трек все треки текущего вью становятся очередью для Prev/Next/Shuffle
- **Volume**: сохраняется в `localStorage`, mouse wheel ±5%
- **Hijack**: stream и cover роуты используют `reply.hijack()` — Fastify отдаёт управление Node.js raw response
- **Scanner**: при ошибке парсинга вставляется baseline-запись (filename, size, format)
- **Автоматический seed**: при запуске создаётся admin-пользователь из `ADMIN_USERNAME`/`ADMIN_PASSWORD`
- **Теги**: запись только для MP3 (node-id3). FLAC/OGG/Opus/M4A — read-only (нет JS-библиотеки для записи)
- **Scan UI**: кнопка блокируется во время сканирования, показывает "Scanning...", тост без reload

---

## License

GPL v3.0
