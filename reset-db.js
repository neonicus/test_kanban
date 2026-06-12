const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const dropQueries = `
  DROP TABLE IF EXISTS comments CASCADE;
  DROP TABLE IF EXISTS subtasks CASCADE;
  DROP TABLE IF EXISTS task_labels CASCADE;
  DROP TABLE IF EXISTS tasks CASCADE;
  DROP TABLE IF EXISTS labels CASCADE;
  DROP TABLE IF EXISTS statuses CASCADE;
  DROP TABLE IF EXISTS room_members CASCADE;
  DROP TABLE IF EXISTS sessions CASCADE;
  DROP TABLE IF EXISTS rooms CASCADE;
  DROP TABLE IF EXISTS users CASCADE;
`;

async function reset() {
  try {
    await client.connect();
    console.log('Connected to database. Dropping existing tables...');
    await client.query(dropQueries);
    console.log('All conflicting tables successfully dropped.');
  } catch (err) {
    console.error('Error resetting database:', err);
  } finally {
    await client.end();
  }
}

reset();
