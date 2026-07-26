# TuneCloud

**Self-hosted music browser & player** — кросс между Filebrowser и Navidrome.  
Сканирует локальную музыкальную библиотеку, парсит теги, подтягивает обложки и фото артистов через Spotify.

---

## Скриншоты

```
[Browse]     [Albums]         [Album Detail]       [Player]
  📁 Music     🖼️ Сетка        🖼️ Cover 192px      ⏯️ Queue
  📄 Файлы     альбомов        📋 Треки + play       🔁 Repeat
                                                       🔀 Shuffle
                                                       🔊 Volume
```

---

## Архитектура

```
┌──────────────┐     ┌──────────────────┐     ┌────────────┐
│   Browser    │ ──→ │   Fastify :4000  │ ──→ │ PostgreSQL │
│  React/Vite  │     │  Node.js 26      │     │    16      │
│  Tailwind 3  │ ←── │  music-metadata  │ ←── │            │
└──────────────┘     │  node-id3        │     └────────────┘
                     │  Spotify OAuth   │
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
| **Backend** | Node.js 26 + Fastify 4 |
| **Парсинг медиа** | music-metadata 7 (20+ форматов), node-id3 (ID3v2 запись) |
| **База данных** | PostgreSQL 16 |
| **Фронтенд** | React 18 + Vite 5 + Tailwind CSS 3 |
| **Изображения** | Spotify Web API (Client Credentials) |

---

## Возможности

- **Сканирование** — рекурсивный обход директории, парсинг метаданных (MP3, FLAC, Ogg, Wav, M4A, AAC, WMA, Opus)
- **Обложки** — извлекаются из тегов аудиофайлов, из `cover.jpg`/`folder.jpg` в папке альбома
- **Стриминг** — HTML5 Audio с Range-запросами (seek, прогресс)
- **Браузер файлов** — навигация по директориям музыки с breadcrumbs
- **Альбомы** — сетка с обложками, клик → страница альбома (треки, метаданные)
- **Артисты** — список с фотографиями из Spotify, треки сгруппированы по альбомам
- **Поиск** — полнотекстовый по трекам, альбомам, артистам
- **Плеер** — кастомный UI: обложка, прогресс-бар, Prev/Next, Repeat (none/all/one), Shuffle, громкость, Mute
- **Очередь** — двойной клик или кнопка play (появляется при наведении на трек) запускает весь текущий список
- **ID3 теги** — чтение и запись для MP3
- **Spotify** — поиск артистов с точным совпадением имени, подгрузка фото

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

cp server/.env.example server/.env   # или отредактировать существующий
```

**`server/.env`**:
```env
DATABASE_URL=postgresql://tunecloud:tunecloud@localhost:5432/tunecloud
MUSIC_DIR=/home/username/music
PORT=4000
HOST=0.0.0.0
SPOTIFY_CLIENT_ID=your_spotify_id
SPOTIFY_CLIENT_SECRET=your_spotify_secret
```

Spotify API ключи можно получить в [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → Create App → Client Credentials.

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
Нажми **Rescan Library** в левом нижнем углу — просканируется `MUSIC_DIR`.

---

## API Endpoints

| Метод | Путь | Описание |
|-------|------|---------|
| GET | `/api/browse/dirs?dir=...` | Файловый браузер |
| GET | `/api/tracks?sort=&limit=&offset=` | Треки с пагинацией |
| GET | `/api/tracks/:id` | Детально трек |
| GET | `/api/albums` | Все альбомы |
| GET | `/api/albums/:id` | Треки альбома |
| GET | `/api/artists` | Все артисты |
| GET | `/api/search?q=` | Поиск |
| GET | `/api/stream/:id` | Стрим трека (Range) |
| POST | `/api/scan` | Запуск сканирования |
| GET | `/api/scan/status` | Статус библиотеки |
| GET/PUT | `/api/tags/:id` | Чтение/запись ID3 (MP3) |
| GET | `/api/cover/:filename` | Обложка по имени файла |
| GET | `/api/cover/album/:id` | Обложка альбома |
| GET | `/api/spotify/artist?name=` | Поиск артиста в Spotify |

---

## Структура проекта

```
tunecloud/
├── server/
│   ├── src/
│   │   ├── index.js           # Fastify entry
│   │   ├── db.js              # PostgreSQL pool
│   │   ├── schema.sql         # DDL
│   │   ├── scanner.js         # glob → parseFile → upsert
│   │   ├── cover.js           # extraction from tags + cover.jpg
│   │   ├── spotify.js         # Spotify OAuth + search + cache
│   │   └── routes/
│   │       ├── browse.js      # файловый браузер
│   │       ├── stream.js      # стриминг + Range
│   │       ├── tracks.js      # треки/альбомы/артисты/поиск
│   │       ├── scan.js        # сканирование
│   │       ├── tags.js        # ID3 теги
│   │       ├── cover.js       # раздача обложек
│   │       └── spotify.js     # Spotify API прокси
│   └── covers/                # кэш обложек (gitignored)
│
└── client/
    └── src/
        ├── main.jsx           # React entry
        ├── api.js             # HTTP-клиент
        ├── index.css          # Tailwind + компоненты
        └── App.jsx            # всё приложение
```

---

## Особенности

- **FLAC**: битрейт во float (до 1 Mbps) — `toInt()` хелпер приводит к integer для PostgreSQL
- **Обложки**: если в тегах нет картинки, ищется `cover.jpg`/`folder.jpg` в директории трека
- **Spotify**: точный поиск `artist:"${name}"`, фильтр exact match (регистронезависимый)
- **Очередь**: при клике на трек все треки текущего вью становятся очередью для Prev/Next/Shuffle
- **Volume**: сохраняется в `localStorage`
- **Hijack**: стрим-роут использует `reply.hijack()` — Fastify отдаёт управление Node.js raw response (Range-запросы без буферизации)

---

## License

MIT
