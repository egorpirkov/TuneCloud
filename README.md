# TuneCloud

**Self-hosted music browser & player** — что-то между Filebrowser и Navidrome.
Сканирует локальную музыкальную библиотеку, парсит теги, подтягивает фото артистов через Spotify.


![Скриншот интерфейса](pictures/screenshot.png)

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
| **Мониторинг** | kube-prometheus-stack (Prometheus + Grafana + Alertmanager) |
| **Деплой** | Docker Compose / Kubernetes (ArgoCD GitOps + Helm) |

---

## Возможности

- **Сканирование** — рекурсивный обход директории, парсинг метаданных (MP3, FLAC, Ogg, Wav, M4A, AAC, WMA, Opus)
- **Дедупликация** — `mainArtist()` нормализует имена артистов (feat./ft./&/vs → основное имя), постсканировочный merge дублей альбомов и артистов
- **Обложки** — извлекаются из тегов аудиофайлов, из `cover.jpg`/`folder.jpg` в папке альбома
- **Стриминг** — HTML5 Audio с Range-запросами (seek, прогресс)
- **Браузер файлов** — навигация по директориям музыки с breadcrumbs
- **Альбомы** — сетка с обложками, фильтр по title/artist, клик → страница альбома (треки, метаданные)
- **Артисты** — сетка карточек с фото из Spotify (кэшируются в localStorage), треки сгруппированы по альбомам
- **Поиск** — полнотекстовый по трекам, альбомам, артистам (ILIKE), кликабельные результаты
- **Плеер** — кастомный UI: обложка, прогресс-бар, Prev/Next, Repeat (none/all/one), Shuffle, громкость (slider + mouse wheel), Mute
- **Media Session API** — интеграция с системным плеером ОС (оповещения, клавиши media)
- **Очередь** — двойной клик или кнопка play запускает весь текущий список
- **Редактирование тегов** — запись ID3 для MP3 (title, artist, album, trackNumber, year, genre), non-MP3 — read-only
- **Навигация** — Back button с navHistory стеком, сохранение позиции в Browse между переходами
- **Spotify** — поиск артистов с точным совпадением имени, подгрузка фото
- **Авторизация** — JWT, роли admin/user, admin-only эндпоинты (scan, register)
- **Аватарки артистов** — загружаются при открытии вкладки, кэшируются в localStorage
- **Метрики** — Prometheus-совместимый эндпоинт `/metrics` (request duration, rate, etc.)
- **Мониторинг** — Grafana дашборды через kube-prometheus-stack

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

---

### Kubernetes (ArgoCD GitOps + Helm)

Кластер: **k3s** на Arch Linux, музыка на `/mnt/HDD/Muzl0`.

#### CI/CD Pipeline

![CI Pipeline](pictures/1.png)
![CD Pipeline & GitOps](pictures/2.png)

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐
│  git push   │───→│ GitHub       │───→│ ghcr.io      │───→│ GitOps   │
│  main       │    │ Actions      │    │ (Docker      │    │ Helm     │
│             │    │              │    │  images)     │    │ chart    │
└─────────────┘    │ 1. build     │    └──────────────┘    └────┬─────┘
                   │ 2. push      │                             │
                   │ 3. yq patch  │←────────────────────────────┘
                   │    values.yaml                             │
                   │ 4. git push  │                             │
                   └──────────────┘                             │
                                                                ▼
                                                      ┌──────────────┐
                                                      │   ArgoCD     │
                                                      │  sync ──→    │
                                                      │  k3s cluster │
                                                      └──────────────┘
```

**Шаги CI/CD:**

1. **Push в `main`** → GitHub Actions запускает workflow
2. **Docker build** — собираются `client/Dockerfile` (node → nginx) и `server/Dockerfile` (node:22-alpine)
3. **Push в ghcr.io** — образы пушатся с тегом `sha-<SHORT_SHA:0:7>`:
   - `ghcr.io/egorpirkov/tunecloud-client:sha-XXXXXXX`
   - `ghcr.io/egorpirkov/tunecloud-server:sha-XXXXXXX`
4. **Обновление GitOps** — `yq` патчит `values.yaml` в Helm-чарте:
   ```bash
   yq -i ".client.image = \"$CLIENT_IMAGE\"" tunecloud/values.yaml
   yq -i ".server.image = \"$SERVER_IMAGE\"" tunecloud/values.yaml
   ```
5. **Auto-commit** — `stefanzweifel/git-auto-commit-action` коммитит и пушит изменения в GitOps репозиторий
6. **ArgoCD sync** — автоматически подхватывает изменения и деплоит в k3s

#### GitOps Repository (Helm Chart)

Репозиторий [`egorpirkov/TuneCloud-GitOps`](https://github.com/egorpirkov/TuneCloud-GitOps) — это **Helm chart**, а не плоские YAML-манифесты:

```
TuneCloud-GitOps/
└── tunecloud/                        # Helm chart
    ├── Chart.yaml                    # apiVersion: v2, name: tunecloud, version: 0.1.0
    ├── values.yaml                   # image теги (патчатся CI), domain, replicas
    ├── .helmignore
    └── templates/
        ├── server-deployment.yaml    # Deployment API
        ├── server-service.yaml       # ClusterIP :4000
        ├── server-monitor.yaml       # Service + ServiceMonitor (Prometheus /metrics)
        ├── client-deployment.yaml    # Deployment Nginx
        ├── client-service.yaml       # NodePort :30080
        ├── ingress.yaml              # Ingress: tunecloud.local → client, /api → server
        ├── grafana-ingress.yaml      # Ingress: grafana.tunecloud.local → monitoring-grafana
        ├── postgres-deployment.yaml  # PostgreSQL 16 + readinessProbe
        ├── postgres-service.yaml     # ClusterIP :5432
        ├── postgres-configmap.yaml   # init.sql (схема БД)
        ├── postgres-pvc.yaml         # PersistentVolumeClaim 2Gi (данные)
        └── covers-pvc.yaml           # PersistentVolumeClaim 2Gi (обложки)
