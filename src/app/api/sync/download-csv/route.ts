// src/app/api/sync/download-csv/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getUserFromReq, hasRole } from "@/lib/auth";
import { handleCorsOptions, addCorsHeaders } from "@/lib/cors";
import pool from "@/lib/db";
import { readFile } from "fs/promises";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

/**
 * GET /api/sync/download-csv - Download the latest sync CSV log file
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

    // Get the latest sync record with CSV file
    const { rows } = await pool.query(
      `SELECT log_file_csv, synced_at
      FROM sync_history
      WHERE sync_type = 'pegawai' AND log_file_csv IS NOT NULL
      ORDER BY synced_at DESC
      LIMIT 1`
    );

    if (rows.length === 0 || !rows[0].log_file_csv) {
      const response = NextResponse.json(
        { error: "Tidak ada file CSV yang tersedia" },
        { status: 404 }
      );
      return addCorsHeaders(response, origin);
    }

    const csvPath = rows[0].log_file_csv;
    
    try {
      const csvContent = await readFile(csvPath, 'utf-8');
      
      // Extract filename from path
      const filename = csvPath.split(/[\\/]/).pop() || 'unmatched-pegawai.csv';
      
      const response = new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
      
      return addCorsHeaders(response, origin);
    } catch (fileError: any) {
      console.error('[SYNC DOWNLOAD CSV] File read error:', fileError);
      const response = NextResponse.json(
        { 
          error: "File CSV tidak ditemukan atau tidak dapat dibaca",
          detail: fileError.message 
        },
        { status: 404 }
      );
      return addCorsHeaders(response, origin);
    }
  } catch (error: any) {
    console.error('[SYNC DOWNLOAD CSV] Error:', error);
    const response = NextResponse.json(
      { 
        error: "Gagal mengunduh file CSV",
        detail: error.message 
      },
      { status: 500 }
    );
    return addCorsHeaders(response, origin);
  }
}
