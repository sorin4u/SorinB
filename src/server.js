/* eslint-env node */
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');

// Database pool configuration (more robust than single client)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_ywEpB3DL4JVF@ep-aged-sunset-abc5a289-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: false,
  keepAlive: true,
});

// Initial sanity check (non-fatal)
pool.query('SELECT 1').then(() => {
  console.log('✅ DB pool ready');
}).catch((err) => {
  console.warn('⚠️ DB initial check failed (will retry on requests):', err.message);
});

// Health check endpoint
app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

// DB health endpoint
app.get('/healthz/db', async (_req, res) => {
  try {
    const r = await pool.query('SELECT 1 as ok');
    res.json({ ok: true, result: r.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Route to get all data from users table
app.get('/api/data', async (req, res) => {
  try {
    // Get all tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('Available tables:', tablesResult.rows);
    
    // Get all data from users table
    const result = await pool.query('SELECT * FROM users');
    res.json({ 
      tables: tablesResult.rows,
      data: result.rows 
    });
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).json({ error: err.message });
  }
});

// Route to execute custom query
app.post('/api/query', async (req, res) => {
  try {
    const { query } = req.body;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Serve static frontend if built (Render/production)
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Root route: serve index.html if present, otherwise helpful message
app.get('/', (req, res) => {
  if (fs.existsSync(path.join(distPath, 'index.html'))) {
    res.sendFile(path.join(distPath, 'index.html'));
  } else {
    res.type('text').send('Backend is running. Try GET /api/data');
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});