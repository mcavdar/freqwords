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

app.get('/', async (req, res) => {
  try {
    let week = Number.parseInt(req.query.week, 10);

    if (Number.isNaN(week) || week < 0) {
      week = 0;
    }

    // Seven calendar days per page.
    const offset = week * 7;

const startDaysAgo = week * 7;
const endDaysAgo = startDaysAgo + 7;

const result = await pool.query(
  `
  SELECT id, sentence, word, created_at
  FROM sentences
  WHERE created_at <= CURRENT_DATE - ($1 * INTERVAL '1 day')
    AND created_at > CURRENT_DATE - ($2 * INTERVAL '1 day')
  ORDER BY created_at DESC, word ASC, id ASC
  `,
  [startDaysAgo, endDaysAgo]
);

    const grouped = {};

    for (const row of result.rows) {
      const date = formatDate(row.created_at);

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

    const hasPrevious = await hasOlderEntries(offset);
    const hasNext = week > 0;

    const navigation = `
      <nav class="pagination" aria-label="Week navigation">

        ${
          hasPrevious
            ? `<a href="/?week=${week + 1}">← Previous week</a>`
            : `<span class="disabled">← Previous week</span>`
        }

        <span class="week-label">
          Week ${week + 1}
        </span>

        ${
          hasNext
            ? `<a href="/?week=${week - 1}">Next week →</a>`
            : `<span class="disabled">Next week →</span>`
        }

      </nav>
    `;

    const pageContent = `
      ${navigation}

      ${
        content ||
        `
        <div class="empty">
          <p>No sentences found for this week.</p>
        </div>
        `
      }

      ${navigation}
    `;

    res.send(
      template.replace('{{CONTENT}}', pageContent)
    );
  } catch (err) {
    console.error('Failed to load homepage:', err);
    res.status(500).send('Server error');
  }
});

async function hasOlderEntries(offset) {
  const result = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM sentences
      WHERE created_at < CURRENT_DATE - ($1 * INTERVAL '7 days')
    ) AS exists
    `,
    [offset / 7 + 7]
  );

  return result.rows[0].exists;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
