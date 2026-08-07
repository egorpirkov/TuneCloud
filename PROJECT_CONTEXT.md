# TuneCloud — Architecture & State Checkpoint

> Назначение этого файла — дать LLM (или новому разработчику) полное и точное
> представление о проекте с одного прочтения. Здесь нет инструкций по запуску
> из коробки и лишней маркетинговой воды — только факты о коде, данных и инфраструктуре.

---

## Стек и причины выбора

| Компонент | Технология | Почему |
|-----------|-----------|--------|
| **Backend** | Node.js 22 + Fastify 4 (ESM) | Асинхронный I/O, встроенный парсер JSON, лёгкий. Через `@fastify/cors`, `@fastify/static` |
| **Media parsing** | `music-metadata` 7 + `node-id3` | Первый **только читает** метаданные 20+ форматов (FLAC, MP4, Ogg, Wav…); второй пишет ID3 в MP3 |
| **DB** | PostgreSQL 16 (`pg.Pool`) | Надёжная, UNIQUE-constraints для дедупликации |
| **Frontend** | React 18 + Vite 5 + Tailwind 3 | Быстрая HMR, utility-first CSS, тёмная тема, mobile-first |
| **Auth** | `bcrypt` + `jsonwebtoken` | JWT с ролями admin/user, TTL 7 дней |
| **Metrics** | `fastify-metrics` + `prom-client` | `/metrics` в формате Prometheus + собственные метрики приложения |
| **CD** | Docker Compose (dev) / Docker images (prod) | Образы собираются в CI |

---

## Структура репозитория

```
tunecloud/
├── package.json                  # корневые скрипты (dev, build, db:migrate)
├── docker-compose.yml            # PostgreSQL + API + Client (dev)
├── .github/workflows/main.yml    # CI: build → push ghcr.io → update GitOps
├── .gitignore                    # .env, spotify-keys.txt, server/covers/, node_modules, dist
├── PROJECT_CONTEXT.md
│
├── server/
│   ├── package.json              # ESM, "dev": node --watch src/index.js
│   ├── .env.example              # DATABASE_URL, MUSIC_DIR, PORT, HOST, SPOTIFY_*, JWT_SECRET, ADMIN_*
│   ├── Dockerfile                # multi-stage (node:22-alpine), USER node, EXPOSE 4000
│   ├── covers/                   # извлечённые обложки + кэш артистов Spotify (.gitignore'd)
│   └── src/
│       ├── index.js              # Fastify entry: cors, static, fastify-metrics, custom metrics, routes, seed admin, SPA fallback
│       ├── db.js                 # pg Pool + initDb (применение schema.sql), query/getClient/export pool
│       ├── schema.sql            # artists / albums / tracks / users + индексы
│       ├── auth.js               # bcrypt + JWT + requireAuth/requireAdmin, seed-логика в index.js
│       ├── scanner.js            # glob → parseFile → upsertTrack + mainArtist dedup + cover + cleanup
│       ├── cover.js              # обложки и фото артистов из тегов / cover.jpg / Spotify
│       ├── metrics.js            # кастомные метрики tunecloud_*: library, scan, stream, build, up
│       ├── spotify.js            # OAuth2 client-credentials + searchArtist + кэш картинок артистов
│       └── routes/
│           ├── auth.js           # register, login, me, users
│           ├── browse.js         # /browse/dirs, /browse/tree
│           ├── stream.js         # /stream/:id (Range + hijack + метрики байт/активных)
│           ├── tracks.js         # /tracks, /albums, /artists, /search + :id детали
│           ├── scan.js           # /scan, /scan/file, /scan/status
│           ├── tags.js           # GET/PUT /tags/:id (MP3 — запись, остальное read-only)
│           ├── cover.js          # /cover/:filename, /cover/album/:id
│           └── spotify.js        # /spotify/artist?name=
│
└── client/
    ├── package.json              # vite, react, tailwind
    ├── vite.config.js            # dev proxy /api → :4000
    ├── tailwind.config.js        # palette surface, glass shadows
    ├── nginx.conf                # SPA try_files + proxy_pass /api → server:4000
    ├── Dockerfile                # multi-stage: build (node) → serve (nginx:alpine), EXPOSE 80
    ├── public/                   # favicon.ico, apple-touch-icon, android-chrome, site.webmanifest
    └── src/
        ├── main.jsx            # React entry
        ├── index.css           # Tailwind base + кастомные классы (btn, card, glass, pb-safe)
        ├── api.js              # fetchJson + все эндпоинты + JWT-обработка
        └── App.jsx             # весь SPA (915 строк): компоненты + глобальный state
```

