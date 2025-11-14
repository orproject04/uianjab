// Run migration using Node.js pg client
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
    connectionString: 'postgresql://postgres:Ortalayes1@localhost:5432/eaa'
});

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🔌 Connected to PostgreSQL');
        console.log('📄 Running migration: 005_enable_pg_trgm.sql\n');
        
        const sql = readFileSync(join(__dirname, 'migrations', '005_enable_pg_trgm.sql'), 'utf-8');
        
        // Execute the entire SQL as one query
        console.log('Executing SQL...\n');
        await client.query(sql);
        console.log('✓ SQL executed successfully\n');
        
        // Verify extension
        console.log('🔍 Verifying pg_trgm extension...');
        const extResult = await client.query(
            "SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm'"
        );
        
        if (extResult.rows.length > 0) {
            console.log('✓ pg_trgm extension enabled:', extResult.rows[0]);
        } else {
            console.log('⚠️  pg_trgm extension not found');
        }
        
        // Verify indexes
        console.log('\n🔍 Verifying indexes...');
        const idxResult = await client.query(`
            SELECT indexname, tablename 
            FROM pg_indexes 
            WHERE indexname LIKE '%_trgm'
        `);
        
        console.log(`✓ Found ${idxResult.rows.length} trigram indexes:`);
        idxResult.rows.forEach(row => {
            console.log(`  - ${row.indexname} on ${row.tablename}`);
        });
        
        console.log('\n✅ Migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration().catch(err => {
    console.error(err);
    process.exit(1);
});
