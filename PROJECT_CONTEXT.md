# TuneCloud — Architecture & State Checkpoint

## Стек и причины выбора

| Компонент | Технология | Почему |
|-----------|-----------|--------|
| **Backend** | Node.js 22 + Fastify 4 | Асинхронный I/O, встроенный парсер JSON, хуки, автовалидация. Лёгкий |
| **Media parsing** | music-metadata 7 + node-id3 | Первый читает 20+ форматов (FLAC, MP4, Ogg, Wav…), второй пишет ID3 в MP3 |
| **DB** | PostgreSQL 16 | Надёжная, JSONB на будущее, UNIQUE constraints для дедупликации |
| **Frontend** | React 18 + Vite 5 + Tailwind 3 | Быстрая HMR сборка, zero-runtime CSS, utility-first для тёмной темы |
| **Auth** | bcrypt + jsonwebtoken | JWT с ролями admin/user, 7 дней TTL |
| **CD** | Docker Compose / Kubernetes | Dev через docker-compose, prod через ArgoCD GitOps |

## Структура репозитория

```
tunecloud/
├── package.json                 # корневые скрипты (dev, build, db:migrate)
├── docker-compose.yml           # PostgreSQL + API + Client
├── .gitignore
├── PROJECT_CONTEXT.md
│
├── server/
│   ├── package.json
│   ├── .env                     # DATABASE_URL, MUSIC_DIR, SPOTIFY_*, JWT_SECRET
│   ├── Dockerfile               # Multi-stage build (node:22-alpine)
│   └── src/
│       ├── index.js             # Fastify entry, cors, static, routes, admin seed
│       ├── db.js                # pg pool + initDb (применение schema.sql)
│       ├── schema.sql           # artists / albums / tracks / users + индексы
│       ├── auth.js              # bcrypt + JWT + requireAuth/requireAdmin
│       ├── scanner.js           # glob → parseFile → upsertTrack + fallback
│       ├── cover.js             # извлечение обложек из тегов + cover.jpg
│       ├── spotify.js           # OAuth2 + searchArtist + getArtistImage + кэш
│       └── routes/
│           ├── auth.js          # register, login, me, users
│           ├── browse.js        # /browse/dirs, /browse/tree
│           ├── stream.js        # /stream/:id (Range + hijack)
│           ├── tracks.js        # /tracks, /albums, /artists, /search
│           ├── scan.js          # /scan, /scan/file, /scan/status
│           ├── tags.js          # GET/PUT /tags/:id
│           ├── cover.js         # /cover/:filename, /cover/album/:id
│           └── spotify.js       # /spotify/artist?name=
│
├── client/
│   ├── package.json
│   ├── vite.config.js           # proxy /api → :4000
│   ├── tailwind.config.js       # surface palette, glass shadows
│   ├── Dockerfile               # Multi-stage build (node → nginx)
│   └── src/
│       ├── main.jsx             # React entry
│       ├── index.css            # Tailwind + кастомные классы
│       ├── api.js               # fetchJson + все эндпоинты + JWT
│       └── App.jsx              # всё приложение (SFC)
│
└── self-gitops/                 # Kubernetes манифесты (ArgoCD)
    ├── server-deployment.yaml
    ├── server-service.yaml
    ├── client-deployment.yaml
    ├── client-service.yaml
    ├── postgres-deployment.yaml
    ├── postgres-service.yaml
    ├── postgres-configmap.yaml
    ├── postgres-pvc.yaml
    └── covers-pvc.yaml
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
- `POST /scan` — полное сканирование MUSIC_DIR (admin only). Удаляет stale треки, извлекает обложки
- `POST /scan/file` — сканирование одного файла (admin only)
- `GET /scan/status` — totalFiles vs indexedTracks

**Tags:**
- `GET /tags/:id` — чтение ID3 (только MP3)
- `PUT /tags/:id` — запись ID3 (title, artist, album, trackNumber, genre, year)

**Covers:**
- `GET /cover/:filename` — обложка по имени файла (hijack + cache-control 24h)
- `GET /cover/album/:id` — обложка альбома по ID

**Spotify:**
- `GET /spotify/artist?name=` — точный поиск, возвращает {id, name, image, thumbnail, followers, genres}

### Frontend

- **Sidebar** — Browse / Albums / Artists / Search + Rescan Library + Logout
- **LoginView** — JWT авторизация, форма логина
- **AdminView** — создание пользователей, список с ролями
- **BrowseView** — файловый браузер по директориям с breadcrumbs, таблица треков
- **AlbumsView** — сетка альбомов с обложками, клик → AlbumDetail
- **AlbumDetail** — полноценная страница: обложка 192px, мета, треклист
- **ArtistsView** — список артистов с фото (кэш localStorage), треки сортируются album → track#
- **SearchView** — debounced поиск, результаты с обложками
- **Player** — кастомный UI: обложка, Title + Artist, прогресс-бар, Play/Pause, Prev/Next, Repeat (none/all/one), Shuffle, Volume slider + Mute, Close
- **Queue** — при клике на трек вся текущая таблица становится очередью
- **Document title** — `Артист — Трек` во время проигрывания, `TuneCloud` при закрытии
- **Cover URL** — проверка на дублирование `/api/` через `path.startsWith('/api/')`
- **TrackRow** — play triangle на hover (как Spotify) + двойной клик
- **Изображения** — `pointer-events: none` + `user-select: none` + `draggable="false"` (защита от drag & select)
- **Аватарки артистов** — загружаются при монтировании, кэшируются в `localStorage` (`tunecloud-artist-images`), `Promise.allSettled` для параллельной подгрузки

### Обработка ошибок сканирования

- Если `music-metadata::parseFile()` упал — вставляется **baseline-запись** (filename, size, format)
- `toInt()` хелпер для каста float → integer (bitrate, sample_rate, year…)
- При сканировании удаляются stale треки и пустые альбомы/артисты

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

## Текущий шаг

**MVP готов к использованию.** Основной функционал написан и протестирован:
- Сканирование MP3 + FLAC протестировано на реальной библиотеке
- Стриминг работает (Range requests, хромает FLAC через браузер — проблема браузера)
- Обложки извлекаются из тегов и cover.jpg
- Кастомный плеер с очередью, repeat, shuffle, громкостью
- Артисты подтягиваются через Spotify API, кэшируются на клиенте
- Авторизация (JWT) + роли admin/user
- Docker Compose + Kubernetes (ArgoCD) деплой

## Ближайшие задачи

1. **HLS / адаптивный стриминг** — для FLAC и больших WAV конвертировать в HLS на лету (ffmpeg) или progressive download
2. **Docker-compose production** — nginx reverse proxy, SSL, healthcheck
3. **Теги для FLAC** — поддержка Vorbis comments (read-only)

## Ограничения и важные нюансы

- **Spotify API** — только поиск артистов (не альбомов). Изображения грузятся с CDN
- **ID3 теги** — `node-id3` пишет только в MP3. FLAC/Vorbis comments read-only
- **Cover extraction** — из FLAC тегов читаются, но server/covers чистится только вручную
- **Queue** — не сохраняется в localStorage, сбрасывается при F5
- **Stream route** — использует `hijack()`, что отключает логирование Fastify для этого запроса
- **Производительность** — `glob('**/*.*')` на 10k+ файлов может быть медленным. Для прода нужен watch-режим (inotify)
- **Секреты** — в `.env` и Kubernetes Secrets, не в репозитории
