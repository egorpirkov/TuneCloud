# TuneCloud — Architecture & State Checkpoint

## Стек и причины выбора

| Компонент | Технология | Почему |
|-----------|-----------|--------|
| **Backend** | Node.js 22 + Fastify 4 | Асинхронный I/O, встроенный парсер JSON, хуки, автовалидация. Лёгкий |
| **Media parsing** | music-metadata 7 + node-id3 | Первый читает 20+ форматов (FLAC, MP4, Ogg, Wav…), второй пишет ID3 в MP3 |
| **DB** | PostgreSQL 16 | Надёжная, JSONB на будущее, UNIQUE constraints для дедупликации |
| **Frontend** | React 18 + Vite 5 + Tailwind 3 | Быстрая HMR сборка, zero-runtime CSS, utility-first для тёмной темы |
| **Auth** | bcrypt + jsonwebtoken | JWT с ролями admin/user, 7 дней TTL |
| **Metrics** | fastify-metrics | Prometheus-совместимый `/metrics` эндпоинт, ServiceMonitor в k8s |
| **CD** | Docker Compose / Kubernetes | Dev через docker-compose, prod через ArgoCD GitOps |

## Структура репозитория

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
├── server-deployment.yaml          # Deployment API (ghcr.io image, env, secrets)
├── server-service.yaml             # ClusterIP :4000
├── server-monitor.yaml             # Service + ServiceMonitor для Prometheus (/metrics)
├── postgres-deployment.yaml        # PostgreSQL 16 + init script + readinessProbe
├── postgres-service.yaml           # ClusterIP :5432
├── postgres-configmap.yaml         # init.sql (схема БД)
├── postgres-pvc.yaml               # PersistentVolumeClaim 2Gi (данные)
└── covers-pvc.yaml                 # PersistentVolumeClaim 2Gi (обложки)
```

## Что уже написано / спроектировано

### База данных

- `artists` (id, name UNIQUE, created_at)
- `albums` (id, title, artist_id FK, year, genre, cover_path, UNIQUE title+artist_id)
- `tracks` (id, file_path UNIQUE, file_name, file_size, duration, title, artist_id FK, album_id FK, track_number, disc_number, genre, year, bitrate, sample_rate, format, cover_path, timestamps)
- `users` (id, username UNIQUE, password_hash, is_admin BOOLEAN, created_at)
- Индексы: artist_id, album_id, file_path, title

### API (REST, все через `/api`)

**Auth:**
- `POST /auth/register` — регистрация (admin only)
- `POST /auth/login` — логин, возвращает JWT + user object
- `GET /auth/me` — текущий пользователь по Bearer token
- `GET /auth/users` — список пользователей (admin only)

**Browse:**
- `GET /browse/dirs?dir=...` — листинг файловой системы с метаданными из БД
- `GET /browse/tree` — дерево альбомов с треками (для плейлиста)

**Tracks/Albums/Artists:**
- `GET /tracks` — пагинированный список, sort (title, artist, album, duration, created_at, track_number), LEFT JOIN artists/albums
- `GET /tracks/:id` — детальная запись с artist/album
- `GET /albums` — все альбомы с cover_path, track_count, total duration
- `GET /albums/:id` — треки альбома, ORDER BY disc_number, track_number
- `GET /artists` — все артисты с track_count, album_count
- `GET /search?q=&limit=30` — ILIKE по tracks/albums/artists, возвращает {tracks, albums, artists}

**Streaming:**
- `GET /stream/:id` — Range requests + hijack (без буферизации в память), MIME по формату

**Scanning:**
- `POST /scan` — полное сканирование MUSIC_DIR (admin only). Удаляет stale треки, извлекает обложки, merge дублей
- `POST /scan/file` — сканирование одного файла (admin only)
- `GET /scan/status` — totalFiles vs indexedTracks

**Tags:**
- `GET /tags/:id` — чтение ID3 (MP3 + другие форматы)
- `PUT /tags/:id` — запись ID3 (title, artist, album, trackNumber, genre, year) — только MP3

**Covers:**
- `GET /cover/:filename` — обложка по имени файла (hijack + cache-control 24h)
- `GET /cover/album/:id` — обложка альбома по ID

**Spotify:**
- `GET /spotify/artist?name=` — точный поиск, возвращает {id, name, image, thumbnail, followers, genres}

**Metrics:**
- `GET /metrics` — Prometheus-совместимые метрики (fastify-metrics)

### Frontend

- **Sidebar** — Browse / Albums / Artists / Search + Rescan Library (с state "Scanning...") + Logout
- **LoginView** — JWT авторизация, форма логина
- **AdminView** — создание пользователей, список с ролями
- **BrowseView** — файловый браузер по директориям с breadcrumbs, таблица треков
- **AlbumsView** — сетка альбомов с обложками, клик → AlbumDetail
- **AlbumDetail** — полноценная страница: обложка 192px, мета, треклист
- **ArtistsView** — список артистов с фото (кэш localStorage), треки сортируются album → track#
- **SearchView** — debounced поиск, результаты с обложками
- **Player** — кастомный UI: обложка, Title + Artist, прогресс-бар, Play/Pause, Prev/Next, Repeat (none/all/one), Shuffle, Volume slider + mouse wheel + Mute, Close
- **Queue** — при клике на трек вся текущая таблица становится очередью
- **EditTrackModal** — модалка редактирования тегов (title, artist, album, trackNumber, year, genre), portal через createPortal
- **TrackRow** — play triangle на hover (как Spotify) + двойной клик + три-точечное меню (admin: Edit Tags / non-MP3: Read-only)
- **Document title** — `Артист — Трек` во время проигрывания, `TuneCloud` при закрытии
- **Cover URL** — проверка на дублирование `/api/` через `path.startsWith('/api/')`
- **Изображения** — `pointer-events: none` + `user-select: none` + `draggable="false"` (защита от drag & select)
- **Аватарки артистов** — загружаются при монтировании, кэшируются в `localStorage` (`tunecloud-artist-images`), `Promise.allSettled` для параллельной подгрузки

### Scanner и дедупликация

- `mainArtist(name)` — regex: `/(.+?)\s*(?:feat\.|ft\.|featuring|vs\.?|&|,\s)/i` — отбрасывает всё после合作символа
- `upsertTrack()` — использует `mainArtist()` для artist_id трека
- `mergeDuplicateAlbums()` — одинаковые title → merge в один, приоритет — артист без feat/vs/&
- `mergeDuplicateArtists()` — артист "A (feat. B)" → перенаправляет треки и альбомы на "A", удаляет дубль
- Post-scan cleanup — удаление пустых альбомов и осиротевших артистов
- `upsertTrackBasic()` — fallback при ошибке парсинга (filename, size, format)
- `toInt()` хелпер для каста float → integer (bitrate, sample_rate, year…)

### Spotify API

- Client Credentials flow (bearer token с автообновлением)
- Точный поиск `artist:"${name}"`, фильтр exact match (регистронезависимый)
- Кэш на сервере: `server/covers/artist_{id}.jpg` (серверный `getArtistImage`)
- Кэш на клиенте: `localStorage` (`tunecloud-artist-images`) — мгновенная загрузка при повторном визите

### Авторизация

- JWT (bcrypt хеши, 7 дней TTL)
- `requireAuth` — проверяет Bearer token
- `requireAdmin` — проверяет `is_admin` флаг
- Admin seed при запуске из `ADMIN_USERNAME`/`ADMIN_PASSWORD` env

### CI/CD Pipeline

- `.github/workflows/main.yml` — при пуше в `main`:
  1. Сборка client и server Docker образов
  2. Пуш в `ghcr.io/egorpirkov/tunecloud-{client,server}:sha-XXXXXXX` + `latest`
  3. Клонирование GitOps репозитория, обновление image тегов через `yq`
  4. Автокоммит и пуш в GitOps репозиторий
  5. ArgoCD автоматически синхронизирует кластер

### Инфраструктура (k3s)

- Кластер: k3s на Arch Linux
- Музыка: hostPath `/mnt/HDD/Muzl0` → `/music` в контейнере
- Обложки: PersistentVolumeClaim `covers-pvc` (2Gi)
- Данные БД: PersistentVolumeClaim `postgres-pvc` (2Gi)
- Мониторинг: ServiceMonitor (Prometheus operator) на `/metrics`
- Секреты: `spotify-secret`, `jwt-secret`, `ghcr-secret`

## Текущий шаг

**MVP готов к использованию.** Полный функционал:

- Сканирование MP3 + FLAC протестировано на реальной библиотеке (2200+ треков, 49 артистов)
- Дедупликация альбомов и артистов работает post-scan
- Стриминг работает (Range requests)
- Обложки извлекаются из тегов и cover.jpg
- Кастомный плеер с очередью, repeat, shuffle, громкостью (slider + wheel)
- Редактирование ID3 тегов для MP3
- Артисты подтягиваются через Spotify API, кэшируются на клиенте
- Авторизация (JWT) + роли admin/user
- Docker Compose + Kubernetes (ArgoCD) деплой
- Prometheus метрики на `/metrics` + ServiceMonitor

## Ближайшие задачи

1. **HLS / адаптивный стриминг** — для FLAC и больших WAV конвертировать в HLS на лету (ffmpeg) или progressive download
2. **Docker-compose production** — nginx reverse proxy, SSL, healthcheck
3. **Теги для FLAC** — поддержка Vorbis comments (read-only; запись нет JS-библиотеки, taglib отклонён)

## Ограничения и важные нюансы

- **Spotify API** — только поиск артистов (не альбомов). Изображения грузятся с CDN
- **ID3 теги** — `node-id3` пишет только в MP3. FLAC/Vorbis comments — read-only. Нет JS-библиотеки для записи OGG/Opus/M4A
- **music-metadata** — read-only во всех версиях (включая v11). Нет writeFile. CJS модуль — `import pkg from 'music-metadata'; const { parseFile } = pkg;`
- **Cover extraction** — из FLAC тегов читаются, но server/covers чистится только вручную
- **Queue** — не сохраняется в localStorage, сбрасывается при F5
- **Stream route** — использует `hijack()`, что отключает логирование Fastify для этого запроса
- **Производительность** — `glob('**/*.*')` на 10k+ файлов может быть медленным. Для прода нужен watch-режим (inotify)
- **Sektor view** — `limit: 10000` для треков в ArtistsView. При >10k треков нужно серверная фильтрация
- **Секреты** — в `.env` и Kubernetes Secrets, не в репозитории