```

**`values.yaml`** (патчится CI через `yq`):
```yaml
global:
  domain: tunecloud.local
  grafanaDomain: grafana.tunecloud.local
server:
  image: ghcr.io/egorpirkov/tunecloud-server:sha-XXXXXXX
  replicas: 1
client:
  image: ghcr.io/egorpirkov/tunecloud-client:sha-XXXXXXX
  replicas: 1
```

#### Kubernetes Resources

| Ресурс | Kind | Описание |
|--------|------|----------|
| `tunecloud-server` | Deployment | API сервер (port 4000), env: DATABASE_URL, MUSIC_DIR, ADMIN_*, Spotify/JWT secrets |
| `tunecloud-server` | ClusterIP Service | Frontend для API |
| `tunecloud-server-svc` | Service + ServiceMonitor | Scraping `/metrics` для Prometheus |
| `tunecloud-client` | Deployment | Nginx (port 80), статический фронтенд |
| `tunecloud-client` | NodePort Service | Доступ снаружи через :30080 |
| `tunecloud-ingress` | Ingress | `tunecloud.local` → client:80, `tunecloud.local/api` → server:4000 |
| `tunecloud-db` | Deployment | PostgreSQL 16-alpine, readinessProbe (`pg_isready`) |
| `tunecloud-db` | ClusterIP Service | PostgreSQL :5432 |
| `postgres-init-script` | ConfigMap | `init.sql` — создание таблиц artists/albums/tracks/users + индексы |
| `postgres-pvc` | PVC | 2Gi ReadWriteOnce — данные PostgreSQL |
| `covers-pvc` | PVC | 2Gi ReadWriteOnce — обложки альбомов |
| `grafana-ingress` | Ingress | `grafana.tunecloud.local` → monitoring-grafana (ns: monitoring) |

**Kubernetes Secrets** (создаются вручную, не в чарте):
| Secret | Назначение |
|--------|-----------|
| `ghcr-secret` | imagePullSecret для pull образов из ghcr.io |
| `spotify-secret` | SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET |
| `jwt-secret` | JWT_SECRET для подписи токенов |

**Host Path**: сервер монтирует музыку с ноды через `hostPath: /mnt/HDD/Muzl0` → `/music`.

#### Мониторинг

![Monitoring Stack](pictures/3.png)

Кластер включает **kube-prometheus-stack** (Helm chart) с полным стеком:

| Компонент | Описание |
|-----------|----------|
| **Prometheus** | Сбор метрик, ServiceMonitor для TuneCloud `/metrics` |
| **Grafana** | Дашборды, доступ через `grafana.tunecloud.local` |
| **Alertmanager** | Алерты |

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ TuneCloud server │────→│ Prometheus       │────→│ Grafana          │
│ /metrics         │     │ (kube-prom-stack)│     │ grafana.         │
│ (fastify-metrics)│     │                  │     │ tunecloud.local  │
└──────────────────┘     │ ServiceMonitor   │     └──────────────────┘
                         │ → scrape /metrics│
                         └──────────────────┘
```

#### Ручной деплой (без ArgoCD)

```bash
# Установка Helm chart
helm install tunecloud ./tunecloud -n tunecloud --create-namespace

# Обновление
helm upgrade tunecloud ./tunecloud -n tunecloud

# Проверка
kubectl get pods -n tunecloud
kubectl logs -f deployment/tunecloud-server -n tunecloud
```

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
- **Навигация**: navHistory стек для Back, browsePath в App state сохраняет позицию в файловом браузере

---

## Screenshots

![CI/CD Pipeline & Architecture](pictures/full.png)

## License

GPL v3.0

---


