/* eslint-env node */
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Client } = pg;
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Database configuration
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_ywEpB3DL4JVF@ep-aged-sunset-abc5a289-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require'
});

// Connect to database
client.connect()
  .then(() => console.log('✅ Connected to Neon PostgreSQL database'))
  .catch(err => console.error('❌ Connection error:', err));

// Route to get all data from users table
app.get('/api/data', async (req, res) => {
  try {
    // Get all tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('Available tables:', tablesResult.rows);
    
    // Get all data from users table
    const result = await client.query('SELECT * FROM users');
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
    const result = await client.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});