GitOps-манифесты — **отдельный репозиторий** `egorpirkov/TuneCloud-GitOps` (Helm chart `tunecloud`, v0.1.0), CI-патчит его `values.yaml` и пушит, а ArgoCD синхронизирует кластер с этим репо.

---

## База данных

### schema.sql (таблицы + индексы)

- `artists (id SERIAL PK, name TEXT UNIQUE NOT NULL, created_at DEFAULT NOW())`
- `albums (id PK, title TEXT, artist_id FK→artists ON DELETE CASCADE, year, genre, cover_path, created_at, UNIQUE(title, artist_id))`
- `tracks (id PK, file_path TEXT UNIQUE, file_name, file_size BIGINT, duration REAL, title, artist_id FK→artists ON DELETE SET NULL, album_id FK→albums ON DELETE SET NULL, track_number, disc_number DEFAULT 1, genre, year, bitrate, sample_rate, format, cover_path, created_at, updated_at)`
- `users (id PK, username TEXT UNIQUE, password_hash, is_admin BOOLEAN DEFAULT false, created_at)` — `ALTER TABLE ADD COLUMN IF NOT EXISTS is_admin` для миграции старых БД
- Индексы: `tracks(artist_id)`, `tracks(album_id)`, `tracks(file_path)`, `tracks(title)`

`db.initDb()` применяет `schema.sql` (идемпотентно, `IF NOT EXISTS`) при каждом старте. Все запросы ходят через `query()` из единого `pg.Pool`.

---

## API (REST, все через `/api`)

Логгер всех запросов — Fastify-logger. Приватные эндпоинты — через `preHandler: requireAdmin` / `requireAuth`.

**Auth** (`routes/auth.js`, требует `requireAdmin` для register/users):
- `POST /auth/register` — создать пользователя (admin only; пароль ≥ 4 символа, 409 если имя занято)
- `POST /auth/login` — `{token, user:{id, username, is_admin}}`
- `GET /auth/me` — валидирует Bearer и возвращает `{authenticated, user}` (без падения на невалидном токене)
- `GET /auth/users` — список `id, username, is_admin, created_at`

**Browse** (`routes/browse.js`):
- `GET /browse/dirs?dir=` — листинг папки в MUSIC_DIR. Возвращает `[{name,path,type:'dir'}]` и `[{name,path,type:'file',meta}]`; для аудио файла `meta` = строка из БД по `file_path` (LEFT JOIN artists/albums) — **иначе `null`**. использует `path.resolve` + проверку `startsWith(musicDir)` против path-traversal. Запросы **не** защищены auth (browse публичен)
- `GET /browse/tree` — группировка треков в альбомы с треклистом (плейлист: `ORDER BY al.title, t.disc_number, COALESCE(t.track_number, 999), t.file_name`)

**Tracks/Albums/Artists** (`routes/tracks.js`):
- `GET /tracks?limit=50&offset=0&sort=title&order=asc` — пагинация; `sort` в `{title, artist, album, duration, created_at, track_number}` (artist/album — вложенная сортировка, тие-брейк `COALESCE(track_number,999), t.file_name`). Возвращает `{tracks, total}`
- `GET /tracks/:id` — `SELECT t.* , artist, album` — 404, если нет
- `GET /albums` — каждый со `track_count` и суммарным `duration` (подзапросы), `ORDER BY title`
- `GET /albums/:id` — треки альбома (JOIN+cover_path), `ORDER BY disc_number, COALESCE(track_number,999), file_name`
- `GET /artists` — с `track_count` и `album_count`, `ORDER BY name`
- `GET /search?q=&limit=30` — ILIKE по трём таблицам: `{tracks (с cover_path), albums, artists (с counts)}`. `ILIKE $1` где `%q%`

**Streaming** (`routes/stream.js`):
- `GET /stream/:id` — Range-запросы (206 с Content-Range) или полная отдача (200). `reply.hijack()` + `fs.createReadStream`. MIME через карту `MIME_TYPES` (mp3/flac/ogg/wav/m4a/aac/wma/opus). Ошибка чтения → `res.end()`. Обёрнут в `pipeWithTracking` (см. Metrics).

