const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Setup database
const db = new sqlite3.Database('./web_content.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE,
    title TEXT,
    domain TEXT,
    visit_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    content_hash TEXT,
    text_content TEXT,
    images TEXT,
    links TEXT
  )`);
});

// Helper to hash content
function generateHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

// Scrape URL and save data
app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const response = await axios.get(url, { timeout: 15000 });
    const html = response.data;
    const $ = cheerio.load(html);
    const title = $('title').text().trim() || 'No Title';
    const domain = new URL(url).hostname;
    const contentHash = generateHash(html);
    const textContent = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 10000);

    // Extract images and links
    const images = [];
    $('img').each((i, el) => {
      const src = $(el).attr('src');
      if (src) images.push(new URL(src, url).href);
    });

    const links = [];
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) links.push(new URL(href, url).href);
    });

    // Insert or replace into DB
    db.run(
      `INSERT INTO visits (url, title, domain, content_hash, text_content, images, links)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET
         title=excluded.title,
         domain=excluded.domain,
         visit_time=CURRENT_TIMESTAMP,
         content_hash=excluded.content_hash,
         text_content=excluded.text_content,
         images=excluded.images,
         links=excluded.links
      `,
      [url, title, domain, contentHash, textContent, JSON.stringify(images), JSON.stringify(links)],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        return res.json({ message: 'Scraped and saved successfully', id: this.lastID });
      }
    );

  } catch (error) {
    res.status(500).json({ error: error.message || 'Scrape failed' });
  }
});

// List recent scraped URLs
app.get('/api/visits', (req, res) => {
  db.all(`SELECT id, url, title, domain, visit_time FROM visits ORDER BY visit_time DESC LIMIT 50`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get details by ID
app.get('/api/visits/:id', (req, res) => {
  const id = req.params.id;
  db.get(`SELECT * FROM visits WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    // Parse JSON fields
    row.images = JSON.parse(row.images || '[]');
    row.links = JSON.parse(row.links || '[]');
    res.json(row);
  });
});

// Search text content
app.get('/api/search', (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Query param "q" is required' });
  db.all(
    `SELECT id, url, title, domain, visit_time FROM visits WHERE text_content LIKE ? ORDER BY visit_time DESC LIMIT 50`,
    [`%${q}%`],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
