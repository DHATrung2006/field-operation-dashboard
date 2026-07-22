// backend/api/db.js – PostgreSQL pool with SSL
const { Pool } = require('pg');
const { PG_CONNECTION_STRING } = require('./config');

const pool = new Pool({
  connectionString: PG_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },
});

module.exports = pool;