**Scanning** (`routes/scan.js`):
- `POST /scan` (admin) — полный скан MUSIC_DIR. Сначала проверяет `fs.existsSync`, вызывает `scanDirectory`, фиксирует длительность и пишет метрики (`recordScan`).
- `POST /scan/file` (admin) — скан одного файла; проверяет `filePath.startsWith(musicDir)` (403 вне муз. каталога), существование (404)
- `GET /scan/status` — glob файлов аудио (8 расширений) vs `COUNT(*) tracks`: `{totalFiles, indexedTracks, remaining}`

**Tags** (`routes/tags.js`):
- `GET /tags/:id` — чтение метаданных (MP3, FLAC, OGG, OPUS, M4A, AAC, WMA, WAV). Парсит через `parseFile`; отдаёт `{title, artist, album, track, year, genre}`
- `PUT /tags/:id` (auth) — запись ID3 **только для MP3** (иначе 400). Валидируемое через `node-id3.writeTags`. После записи обновляет БД: `title/genre/year/track_number`, и `artist_id` (через `ensureArtist`) / `album_id` (через `ensureAlbum` при изменении album). Если запись в файл упала — 500, БД не трогается.

**Covers** (`routes/cover.js`):
- `GET /cover/:filename` / `GET /cover/album/:id` — сервера обложек из `server/covers/`. `path.basename` против traversal, MIME по расширению (png/webp/jpeg), `Cache-Control: max-age=86400`, `hijack()`.

**Spotify** (`routes/spotify.js`):
- `GET /spotify/artist?name=` — `{found:bool, artist:{id,name,image,thumbnail,followers,genres}}`. Если ключей нет / ничего не нашлось → `{found:false}`.

**Metrics**:
- `GET /metrics` — Prometheus-формат (fastify-metrics): дефолтные + кастомные `tunecloud_*` (см. раздел Metrics).

---

## Backend — ключевые классы логики

### Auth (`auth.js`)
- `hashPassword` (`bcrypt.hash`, 10 salt), `verifyPassword`
- `signToken(user)` — JWT с `{id, username, is_admin}`, `expiresIn: 7d`, секрет `JWT_SECRET` (fallback `'change-me-in-production'`)
- `verifyToken`, `requireAuth` (401 без валидного Bearer, кладёт payload в `req.user`), `requireAdmin` (401/403 по флагу `is_admin`)
- **Admin seed** в `index.js`: при старте, если указан `ADMIN_PASSWORD`, создаёт/повышает до `is_admin=true` пользователя `ADMIN_USERNAME` (default `admin`)

### Scanner & дедупликация (`scanner.js`)
- `AUDIO_EXTENSIONS` = mp3/flac/ogg/wav/m4a/aac/wma/opus; `isAudioFile` по `path.extname`
- `ensureArtist` / `ensureAlbum` — UPSERT через `ON CONFLICT` (artist по `name`, album по `(title, artist_id)`, «год/жанр» на Conflict обновляются через `COALESCE`)
- `toInt(v)` — безопасный каст float→int
- `mainArtist(name)` — regex `/(.+?)\s*(?:feat\.|ft\.|featuring|vs\.?|&, \s)/i` — отрезает фича-суффикс; используется как `artist_id` трека и `albumArtist`
- `upsertTrack` — парсит метаданные (`parseFile` c `skipCovers:true`), stat файла; INSERT..ON CONFLICT (file_path) DO UPDATE с `COALESCE` для первичных полей, затем tёплый `extractCoverFromTrack` при наличии albumId
- `upsertTrackBasic` — fallback при ошибке парсинга (filename/size/format только)
- `mergeDuplicateAlbums` — группирует одинаковые `title`, выбирает главный (приоритет артисту без feat/vs/&, tie-break по кол-ву треков), переносит треки, удаляет дубли. Потом чистка сирот
- `mergeDuplicateArtists` — артист «A (feat. B)» → `mainArtist` → перенаправляет треки/альбомы на «A», удаляет дубль
- `scanDirectory` — glob `**/*.*`, фильтр по аудио, upsert всех, **удалить старые** треки по `file_path LIKE musicDir% AND file_path != ALL(scannedPaths)`, чистка пустых albums/artists, `extractAllMissingCovers`, merges, возвращает `{total, processed, covers, removed, merged, artistsMerged}` + вызывает `recordScan`
- `scanSingleFile` — парсинг + upsert одного файла (fallback basic)

