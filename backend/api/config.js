// config.js – reads env vars for Supabase and Postgres
module.exports = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  PG_CONNECTION_STRING: process.env.PG_CONNECTION_STRING,
};
