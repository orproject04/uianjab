// src/lib/pegawai-sk-sync.ts
import pool from "./db";
import { writeFile, mkdir, readdir, readFile } from "fs/promises";
import { join } from "path";
import https from "https";
import { saveSyncHistory } from "./pegawai-sync";

const allowInsecureExternalApiTls =
  process.env.NODE_ENV !== 'production' &&
  process.env.ALLOW_INSECURE_EXTERNAL_API_TLS === 'true';

async function fetchJsonInsecureTls(
  url: string,
  headers: Record<string, string>,
  timeout: number
): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        headers,
        rejectUnauthorized: false,
        timeout,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          const status = res.statusCode || 500;
          if (status < 200 || status >= 300) {
            return reject(new Error(`HTTP error! status: ${status} - ${body}`));
          }
          // Handle the double JSON issue
          // The API sometimes returns 2 identical JSON objects concatenated: {...}{...}
          let parsedBody = body;
          try {
            // Check if there are multiple JSON objects concatenated
            const jsonEnds = body.match(/}{/g);
            if (jsonEnds && jsonEnds.length > 0) {
              const firstEnd = body.indexOf('}{') + 1;
              parsedBody = body.substring(0, firstEnd);
            }
            resolve(JSON.parse(parsedBody));
          } catch (e: any) {
            reject(new Error(`Failed to parse JSON: ${e.message}. Raw: ${parsedBody.substring(0, 100)}...`));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeout}ms`));
    });

    req.on('error', (e) => reject(e));
    req.end();
  });
}

// concurrency limit for promises
async function pMap<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  let currentIndex = 0;

  const workers = Array(concurrency).fill(null).map(async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

export interface UnmatchedRecord {
  name: string;
  nip: string;
  role: string;
  searchKey: string;
  reason: string;
  jabatanNama?: string;
  unorNama?: string;
  statusPegawai?: string;
}

// Function to normalize strings for better matching
function normalizeSearchStr(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ') // replace non-alphanumeric with space
    .replace(/\s+/g, ' ')       // collapse multiple spaces
    .trim();
}

export interface SyncResult {
  totalFetched: number;
  totalMatched: number;
  totalInactive: number;
  unmatchedRecords: any[];
  inactiveRecords: any[];
  errors: any[];
  logFilePaths?: {
    json?: string;
  };
  syncType?: string;
}

export type ProgressCallback = (msg: string, pct: number) => void;

async function saveSkDataErrorRecords(records: UnmatchedRecord[], syncedBy?: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const incomingNips = records.map(r => r.nip);

    if (incomingNips.length === 0) {
      await client.query("DELETE FROM data_error WHERE tipe_sync = 'SK'");
    } else {
      await client.query(
        "DELETE FROM data_error WHERE tipe_sync = 'SK' AND NOT (nip = ANY($1::text[]))",
        [incomingNips]
      );

      const { rows: existingRows } = await client.query<{
        nip: string;
      }>(
        "SELECT nip FROM data_error WHERE tipe_sync = 'SK' AND nip = ANY($1::text[])",
        [incomingNips]
      );

      const existingByNip = new Set(existingRows.map(row => row.nip));

      for (const rec of records) {
        if (existingByNip.has(rec.nip)) {
          await client.query(
            `UPDATE data_error
             SET nama = $1,
                 jabatan = $2,
                 unit_organisasi = $3,
                 status = $4,
                 synced_by = $5,
                 saran_perbaikan = $6,
                 synced_at = CURRENT_TIMESTAMP
             WHERE nip = $7 AND tipe_sync = 'SK'`,
            [
              rec.name || '',
              rec.jabatanNama || '',
              rec.unorNama || '',
              rec.statusPegawai || 'PNS',
              syncedBy || null,
              rec.reason || null,
              rec.nip,
            ]
          );
        } else {
          await client.query(
            `INSERT INTO data_error (
              nip,
              nama,
              jabatan,
              unit_organisasi,
              status,
              saran_perbaikan,
              synced_by,
              tipe_sync
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SK')`,
            [
              rec.nip,
              rec.name || '',
              rec.jabatanNama || '',
              rec.unorNama || '',
              rec.statusPegawai || 'PNS',
              rec.reason || null,
              syncedBy || null,
            ]
          );
        }
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function runSkSync(
  progress?: ProgressCallback,
  saveLogs: boolean = true
): Promise<SyncResult> {
  const externalApiToken = process.env.EXTERNAL_SK_API_TOKEN;
  if (!externalApiToken) {
    throw new Error('EXTERNAL_SK_API_TOKEN is not configured in .env.local');
  }

  const result: SyncResult = {
    totalFetched: 0,
    totalMatched: 0,
    totalInactive: 0,
    unmatchedRecords: [],
    inactiveRecords: [],
    errors: [],
    syncType: 'SK_PEGAWAI',
  };

  const API_TIMEOUT = parseInt(process.env.EXTERNAL_API_TIMEOUT || "30000");
  const BATCH_CONCURRENCY = 3;
  const logsPath = join(process.cwd(), "storage", "sync-logs", "sk");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const updateProgress = (msg: string, p: number) => {
    if (progress) progress(msg, p);
  };

  updateProgress("Mengambil daftar talenta (Surat Keputusan)...", 5);

  const fetchOpts: RequestInit = {
    method: "GET",
    headers: {
      "app-token": externalApiToken,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(API_TIMEOUT)
  };

  try {
    let talentaData;
    const listUrl = process.env.EXTERNAL_SK_API_URL_LIST || "https://okk.dpd.go.id/dpd-portal/openapi/talenta/list";

    if (allowInsecureExternalApiTls) {
      talentaData = await fetchJsonInsecureTls(listUrl, fetchOpts.headers as Record<string, string>, API_TIMEOUT);
    } else {
      const response = await fetch(listUrl, fetchOpts);
      if (!response.ok) {
        throw new Error(`Talenta list HTTP error: ${response.status}`);
      }
      const rawText = await response.text();
      // Handle double JSON response `{...}{...}`
      let parsedText = rawText;
      const jsonEnds = rawText.match(/}{/g);
      if (jsonEnds && jsonEnds.length > 0) {
        const firstEnd = rawText.indexOf('}{') + 1;
        parsedText = rawText.substring(0, firstEnd);
      }
      talentaData = JSON.parse(parsedText);
    }

    if (!talentaData?.data?.list) {
      throw new Error('Format response dari API Talenta tidak sesuai');
    }

    const allTalenta = talentaData.data.list as any[];
    result.totalFetched = allTalenta.length;

    // Filter active and limit to 20 for testing
    // const activeTalenta = allTalenta.filter(t => (t.st_active || "").trim() === "1").slice(0, 20);
    const activeTalenta = allTalenta.filter(t => (t.st_active || "").trim() === "1");

    result.totalInactive = allTalenta.length - activeTalenta.length;

    updateProgress(`Berhasil mengambil ${allTalenta.length} profil. Memulai pengambilan profil (${activeTalenta.length} aktif)...`, 10);

    if (activeTalenta.length > 0) {
      console.log("\n[SYNC SK] === PREVIEW TALENTA PERTAMA ===");
      console.log(JSON.stringify(activeTalenta[0], null, 2));
      console.log("=========================================\n");
    }

    // Fetch Profil
    let completedCount = 0;
    const profiles = await pMap(activeTalenta, async (t, index) => {
      try {
        const apiProfilUrlBase = process.env.EXTERNAL_SK_API_URL_PROFIL || 'https://okk.dpd.go.id/dpd-portal/openapi/profil';
        // Ensure the base URL doesn't end with a slash if we're adding one, or construct safely
        const pUrl = `${apiProfilUrlBase.replace(/\/$/, '')}/${t.NIP}`;

        let pData;
        if (allowInsecureExternalApiTls) {
          pData = await fetchJsonInsecureTls(pUrl, fetchOpts.headers as Record<string, string>, 30000);
        } else {
          const res = await fetch(pUrl, { ...fetchOpts, signal: AbortSignal.timeout(30000) });
          pData = await res.json();
        }

        if (pData) {
          if (pData.code === 200 && (pData.data?.code === 1 || pData.data?.code === '1')) {
            console.log(`[SYNC SK] Profil: ${t.NIP} - ${t.nama_gelar || ''} -> BERHASIL`);
          } else {
            console.log(`[SYNC SK] Profil: ${t.NIP} - ${t.nama_gelar || ''} -> GAGAL/TIDAK DITEMUKAN (${JSON.stringify(pData.data || pData.message)})`);
          }
        }

        // report progress for every single profile so user sees it moving
        completedCount++;
        const pct = 10 + Math.floor((completedCount / activeTalenta.length) * 40);
        updateProgress(`Mengambil profil (${completedCount}/${activeTalenta.length}): ${t.nama_gelar || t.NIP}`, pct);

        if (pData?.code === 200 && pData?.data) {
          // If the profile API returned "Data tidak ditemukan" code (code 0)
          // Keep it in unmatchedRecords because the user legitimately doesn't have a profile
          if (pData.data.code === 0) {
            return {
              nip: t.NIP,
              name: t.nama_gelar || t.nama || "",
              jabatanNama: "", // Will cause it to fall into unmatchedRecords (unless it's Sekjen)
              unorNama: "",
              statusPegawai: "-",
              api_error: "Data profil kosong (Data tidak ditemukan)",
              _raw: { listData: t, profileData: pData.data }
            };
          }

          // If the profile API returned an actual error (e.g. 101504 Send timeout)
          // Push to result.errors and return null so it doesn't pollute unmatchedRecords
          if (String(pData.data.code).startsWith('1015') || pData.data.code > 1) {
            let reasonStr = '';
            if (pData.data.description === 'Send timeout') {
              reasonStr = 'Gagal menghubungi server Talenta (Send timeout)';
            } else if (pData.data.description) {
              reasonStr = `Error dari API Talenta: ${pData.data.description}`;
            } else {
              reasonStr = `Error Code ${pData.data.code}`;
            }
            result.errors.push({
              nip: t.NIP,
              name: t.nama_gelar || t.nama || "",
              reason: reasonStr
            });
            return null;
          }

          const profileObj = pData.data.data || pData.data;

          if (profileObj.kedudukanPnsNama && profileObj.kedudukanPnsNama.toLowerCase().includes('pensiun')) {
            return {
              nip: t.NIP,
              name: t.nama_gelar || profileObj.nama_gelar || profileObj.nama || "",
              jabatanNama: "", // Kosongkan agar gagal mapping dan masuk ke data_error
              unorNama: "",
              statusPegawai: "INACTIVE",
              api_error: `Status Pegawai: ${profileObj.kedudukanPnsNama} (Inaktif)`,
              _raw: { listData: t, profileData: pData.data }
            };
          }

          return {
            nip: t.NIP,
            name: t.nama_gelar || profileObj.nama_gelar || profileObj.nama || "",
            jabatanNama: profileObj.jabatanNama || "",
            unorNama: profileObj.unorNama || "",
            statusPegawai: profileObj.statusPegawai || "PNS",
            _raw: { listData: t, profileData: pData.data }
          };
        } else {
          return null; // failed to get valid profile
        }
      } catch (err: any) {
        result.errors.push({
          nip: t.NIP,
          name: t.nama_gelar || t.nama || "",
          reason: `Gagal fetch dari API eksternal (${err.message})`
        });
        return null;
      }
    }, BATCH_CONCURRENCY);

    const validProfiles = profiles.filter(Boolean) as any[];

    updateProgress("Mempersiapkan data pemetaan ke peta jabatan...", 50);

    // Grouping by jabatanNama and unorNama
    const grouped = new Map<string, any[]>();
    for (const p of validProfiles) {
      const jNameNorm = normalizeSearchStr(p.jabatanNama);
      const uNameNorm = normalizeSearchStr(p.unorNama);
      const key = `${jNameNorm}||${uNameNorm}`;

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push({
        name: p.name,
        nip: p.nip,
        role: p.statusPegawai,
        api_error: p.api_error,
        jabatanNama: p.jabatanNama,
        unorNama: p.unorNama,
      });
    }

    updateProgress("Melakukan update ke database...", 70);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Clear existing SK pejabat
      await client.query("UPDATE peta_jabatan SET pejabat_sk = '[]'::jsonb WHERE deleted_at IS NULL");

      // We need to fetch peta_jabatan mapping
      const resPeta = await client.query(
        "SELECT id, nama_jabatan, unit_kerja FROM peta_jabatan WHERE deleted_at IS NULL"
      );

      // To optimize match, build a lookup table
      const pjRows = resPeta.rows;

      let matchCount = 0;

      // For each pj row, find its matching profiles
      for (const pj of pjRows) {
        const jNameNorm = normalizeSearchStr(pj.nama_jabatan);
        const uNameNorm = normalizeSearchStr(pj.unit_kerja);
        const key = `${jNameNorm}||${uNameNorm}`;

        const matchedPegawai = grouped.get(key);
        if (matchedPegawai && matchedPegawai.length > 0) {
          // Urutkan berdasarkan NIP terkecil
          matchedPegawai.sort((a, b) => (a.nip || '').localeCompare(b.nip || ''));

          await client.query(
            "UPDATE peta_jabatan SET pejabat_sk = $1::jsonb WHERE id = $2::uuid",
            [JSON.stringify(matchedPegawai), pj.id]
          );
          matchCount += matchedPegawai.length;
          // Mark as processed
          grouped.delete(key);
        }
      }

      result.totalMatched = matchCount;

      // The remaining in grouped are unmatched
      for (const [key, arr] of grouped.entries()) {
        result.unmatchedRecords.push(...arr.map(p => {
          const apiError = p.api_error;
          delete p.api_error; // remove from object so it doesn't pollute
          return {
            ...p,
            jabatanNama: p.jabatanNama || '',
            unorNama: p.unorNama || '',
            statusPegawai: p.role || 'PNS',
            searchKey: key,
            reason: apiError || 'Tidak ditemukan di peta_jabatan (jabatanNama dan unorNama tidak cocok)'
          };
        }));
      }

      // Check and set default for Sekretaris Jenderal DPD RI if not matched
      updateProgress("Memeriksa Sekretaris Jenderal...", 85);
      try {
        const resSekjen = await client.query(
          `SELECT id, pejabat_sk as pejabat 
           FROM peta_jabatan 
           WHERE LOWER(nama_jabatan) = LOWER('Sekretaris Jenderal DPD RI') AND deleted_at IS NULL`
        );

        if (resSekjen.rows.length > 0) {
          for (const sekjen of resSekjen.rows) {
            const pejabat = sekjen.pejabat;
            // Check if pejabat is empty or null
            if (!pejabat || (Array.isArray(pejabat) && pejabat.length === 0)) {
              // Try to find the NIP from allTalenta if NIP 70070207 is not hardcoded, but user explicitly wants this NIP
              const sekjenData = allTalenta.find(t => t.NIP === '70070207') || { NIP: '70070207', nama_gelar: 'H. Mohammad Iqbal, S.I.K, M.H.' };
              const defaultSekjen = [
                {
                  "nip": sekjenData.NIP,
                  "name": sekjenData.nama_gelar || "H. Mohammad Iqbal, S.I.K, M.H.",
                  "role": "PNS"
                }
              ];

              await client.query(
                `UPDATE peta_jabatan 
                 SET pejabat_sk = $1::jsonb
                 WHERE id = $2`,
                [JSON.stringify(defaultSekjen), sekjen.id]
              );

              // Remove Sekjen from unmatchedRecords since we've mapped him manually
              result.unmatchedRecords = result.unmatchedRecords.filter(r => r.nip !== sekjenData.NIP);
              result.totalMatched += 1;
            }
          }
        }
      } catch (sekjenError: any) {
        console.error('[SYNC SK] Error setting default Sekjen:', sekjenError);
      }

      await client.query("COMMIT");
      updateProgress("Update database selesai", 90);
    } catch (e: any) {
      await client.query("ROLLBACK");
      throw new Error(`Database error: ${e.message}`);
    } finally {
      client.release();
    }
    if (saveLogs) {
      updateProgress("Menyimpan log data error...", 93);
      try {
        await saveSkDataErrorRecords(result.unmatchedRecords);
      } catch (err: any) {
        console.error('[SYNC SK] Failed to save data error records:', err);
        result.errors.push(`Gagal menyimpan data_error: ${err.message}`);
      }

      updateProgress("Menyimpan log...", 95);
      await mkdir(logsPath, { recursive: true });
      const jsonPath = join(logsPath, `sync-sk-${timestamp}.json`);
      await writeFile(jsonPath, JSON.stringify(result, null, 2));
      result.logFilePaths = { json: jsonPath };
    }

    // Save to sync history database
    updateProgress("Menyimpan riwayat sinkronisasi...", 98);
    try {
      await saveSyncHistory(result);
    } catch (saveError: any) {
      console.error('[SYNC SK] Failed to save sync history:', saveError);
    }

    updateProgress("Sinkronisasi SK Selesai", 100);
    return result;

  } catch (err: any) {
    result.errors.push(`Fatal Error: ${err.message}`);
    throw err;
  }
}

