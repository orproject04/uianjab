import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { success: false, error: "ID jabatan diperlukan" },
                { status: 400 }
            );
        }

        const result = await pool.query(
            "SELECT * FROM jabatan WHERE id = $1",
            [id]
        );

        if (result.rows.length === 0) {
            return NextResponse.json(
                { success: false, error: "Jabatan tidak ditemukan" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message || "Terjadi kesalahan server" },
            { status: 500 }
        );
    }
}
