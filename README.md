# freqwords

A lightweight Express app for learning vocabulary through daily example sentences in English and French.

The project stores words and example sentences in PostgreSQL and serves a small web interface that groups entries by day and word. It also exposes a JSON API for creating and retrieving sentence sets.

## Features

- Daily sentence collections by word
- English and French views
- Weekly pagination for browsing past entries
- PostgreSQL-backed persistence
- REST API for sentence submissions and retrieval
- Docker support for simple local setup

## Tech stack

- Node.js
- Express
- PostgreSQL
- Docker / Docker Compose

## Project structure

```text
.
├── server/
│   ├── index.js          # Express app and page rendering
│   ├── db.js             # PostgreSQL connection pool
│   ├── public/           # Static assets (CSS, SVG)
│   ├── routes/
│   │   └── sentences.js  # API endpoints for sentence data
│   └── views/
│       └── home.html     # Shared page template
├── .env.example          # Example environment variables
├── Dockerfile            # Container definition
├── docker-compose.yml    # Local service orchestration
├── init.sql              # Initial database schema
├── package.json          # Node dependencies and scripts
├── words/                # Word/sentence data source
└── README.md             # Project documentation
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm

Optional:

- Docker and Docker Compose

## Environment variables

Copy `.env.example` to `.env` and configure the values for your database.

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=freqwords
PORT=3006
```

## Installation

```bash
npm install
```

## Database setup

Create a PostgreSQL database and run the SQL from `init.sql`:

```sql
CREATE TABLE IF NOT EXISTS sentences (
  id SERIAL PRIMARY KEY,
  word TEXT NOT NULL,
  sentence TEXT NOT NULL,
  created_at DATE DEFAULT CURRENT_DATE
);
```

For the French view, the app expects a second table named `sentences_fr` with the same schema.

```sql
CREATE TABLE IF NOT EXISTS sentences_fr (
  id SERIAL PRIMARY KEY,
  word TEXT NOT NULL,
  sentence TEXT NOT NULL,
  created_at DATE DEFAULT CURRENT_DATE
);
```

## Running locally

Start the app:

```bash
npm start
```

Then open:

- `http://localhost:3006/` for English sentences
- `http://localhost:3006/fr` for French sentences

## Docker

```bash
docker-compose up --build
```

This project includes a `Dockerfile` and `docker-compose.yml` for running the app with PostgreSQL.

## API

### Create sentences

`POST /api/en/sentences`

Request body:

```json
{
  "word": "happy",
  "sentences": [
    "I am happy to see you.",
    "She looked happy all day.",
    "They are happy with the result."
  ]
}
```

Response:

```json
{
  "count": 3
}
```

### Get sentences

`GET /api/en/sentences`

Returns all English entries, ordered by creation date.

`GET /api/fr/sentences`

Returns all French entries, ordered by creation date.

## Health check

`GET /health`

Returns the database connection status.

## Notes

This app is designed as a simple vocabulary study tool rather than a full CMS or content management platform. It is best suited for tracking daily example sentences and revisiting them in a clean weekly format.
