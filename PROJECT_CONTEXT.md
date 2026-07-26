# TuneCloud — Architecture & State Checkpoint

## Стек и причины выбора

| Компонент | Технология | Почему |
|-----------|-----------|--------|
| **Backend** | Node.js 26 + Fastify 4 | Асинхронный I/O, встроенный парсер JSON, хуки, автовалидация. Лёгкий — ~1.5MB + 0 зависимостей (ниже Express в 10×) |
| **Media parsing** | music-metadata 7 + node-id3 | Первый читает 20+ форматов (FLAC, MP4, Ogg, Wav…), второй пишет ID3 в MP3 |
| **DB** | PostgreSQL 16 | Надёжная, вложенные индексы, JSONB на будущее, UNIQUE constraints для дедупликации |
| **Frontend** | React 18 + Vite 5 + Tailwind 3 | Быстрая HMR сборка, zero-runtime CSS, utility-first для тёмной темы без кастомных классов |
| **CD** | Docker / bare Arch | MVP без контейнеризации, `docker-compose.yml` для PostgreSQL |

## Структура репозитория

```
tunecloud/
├── package.json                 # корневые скрипты (dev, build, db:migrate)
├── docker-compose.yml           # PostgreSQL 16
├── spotify-keys.txt             # credentials (gitignored)
├── .gitignore
├── PROJECT_CONTEXT.md           # ← этот файл
│
├── server/
│   ├── package.json
│   ├── .env                     # DATABASE_URL, MUSIC_DIR, SPOTIFY_CLIENT_*
│   └── src/
│       ├── index.js             # Fastify entry, cors, static, routes
│       ├── db.js                # pg pool + initDb (применение schema.sql)
│       ├── schema.sql           # artists / albums / tracks + индексы
│       ├── scanner.js           # glob → parseFile → upsertTrack + fallback
│       ├── cover.js             # извлечение обложек из тегов + cover.jpg
│       ├── spotify.js           # OAuth2 + searchArtist (exact match) + кэш
│       └── routes/
│           ├── browse.js        # GET /api/browse/dirs (файловый браузер)
│           ├── stream.js        # GET /api/stream/:id (Range requests + hijack)
│           ├── tracks.js        # /api/tracks /albums /artists /search
│           ├── scan.js          # POST /api/scan + GET /api/scan/status
│           ├── tags.js          # GET/PUT /api/tags/:id (ID3v2 для MP3)
│           ├── cover.js         # GET /api/cover/album/:id и /api/cover/:filename
│           └── spotify.js       # GET /api/spotify/artist?name=…
│
└── client/
    ├── package.json
    ├── vite.config.js           # proxy /api → :4000
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── index.css            # tailwind directives + кастомные .btn/.card/.input
        ├── api.js               # fetchJson + все эндпоинты
        └── App.jsx              # всё приложение (SFC, ~500 строк)
```

## Что уже написано / спроектировано

### База данных
- `artists` (id, name UNIQUE, created_at)
- `albums` (id, title, artist_id FK, year, genre, cover_path, UNIQUE title+artist_id)
- `tracks` (id, file_path UNIQUE, file_name, file_size, duration, title, artist_id FK, album_id FK, track_number, disc_number, genre, year, bitrate, sample_rate, format, cover_path, timestamps)
- Индексы: artist_id, album_id, file_path, title

### API (REST, все через `/api`)
- **GET /browse/dirs** — листинг файловой системы с метаданными из БД
- **GET /tracks** — пагинированный список, sort (album → disc → track_number compound), фильтр по artist
- **GET /tracks/:id** — детальная запись
- **GET /albums** — все альбомы с cover_path и агрегатами
- **GET /albums/:id** — треки альбома
- **GET /artists** — все артисты с счётчиками
- **GET /search?q=** — ILIKE по tracks/albums/artists
- **GET /stream/:id** — Range requests + hijack (без буферизации в память)
- **POST /scan** — полное сканирование MUSIC_DIR
- **GET /scan/status** — сколько файлов / проиндексировано
- **GET/PUT /tags/:id** — чтение/запись ID3 (только MP3)
- **GET /cover/:filename** / **GET /cover/album/:id** — обложки (hijack + cache-control)
- **GET /spotify/artist?name=** — поиск exact match, возвращает image URL

