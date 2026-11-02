import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";
import { addCorsHeaders, handleCorsOptions } from "@/lib/cors";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function OPTIONS(req: NextRequest) {
    return handleCorsOptions(req);
}

// GET: Ambil daftar semua versi peta jabatan
export async function GET(req: NextRequest) {
    const origin = req.headers.get('origin');
    try {
        const user = getUserFromReq(req);
        if (!user) {
            return addCorsHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), origin);
        }

        const { rows } = await pool.query(
            `SELECT id, nama_versi, status, keterangan, created_at, updated_at 
             FROM peta_jabatan_versi 
             ORDER BY (status = 'AKTIF') DESC, created_at DESC`
        );

        return addCorsHeaders(NextResponse.json({ success: true, data: rows }), origin);
    } catch (e: any) {
        console.error("GET /api/peta-jabatan/versi ERROR:", e);
        return addCorsHeaders(NextResponse.json({ error: "Internal error" }, { status: 500 }), origin);
    }
}

// POST: Aksi Clone (Buat Draft) atau Publish (Sahkan Draft)
export async function POST(req: NextRequest) {
    const origin = req.headers.get('origin');
    const client = await pool.connect();
    
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return addCorsHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }), origin);
        }

        const body = await req.json();
        const { action } = body;

        if (action === 'CLONE') {
            const { source_id, new_id, nama_versi, status = 'DRAFT', keterangan = '' } = body;

            if (!new_id || !nama_versi) {
                return addCorsHeaders(NextResponse.json({ error: "new_id dan nama_versi wajib diisi" }, { status: 400 }), origin);
            }

            // Cari source_id: jika tidak diberikan atau 'AKTIF', ambil versi yang status = 'AKTIF'
            let srcId = source_id;
            if (!srcId || srcId === 'AKTIF') {
                const activeRes = await client.query(`SELECT id FROM peta_jabatan_versi WHERE status = 'AKTIF' LIMIT 1`);
                srcId = activeRes.rows[0]?.id;
            } else {
                const sourceCheck = await client.query(`SELECT id FROM peta_jabatan_versi WHERE id = $1`, [srcId]);
                if (sourceCheck.rowCount === 0) {
                    const activeRes = await client.query(`SELECT id FROM peta_jabatan_versi WHERE status = 'AKTIF' LIMIT 1`);
                    srcId = activeRes.rows[0]?.id;
                }
            }

            if (!srcId) {
                return addCorsHeaders(NextResponse.json({ error: "Source versi tidak ditemukan" }, { status: 404 }), origin);
            }

            const dupCheck = await client.query(`SELECT 1 FROM peta_jabatan_versi WHERE id = $1`, [new_id]);
            if (dupCheck.rowCount && dupCheck.rowCount > 0) {
                return addCorsHeaders(NextResponse.json({ error: `Draft dengan nama ini sudah pernah dibuat (${new_id}). Silakan gunakan nama yang berbeda.` }, { status: 400 }), origin);
            }

            await client.query('BEGIN');

            // 1. Buat versi baru
            await client.query(
                `INSERT INTO peta_jabatan_versi (id, nama_versi, status, keterangan) VALUES ($1, $2, $3, $4)`,
                [new_id, nama_versi, status, keterangan]
            );

            // 2. Clone peta_jabatan (dengan ID uuid yang sama, tapi versi_id baru)
            await client.query(
                `INSERT INTO peta_jabatan 
                 (id, parent_id, jabatan_id, nama_jabatan, unit_kerja, slug, level, order_index, kebutuhan_pegawai, is_pusat, jenis_jabatan, pejabat_st, pejabat_sk, created_at, updated_at, updated_by, deleted_at, versi_id)
                 SELECT 
                 id, parent_id, jabatan_id, nama_jabatan, unit_kerja, slug, level, order_index, kebutuhan_pegawai, is_pusat, jenis_jabatan, pejabat_st, pejabat_sk, created_at, updated_at, updated_by, deleted_at, $2
                 FROM peta_jabatan WHERE versi_id = $1
                 ORDER BY level ASC`,
                [srcId, new_id]
            );

            // 3. Clone tugas_pokok_abk
            await client.query(
                `INSERT INTO tugas_pokok_abk
                 (id, peta_jabatan_id, tugas_pokok_id, jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai, created_at, updated_at, versi_id)
                 SELECT 
                 id, peta_jabatan_id, tugas_pokok_id, jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai, created_at, updated_at, $2
                 FROM tugas_pokok_abk WHERE versi_id = $1`,
                [srcId, new_id]
            );

            await client.query('COMMIT');
            return addCorsHeaders(NextResponse.json({ success: true, message: `Draft "${nama_versi}" berhasil dibuat.` }), origin);
        }

        if (action === 'PUBLISH') {
            const { draft_id, archive_name } = body;

            if (!draft_id) {
                return addCorsHeaders(NextResponse.json({ error: "draft_id wajib diisi" }, { status: 400 }), origin);
            }

            const targetCheck = await client.query(`SELECT status FROM peta_jabatan_versi WHERE id = $1`, [draft_id]);
            if (targetCheck.rowCount === 0) {
                return addCorsHeaders(NextResponse.json({ error: "Versi tidak ditemukan" }, { status: 404 }), origin);
            }
            if (targetCheck.rows[0].status === 'AKTIF') {
                return addCorsHeaders(NextResponse.json({ error: "Versi ini sudah aktif" }, { status: 400 }), origin);
            }

            const currentAktifRes = await client.query(`SELECT nama_versi FROM peta_jabatan_versi WHERE status = 'AKTIF' LIMIT 1`);
            const currentAktifName: string | undefined = currentAktifRes.rows[0]?.nama_versi;

            // Nama arsip otomatis dibuat agar proses publish tidak bergantung pada
            // input manual sesaat (archive_name tetap bisa override jika dikirim).
            const finalArchiveName = archive_name?.trim() || (currentAktifName
                ? `${currentAktifName} (Diarsipkan ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })})`
                : null);

            await client.query('BEGIN');

            // 1. Ubah versi yang saat ini AKTIF menjadi ARSIP (ID tetap permanen, hanya status yang berubah)
            if (finalArchiveName) {
                await client.query(
                    `UPDATE peta_jabatan_versi SET status = 'ARSIP', nama_versi = $1, updated_at = now() WHERE status = 'AKTIF'`,
                    [finalArchiveName]
                );
            } else {
                await client.query(
                    `UPDATE peta_jabatan_versi SET status = 'ARSIP', updated_at = now() WHERE status = 'AKTIF'`
                );
            }

            // 2. Sahkan versi terpilih (draft ATAU arsip) menjadi AKTIF — mendukung
            //    publish draft baru maupun memulihkan versi arsip lama.
            await client.query(
                `UPDATE peta_jabatan_versi SET status = 'AKTIF', updated_at = now() WHERE id = $1`,
                [draft_id]
            );

            await client.query('COMMIT');
            return addCorsHeaders(NextResponse.json({ success: true, message: `Versi berhasil disahkan menjadi Peta Jabatan Aktif.` }), origin);
        }

        if (action === 'RENAME') {
            const { id, nama_versi, keterangan } = body;

            if (!id || !nama_versi || !String(nama_versi).trim()) {
                return addCorsHeaders(NextResponse.json({ error: "id dan nama_versi wajib diisi" }, { status: 400 }), origin);
            }

            const verCheck = await client.query(`SELECT id FROM peta_jabatan_versi WHERE id = $1`, [id]);
            if (verCheck.rowCount === 0) {
                return addCorsHeaders(NextResponse.json({ error: "Versi tidak ditemukan" }, { status: 404 }), origin);
            }

            await client.query(
                `UPDATE peta_jabatan_versi SET nama_versi = $1, keterangan = $2, updated_at = now() WHERE id = $3`,
                [String(nama_versi).trim(), keterangan ?? null, id]
            );

            return addCorsHeaders(NextResponse.json({ success: true, message: `Versi berhasil diperbarui.` }), origin);
        }

        if (action === 'DELETE') {
            const { id } = body;

            if (!id) {
                return addCorsHeaders(NextResponse.json({ error: "id wajib diisi" }, { status: 400 }), origin);
            }

            const verCheck = await client.query(`SELECT status, nama_versi FROM peta_jabatan_versi WHERE id = $1`, [id]);
            if (verCheck.rowCount === 0) {
                return addCorsHeaders(NextResponse.json({ error: "Versi tidak ditemukan" }, { status: 404 }), origin);
            }
            if (verCheck.rows[0].status === 'AKTIF') {
                return addCorsHeaders(NextResponse.json({ error: "Versi yang sedang aktif tidak dapat dihapus" }, { status: 400 }), origin);
            }

            await client.query('BEGIN');

            // tugas_pokok_abk ikut terhapus otomatis lewat ON DELETE CASCADE (fk_abk_peta)
            await client.query(`DELETE FROM peta_jabatan WHERE versi_id = $1`, [id]);
            await client.query(`DELETE FROM peta_jabatan_versi WHERE id = $1`, [id]);

            await client.query('COMMIT');
            return addCorsHeaders(NextResponse.json({ success: true, message: `Versi "${verCheck.rows[0].nama_versi}" berhasil dihapus.` }), origin);
        }

        return addCorsHeaders(NextResponse.json({ error: "Action tidak valid" }, { status: 400 }), origin);
    } catch (e: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error("POST /api/peta-jabatan/versi ERROR:", e);
        return addCorsHeaders(NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 }), origin);
    } finally {
        client.release();
    }
}
