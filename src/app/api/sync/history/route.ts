// src/app/api/sync/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getUserFromReq, hasRole } from "@/lib/auth";
import { handleCorsOptions, addCorsHeaders } from "@/lib/cors";
import pool from "@/lib/db";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

/**
 * GET /api/sync/history - Get sync history
 * Query params:
 * - limit: number of records to return (default: 10)
 * - type: sync type filter (default: 'pegawai')
 */
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const syncType = searchParams.get('type') || 'pegawai';

    const { rows } = await pool.query(
      `SELECT 
        id, 
        sync_type, 
        total_fetched, 
        total_matched, 
        total_updated, 
        total_unmatched, 
        errors, 
        log_file_json, 
        log_file_csv, 
        synced_at, 
        synced_by
      FROM sync_history
      WHERE sync_type = $1
      ORDER BY synced_at DESC
      LIMIT $2`,
      [syncType, limit]
    );

    const response = NextResponse.json({
      ok: true,
      history: rows,
    });
    
    return addCorsHeaders(response, origin);
  } catch (error: any) {
    console.error('[SYNC HISTORY] Error:', error);
    const response = NextResponse.json(
      { 
        error: "Gagal mengambil riwayat sinkronisasi",
        detail: error.message 
      },
      { status: 500 }
    );
    return addCorsHeaders(response, origin);
  }
}