export async function retrySkErrors(
  progress?: (msg: string, pct: number) => void,
  saveLogs: boolean = true
): Promise<SyncResult> {
  const result: SyncResult = {
    totalFetched: 0,
    totalMatched: 0,
    totalInactive: 0,
    unmatchedRecords: [],
    inactiveRecords: [],
    errors: [],
    syncType: 'SK_PEGAWAI', // Use SK_PEGAWAI so it appears as the latest sync in UI
  };

  const API_TIMEOUT = parseInt(process.env.EXTERNAL_API_TIMEOUT || "30000");
  const BATCH_CONCURRENCY = 3;
  const logsPath = join(process.cwd(), "storage", "sync-logs", "sk");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const updateProgress = (msg: string, p: number) => {
    if (progress) progress(msg, p);
  };

  updateProgress("Mencari log error terakhir...", 5);

  let lastErrors: any[] = [];
  let prevTotalFetched = 0;
  let prevTotalMatched = 0;
  let prevTotalInactive = 0;
  let prevUnmatchedRecords: any[] = [];

  try {
    const files = await readdir(logsPath);
    // Karena penamaan sudah disamakan menjadi sync-sk-, kita cukup mencari sync-sk-
    const syncFiles = files.filter(f => f.startsWith("sync-sk-") && f.endsWith(".json"));
    if (syncFiles.length === 0) {
      throw new Error("Tidak ada file log sinkronisasi sebelumnya.");
    }
    syncFiles.sort();
    const latestFile = syncFiles[syncFiles.length - 1];
    const content = await readFile(join(logsPath, latestFile), "utf8");
    const json = JSON.parse(content);

    // Simpan stat sebelumnya untuk diakumulasikan
    prevTotalFetched = json.totalFetched || 0;
    prevTotalMatched = json.totalMatched || 0;
    prevTotalInactive = json.totalInactive || 0;
    prevUnmatchedRecords = json.unmatchedRecords || [];

    // Filter to only errors that are objects with 'nip' (ignoring any leftover strings if any)
    if (!json.errors || json.errors.length === 0) {
      throw new Error("Tidak ada NIP yang error pada sinkronisasi terakhir.");
    }

    lastErrors = json.errors.filter((e: any) => e && e.nip);
    if (lastErrors.length === 0) {
      throw new Error("Tidak ditemukan NIP yang error (format lama tidak didukung untuk retry).");
    }
  } catch (err: any) {
    throw new Error(`Gagal membaca log terakhir: ${err.message}`);
  }

  const errorNips = lastErrors.map(e => e.nip);
  // Akumulasi total
  result.totalFetched = prevTotalFetched;
  result.totalInactive = prevTotalInactive;
  result.unmatchedRecords = [...prevUnmatchedRecords];

  updateProgress(`Ditemukan ${errorNips.length} NIP yang error. Mengambil profil dari AKK...`, 10);

  const activeTalenta = lastErrors.map(e => ({
    NIP: e.nip,
    nama_gelar: e.name || "",
    st_active: "1",
  }));

  const fetchOpts: RequestInit = {
    method: "GET",
    headers: {
      "app-token": process.env.EXTERNAL_SK_API_TOKEN || "B961053EA53BA09456F62F5E2EDDCC15",
      "Content-Type": "application/json",
    },
  };

  try {
    // Fetch Profil for the errored NIPs only
    let completedCount = 0;
    const profiles = await pMap(activeTalenta, async (t, index) => {
      try {
        const apiProfilUrlBase = process.env.EXTERNAL_SK_API_URL_PROFIL || 'https://okk.dpd.go.id/dpd-portal/openapi/profil';
        const pUrl = `${apiProfilUrlBase.replace(/\/$/, '')}/${t.NIP}`;

        let pData;
        if (allowInsecureExternalApiTls) {
          pData = await fetchJsonInsecureTls(pUrl, fetchOpts.headers as Record<string, string>, API_TIMEOUT);
        } else {
          const res = await fetch(pUrl, { ...fetchOpts, signal: AbortSignal.timeout(API_TIMEOUT) });
          pData = await res.json();
        }

        if (pData) {
          if (pData.code === 200 && (pData.data?.code === 1 || pData.data?.code === '1')) {
            console.log(`[SYNC SK RETRY] Profil: ${t.NIP} - ${t.nama_gelar || ''} -> BERHASIL`);
          } else {
            console.log(`[SYNC SK RETRY] Profil: ${t.NIP} - ${t.nama_gelar || ''} -> GAGAL/TIDAK DITEMUKAN (${JSON.stringify(pData.data || pData.message)})`);
          }
        }

        completedCount++;
        const pct = 10 + Math.floor((completedCount / activeTalenta.length) * 40);
        updateProgress(`Mencoba ulang (${completedCount}/${activeTalenta.length}): ${t.nama_gelar || t.NIP}`, pct);

        if (pData?.code === 200 && pData?.data) {
          // If the profile API returned "Data tidak ditemukan" code (code 0)
          if (pData.data.code === 0) {
            return {
              nip: t.NIP,
              name: t.nama_gelar || t.nama || "",
              jabatanNama: "",
              unorNama: "",
              statusPegawai: "PNS",
              api_error: "Data profil kosong (Data tidak ditemukan)",
              _raw: { listData: t, profileData: pData.data }
            };
          }

          if (String(pData.data.code).startsWith('1015') || pData.data.code > 1) {
            let reasonStr = '';
            if (pData.data.description === 'Send timeout') {
              reasonStr = 'Gagal menghubungi server Talenta (Send timeout)';
            } else if (pData.data.description) {
              reasonStr = `Error dari API Talenta: ${pData.data.description}`;
            } else {
              reasonStr = `Error Code ${pData.data.code}`;
            }
            result.errors.push({
              nip: t.NIP,
              name: t.nama_gelar || t.nama || "",
              reason: reasonStr
            });
            return null;
          }

          const profileObj = pData.data.data || pData.data;

          if (profileObj.kedudukanPnsNama && profileObj.kedudukanPnsNama.toLowerCase().includes('pensiun')) {
            return {
              nip: t.NIP,
              name: t.nama_gelar || profileObj.nama_gelar || profileObj.nama || "",
              jabatanNama: "", // Kosongkan agar gagal mapping dan masuk ke data_error
              unorNama: "",
              statusPegawai: "INACTIVE",
              api_error: `Status Pegawai: ${profileObj.kedudukanPnsNama} (Inaktif)`,
              _raw: { listData: t, profileData: pData.data }
            };
          }

          return {
            nip: t.NIP,
            name: t.nama_gelar || profileObj.nama_gelar || profileObj.nama || "",
            jabatanNama: profileObj.jabatanNama || "",
            unorNama: profileObj.unorNama || "",
            statusPegawai: profileObj.statusPegawai || "PNS",
            _raw: { listData: t, profileData: pData.data }
          };
        } else {
          return null;
        }
      } catch (err: any) {
        result.errors.push({
          nip: t.NIP,
          name: t.nama_gelar || t.nama || "",
          reason: `Gagal fetch dari API eksternal (${err.message})`
        });
        return null;
      }
    }, BATCH_CONCURRENCY);

    const validProfiles = profiles.filter(Boolean) as any[];
    updateProgress("Mempersiapkan data hasil retry...", 60);

    const grouped = new Map<string, any[]>();
    for (const p of validProfiles) {
      const jNameNorm = normalizeSearchStr(p.jabatanNama);
      const uNameNorm = normalizeSearchStr(p.unorNama);
      const key = `${jNameNorm}||${uNameNorm}`;

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push({
        name: p.name,
        nip: p.nip,
        role: p.statusPegawai,
        api_error: p.api_error,
        jabatanNama: p.jabatanNama,
        unorNama: p.unorNama,
      });
    }

    updateProgress("Menyisipkan data retry ke database...", 70);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const resPeta = await client.query(
        "SELECT id, nama_jabatan, unit_kerja, pejabat_sk FROM peta_jabatan WHERE deleted_at IS NULL"
      );

      const pjRows = resPeta.rows;
      let matchCount = 0;

      for (const pj of pjRows) {
        const jNameNorm = normalizeSearchStr(pj.nama_jabatan);
        const uNameNorm = normalizeSearchStr(pj.unit_kerja);
        const key = `${jNameNorm}||${uNameNorm}`;

        const matchedPegawai = grouped.get(key);
        if (matchedPegawai && matchedPegawai.length > 0) {
          const existingPejabatArray = pj.pejabat_sk || [];

          // Append new matches, but avoid appending if the NIP already exists
          const filteredExisting = Array.isArray(existingPejabatArray)
            ? existingPejabatArray.filter(p => p && p.nip && !matchedPegawai.some(m => m.nip === p.nip))
            : [];

          const newArray = [...filteredExisting, ...matchedPegawai];

          // Urutkan berdasarkan NIP terkecil
          newArray.sort((a, b) => (a.nip || '').localeCompare(b.nip || ''));

          await client.query(
            "UPDATE peta_jabatan SET pejabat_sk = $1::jsonb WHERE id = $2::uuid",
            [JSON.stringify(newArray), pj.id]
          );

          matchCount += matchedPegawai.length;
          grouped.delete(key);
        }
      }

      // Tambahkan matchCount baru ke total sebelumnya
      result.totalMatched = prevTotalMatched + matchCount;

      for (const [key, arr] of grouped.entries()) {
        result.unmatchedRecords.push(...arr.map(p => {
          const apiError = p.api_error;
          delete p.api_error;
          return {
            ...p,
            jabatanNama: p.jabatanNama || '',
            unorNama: p.unorNama || '',
            statusPegawai: p.role || 'PNS',
            searchKey: key,
            reason: apiError || 'Tidak ditemukan di peta_jabatan (jabatanNama dan unorNama tidak cocok)'
          };
        }));
      }

      // We do not do Sekjen fallback again here unless specifically retrying Sekjen, 
      // but if Sekjen is in unmatchedRecords, they should be mapped if they retry.
      try {
        const resSekjen = await client.query(
          `SELECT id, pejabat_sk FROM peta_jabatan WHERE LOWER(nama_jabatan) = LOWER('Sekretaris Jenderal DPD RI') AND deleted_at IS NULL`
        );
        if (resSekjen.rows.length > 0) {
          for (const sekjen of resSekjen.rows) {
            let sekjenData = result.unmatchedRecords.find(r => r.nip === '70070207');
            if (sekjenData) {
              const existingSekjenArray = Array.isArray(sekjen.pejabat_sk) ? sekjen.pejabat_sk : [];
              if (!existingSekjenArray.some(p => p.nip === '70070207')) {
                const defaultSekjen = { nip: '70070207', name: 'H. Mohammad Iqbal, S.I.K, M.H.', role: 'PNS' };
                const newSekjenArray = [...existingSekjenArray, defaultSekjen];

                // Urutkan berdasarkan NIP terkecil
                newSekjenArray.sort((a, b) => (a.nip || '').localeCompare(b.nip || ''));

                await client.query(
                  `UPDATE peta_jabatan SET pejabat_sk = $1::jsonb WHERE id = $2`,
                  [JSON.stringify(newSekjenArray), sekjen.id]
                );
              }
              result.unmatchedRecords = result.unmatchedRecords.filter(r => r.nip !== '70070207');
              result.totalMatched += 1;
            }
          }
        }
      } catch (err: any) { }

      await client.query("COMMIT");
    } catch (dbError: any) {
      await client.query("ROLLBACK");
      throw new Error(`Database error during retry: ${dbError.message}`);
    } finally {
      client.release();
    }

    if (saveLogs) {
      updateProgress("Menyimpan log data error...", 93);
      try {
        await saveSkDataErrorRecords(result.unmatchedRecords);
      } catch (err: any) {
        console.error('[SYNC SK] Failed to save data error records:', err);
        result.errors.push(`Gagal menyimpan data_error: ${err.message}`);
      }

      updateProgress("Menyimpan log retry...", 95);
      await mkdir(logsPath, { recursive: true });
      // Menyamakan nama file agar sorting kronologis berjalan sempurna
      const jsonPath = join(logsPath, `sync-sk-${timestamp}.json`);
      await writeFile(jsonPath, JSON.stringify(result, null, 2));
      result.logFilePaths = { json: jsonPath };
    }

    try {
      await saveSyncHistory(result);
    } catch (err: any) { }

    updateProgress("Retry SK Selesai", 100);
    return result;

  } catch (err: any) {
    result.errors.push({
      nip: "",
      name: "Sistem",
      reason: `Fatal Error: ${err.message}`
    });
    throw err;
  }
}

