# IoT Система за мониторинг на добитък

Монолитно Node.js + Express.js приложение с обикновен HTML / CSS / Vanilla JavaScript.
Не използва React, Vite, Bun или TypeScript.

## Архитектура

- **Бекенд:** Node.js + Express.js (`server.js`)
- **Бази данни:** In-memory store (Mongoose-подобни модели в `models/`)
- **Фронтенд:** Статичен HTML + CSS + Vanilla JS в `/public`
- **Карта:** Leaflet.js (CDN)
- **Графики:** Chart.js (CDN)
- **Симулация:** Haversine формула за реалистично GPS движение
- **REST API:** JSON ендпойнти под `/api/*`

## Стартиране

```bash
cd express-app
npm install
node server.js
```

След това отворете: http://localhost:3000

## REST API ендпойнти

| Метод  | Път                          | Описание                          |
| ------ | ---------------------------- | --------------------------------- |
| GET    | `/api/animals`               | Списък на всички животни          |
| GET    | `/api/animals/:id`           | Едно животно                      |
| POST   | `/api/animals`               | Регистрация на ново животно       |
| DELETE | `/api/animals/:id`           | Изтриване                         |
| GET    | `/api/alerts`                | Активни известия                  |
| GET    | `/api/geofence`              | Геозона (център и радиус)         |
| POST   | `/api/simulation/start`      | Стартиране на симулация           |
| POST   | `/api/simulation/stop`       | Спиране на симулация              |
| POST   | `/api/simulation/breach`     | Принудително нарушение на ограда  |
| POST   | `/api/telemetry`             | Приемане на реални ESP32 данни    |

## Структура

```
express-app/
├── server.js            # Express сървър + REST API + симулация
├── package.json
├── models/
│   └── store.js         # In-memory модели (Animal, Alert)
└── public/
    ├── index.html       # Landing страница
    ├── dashboard.html   # Главно табло
    ├── css/styles.css
    └── js/app.js        # Карта, графики, симулация (клиент)
```