### Frontend
- **Sidebar** — Browse / Albums / Artists / Search + Rescan Library
- **BrowseView** — файловый браузер по директориям с breadcrumbs, таблица треков
- **AlbumsView** — сетка альбомов с обложками, клик → AlbumDetail
- **AlbumDetail** — полноценная страница: обложка 192px, мета, треклист
- **ArtistsView** — список артистов с фото со Spotify, треки сортируются album → track#
- **SearchView** — debounced поиск, результаты с обложками
- **Player** — кастомный UI: обложка, Title + Artist, прогресс-бар, Play/Pause, Prev/Next, Repeat (none/all/one), Shuffle, Volume slider + Mute, Close
- **Queue** — при клике на трек вся текущая таблица становится очередью
- **Document title** — `Артист — Трек` во время проигрывания, `TuneCloud` при закрытии
- **Cover URL** — проверка на дублирование `/api/` через `path.startsWith('/api/')`
- **TrackRow** — play triangle на hover (как Spotify) + двойной клик

### Обработка ошибок сканирования
- Если `music-metadata::parseFile()` упал (FLAC с float bitrate, битый файл), вставляется **baseline-запись** (filename, size, format)
- `toInt()` хелпер для каста float → integer (bitrate, sample_rate, year…)

### Spotify API
- Client Credentials flow (bearer token с автообновлением)
- Точный поиск `artist:"${name}"`, фильтр exact match (регистронезависимый)
- Кэш изображений: `server/covers/artist_{id}.jpg`
- Фронтенд грузит с CDN, не через прокси (быстрее, меньше нагрузка на сервер)

## Текущий шаг

**MVP готов к использованию.** Основной функционал написан и протестирован:
- Сканирование MP3 + FLAC протестировано на реальной библиотеке (90 файлов, 9 альбомов)
- Стриминг работает (Range requests, хромает FLAC через браузер — проблема браузера)
- Обложки извлекаются из тегов и cover.jpg
- Кастомный плеер с очередью, repeat, shuffle, громкостью
- Артисты подтягиваются через Spotify API

## Ближайшие 3 задачи

1. **Cover extraction fix** — `extractAlbumCover` ищет `cover.jpg` в директории трека, но не в родительской директории альбома (если треки во вложенных папках). Нужна эвристика: подниматься на 1 уровень вверх.
2. **HLS / адаптивный стриминг** — для FLAC и больших WAV конвертировать в HLS на лету (ffmpeg) или хотя бы сделать progressive download вместо Range.
3. **Docker-композ** — завернуть сервер + клиент + PostgreSQL в `docker-compose.yml`, добавить healthcheck и volume для музыки.

## Ограничения и важные нюансы

- **Spotify API** — только поиск артистов (не альбомов). Изображения грузятся с CDN, не кэшируются на сервере (только URL)
- **ID3 теги** — `node-id3` пишет только в MP3. FLAC/Vorbis comments read-only
- **Cover extraction** — из FLAC тегов читаются, но server/covers чистится только вручную
- **Безопасность** — нет авторизации. `/api/browse/dirs` проверяет `targetDir.startsWith(musicDir)`, но это не защита от path traversal для прода
- **Queue** — не сохраняется в localStorage, сбрасывается при F5
- **Громкость** — сохраняется в `localStorage` (`tunecloud-volume`), но mute — нет
- **Stream route** — использует `hijack()`, что отключает всё сжатие/логирование Fastify для этого запроса
- **Производительность** — `glob('**/*.*')` на 10k+ файлов может быть медленным. Для прода нужен watch-режим (inotify) вместо рескана