### Cover (`cover.js`)
- `COVERS_DIR = server/covers`; `initCoversDir` создаёт при старте
- `saveCoverBuffer(buf, format, albumId)` → пишет `album_<id>.<ext>` и возвращает `/api/cover/<file>`
- `extractAlbumCover` — ищет `cover.jpg/png, folder.jpg, front.jpg, Cover.jpg` в папке альбома; если нашли — копирует
- `extractCoverFromTrack` — если у альбома ещё нет обложки: парсит теги (картинка) → `saveCoverBuffer`; иначе `extractAlbumCover` по папке файла
- `extractAllMissingCovers` — для всех альбомов без `cover_path` берёт по одному образцу трека и вытягивает
- `coverUrl(filename)` — проверка существования файла по basename

### Spotify (`spotify.js`)
- Client Credentials: `getAccessToken` — POST `/api/token`, базовый auth из `SPOTIFY_CLIENT_ID/SECRET`, кэш токена с автообновлением (минус 60s до expiry). Нет ключей → `null`
- `searchArtist(name)` — `artist:"<name>"` exact-поиск, нормализация регистра, `find` точного совпадения или первый результат; только если есть картинки; отдаёт `id,name,image(крупнейш),thumbnail,followers,genres`
- `getArtistImage` — кэш `artist_<dbId>.jpg` в `server/covers/`; при отсутствии скачивает CDN картинку, возвращает `/api/cover/artist_<dbId>.jpg`

### Metrics (`metrics.js`)
Регистрирует кастомные метрики через `fastify.metrics.client` (общий prom-client реестр), поэтому они видны на том же `/metrics`. Префикс `tunecloud_`:
- `tunecloud_build_info{version}` = 1 (версия из `server/package.json`)
- `tunecloud_up` — 1/0 по состоянию БД-запроса (liveness/DB check)
- Library gauges: `tunecloud_library_tracks_total`, `_albums_total`, `_artists_total`, `_users_total`, `_duration_seconds_total`, `_size_bytes_total` — обновляются каждые 60 s (`setInterval`, `unref()`) и после каждого скана (`recordScan`)
- Last scan: `tunecloud_scan_last_timestamp_seconds`, `_duration_seconds`, `_files_total`, `_processed_total`, `_covers_total`, `_removed_total`, `_merged_albums_total`, `_merged_artists_total`
- Stream: `tunecloud_stream_active_connections` (gauge), `tunecloud_stream_requests_total` (counter), `tunecloud_stream_bytes_total` (counter)

Экспортные хелперы:
- `setupCustomMetrics(fastify)` — создание метрик (идемпотентно), фоновый refresh
- `refreshLibraryStats()` — один агрегатный SQL-запрос статуса библиотеки + `tunecloud_up`
- `recordScan(result, durationSeconds)` — пишет результат скана и вызывает refresh
- `streamOpened()` / `streamClosed(bytes)` — трекинг стримов

`stream.js` инжектится через `pipeWithTracking(fileStream, res)`, который вызывает `streamOpened()` перед пайпом и `streamClosed(bytes)` при `finish`/`close`/`error` (с защитой от двойного вызова), считая и отдаваемые байты.

---

## Frontend (React SPA, `App.jsx` — единственный файл UI, ~900 строк)

**Global state (`App`)**: `user`, `authLoading`, `view` (browse/albums/album/artists/artist/search/admin), `selectedAlbum`/`selectedArtist`, `queue`, `queueIndex`, `repeat` (none/all/one), `shuffle`, `volume` (localStorage `tunecloud-volume`), `scanVersion`, `navHistory`, `browsePath`, `sidebarOpen`.

**Авторизация**: `api.js` держит токен в `localStorage['tunecloud-token']`, каждый запрос добавляет `Authorization: Bearer`. Стартовая проверка `auth/me`. Без юзера → `LoginView`.

