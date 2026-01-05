// src/lib/pegawai-sync.ts
import pool from "./db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

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
  json: any;
}

export interface SyncResult {
  totalFetched: number;
  totalMatched: number;
  totalUpdated: number;
  unmatchedRecords: UnmatchedRecord[];
  errors: string[];
  logFilePaths?: {
    json?: string;
    csv?: string;
  };
}

export interface UnmatchedRecord {
  nip: string;
  name: string;
  jabatan_name: string;
  unit_organisasi_name: string;
  reason: string;
}

/**
 * Fetch data from external pegawai API with pagination
 */
export async function fetchPegawaiData(
  page: number = 1,
  perPage: number = 100
): Promise<PegawaiApiResponse> {
  const baseUrl = process.env.EXTERNAL_PEGAWAI_API_URL || 'https://cmb.tail91813a.ts.net/api/pegawai';
  const timeout = parseInt(process.env.EXTERNAL_API_TIMEOUT || '60000');
  
  const url = `${baseUrl}?per_page=${perPage}&page=${page}`;
  
  console.log('[FETCH_PEGAWAI] Starting fetch:', {
    url,
    page,
    perPage,
    timeout,
    hasToken: !!process.env.EXTERNAL_API_TOKEN,
  });
  
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
    
    const data = await response.json();
    console.log('[FETCH_PEGAWAI] Success:', {
      page,
      dataCount: data.data?.length || 0,
      totalPages: data.meta?.last_page,
    });
    
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
export async function clearAllNamaPejabat(): Promise<void> {
  await pool.query(`
    UPDATE peta_jabatan 
    SET pejabat = '[]'::jsonb,
        bezetting = 0
  `);
}

/**
 * Sync pegawai data to peta_jabatan
 */
export async function syncPegawaiToPetaJabatan(
  onProgress?: (current: number, total: number, message: string) => void
): Promise<SyncResult> {
  const result: SyncResult = {
    totalFetched: 0,
    totalMatched: 0,
    totalUpdated: 0,
    unmatchedRecords: [],
    errors: [],
  };
  
  try {
    // Step 1: Clear existing nama_pejabat
    if (onProgress) onProgress(0, 100, 'Menghapus data pegawai lama...');
    await clearAllNamaPejabat();
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
    
    // Step 3: Group pegawai by jabatan and unit kerja
    if (onProgress) onProgress(40, 100, 'Mengelompokkan data pegawai...');
    
    const groupedPegawai = new Map<string, PegawaiData[]>();
    
    for (const pegawai of allPegawai) {
      const key = `${pegawai.jabatan_name}|||${pegawai.unit_organisasi_name}`;
      if (!groupedPegawai.has(key)) {
        groupedPegawai.set(key, []);
      }
      groupedPegawai.get(key)!.push(pegawai);
    }
    
    // Step 4: Match and update peta_jabatan
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
            // Determine role from json.kedudukanPnsNama field
            let role = 'PNS'; // Default to PNS
            
            if (p.json && typeof p.json === 'object' && 'kedudukanPnsNama' in p.json) {
              const kedudukanPnsNama = String(p.json.kedudukanPnsNama || '').trim();
              // If kedudukanPnsNama contains "PPPK", set role as PPPK
              if (/PPPK/i.test(kedudukanPnsNama)) {
                role = 'PPPK';
              }
            }
            
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
                   bezetting = $2
               WHERE id = $3`,
              [JSON.stringify(namaPejabat), bezetting, row.id]
            );
            result.totalUpdated++;
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
    
    // Step 5: Write unmatched records to log file
    if (result.unmatchedRecords.length > 0) {
      if (onProgress) onProgress(92, 100, 'Menulis log unmatched records...');
      const logPaths = await writeUnmatchedLog(result.unmatchedRecords);
      result.logFilePaths = logPaths;
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
    
    console.log('[SYNC_LOG] Environment check:', {
      cwd: process.cwd(),
      SYNC_LOGS_DIR: process.env.SYNC_LOGS_DIR || '(not set)',
      resolvedStorageDir: storageDir,
      recordCount: records.length,
    });
    
    // Create directory if not exists
    try {
      await mkdir(storageDir, { recursive: true });
      console.log('[SYNC_LOG] Directory ensured:', storageDir);
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
      console.log('[SYNC_LOG] ✓ JSON file written successfully:', filepath);
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
      'NIP,Nama,Jabatan,Unit Organisasi,Alasan',
      ...records.map(r => 
        `"${r.nip}","${r.name}","${r.jabatan_name}","${r.unit_organisasi_name}","${r.reason}"`
      ),
    ];
    
    try {
      await writeFile(csvFilepath, csvLines.join('\n'), 'utf-8');
      console.log('[SYNC_LOG] ✓ CSV file written successfully:', csvFilepath);
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
