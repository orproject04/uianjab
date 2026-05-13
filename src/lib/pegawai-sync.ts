// src/lib/pegawai-sync.ts
import pool from "./db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import https from "https";

const allowInsecureExternalApiTls =
  process.env.NODE_ENV !== 'production' &&
  process.env.ALLOW_INSECURE_EXTERNAL_API_TLS === 'true';

function isTlsVerificationError(error: any): boolean {
  const code = error?.cause?.code || error?.code;
  return code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'SELF_SIGNED_CERT_IN_CHAIN';
}

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
          try {
            resolve(JSON.parse(body));
          } catch (parseError: any) {
            reject(new Error(`Invalid JSON response: ${parseError.message}`));
          }
        });
      }
    );

    req.setTimeout(timeout, () => {
      req.destroy(new Error(`Request timeout - API took too long to respond (>${timeout}ms)`));
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

export interface PegawaiApiResponse {
  data: PegawaiData[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
  filters: any[];
}

export interface PegawaiData {
  id: string;
  nip: string;
  name: string;
  email: string;
  unit_organisasi_id: number;
  unit_organisasi_name: string;
  jabatan_id: number;
  jabatan_name: string;
  anjab_id: string;
  jenis_jabatan: string;
  golongan: string;
  role: string;
  status: string; // ACTIVE, INACTIVE, etc.
  json: any;
}

export interface SyncResult {
  totalFetched: number;
  totalMatched: number;
  totalInactive: number; // Pegawai dengan status != ACTIVE
  unmatchedRecords: UnmatchedRecord[];
  inactiveRecords: UnmatchedRecord[]; // Pegawai tidak aktif
  errors: string[];
  logFilePaths?: {
    json?: string;
    csv?: string;
  };
  syncedBy?: string;
}

export interface UnmatchedRecord {
  nip: string;
  name: string;
  jabatan_name: string;
  unit_organisasi_name: string;
  status?: string; // Status pegawai
  reason: string;
}

function getPegawaiRole(pegawai: PegawaiData): 'PNS' | 'PPPK' {
  if (pegawai.json && typeof pegawai.json === 'object' && 'kedudukanPnsNama' in pegawai.json) {
    const kedudukanPnsNama = String(pegawai.json.kedudukanPnsNama || '').trim();
    if (/PPPK/i.test(kedudukanPnsNama)) {
      return 'PPPK';
    }
  }
  return 'PNS';
}

function buildSaranPerbaikan(record: UnmatchedRecord): string {
  return '-';
}

async function saveDataErrorRecords(records: UnmatchedRecord[], syncedBy?: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const uniqueRecords = new Map<string, UnmatchedRecord>();
    for (const rec of records) {
      if (rec.nip) {
        uniqueRecords.set(rec.nip, rec);
      }
    }

    const incomingNips = Array.from(uniqueRecords.keys());

    if (incomingNips.length === 0) {
      await client.query('DELETE FROM data_error');
    } else {
      await client.query(
        'DELETE FROM data_error WHERE NOT (nip = ANY($1::text[]))',
        [incomingNips]
      );

      const { rows: existingRows } = await client.query<{
        nip: string;
        saran_perbaikan: string | null;
      }>(
        'SELECT nip, saran_perbaikan FROM data_error WHERE nip = ANY($1::text[])',
        [incomingNips]
      );

      const existingByNip = new Map(
        existingRows.map((row) => [row.nip, row])
      );

      for (const rec of uniqueRecords.values()) {
        if (existingByNip.has(rec.nip)) {
          await client.query(
            `UPDATE data_error
             SET nama = $1,
                 jabatan = $2,
                 unit_organisasi = $3,
                 status = $4,
                 synced_by = $5,
                 synced_at = CURRENT_TIMESTAMP
             WHERE nip = $6`,
            [
              rec.name || '',
              rec.jabatan_name || '',
              rec.unit_organisasi_name || '',
              rec.status || 'ACTIVE',
              syncedBy || null,
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
              synced_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              rec.nip,
              rec.name || '',
              rec.jabatan_name || '',
              rec.unit_organisasi_name || '',
              rec.status || 'ACTIVE',
              buildSaranPerbaikan(rec),
              syncedBy || null,
            ]
          );
        }
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Save sync result to database
 */
export async function saveSyncHistory(result: SyncResult): Promise<number> {
  try {
    const { rows } = await pool.query(
      `INSERT INTO sync_history (
        sync_type,
        total_fetched,
        total_matched,
        total_unmatched,
        total_inactive,
        errors,
        log_file_json,
        log_file_csv,
        synced_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        'pegawai',
        result.totalFetched,
        result.totalMatched,
        result.unmatchedRecords.length,
        result.totalInactive,
        result.errors.length > 0 ? result.errors : null,
        result.logFilePaths?.json || null,
        result.logFilePaths?.csv || null,
        result.syncedBy || null,
      ]
    );
    
    return rows[0].id;
  } catch (error: any) {
    console.error('[SAVE_SYNC_HISTORY] Error:', error);
    throw error;
  }
}

/**
 * Fetch data from external pegawai API with pagination
 */
export async function fetchPegawaiData(
  page: number = 1,
  perPage: number = 100
): Promise<PegawaiApiResponse> {
  const baseUrl = process.env.EXTERNAL_PEGAWAI_API_URL;
  const timeout = parseInt(process.env.EXTERNAL_API_TIMEOUT || '60000');
  
  const url = `${baseUrl}?per_page=${perPage}&page=${page}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    // Add API token if configured
    const apiToken = process.env.EXTERNAL_API_TOKEN;
    if (apiToken) {
      headers['x-api-token'] = apiToken;
    }
    
    let data: PegawaiApiResponse;
    if (allowInsecureExternalApiTls) {
      data = await fetchJsonInsecureTls(url, headers, timeout);
    } else {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unable to read response');
          console.error('[FETCH_PEGAWAI] HTTP error:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText,
            url,
          });
          throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        data = await response.json();
      } catch (fetchError: any) {
        if (process.env.NODE_ENV !== 'production' && isTlsVerificationError(fetchError)) {
          console.warn('[FETCH_PEGAWAI] TLS verification failed in development, retrying with insecure TLS');
          data = await fetchJsonInsecureTls(url, headers, timeout);
        } else {
          throw fetchError;
        }
      }
    }

    clearTimeout(timeoutId);
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    console.error('[FETCH_PEGAWAI] Error details:', {
      name: error.name,
      message: error.message,
      cause: error.cause,
      stack: error.stack,
      url,
      page,
    });
    
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout - API took too long to respond (>${timeout}ms)`);
    }
    
    // Enhance error message with context
    const enhancedError = new Error(
      `Failed to fetch pegawai data from ${url}: ${error.message}`
    );
    enhancedError.cause = error;
    throw enhancedError;
  }
}

/**
 * Fetch all pages of pegawai data
 */
export async function fetchAllPegawaiData(
  onProgress?: (current: number, total: number) => void
): Promise<PegawaiData[]> {
  const perPage = parseInt(process.env.EXTERNAL_API_PER_PAGE || '100');
  
  // Fetch first page to get total pages
  const firstPage = await fetchPegawaiData(1, perPage);
  const totalPages = firstPage.meta.last_page;
  const allData: PegawaiData[] = [...firstPage.data];
  
  if (onProgress) {
    onProgress(1, totalPages);
  }
  
  // Fetch remaining pages
  for (let page = 2; page <= totalPages; page++) {
    const pageData = await fetchPegawaiData(page, perPage);
    allData.push(...pageData.data);
    
    if (onProgress) {
      onProgress(page, totalPages);
    }
  }
  
  return allData;
}

/**
 * Clear all pejabat in peta_jabatan table
 */
export async function clearAllNamaPejabat(syncedBy?: string): Promise<void> {
  await pool.query(
    `UPDATE peta_jabatan 
    SET pejabat = '[]'::jsonb,
        bezetting = 0,
        updated_by = $1
    `,
    [syncedBy || null]
  );
}

/**
 * Sync pegawai data to peta_jabatan
 */
export async function syncPegawaiToPetaJabatan(
  onProgress?: (current: number, total: number, message: string) => void,
  syncedBy?: string
): Promise<SyncResult> {
  const result: SyncResult = {
    totalFetched: 0,
    totalMatched: 0,
    totalInactive: 0,
    unmatchedRecords: [],
    inactiveRecords: [],
    errors: [],
    syncedBy: syncedBy,
  };
  
  try {
    // Step 1: Clear existing nama_pejabat
    if (onProgress) onProgress(0, 100, 'Menghapus data pegawai lama...');
    await clearAllNamaPejabat(syncedBy);
    if (onProgress) onProgress(5, 100, 'Data lama berhasil dihapus');
    
    // Step 2: Fetch all pegawai data
    if (onProgress) onProgress(5, 100, 'Mengambil data pegawai dari API eksternal...');
    
    const allPegawai = await fetchAllPegawaiData((current, total) => {
      const progress = 5 + (current / total) * 30; // 5-35%
      if (onProgress) {
        onProgress(Math.round(progress), 100, `Mengambil data halaman ${current} dari ${total}...`);
      }
    });
    
    result.totalFetched = allPegawai.length;
    
    // Step 3: Filter ACTIVE and track INACTIVE pegawai
    if (onProgress) onProgress(38, 100, 'Memfilter pegawai aktif...');
    
    const activePegawai = allPegawai.filter(p => p.status === 'ACTIVE');
    const inactivePegawai = allPegawai.filter(p => p.status !== 'ACTIVE');
    
    result.totalInactive = inactivePegawai.length;
    
    // Track inactive pegawai as records
    for (const pegawai of inactivePegawai) {
      result.inactiveRecords.push({
        nip: pegawai.nip,
        name: pegawai.name,
        jabatan_name: pegawai.jabatan_name,
        unit_organisasi_name: pegawai.unit_organisasi_name,
        status: 'INACTIVE',
        reason: `Status pegawai: ${pegawai.status} (Tidak Aktif)`,
      });
    }
    
    
    // Step 4: Group pegawai by jabatan and unit kerja
    if (onProgress) onProgress(40, 100, 'Mengelompokkan data pegawai...');
    
    const groupedPegawai = new Map<string, PegawaiData[]>();
    
    for (const pegawai of activePegawai) {
      const key = `${pegawai.jabatan_name}|||${pegawai.unit_organisasi_name}`;
      if (!groupedPegawai.has(key)) {
        groupedPegawai.set(key, []);
      }
      groupedPegawai.get(key)!.push(pegawai);
    }
    
    // Step 5: Match and update peta_jabatan
    if (onProgress) onProgress(45, 100, 'Mencocokkan dan update database...');
    
    let processed = 0;
    const totalGroups = groupedPegawai.size;
    
    for (const [key, pegawaiList] of groupedPegawai.entries()) {
      const [jabatan_name, unit_organisasi_name] = key.split('|||');
      
      try {
        // Sort by NIP (ascending)
        pegawaiList.sort((a, b) => a.nip.localeCompare(b.nip));
        
        // Find matching peta_jabatan
        const { rows } = await pool.query(
          `SELECT id, nama_jabatan, unit_kerja 
           FROM peta_jabatan 
           WHERE LOWER(nama_jabatan) = LOWER($1) 
           AND LOWER(COALESCE(unit_kerja, '')) = LOWER($2)`,
          [jabatan_name, unit_organisasi_name]
        );
        
        if (rows.length > 0) {
          // Match found - update each matching row
          // Store as JSONB array with structure: {name, nip, role}
          const namaPejabat = pegawaiList.map(p => {
            const role = getPegawaiRole(p);
            return {
              name: p.name,
              nip: p.nip,
              role: role
            };
          });
          const bezetting = pegawaiList.length;
          
          for (const row of rows) {
            await pool.query(
              `UPDATE peta_jabatan 
               SET pejabat = $1::jsonb,
                   bezetting = $2,
                   updated_by = $4
               WHERE id = $3`,
              [JSON.stringify(namaPejabat), bezetting, row.id, syncedBy || null]
            );
          }
          
          result.totalMatched += pegawaiList.length;
        } else {
          // No match found - add to unmatched records
          for (const pegawai of pegawaiList) {
            result.unmatchedRecords.push({
              nip: pegawai.nip,
              name: pegawai.name,
              jabatan_name: pegawai.jabatan_name,
              unit_organisasi_name: pegawai.unit_organisasi_name,
              status: getPegawaiRole(pegawai),
              reason: 'Tidak ditemukan jabatan dengan nama dan unit kerja yang cocok di database',
            });
          }
        }
      } catch (error: any) {
        result.errors.push(`Error processing ${jabatan_name} - ${unit_organisasi_name}: ${error.message}`);
      }
      
      processed++;
      const progress = 45 + (processed / totalGroups) * 45; // 45-90%
      if (onProgress) {
        onProgress(Math.round(progress), 100, `Update database: ${processed} dari ${totalGroups} grup jabatan...`);
      }
    }
    
    // Step 5.5: Check and set default for Sekretaris Jenderal DPD RI if not matched
    if (onProgress) onProgress(91, 100, 'Memeriksa Sekretaris Jenderal...');
    try {
      const { rows: sekjenRows } = await pool.query(
        `SELECT id, pejabat 
         FROM peta_jabatan 
         WHERE LOWER(nama_jabatan) = LOWER('Sekretaris Jenderal DPD RI')`
      );
      
      if (sekjenRows.length > 0) {
        for (const sekjen of sekjenRows) {
          const pejabat = sekjen.pejabat;
          // Check if pejabat is empty or null
          if (!pejabat || (Array.isArray(pejabat) && pejabat.length === 0)) {
            // Set default Sekjen data
            const defaultSekjen = [
              {
                "nip": "70070207",
                "name": "H. MOHAMMAD IQBAL, S.I.K, M.H.",
                "role": "PNS"
              }
            ];
            
            await pool.query(
              `UPDATE peta_jabatan 
               SET pejabat = $1::jsonb,
                   bezetting = 1,
                   updated_by = $3
               WHERE id = $2`,
              [JSON.stringify(defaultSekjen), sekjen.id, syncedBy || null]
            );
            
          }
        }
      }
    } catch (sekjenError: any) {
      console.error('[SYNC] Error setting default Sekjen:', sekjenError);
      // Don't throw - continue with sync
    }
    
    // Step 6: Write unmatched and inactive records to log file
    const combinedRecords = [...result.unmatchedRecords, ...result.inactiveRecords];
    if (onProgress) onProgress(92, 100, 'Menyimpan data error...');
    try {
      await saveDataErrorRecords(combinedRecords, syncedBy);
    } catch (saveDataError: any) {
      console.error('[SYNC] Failed to save data_error:', saveDataError);
      result.errors.push(`Gagal menyimpan data_error: ${saveDataError.message}`);
    }

    if (combinedRecords.length > 0) {
      if (onProgress) onProgress(93, 100, 'Menulis log records...');
      const logPaths = await writeUnmatchedLog(combinedRecords);
      result.logFilePaths = logPaths;
    }
    
    // Step 7: Save to sync history database
    if (onProgress) onProgress(95, 100, 'Menyimpan riwayat sinkronisasi...');
    try {
      await saveSyncHistory(result);
    } catch (saveError: any) {
      console.error('[SYNC] Failed to save sync history:', saveError);
      // Don't throw - sync was successful even if history save failed
    }
    
    if (onProgress) onProgress(100, 100, 'Selesai!');
    
  } catch (error: any) {
    result.errors.push(`Fatal error: ${error.message}`);
  }
  
  return result;
}

/**
 * Write unmatched records to log file
 */
async function writeUnmatchedLog(records: UnmatchedRecord[]): Promise<{ json?: string; csv?: string }> {
  const result: { json?: string; csv?: string } = {};
  
  try {
    // Allow overriding storage directory via env var (absolute path recommended for AWS)
    const storageDir = process.env.SYNC_LOGS_DIR
      ? process.env.SYNC_LOGS_DIR
      : join(process.cwd(), 'storage', 'sync-logs');
    
    // Create directory if not exists
    try {
      await mkdir(storageDir, { recursive: true });
    } catch (mkdirError: any) {
      console.error('[SYNC_LOG] Failed to create directory:', {
        path: storageDir,
        error: mkdirError.message,
        code: mkdirError.code,
      });
      throw new Error(`Cannot create log directory: ${mkdirError.message}`);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `unmatched-pegawai-${timestamp}.json`;
    const filepath = join(storageDir, filename);
    
    const logData = {
      timestamp: new Date().toISOString(),
      total_unmatched: records.length,
      records: records,
    };
    
    // Write JSON file
    try {
      await writeFile(filepath, JSON.stringify(logData, null, 2), 'utf-8');
      result.json = filepath;
    } catch (writeError: any) {
      console.error('[SYNC_LOG] Failed to write JSON file:', {
        path: filepath,
        error: writeError.message,
        code: writeError.code,
      });
      throw new Error(`Cannot write JSON log: ${writeError.message}`);
    }
    
    // Also create a CSV version for easier viewing
    const csvFilename = `unmatched-pegawai-${timestamp}.csv`;
    const csvFilepath = join(storageDir, csvFilename);
    
    const csvLines = [
      'NIP,Nama,Jabatan,Unit Organisasi,Status,Alasan',
      ...records.map(r => 
        `"${r.nip}","${r.name}","${r.jabatan_name}","${r.unit_organisasi_name}","${r.status || 'ACTIVE'}","${r.reason}"`
      ),
    ];
    
    try {
      await writeFile(csvFilepath, csvLines.join('\n'), 'utf-8');
      result.csv = csvFilepath;
    } catch (writeError: any) {
      console.error('[SYNC_LOG] Failed to write CSV file:', {
        path: csvFilepath,
        error: writeError.message,
        code: writeError.code,
      });
      // CSV is optional, don't throw
    }
    
    return result;
  } catch (error: any) {
    console.error('[SYNC_LOG] Fatal error in writeUnmatchedLog:', error);
    // Return empty result instead of throwing to not break sync flow
    return {};
  }
}
