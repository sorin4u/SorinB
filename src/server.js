/* eslint-env node */
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }),
);
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Allow browser geolocation APIs (important when the app is embedded in an iframe).
// Note: the embedding page must also include `allow="geolocation"` on the iframe.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  next();
});

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

async function ensureSchema() {
  // Stores browser geolocation readings (useful for the map feature)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS locations (
      id BIGSERIAL PRIMARY KEY,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      accuracy REAL,
      altitude DOUBLE PRECISION,
      altitude_accuracy REAL,
      heading REAL,
      speed REAL,
      client_timestamp_ms BIGINT,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Backfill schema if table already existed
  await pool.query('ALTER TABLE locations ADD COLUMN IF NOT EXISTS client_timestamp_ms BIGINT');

  await pool.query('CREATE INDEX IF NOT EXISTS locations_recorded_at_idx ON locations (recorded_at DESC)');
}

// Initial sanity check (non-fatal)
pool.query('SELECT 1').then(() => {
  console.log('✅ DB pool ready');
  return ensureSchema();
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
    await ensureSchema();
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

// Save a geolocation reading
app.post('/api/locations', async (req, res) => {
  try {
    await ensureSchema();

    const {
      lat,
      lng,
      accuracy = null,
      altitude = null,
      altitudeAccuracy = null,
      heading = null,
      speed = null,
      timestamp = null,
    } = req.body ?? {};

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat and lng must be numbers' });
    }

    const insert = await pool.query(
      `
        INSERT INTO locations (lat, lng, accuracy, altitude, altitude_accuracy, heading, speed, client_timestamp_ms)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
      [lat, lng, accuracy, altitude, altitudeAccuracy, heading, speed, timestamp],
    );

    res.status(201).json(insert.rows[0]);
  } catch (err) {
    console.error('Error inserting location:', err);
    res.status(500).json({ error: err.message });
  }
});

// List recent geolocation readings
app.get('/api/locations', async (req, res) => {
  try {
    await ensureSchema();
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 200);
    const result = await pool.query(
      'SELECT * FROM locations ORDER BY recorded_at DESC LIMIT $1',
      [limit],
    );
    res.json({ count: result.rows.length, data: result.rows });
  } catch (err) {
    console.error('Error fetching locations:', err);
    res.status(500).json({ error: err.message });
  }
});

// Simple endpoint for GPS receivers (Cordova, embedded apps, etc.)
// DEFAULT_SERVER_ENDPOINT = 'https://sorinb.onrender.com/gps'
app.post('/gps', async (req, res) => {
  try {
    await ensureSchema();

    const {
      lat,
      lng,
      accuracy = null,
      altitude = null,
      altitudeAccuracy = null,
      heading = null,
      speed = null,
      timestamp = null,
    } = req.body ?? {};

    const latNum = typeof lat === 'string' ? Number.parseFloat(lat) : lat;
    const lngNum = typeof lng === 'string' ? Number.parseFloat(lng) : lng;

    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({ ok: false, error: 'lat and lng are required (numbers)' });
    }

    const insert = await pool.query(
      `
        INSERT INTO locations (lat, lng, accuracy, altitude, altitude_accuracy, heading, speed, client_timestamp_ms)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, lat, lng, recorded_at
      `,
      [
        latNum,
        lngNum,
        accuracy,
        altitude,
        altitudeAccuracy,
        heading,
        speed,
        timestamp,
      ],
    );

    res.status(201).json({ ok: true, saved: insert.rows[0] });
  } catch (err) {
    console.error('Error inserting /gps location:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/gps', (_req, res) => {
  res.type('text').send('ok');
});

// Also allow sending GPS via query string (some clients use GET requests)
// Example: /gps?lat=44.4&lng=26.1&accuracy=10
app.get('/gps', async (req, res, next) => {
  // If no coordinates are provided, keep the simple health response above.
  if (req.query?.lat === undefined && req.query?.lng === undefined) return next();

  try {
    await ensureSchema();

    const latNum = Number.parseFloat(String(req.query.lat));
    const lngNum = Number.parseFloat(String(req.query.lng));
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({ ok: false, error: 'lat and lng are required (numbers)' });
    }

    const accuracy = req.query.accuracy !== undefined ? Number.parseFloat(String(req.query.accuracy)) : null;
    const altitude = req.query.altitude !== undefined ? Number.parseFloat(String(req.query.altitude)) : null;
    const altitudeAccuracy =
      req.query.altitudeAccuracy !== undefined
        ? Number.parseFloat(String(req.query.altitudeAccuracy))
        : req.query.altitude_accuracy !== undefined
          ? Number.parseFloat(String(req.query.altitude_accuracy))
          : null;
    const heading = req.query.heading !== undefined ? Number.parseFloat(String(req.query.heading)) : null;
    const speed = req.query.speed !== undefined ? Number.parseFloat(String(req.query.speed)) : null;
    const timestamp =
      req.query.timestamp !== undefined ? Number.parseInt(String(req.query.timestamp), 10) : null;

    const insert = await pool.query(
      `
        INSERT INTO locations (lat, lng, accuracy, altitude, altitude_accuracy, heading, speed, client_timestamp_ms)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, lat, lng, recorded_at
      `,
      [latNum, lngNum, Number.isFinite(accuracy) ? accuracy : null, Number.isFinite(altitude) ? altitude : null, Number.isFinite(altitudeAccuracy) ? altitudeAccuracy : null, Number.isFinite(heading) ? heading : null, Number.isFinite(speed) ? speed : null, Number.isFinite(timestamp) ? timestamp : null],
    );

    res.status(201).json({ ok: true, saved: insert.rows[0] });
  } catch (err) {
    console.error('Error inserting /gps (GET) location:', err);
    res.status(500).json({ ok: false, error: err.message });
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


