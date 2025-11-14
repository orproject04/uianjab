// src/app/api/anjab/match/route.ts
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq } from "@/lib/auth";

/**
 * Endpoint untuk mencari anjab master yang paling cocok dengan nama jabatan
 * Menggunakan PostgreSQL trigram similarity
 */
export async function GET(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(req.url);
        const nama_jabatan = searchParams.get("nama_jabatan");

        if (!nama_jabatan) {
            return NextResponse.json(
                { error: "Parameter nama_jabatan diperlukan" },
                { status: 400 }
            );
        }

        // Gunakan PostgreSQL trigram similarity untuk fuzzy matching
        // Similarity score: 0-1 (1 = exact match)
        const { rows } = await pool.query<{
            id: string;
            nama_jabatan: string;
            similarity: number;
        }>(
            `
            SELECT 
                id,
                nama_jabatan,
                SIMILARITY(nama_jabatan, $1) as similarity
            FROM jabatan
            WHERE SIMILARITY(nama_jabatan, $1) > 0.2
            ORDER BY similarity DESC, nama_jabatan ASC
            LIMIT 5
            `,
            [nama_jabatan]
        );

        // Jika ada hasil dengan similarity > 0.5, ambil yang tertinggi
        // Jika tidak, kembalikan null (user harus pilih manual)
        if (rows.length > 0 && rows[0].similarity > 0.5) {
            return NextResponse.json({
                success: true,
                match: {
                    jabatan_id: rows[0].id,
                    nama_jabatan: rows[0].nama_jabatan,
                    similarity: rows[0].similarity,
                    confidence: rows[0].similarity > 0.8 ? "high" : "medium"
                },
                alternatives: rows.slice(1)
            });
        }

        // Similarity rendah, kembalikan suggestions saja
        return NextResponse.json({
            success: true,
            match: null,
            suggestions: rows
        });
    } catch (e: any) {
        console.error("Error matching anjab:", e);
        return NextResponse.json(
            { error: "Internal error", detail: e.message },
            { status: 500 }
        );
    }
}