export async function syncSingleNipSk(nip: string) {
  const externalApiToken = process.env.EXTERNAL_SK_API_TOKEN;
  if (!externalApiToken) {
    throw new Error('EXTERNAL_SK_API_TOKEN is not configured in .env.local');
  }

  const API_TIMEOUT = parseInt(process.env.EXTERNAL_API_TIMEOUT || "30000");
  const fetchOpts: RequestInit = {
    method: "GET",
    headers: {
      "app-token": externalApiToken,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(API_TIMEOUT)
  };

  const apiProfilUrlBase = process.env.EXTERNAL_SK_API_URL_PROFIL || 'https://okk.dpd.go.id/dpd-portal/openapi/profil';
  const pUrl = `${apiProfilUrlBase.replace(/\/$/, '')}/${nip}`;

  let pData;
  try {
    if (allowInsecureExternalApiTls) {
      pData = await fetchJsonInsecureTls(pUrl, fetchOpts.headers as Record<string, string>, API_TIMEOUT);
    } else {
      const res = await fetch(pUrl, fetchOpts);
      pData = await res.json();
    }
  } catch (err: any) {
    throw new Error(`Gagal menghubungi server Talenta: ${err.message}`);
  }

  if (!pData || pData.code !== 200 || !pData.data) {
    throw new Error(`Data profil tidak ditemukan atau error dari API (${pData?.message || 'Unknown Error'})`);
  }

  if (pData.data.code === 0) {
    throw new Error("Data profil kosong (Data tidak ditemukan)");
  }

  if (String(pData.data.code).startsWith('1015') || pData.data.code > 1) {
    throw new Error(`Error dari API Talenta: ${pData.data.description || 'Error Code ' + pData.data.code}`);
  }

  const profileObj = pData.data.data || pData.data;
  
  if (profileObj.kedudukanPnsNama && profileObj.kedudukanPnsNama.toLowerCase().includes('pensiun')) {
    const pName = profileObj.nama_gelar || profileObj.nama || "";
    const client = await pool.connect();
    try {
      const checkErr = await client.query("SELECT id FROM data_error WHERE nip = $1 AND tipe_sync = 'SK'", [nip]);
      if (checkErr.rows.length > 0) {
        await client.query(
          `UPDATE data_error SET nama = $1, jabatan = $2, unit_organisasi = $3, status = $4, saran_perbaikan = $5, synced_at = CURRENT_TIMESTAMP WHERE nip = $6 AND tipe_sync = 'SK'`,
          [pName, "", "", "INACTIVE", `Status Pegawai: ${profileObj.kedudukanPnsNama} (Inaktif)`, nip]
        );
      } else {
        await client.query(
          `INSERT INTO data_error (nip, nama, jabatan, unit_organisasi, status, saran_perbaikan, tipe_sync) VALUES ($1, $2, $3, $4, $5, $6, 'SK')`,
          [nip, pName, "", "", "INACTIVE", `Status Pegawai: ${profileObj.kedudukanPnsNama} (Inaktif)`]
        );
      }
    } finally {
      client.release();
    }
    throw new Error(`Status Pegawai: ${profileObj.kedudukanPnsNama} (Inaktif). Masuk ke Data Error.`);
  }

  const p = {
    nip: nip,
    name: profileObj.nama_gelar || profileObj.nama || "",
    jabatanNama: profileObj.jabatanNama || "",
    unorNama: profileObj.unorNama || "",
    statusPegawai: profileObj.statusPegawai || "-",
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // Fetch peta_jabatan mapping to find a match
    const resPeta = await client.query(
      "SELECT id, nama_jabatan, unit_kerja, pejabat_sk FROM peta_jabatan WHERE deleted_at IS NULL"
    );
    const pjRows = resPeta.rows;

    const jNameNorm = normalizeSearchStr(p.jabatanNama);
    const uNameNorm = normalizeSearchStr(p.unorNama);
    
    let matchedPjId = null;
    let matchedPejabatSk = null;
    
    // Exact match logic just like bulk sync
    for (const pj of pjRows) {
      const pjJNameNorm = normalizeSearchStr(pj.nama_jabatan);
      const pjUNameNorm = normalizeSearchStr(pj.unit_kerja);
      
      if (pjJNameNorm === jNameNorm && pjUNameNorm === uNameNorm) {
        matchedPjId = pj.id;
        matchedPejabatSk = typeof pj.pejabat_sk === 'string' ? JSON.parse(pj.pejabat_sk) : (pj.pejabat_sk || []);
        break;
      }
    }
    
    if (matchedPjId) {
      // Remove existing entry for this NIP from the array just in case
      matchedPejabatSk = matchedPejabatSk.filter((existing: any) => existing.nip !== nip);
      
      // Add the updated info
      matchedPejabatSk.push({
        name: p.name,
        nip: p.nip,
        role: p.statusPegawai,
        jabatanNama: p.jabatanNama,
        unorNama: p.unorNama,
      });
      
      // Sort by NIP
      matchedPejabatSk.sort((a: any, b: any) => (a.nip || '').localeCompare(b.nip || ''));
      
      // Update peta_jabatan
      await client.query(
        "UPDATE peta_jabatan SET pejabat_sk = $1::jsonb WHERE id = $2::uuid",
        [JSON.stringify(matchedPejabatSk), matchedPjId]
      );
      
      // Since it successfully mapped, remove from data_error if exists
      await client.query(
        "DELETE FROM data_error WHERE nip = $1 AND tipe_sync = 'SK'",
        [nip]
      );
      
      await client.query("COMMIT");
      return { success: true, message: `Berhasil sinkronisasi NIP ${nip} ke peta jabatan.` };
    } else {
      // Not matched, should insert or update in data_error
      const checkErr = await client.query("SELECT id FROM data_error WHERE nip = $1 AND tipe_sync = 'SK'", [nip]);
      if (checkErr.rows.length > 0) {
        await client.query(
          `UPDATE data_error SET nama = $1, jabatan = $2, unit_organisasi = $3, status = $4, saran_perbaikan = $5, synced_at = CURRENT_TIMESTAMP WHERE nip = $6 AND tipe_sync = 'SK'`,
          [p.name, p.jabatanNama, p.unorNama, p.statusPegawai, 'Tidak ditemukan di peta_jabatan (jabatanNama dan unorNama tidak cocok)', nip]
        );
      } else {
        await client.query(
          `INSERT INTO data_error (nip, nama, jabatan, unit_organisasi, status, saran_perbaikan, tipe_sync) VALUES ($1, $2, $3, $4, $5, $6, 'SK')`,
          [nip, p.name, p.jabatanNama, p.unorNama, p.statusPegawai, 'Tidak ditemukan di peta_jabatan (jabatanNama dan unorNama tidak cocok)']
        );
      }
      
      await client.query("COMMIT");
      throw new Error(`Data ditarik tapi gagal dipetakan (Unit/Jabatan tidak cocok). Masuk ke Data Error.`);
    }
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
