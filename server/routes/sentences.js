const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/sentences', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, sentence, word, created_at
      FROM sentences
      ORDER BY created_at DESC, id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch sentences:', err);
    res.status(500).json({
      error: 'Failed to fetch sentences'
    });
  }
});

router.post('/sentences', async (req, res) => {
  const { word, sentences } = req.body;

  if (
    typeof word !== 'string' ||
    !word.trim() ||
    !Array.isArray(sentences) ||
    sentences.length === 0
  ) {
    return res.status(400).json({
      error: 'word and a non-empty sentences array are required'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const sentence of sentences) {
      if (typeof sentence !== 'string' || !sentence.trim()) {
        throw new Error('Invalid sentence');
      }

      await client.query(
        'INSERT INTO sentences (word, sentence) VALUES ($1, $2)',
        [word.trim(), sentence.trim()]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      word: word.trim(),
      count: sentences.length
    });
  } catch (err) {
    await client.query('ROLLBACK');

    console.error('Failed to insert sentences:', err);

    res.status(500).json({
      error: 'Failed to insert sentences'
    });
  } finally {
    client.release();
  }
});

module.exports = router;