**Плеер (`Player`)**: `<audio>` с `autoPlay`, кастомный UI (обложка→заголовок→артист, прогресс-бар, Play/Pause, Prev/Next, Repeat циклически none→all→one, Shuffle, громкость slider + mouse wheel + mute, Close). `document.title = «Артист — Трек»`. **Media Session API**: `metadata` (title/artist/album/artwork) + обработчики play/pause/prev/next. На мобилке — компактный (без прогресс-бара, shuffle, repeat и громкости), safe-area `pb-safe`.

**Очередь**: `handlePlay(track, list)` — вся текущая таблица становится очередью; `pickNext`/`pickPrev` учитывают shuffle и repeat ('all' → циклическая); `closePlayer` сбрасывает и меняет title. Очередь **не** сохраняется в localStorage (сбрасывается при F5).

**Навигация/поведение**:
- `navHistory` stack для Back (Album/Artist → prev view); logo/кнопка Brows e сохраняет `browsePath` глобально
- `scanVersion` counter → `key={scanVersion}` на Browse/Albums/Artists → remount + re-fetch после скана
- `browsePath` в App — путь файлового браузера сохраняется между mount/unmount

**Компоненты**:
- `Sidebar` — Browse/Albums/Artists/Search + Rescan Library + Logout + Admin icon (для is_admin). Мобильный drawer (hamburger → slide-in + overlay, закрытие тапом вне/крестиком); десктоп — статично
- `MobileHeader` — встроен в main: ☰ hamburger + logo (только < lg)
- `BrowseView` — breadcrumbs, папки (сетка) + файлы (таблица `TrackRow`); скрытые колонки на мобилке
- `AlbumsView` — responsive grid (2→…→6 колонок), фильтр по title/artist, клик → AlbumDetail, показ track_count/duration
- `AlbumDetail` — обложка + мета + треклист, Back
- `ArtistsView` — сетка карточек, фото артистов загружаются через Spotify (кэш в `tunecloud-artist-images`, `Promise.allSettled`), responsive grid
- `ArtistDetail` — обложка, статистика (album_count из Set), треки сгруппированы по альбомам
- `SearchView` — debounce 300ms, кликабельные art/album/artist → их страницы
- `LoginView` — форма логин/регистрация
- `AdminView` — создание пользователей + список с ролью/датой
- `EditTrackModal` + `TrackRow` — Portal (createPortal, position:fixed, z-[200]); TrackRow: play triangle на hover, double-click play, ⋮-меню → Go to Album / Go to Artist (forall), Edit Tags (admin, MP3) / Read-only (admin, non-MP3)

**Прочее**: toast-система (`toastListeners` + `ToastContainer`), документ заголовок, запрет drag/select на изображениях (через CSS), touch-таргеты на мобильных.

### `api.js`
Центральный HTTP-клиент: `fetchJson` унифицирует headers (Content-Type + Bearer), обрабатывает ошибки через `.json().error`, все эндпоинты, `streamUrl`, `coverUrl` (нормализует `/api/` префикс), `albumCover`.

### CSS (`index.css`)
`tailwind base/components/utilities`, кастомные `.btn`, `.card`, `.glass`, `.input`, фоновый градиент на body, тонкий скроллбар, `user-select/drag` защита изображений, анимация тостов, `pb-safe` для iOS.

---

## Наблюдаемость / Операции

- `GET /metrics` отдаёт стандартные (node, prometheus) + `tunecloud_*`. ServiceMonitor (в GitOps) скрейпит `/metrics` сервера.
- Готовый Grafana **дашборд** (библиотека, размер, duration, активные стримы rate запросов/байт, статистика последнего скана) сгенерирован ранее и лежит вне репозитория (`/home/pirkov/tunecloud-grafana-dashboard.json`); при желании добавить в репо — перенести и поправить путь.
- Мониторинг стека: kube-prometheus-stack (Prometheus + Grafana + Alertmanager) в namespace `monitoring`, `grafana.tunecloud.local`.

---

## CI/CD, Docker & GitOps

### Dockerfiles
- **server**: `node:22-alpine` — builder копирует `package*.json` + `npm ci --only=production`, runtime под `USER node` (non-root), `EXPOSE 4000`, `CMD node src/index.js`
- **client**: builder `npm ci` → `npm run build` → `npm prune --production` → copy `dist` в `nginx:alpine`. `nginx.conf`: try_files SPA + `/api/` → `proxy_pass http://tunecloud-server:4000/api/` (proxy_buffering off, read_timeout 3600s, upgrade headers).

