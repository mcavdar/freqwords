const express = require('express');
const pool = require('../db');

const router = express.Router();


// --------------------------------------------------
// English
// --------------------------------------------------

router.post('/en/sentences', async (req, res) => {
  await insertSentences('sentences', req, res);
});

router.get('/en/sentences', async (req, res) => {
  await getSentences('sentences', req, res);
});


// --------------------------------------------------
// French
// --------------------------------------------------

router.post('/fr/sentences', async (req, res) => {
  await insertSentences('sentences_fr', req, res);
});

router.get('/fr/sentences', async (req, res) => {
  await getSentences('sentences_fr', req, res);
});


// --------------------------------------------------
// Insert
// --------------------------------------------------

async function insertSentences(table, req, res) {
  try {
    const { word, sentences } = req.body;

    if (
      typeof word !== 'string' ||
      !word.trim() ||
      !Array.isArray(sentences) ||
      sentences.length !== 3 ||
      sentences.some(
        sentence =>
          typeof sentence !== 'string' ||
          !sentence.trim()
      )
    ) {
      return res.status(400).json({
        error: 'word and exactly 3 sentences are required'
      });
    }

    for (const sentence of sentences) {
      await pool.query(
        `INSERT INTO ${table} (word, sentence)
         VALUES ($1, $2)`,
        [word.trim(), sentence.trim()]
      );
    }

    res.status(201).json({
      count: 3
    });

  } catch (err) {
    console.error('Insert failed:', err);

    res.status(500).json({
      error: 'Database error'
    });
  }
}


// --------------------------------------------------
// Get
// --------------------------------------------------

async function getSentences(table, req, res) {
  try {
    const result = await pool.query(
      `
      SELECT id, word, sentence, created_at
      FROM ${table}
      ORDER BY created_at DESC, id ASC
      `
    );

    res.json({
      sentences: result.rows
    });

  } catch (err) {
    console.error('Select failed:', err);

    res.status(500).json({
      error: 'Database error'
    });
  }
}


module.exports = router;
