import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function enableVectorExtension() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');

    // Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✅ pgvector extension enabled successfully!');

    // Verify it's installed
    const result = await client.query(
      "SELECT * FROM pg_extension WHERE extname = 'vector';"
    );

    if (result.rows.length > 0) {
      console.log('✅ Verified: pgvector extension is installed');
      console.log('Extension details:', result.rows[0]);
    }
  } catch (error) {
    console.error('❌ Error enabling pgvector extension:');
    console.error(error.message);

    if (error.message.includes('not available')) {
      console.error('\n⚠️  pgvector is not available on this PostgreSQL instance.');
      console.error('You need to contact Railway support or use a PostgreSQL instance that supports pgvector.');
    }
  } finally {
    await client.end();
  }
}

enableVectorExtension();
