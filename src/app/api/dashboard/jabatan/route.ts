import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq } from "@/lib/auth";

/**
 * GET /api/dashboard/jabatan
 * Query params:
 * - biro: filter by specific biro (optional)
 * - jenis_jabatan: filter by jenis_jabatan (optional)
 * - lokasi: filter by lokasi "pusat" or "daerah" (optional)
 */
export async function GET(req: NextRequest) {
    try {
        // AUTH - Check if user is authenticated and has admin role
        const user = getUserFromReq(req);
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized, Silakan login kembali" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(req.url);
        const biroFilter = searchParams.get("biro");
        const jenisJabatanFilter = searchParams.get("jenis_jabatan");
        const lokasiFilter = searchParams.get("lokasi");        // Build WHERE clause
    // Build WHERE clause against peta_jabatan (no deleted_at column)
    const whereConditions: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        // Jika ada filter biro, gunakan recursive CTE untuk mendapatkan semua child nodes
        let biroFilterCTE = "";
        if (biroFilter) {
            biroFilterCTE = `
                WITH RECURSIVE unit_tree AS (
                    -- Base case: node dengan unit_kerja yang match
                    SELECT id, parent_id, unit_kerja, nama_jabatan
                    FROM peta_jabatan
                    WHERE unit_kerja ILIKE $${paramIndex}
                    
                    UNION ALL
                    
                    -- Recursive case: semua children dari node yang sudah dipilih
                    SELECT p.id, p.parent_id, p.unit_kerja, p.nama_jabatan
                    FROM peta_jabatan p
                    INNER JOIN unit_tree ut ON p.parent_id = ut.id
                )
            `;
            params.push(`%${biroFilter}%`);
            paramIndex++;
            whereConditions.push(`id IN (SELECT id FROM unit_tree)`);
        }

        if (jenisJabatanFilter) {
            whereConditions.push(`jenis_jabatan = $${paramIndex}`);
            params.push(jenisJabatanFilter);
            paramIndex++;
        }

        if (lokasiFilter) {
            if (lokasiFilter.toLowerCase() === "pusat") {
                whereConditions.push(`is_pusat = true`);
            } else if (lokasiFilter.toLowerCase() === "daerah") {
                whereConditions.push(`is_pusat = false`);
            }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

        // Query untuk summary total dari peta_jabatan
        const summaryQuery = `
            ${biroFilterCTE}
            SELECT 
                COUNT(*) as total_jabatan,
                COALESCE(SUM(bezetting), 0) as total_besetting,
                COALESCE(SUM(kebutuhan_pegawai), 0) as total_kebutuhan,
                COALESCE(SUM(kebutuhan_pegawai - bezetting), 0) as total_selisih
            FROM peta_jabatan
            ${whereClause}
        `;

        const summaryResult = await pool.query(summaryQuery, params);
        const summary = summaryResult.rows[0];

        // Query untuk breakdown by jenis_jabatan di peta_jabatan
        const byJenisQuery = `
            ${biroFilterCTE}
            SELECT 
                COALESCE(jenis_jabatan, 'Tidak Ditentukan') as jenis,
                COUNT(*) as jumlah_jabatan,
                COALESCE(SUM(bezetting), 0) as besetting,
                COALESCE(SUM(kebutuhan_pegawai), 0) as kebutuhan,
                COALESCE(SUM(kebutuhan_pegawai - bezetting), 0) as selisih
            FROM peta_jabatan
            ${whereClause}
            GROUP BY jenis_jabatan
            ORDER BY kebutuhan DESC
        `;

        const byJenisResult = await pool.query(byJenisQuery, params);
        const byJenis = byJenisResult.rows;

        // Query untuk breakdown by is_pusat (Pusat vs Daerah) di peta_jabatan
        const byLokasiQuery = `
            ${biroFilterCTE}
            SELECT 
                CASE 
                    WHEN is_pusat = true THEN 'Pusat'
                    ELSE 'Daerah'
                END as lokasi,
                COUNT(*) as jumlah_jabatan,
                COALESCE(SUM(bezetting), 0) as besetting,
                COALESCE(SUM(kebutuhan_pegawai), 0) as kebutuhan,
                COALESCE(SUM(kebutuhan_pegawai - bezetting), 0) as selisih
            FROM peta_jabatan
            ${whereClause}
            GROUP BY is_pusat
            ORDER BY is_pusat DESC
        `;

        const byLokasiResult = await pool.query(byLokasiQuery, params);
        const byLokasi = byLokasiResult.rows;

        // Query untuk breakdown by unit_kerja (biro) di peta_jabatan
        const byBiroQuery = `
            ${biroFilterCTE}
            SELECT 
                COALESCE(unit_kerja, 'Tidak Ada Unit') as unit_kerja,
                COUNT(*) as jumlah_jabatan,
                COALESCE(SUM(bezetting), 0) as besetting,
                COALESCE(SUM(kebutuhan_pegawai), 0) as kebutuhan,
                COALESCE(SUM(kebutuhan_pegawai - bezetting), 0) as selisih
            FROM peta_jabatan
            ${whereClause}
            GROUP BY unit_kerja
            ORDER BY kebutuhan DESC
            LIMIT 10
        `;

        const byBiroResult = await pool.query(byBiroQuery, params);
        const byBiro = byBiroResult.rows;

        // Query untuk breakdown by nama_jabatan di peta_jabatan
        const byNamaJabatanQuery = `
            ${biroFilterCTE}
            SELECT 
                COALESCE(nama_jabatan, 'Tidak Ada Nama') as nama_jabatan,
                COALESCE(jenis_jabatan, 'Tidak Ditentukan') as jenis_jabatan,
                COUNT(*) as jumlah_jabatan,
                COALESCE(SUM(bezetting), 0) as besetting,
                COALESCE(SUM(kebutuhan_pegawai), 0) as kebutuhan,
                COALESCE(SUM(kebutuhan_pegawai - bezetting), 0) as selisih
            FROM peta_jabatan
            ${whereClause}
            GROUP BY nama_jabatan, jenis_jabatan
            ORDER BY kebutuhan DESC, nama_jabatan ASC
            LIMIT 50
        `;

        const byNamaJabatanResult = await pool.query(byNamaJabatanQuery, params);
        const byNamaJabatan = byNamaJabatanResult.rows;

        // Get unique biro list for filter dropdown
        const biroListQuery = `
            SELECT DISTINCT unit_kerja 
            FROM peta_jabatan 
            WHERE unit_kerja IS NOT NULL
            ORDER BY unit_kerja
        `;
        const biroListResult = await pool.query(biroListQuery);
        const biroList = biroListResult.rows.map((r: any) => r.unit_kerja);

        // Get jenis_jabatan list for filter dropdown
        const jenisListQuery = `
            SELECT DISTINCT jenis_jabatan 
            FROM peta_jabatan 
            WHERE jenis_jabatan IS NOT NULL
            ORDER BY jenis_jabatan
        `;
        const jenisListResult = await pool.query(jenisListQuery);
        const jenisList = jenisListResult.rows.map((r: any) => r.jenis_jabatan);

        return NextResponse.json({
            summary: {
                total_jabatan: parseInt(summary.total_jabatan),
                total_besetting: parseInt(summary.total_besetting),
                total_kebutuhan: parseInt(summary.total_kebutuhan),
                total_selisih: parseInt(summary.total_selisih),
            },
            byJenis: byJenis.map((r: any) => ({
                jenis: r.jenis,
                jumlah_jabatan: parseInt(r.jumlah_jabatan),
                besetting: parseInt(r.besetting),
                kebutuhan: parseInt(r.kebutuhan),
                selisih: parseInt(r.selisih),
            })),
            byLokasi: byLokasi.map((r: any) => ({
                lokasi: r.lokasi,
                jumlah_jabatan: parseInt(r.jumlah_jabatan),
                besetting: parseInt(r.besetting),
                kebutuhan: parseInt(r.kebutuhan),
                selisih: parseInt(r.selisih),
            })),
            byBiro: byBiro.map((r: any) => ({
                unit_kerja: r.unit_kerja,
                jumlah_jabatan: parseInt(r.jumlah_jabatan),
                besetting: parseInt(r.besetting),
                kebutuhan: parseInt(r.kebutuhan),
                selisih: parseInt(r.selisih),
            })),
            byNamaJabatan: byNamaJabatan.map((r: any) => ({
                nama_jabatan: r.nama_jabatan,
                jenis_jabatan: r.jenis_jabatan,
                jumlah_jabatan: parseInt(r.jumlah_jabatan),
                besetting: parseInt(r.besetting),
                kebutuhan: parseInt(r.kebutuhan),
                selisih: parseInt(r.selisih),
            })),
            filters: {
                biroList,
                jenisList,
            },
        });
    } catch (error: any) {
        if (error?.message === "UNAUTHORIZED") {
            return NextResponse.json(
                { error: "Unauthorized, Silakan login kembali" },
                { status: 401 }
            );
        }
        return NextResponse.json(
            { error: "Failed to fetch dashboard data", details: error.message },
            { status: 500 }
        );
    }
}