### docker-compose.yml (dev)
- `db`: postgres:16-alpine, volume `pgdata`, авто-init `schema.sql`, healthcheck `pg_isready`, exposed 5432
- `api`: build `./server`, env `DATABASE_URL` на `db:5432`, `MUSIC_DIR` (x-env, default `/home/pirkov/music`), mount `/music:ro` + covers volume, `depends_on` з healthcheck
- `web`: build `./client`, exposed 80
- Три named volume: pgdata, covers_data

### GitHub Actions (`.github/workflows/main.yml` — триггер push в `main`)
1. **build-and-push**: login GHCR → metadata (tags `latest` + `sha-<short>`), build+push `tunecloud-client` и `tunecloud-server` в `ghcr.io/<owner>/`
2. **update-gitops** (needs build): checkout репо `egorpirkov/TuneCloud-GitOps` с `GITOPS_REPO_PAT` → патчит `yq -i` image теги в `values.yaml` → автокоммит `chore(deploy): update tunecloud images to sha-…`
3. **ArgoCD** замечает изменение в GitOps-репозитории и синхронизирует кластер в строгом GitOps (zero-downtime)

### Production (Helm + ArgoCD)
- Хельм chart в `TuneCloud-GitOps`/tunecloud (v0.1.0): Deployments client/server/db, PVC `covers-pvc` + `postgres-pvc` (2Gi), `postgres-configmap` (init.sql), Ingress `tunecloud.local` (client :80, `/api` → server:4000), `grafana-ingress.yaml`, ServiceMonitors server/postgres-exporter, Secrets внешние (ghcr, spotify, jwt), hostPath `/mnt/HDD/Muzl0` → `/music`.

---

## Ограничения и важные нюансы (must-read при работе с кодом)

- **ID3**: запись только в MP3 (`node-id3`); FLAC/OGG и прочие — read-only. Нет JS-библиотеки для записи OGG/Opus/M4A.
- **music-metadata** — только чтение (включая v11). CJS-модуль; импортируется как `import pkg from 'music-metadata'; const { parseFile } = pkg;`
- **Spotify**: доступен только поиск артистов (не альбомов). Картинки тянутся с CDN и кэшируются на сервере локально.
- **Cover extraction**: серверный `server/covers` чистится только вручную (в .gitignore). Пересканивание не удаляет «осиротевшие» cover-файлы.
- **Очередь** не персистентна (сбрасывается при F5).
- **Stream**: использует `hijack()` — Fastify-лог для этих запросов отключается. Однако активные соединения/байты отслеживаются в метриках.
- **Производительность**: `glob('"**/*.*"')` на 10k+ файлов медленный; нет watch-режима (inotify). Для прода нужен.
- **`ArtistsDetail`/`ArtistDetail` использует `limit: 10000` для `GET /tracks`** — при больших коллекций нужно серверная фильтрация.
- **browse/dirs не требует auth** (открытый доступ) — возможно стоит закрыть.
- **Поиск ограничен `limit` параметром**, делуат 30.
- `requireAdmin/requireAuth` есть, но многие read-эндпоинты (browse, tracks, search, stream) открыты без пре-хука.

## Текущее состояние & ближайшие задачи

**MVP готов**: сканирование MP3+FLAC (протестировано; 2200+ треков на реальной библиотеке), дедупликация, Range-стриминг, обложки, плеер с очередью/repeat/shuffle/volume, Media Session, редактирование ID3 (MP3), страницы альбомов/артистов, поиск, авторизация (JWT), CI/CD + Docker + Helm/ArgoCD, кастомные метрики `tunecloud_*` + Grafana dashboard, mobile responsive UI.

**Открытые задачи**:
1. **HLS / адаптивный стриминг** — для FLAC/больших WAV конвертировать на лету (ffmpeg) или progressive
2. **Production docker-compose** — nginx reverse proxy, SSL, healthcheck контейнеров, полноценный compose-деплой
3. **Vorbis comments (FLAC) read-only** — сейчас поддерживается чтение, но не запись (нет JS-библиотеки; taglib отклонён)
4. Watch-режим сканера (inotify), фильтрация на стороне сервера для библиотек >10k треков
5. Очистка «осиротевших» covers при удалении треков/альбомов

---

*Файл поддерживается вручную; при изменении архитектуры — обновляй структуру/API/нюансы наверху.*