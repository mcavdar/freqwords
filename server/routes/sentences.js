const express = require('express');
const pool = require('../db');

const router = express.Router();

const TABLES = {
  en: 'sentences',
  fr: 'sentences_fr'
};

router.post('/:lang(en|fr)/sentences', async (req, res) => {
  const table = TABLES[req.params.lang];
  const { word, sentences } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const sentence of sentences) {
      await client.query(
        `INSERT INTO ${table} (word, sentence) VALUES ($1,$2)`,
        [word, sentence]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ count: sentences.length });

  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'insert failed' });
  } finally {
    client.release();
  }
});

module.exports = router;
