// src/app/api/sync/clear-cache/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getUserFromReq, hasRole } from "@/lib/auth";
import { handleCorsOptions, addCorsHeaders } from "@/lib/cors";
import pool from "@/lib/db";
import { readdir, unlink } from "fs/promises";
import { join } from "path";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

/**
 * DELETE /api/sync/clear-cache - Clear old sync cache files (keep only the latest)
 */
export async function DELETE(req: NextRequest) {
  const origin = req.headers.get('origin');
  
  try {
    // Check authentication and authorization
    const user = getUserFromReq(req);
    if (!user || !hasRole(user, ["admin"])) {
      const response = NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
      return addCorsHeaders(response, origin);
    }

    // Get the latest sync record
    const { rows } = await pool.query(
      `SELECT log_file_csv, log_file_json
      FROM sync_history
      WHERE sync_type = 'pegawai'
      ORDER BY synced_at DESC
      LIMIT 1`
    );

    const latestCsv = rows.length > 0 ? rows[0].log_file_csv : null;
    const latestJson = rows.length > 0 ? rows[0].log_file_json : null;

    // Get the storage directory
    const storageDir = process.env.SYNC_LOGS_DIR
      ? process.env.SYNC_LOGS_DIR
      : join(process.cwd(), 'storage', 'sync-logs');

    // Read all files in the directory
    let files: string[] = [];
    try {
      files = await readdir(storageDir);
    } catch (readError: any) {
      console.error('[SYNC CLEAR CACHE] Cannot read directory:', readError);
      const response = NextResponse.json(
        { 
          error: "Direktori log tidak dapat dibaca",
          detail: readError.message 
        },
        { status: 500 }
      );
      return addCorsHeaders(response, origin);
    }

    // Filter CSV and JSON files only
    const csvFiles = files.filter(f => f.endsWith('.csv'));
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    let deletedCount = 0;
    const errors: string[] = [];

    // Delete old CSV files (except latest)
    for (const file of csvFiles) {
      const fullPath = join(storageDir, file);
      if (latestCsv && fullPath === latestCsv) {
        continue; // Skip latest file
      }
      
      try {
        await unlink(fullPath);
        deletedCount++;
      } catch (deleteError: any) {
        errors.push(`Failed to delete ${file}: ${deleteError.message}`);
        console.error('[SYNC CLEAR CACHE] Delete error:', deleteError);
      }
    }

    // Delete old JSON files (except latest)
    for (const file of jsonFiles) {
      const fullPath = join(storageDir, file);
      if (latestJson && fullPath === latestJson) {
        continue; // Skip latest file
      }
      
      try {
        await unlink(fullPath);
        deletedCount++;
      } catch (deleteError: any) {
        errors.push(`Failed to delete ${file}: ${deleteError.message}`);
        console.error('[SYNC CLEAR CACHE] Delete error:', deleteError);
      }
    }

    const response = NextResponse.json({
      ok: true,
      message: "Cache berhasil dibersihkan",
      deletedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
    
    return addCorsHeaders(response, origin);
  } catch (error: any) {
    console.error('[SYNC CLEAR CACHE] Error:', error);
    const response = NextResponse.json(
      { 
        error: "Gagal membersihkan cache",
        detail: error.message 
      },
      { status: 500 }
    );
    return addCorsHeaders(response, origin);
  }
}
