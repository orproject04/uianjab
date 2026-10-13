import pool from "@/lib/db";

/**
 * Mengambil ID versi peta jabatan yang sedang aktif di database jika parameter tidak diisi atau 'AKTIF'
 */
export async function resolveVersiId(versiIdParam?: string | null): Promise<string> {
    if (!versiIdParam || versiIdParam === "AKTIF") {
        try {
            const { rows } = await pool.query(
                `SELECT id FROM peta_jabatan_versi WHERE status = 'AKTIF' LIMIT 1`
            );
            if (rows.length > 0 && rows[0].id) {
                return rows[0].id;
            }
        } catch (e) {
            console.error("resolveVersiId error:", e);
        }
        return "PETA_JABATAN_OKTOBER_2026";
    }
    return versiIdParam;
}
