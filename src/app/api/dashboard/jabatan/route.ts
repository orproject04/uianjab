import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";

/**
 * GET /api/dashboard/jabatan
 * Query params:
 * - biro: filter by specific biro (optional)
 * - jenis_jabatan: filter by jenis_jabatan (optional)
 * - lokasi: filter by lokasi "pusat" or "daerah" (optional)
 */
export async function GET(req: NextRequest) {
    try {
        // AUTH - Check if user is authenticated and is admin
        const user = getUserFromReq(req);
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized, Silakan login kembali" },
                { status: 401 }
            );
        }

        // allow both full admin and admin-jf (special role limited to fungsional dashboard)
        if (!hasRole(user, ["admin", "admin-jf"])) {
            return NextResponse.json(
                { error: "Forbidden, hanya admin yang dapat mengakses data ini" },
                { status: 403 }
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

        // Special-case: if the caller is an admin-jf and didn't explicitly supply a jenis_jabatan,
        // restrict results to fungsional by default so the UI only needs to call the API once.
        let effectiveJenisFilter = jenisJabatanFilter;
        if (!effectiveJenisFilter && user && user.role === 'admin-jf') {
            effectiveJenisFilter = '__ADMIN_JF__';
        }

        // Jika ada filter biro, gunakan recursive CTE untuk mendapatkan semua child nodes
        let biroFilterCTE = "";
        if (biroFilter) {
            biroFilterCTE = `
                WITH RECURSIVE unit_tree AS (
                    -- Base case: node dengan unit_kerja yang match
                    SELECT id, parent_id, unit_kerja, nama_jabatan
                    FROM peta_jabatan
                    -- Use exact, case-insensitive match so "Persidangan I" does not also match "Persidangan II"
                    WHERE lower(trim(unit_kerja)) = lower(trim($${paramIndex}))
                    
                    UNION ALL
                    
                    -- Recursive case: semua children dari node yang sudah dipilih
                    SELECT p.id, p.parent_id, p.unit_kerja, p.nama_jabatan
                    FROM peta_jabatan p
                    INNER JOIN unit_tree ut ON p.parent_id = ut.id
                )
            `;
            // No wildcard to avoid pulling sibling units with similar names (e.g., I vs II)
            params.push(biroFilter);
            paramIndex++;
            whereConditions.push(`id IN (SELECT id FROM unit_tree)`);
        }

        if (effectiveJenisFilter) {
            if (effectiveJenisFilter === '__ADMIN_JF__') {
                // restrict to any jenis_jabatan that contains 'fungsional' (case-insensitive)
                whereConditions.push(`lower(coalesce(jenis_jabatan,'')) LIKE '%fungsional%'`);
            } else {
                whereConditions.push(`jenis_jabatan = $${paramIndex}`);
                params.push(effectiveJenisFilter);
                paramIndex++;
            }
        }

        if (lokasiFilter) {
            if (lokasiFilter.toLowerCase() === "pusat") {
                whereConditions.push(`is_pusat = true`);
            } else if (lokasiFilter.toLowerCase() === "daerah") {
                whereConditions.push(`is_pusat = false`);
            }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

        // Helper to run queries with labeled errors for easier debugging
        async function runQuery(label: string, query: string, paramsArr: any[] = []) {
            try {
                return await pool.query(query, paramsArr);
            } catch (err: any) {
                const msg = `Query Failed [${label}]: ${err?.message || String(err)}`;
                const e: any = new Error(msg);
                e.label = label;
                e.original = err;
                throw e;
            }
        }
        // Query untuk summary total dari peta_jabatan
        const summaryQuery = `
            ${biroFilterCTE}
            SELECT 
                -- Count distinct nama_jabatan, but for fungsional group similar ranks together
                COUNT(DISTINCT NULLIF(
                    CASE
                        WHEN lower(coalesce(jenis_jabatan, '')) LIKE '%fungsional%' THEN
                            regexp_replace(lower(trim(coalesce(nama_jabatan, ''))), '\\s+(?:ahli\\s+pertama|ahli\\s+muda|ahli\\s+madya|ahli\\s+utama|pertama|muda|madya|utama|pelaksana\\s+lanjutan|pelaksana|penyelia|terampil|mahir)(?:\\s*\\([^)]*\\))?$', '', 'i')
                        ELSE lower(trim(coalesce(nama_jabatan, '')))
                    END
                , '')) as total_jabatan,
                COALESCE(SUM(bezetting), 0) as total_bezetting,
                COALESCE(SUM(kebutuhan_pegawai), 0) as total_kebutuhan,
                COALESCE(SUM(bezetting - kebutuhan_pegawai), 0) as total_selisih
            FROM peta_jabatan
            ${whereClause}
        `;

        const summaryResult = await runQuery('summaryQuery', summaryQuery, params);
        const summary = summaryResult.rows[0];

        // Query untuk breakdown PNS vs PPPK dari pejabat jsonb
        const roleBreakdownQuery = `
            ${biroFilterCTE}
            SELECT 
                pegawai->>'role' as role,
                COUNT(*) as count
            FROM peta_jabatan,
                jsonb_array_elements(COALESCE(pejabat, '[]'::jsonb)) as pegawai
            ${whereClause}
            GROUP BY pegawai->>'role'
        `;

        const roleBreakdownResult = await runQuery('roleBreakdownQuery', roleBreakdownQuery, params);
        const roleBreakdown = {
            pns: 0,
            pppk: 0
        };
        
        for (const row of roleBreakdownResult.rows) {
            const role = (row.role || 'PNS').toUpperCase();
            const count = parseInt(row.count || '0', 10);
            if (role === 'PPPK') {
                roleBreakdown.pppk += count;
            } else {
                roleBreakdown.pns += count;
            }
        }

        // Add role breakdown to summary - ensure they are numbers
        summary.bezetting_pns = parseInt(String(roleBreakdown.pns), 10);
        summary.bezetting_pppk = parseInt(String(roleBreakdown.pppk), 10);

        // Query untuk breakdown by jenis_jabatan di peta_jabatan
        const byJenisQuery = `
            ${biroFilterCTE}
            SELECT 
                COALESCE(jenis_jabatan, 'Tidak Ditentukan') as jenis,
                -- Count distinct normalized nama_jabatan per jenis (dedupe similar fungsional ranks)
                COUNT(DISTINCT NULLIF(
                    CASE
                        WHEN lower(coalesce(jenis_jabatan, '')) LIKE '%fungsional%' THEN
                            regexp_replace(lower(trim(coalesce(nama_jabatan, ''))), '\\s+(?:ahli\\s+pertama|ahli\\s+muda|ahli\\s+madya|ahli\\s+utama|pertama|muda|madya|utama|pelaksana\\s+lanjutan|pelaksana|penyelia|terampil|mahir)(?:\\s*\\([^)]*\\))?$', '', 'i')
                        ELSE lower(trim(coalesce(nama_jabatan, '')))
                    END
                , '')) as jumlah_jabatan,
                COALESCE(SUM(bezetting), 0) as bezetting,
                COALESCE(SUM(kebutuhan_pegawai), 0) as kebutuhan,
                COALESCE(SUM(bezetting - kebutuhan_pegawai), 0) as selisih
            FROM peta_jabatan
            ${whereClause}
            GROUP BY jenis_jabatan
            ORDER BY kebutuhan DESC
        `;

        const byJenisResult = await runQuery('byJenisQuery', byJenisQuery, params);
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
                COALESCE(SUM(bezetting), 0) as bezetting,
                COALESCE(SUM(kebutuhan_pegawai), 0) as kebutuhan,
                COALESCE(SUM(bezetting - kebutuhan_pegawai), 0) as selisih
            FROM peta_jabatan
            ${whereClause}
            GROUP BY is_pusat
            ORDER BY is_pusat DESC
        `;

        const byLokasiResult = await runQuery('byLokasiQuery', byLokasiQuery, params);
        const byLokasi = byLokasiResult.rows;

        // Query untuk breakdown by biro (cari ancestor terdekat yang mengandung kata 'biro',
        // jika tidak ada gunakan ancestor paling atas). Setiap biro mengikutsertakan anak-anaknya.
        // If a biroFilterCTE exists, it already starts with 'WITH RECURSIVE ...' so we need to
        // merge it with our CTEs instead of prepending another WITH.
        const ctePrefix = biroFilterCTE
            ? biroFilterCTE.replace(/^[\s\S]*?(WITH\s+RECURSIVE\s+)/i, 'WITH RECURSIVE ') + ','
            : 'WITH RECURSIVE ';

        // Aggregate by units whose `jenis_jabatan` is ESELON II / JPT Pratama (include their descendants)
        // Only include rows that actually resolved to an ESELON root (exclude top-ancestor fallback)
        const byBiroWhereClause = whereClause && whereClause.length > 0
            ? `${whereClause} AND es.root_unit IS NOT NULL`
            : `WHERE es.root_unit IS NOT NULL`;

        const byBiroQuery = `
            ${ctePrefix}
            up AS (
                SELECT id, parent_id, unit_kerja, jenis_jabatan, id AS orig, 0 AS depth
                FROM peta_jabatan
                UNION ALL
                SELECT p.id, p.parent_id, p.unit_kerja, p.jenis_jabatan, up.orig, up.depth + 1
                FROM peta_jabatan p
                JOIN up ON p.id = up.parent_id
            ),
            eselon_match AS (
                SELECT orig, unit_kerja, depth,
                    ROW_NUMBER() OVER (PARTITION BY orig ORDER BY depth ASC) as rn
                FROM up
                WHERE lower(coalesce(jenis_jabatan, '')) = 'eselon ii / jpt pratama'
            ),
            eselon_selected AS (
                SELECT orig, unit_kerja as root_unit
                FROM eselon_match
                WHERE rn = 1
            ),
            top_ancestor AS (
                SELECT orig, unit_kerja as root_unit
                FROM up
                WHERE parent_id IS NULL
            )
            SELECT
                es.root_unit as unit_kerja,
                COUNT(p.id) as jumlah_jabatan,
                COALESCE(SUM(p.bezetting), 0) as bezetting,
                COALESCE(SUM(p.kebutuhan_pegawai), 0) as kebutuhan,
                COALESCE(SUM(p.bezetting - p.kebutuhan_pegawai), 0) as selisih
            FROM peta_jabatan p
            LEFT JOIN eselon_selected es ON p.id = es.orig
            ${byBiroWhereClause}
            GROUP BY es.root_unit
            ORDER BY kebutuhan DESC
            LIMIT 11
        `;

        const byBiroResult = await runQuery('byBiroQuery', byBiroQuery, params);
        const byBiro = byBiroResult.rows;

        // Query untuk breakdown by nama_jabatan di peta_jabatan (tanpa grouping)
        const byNamaJabatanQuery = `
            ${biroFilterCTE}
            SELECT 
                COALESCE(nama_jabatan, 'Tidak Ada Nama') as nama_jabatan,
                COALESCE(unit_kerja, 'Tidak Ada Unit') as unit_kerja,
                COALESCE(jenis_jabatan, 'Tidak Ditentukan') as jenis_jabatan,
                bezetting,
                kebutuhan_pegawai as kebutuhan,
                (bezetting - kebutuhan_pegawai) as selisih
            FROM peta_jabatan
            ${whereClause}
            ORDER BY kebutuhan DESC, nama_jabatan ASC
        `;

        const byNamaJabatanResult = await runQuery('byNamaJabatanQuery', byNamaJabatanQuery, params);
        const byNamaJabatan = byNamaJabatanResult.rows;

        // Also return lists of normalized unique names for verification
        const normalizedNameExpr = `(
                    CASE
                        WHEN lower(coalesce(jenis_jabatan, '')) LIKE '%fungsional%' THEN
                            regexp_replace(lower(trim(coalesce(nama_jabatan, ''))), '\\s+(?:ahli\\s+pertama|ahli\\s+muda|ahli\\s+madya|ahli\\s+utama|pertama|muda|madya|utama|pelaksana\\s+lanjutan|pelaksana|penyelia|terampil|mahir)(?:\\s*\\([^)]*\\))?$', '', 'i')
                        ELSE lower(trim(coalesce(nama_jabatan, '')))
                    END
                )`;

        const allNamesQuery = `
            ${biroFilterCTE}
            SELECT array_remove(array_agg(DISTINCT ${normalizedNameExpr}), NULL) as unique_names
            FROM peta_jabatan
            ${whereClause}
        `;
        const allNamesResult = await runQuery('allNamesQuery', allNamesQuery, params);
        const allNames = (allNamesResult.rows[0] && allNamesResult.rows[0].unique_names) || [];

        const byJenisNamesQuery = `
            ${biroFilterCTE}
            SELECT COALESCE(jenis_jabatan, 'Tidak Ditentukan') as jenis,
                array_remove(array_agg(DISTINCT ${normalizedNameExpr}), NULL) as names
            FROM peta_jabatan
            ${whereClause}
            GROUP BY jenis_jabatan
        `;
        const byJenisNamesResult = await runQuery('byJenisNamesQuery', byJenisNamesQuery, params);
        const byJenisNames = byJenisNamesResult.rows.map((r: any) => ({ jenis: r.jenis, names: r.names || [] }));

        // Get unique biro list for filter dropdown
        const biroListQuery = `
            SELECT DISTINCT unit_kerja 
            FROM peta_jabatan 
            WHERE unit_kerja IS NOT NULL
            ORDER BY unit_kerja
        `;
        const biroListResult = await runQuery('biroListQuery', biroListQuery);
        const biroList = biroListResult.rows.map((r: any) => r.unit_kerja);

        // Get jenis_jabatan list for filter dropdown
        const jenisListQuery = `
            SELECT DISTINCT jenis_jabatan 
            FROM peta_jabatan 
            WHERE jenis_jabatan IS NOT NULL
            ORDER BY jenis_jabatan
        `;
        const jenisListResult = await runQuery('jenisListQuery', jenisListQuery);
        const jenisList = jenisListResult.rows.map((r: any) => r.jenis_jabatan);

        return NextResponse.json({
            summary: {
                total_jabatan: Number(summary.total_jabatan ?? 0),
                total_bezetting: Number(summary.total_bezetting ?? 0),
                total_kebutuhan: Number(summary.total_kebutuhan ?? 0),
                total_selisih: Number(summary.total_selisih ?? 0),
                bezetting_pns: Number(summary.bezetting_pns ?? 0),
                bezetting_pppk: Number(summary.bezetting_pppk ?? 0),
            },
            byJenis: byJenis.map((r: any) => ({
                jenis: r.jenis,
                jumlah_jabatan: Number(r.jumlah_jabatan ?? 0),
                bezetting: Number(r.bezetting ?? 0),
                kebutuhan: Number(r.kebutuhan ?? 0),
                selisih: Number(r.selisih ?? 0),
            })),
            byLokasi: byLokasi.map((r: any) => ({
                lokasi: r.lokasi,
                jumlah_jabatan: Number(r.jumlah_jabatan ?? 0),
                bezetting: Number(r.bezetting ?? 0),
                kebutuhan: Number(r.kebutuhan ?? 0),
                selisih: Number(r.selisih ?? 0),
            })),
            byBiro: byBiro.map((r: any) => ({
                unit_kerja: r.unit_kerja,
                jumlah_jabatan: Number(r.jumlah_jabatan ?? 0),
                bezetting: Number(r.bezetting ?? 0),
                kebutuhan: Number(r.kebutuhan ?? 0),
                selisih: Number(r.selisih ?? 0),
            })),
            byNamaJabatan: byNamaJabatan.map((r: any) => ({
                nama_jabatan: r.nama_jabatan,
                unit_kerja: r.unit_kerja,
                jenis_jabatan: r.jenis_jabatan,
                bezetting: Number(r.bezetting ?? 0),
                kebutuhan: Number(r.kebutuhan ?? 0),
                selisih: Number(r.selisih ?? 0),
            })),
            // For verification: lists of normalized unique names
            all_unique_names: allNames,
            byJenis_names: byJenisNames,
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
