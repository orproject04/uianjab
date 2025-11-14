#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {Pool} = require("pg");

const pool = new Pool({
    host: "localhost",
    port: 5432,
    database: "eaa",
    user: "postgres",
    password: "Ortalayes1",
});

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log("🚀 Starting Migration 004: Cleanup Redundant Jabatan Data\n");
        
        // Read migration file
        const migrationPath = path.join(__dirname, "..", "migrations", "004_cleanup_redundant_jabatan.sql");
        const migrationSQL = fs.readFileSync(migrationPath, "utf8");
        
        // Run migration
        console.log("📝 Executing migration...\n");
        const result = await client.query(migrationSQL);
        
        console.log("\n✅ Migration 004 completed successfully!");
        
        // Show summary
        console.log("\n📊 Summary:");
        const totalJabatan = await client.query("SELECT COUNT(*) FROM jabatan");
        console.log(`   Total jabatan: ${totalJabatan.rows[0].count}`);
        
        const duplicates = await client.query(`
            SELECT COUNT(*) FROM (
                SELECT nama_jabatan, COUNT(*) as cnt
                FROM jabatan
                GROUP BY nama_jabatan
                HAVING COUNT(*) > 1
            ) duplicates
        `);
        console.log(`   Remaining duplicates: ${duplicates.rows[0].count}`);
        
        const petaCount = await client.query("SELECT COUNT(*) FROM peta_jabatan WHERE jabatan_id IS NOT NULL");
        console.log(`   Peta jabatan with jabatan_id: ${petaCount.rows[0].count}`);
        
    } catch (error) {
        console.error("\n❌ Migration failed:");
        console.error(error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
