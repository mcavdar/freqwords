const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const pool = require('./db');
const sentencesRouter = require('./routes/sentences');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3006;

app.use(express.json());

app.use(
  '/static',
  express.static(path.join(__dirname, 'public'))
);

app.use('/api', sentencesRouter);


// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      status: 'ok',
      database: 'ok'
    });
  } catch (err) {
    console.error('Health check failed:', err);

    res.status(503).json({
      status: 'error',
      database: 'unavailable'
    });
  }
});


// --------------------------------------------------
// English
// --------------------------------------------------

app.get('/', async (req, res) => {
  await renderPage(
    req,
    res,
    'sentences',
    'Daily Sentences',
    'en',
    '/'
  );
});


// --------------------------------------------------
// French
// --------------------------------------------------

app.get('/fr', async (req, res) => {
  await renderPage(
    req,
    res,
    'sentences_fr',
    'Phrases françaises',
    'fr',
    '/fr'
  );
});


// --------------------------------------------------
// Generic page renderer
// --------------------------------------------------

async function renderPage(req, res, table, title, language, basePath) {
  try {
    let week = Number.parseInt(req.query.week, 10);

    if (Number.isNaN(week) || week < 0) {
      week = 0;
    }

    const offset = week * 7;

    const startDaysAgo = week * 7;
    const endDaysAgo = startDaysAgo + 7;

    const result = await pool.query(
      `
      SELECT id, sentence, word, created_at
      FROM ${table}
      WHERE created_at <= CURRENT_DATE - ($1 * INTERVAL '1 day')
        AND created_at > CURRENT_DATE - ($2 * INTERVAL '1 day')
      ORDER BY created_at DESC, word ASC, id ASC
      `,
      [startDaysAgo, endDaysAgo]
    );

    const grouped = {};

    for (const row of result.rows) {
      const date = formatDate(row.created_at, language);

      if (!grouped[date]) {
        grouped[date] = {};
      }

      if (!grouped[date][row.word]) {
        grouped[date][row.word] = [];
      }

      grouped[date][row.word].push(row.sentence);
    }

    const content = Object.entries(grouped)
      .map(([date, words]) => {
        const wordSections = Object.entries(words)
          .map(([word, sentences]) => {
            const sentenceList = sentences
              .map(sentence => `<li>${escapeHtml(sentence)}</li>`)
              .join('');

            return `
              <section class="word-card">
                <h3>${escapeHtml(word)}</h3>
                <ul>
                  ${sentenceList}
                </ul>
              </section>
            `;
          })
          .join('');

        return `
          <section class="day">
            <h2>${date}</h2>
            <div class="words">
              ${wordSections}
            </div>
          </section>
        `;
      })
      .join('');

    const template = await fs.readFile(
      path.join(__dirname, 'views', 'home.html'),
      'utf8'
    );

    const hasPrevious = await hasOlderEntries(table, offset);
    const hasNext = week > 0;

    const previousUrl = `${basePath}?week=${week + 1}`;
    const nextUrl = `${basePath}?week=${week - 1}`;

    const previousLabel =
      language === 'fr'
        ? '← Semaine précédente'
        : '← Previous week';

    const nextLabel =
      language === 'fr'
        ? 'Semaine suivante →'
        : 'Next week →';

    const weekLabel =
      language === 'fr'
        ? `Semaine ${week + 1}`
        : `Week ${week + 1}`;

    const emptyMessage =
      language === 'fr'
        ? 'Aucune phrase trouvée pour cette semaine.'
        : 'No sentences found for this week.';

    const navigation = `
      <nav class="pagination" aria-label="Week navigation">

        ${
          hasPrevious
            ? `<a href="${previousUrl}">${previousLabel}</a>`
            : `<span class="disabled">${previousLabel}</span>`
        }

        <span class="week-label">
          ${weekLabel}
        </span>

        ${
          hasNext
            ? `<a href="${nextUrl}">${nextLabel}</a>`
            : `<span class="disabled">${nextLabel}</span>`
        }

      </nav>
    `;

    const pageContent = `
      ${navigation}

      ${
        content ||
        `
        <div class="empty">
          <p>${emptyMessage}</p>
        </div>
        `
      }

      ${navigation}
    `;

    res.send(
      template
        .replace('{{CONTENT}}', pageContent)
        .replace('{{TITLE}}', title)
        .replace('{{LANG}}', language)
    );

  } catch (err) {
    console.error(`Failed to load ${table}:`, err);
    res.status(500).send('Server error');
  }
}


// --------------------------------------------------
// Check whether an older week exists
// --------------------------------------------------

async function hasOlderEntries(table, offset) {
  const result = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM ${table}
      WHERE created_at < CURRENT_DATE - ($1 * INTERVAL '7 days')
    ) AS exists
    `,
    [offset / 7 + 7]
  );

  return result.rows[0].exists;
}


// --------------------------------------------------
// Date formatting
// --------------------------------------------------

function formatDate(value, language) {
  return new Date(value).toLocaleDateString(
    language === 'fr' ? 'fr-FR' : 'en-GB',
    {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }
  );
}


// --------------------------------------------------
// HTML escaping
// --------------------------------------------------

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
