import { TruckRecord, UserRecord, DailyHistoryMap, TruckDailyHistoryEntry, ReadinessStatus, CutOffMode } from '../types';
import { INITIAL_TRUCKS, INITIAL_USERS } from './mockData';
import { getWIBDateString } from '../utils/timeUtils';

export const STORAGE_KEYS = {
  USERS: 'fleet_users_v1',
  TRUCKS: 'fleet_trucks_v1',
  GAS_URL: 'fleet_gas_url_v1',
  CONFIRMED_TIMES: 'fleet_confirmed_times_v1',
  SYNC_MODE: 'fleet_sync_mode_v1', // 'appsheet' | 'gas' | 'local'
  DAILY_HISTORY: 'fleet_daily_history_v1',
  LAST_ACTIVE_DATE: 'fleet_last_active_date_v1',
  CUTOFF_MODE: 'fleet_cutoff_mode_v1',
};

export function getStoredCutOffMode(): CutOffMode {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.CUTOFF_MODE);
    if (val === 'auto' || val === 'unlocked' || val === 'locked') return val;
  } catch {}
  return 'unlocked'; // Default to unlocked so transporter can edit smoothly
}

export function saveStoredCutOffMode(mode: CutOffMode): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CUTOFF_MODE, mode);
  } catch (e) {
    console.error('Failed to save cutoff mode', e);
  }
}

export type SyncMode = 'appsheet' | 'gas' | 'local';

export function getStoredSyncMode(): SyncMode {
  try {
    const mode = localStorage.getItem(STORAGE_KEYS.SYNC_MODE);
    if (mode === 'appsheet' || mode === 'gas' || mode === 'local') return mode;
  } catch {}
  return 'appsheet'; // Default to verified AppSheet REST API
}

export function saveStoredSyncMode(mode: SyncMode): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SYNC_MODE, mode);
  } catch (e) {
    console.error('Failed to save sync mode', e);
  }
}

// AppSheet REST API Client
export async function syncWithAppSheet(customTableName?: string): Promise<{
  success: boolean;
  trucks?: TruckRecord[];
  message?: string;
  isApiDisabled?: boolean;
  isTableNotFound?: boolean;
  tableName?: string;
}> {
  try {
    const url = customTableName
      ? `/api/appsheet/trucks?table=${encodeURIComponent(customTableName.trim())}`
      : '/api/appsheet/trucks';
    const res = await fetch(url);
    const data = await res.json();

    if (res.ok && data.success && data.trucks) {
      return {
        success: true,
        trucks: data.trucks,
        tableName: data.tableName,
        message: `Berhasil memuat ${data.trucks.length} unit armada dari AppSheet (${data.tableName})`,
      };
    }

    return {
      success: false,
      message: data.message || 'Gagal memuat data dari AppSheet',
      isApiDisabled: Boolean(data.isApiDisabled),
      isTableNotFound: Boolean(data.isTableNotFound),
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Koneksi ke server proxy AppSheet gagal',
    };
  }
}

export async function sendAppSheetAction(
  action: 'updateTruck' | 'addTruck' | 'deleteTruck' | 'confirmAll',
  payload: Record<string, any>
): Promise<{ success: boolean; message?: string; isApiDisabled?: boolean }> {
  try {
    let endpoint = '/api/appsheet/update-truck';
    let body = payload;

    if (action === 'addTruck') {
      endpoint = '/api/appsheet/add-truck';
    } else if (action === 'deleteTruck') {
      endpoint = '/api/appsheet/delete-truck';
    } else if (action === 'confirmAll') {
      endpoint = '/api/appsheet/confirm-all';
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({ success: true }));
    if (res.ok && data.success) {
      return { success: true };
    }

    return {
      success: false,
      message: data.message || 'Gagal memperbarui data di AppSheet',
      isApiDisabled: Boolean(data.isApiDisabled),
    };
  } catch (err: any) {
    console.warn('AppSheet background sync error:', err.message);
    return { success: false, message: err.message };
  }
}

export async function syncMasterDriversToDataTruk2(): Promise<{
  success: boolean;
  message?: string;
  count?: number;
  updated?: Array<{ id: string; oldName: string; newName: string }>;
}> {
  try {
    const res = await fetch('/api/appsheet/sync-master-drivers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Gagal menyinkronkan master sopir ke Data Truk 2',
    };
  }
}

// Initial state getters
export function getLocalUsers(): UserRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USERS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load users from localStorage', e);
  }
  return INITIAL_USERS;
}

export function saveLocalUsers(users: UserRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  } catch (e) {
    console.error('Failed to save users', e);
  }
}

export function getLocalTrucks(): TruckRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRUCKS);
    if (raw) {
      const parsed: TruckRecord[] = JSON.parse(raw);
      // Filter out dummy TRK- trucks if real trucks exist
      const realTrucks = parsed.filter((t) => !t.id?.startsWith('TRK-') && Boolean(t.nomorPolisi));
      
      // Jika data lokal adalah sisa data dummy lama (< 50 truk), gunakan 151 armada riil dari MD to Dealer 2
      if (realTrucks.length < 50 && INITIAL_TRUCKS.length >= 100) {
        return INITIAL_TRUCKS;
      }

      const targetList = realTrucks.length > 0 ? realTrucks : INITIAL_TRUCKS;

      // Ensure capacities are numbers only and driver name uses first name only
      const sanitized = targetList.map((t) => {
        let kap = String(t.kapasitas || '28').trim();
        const digits = kap.replace(/\D/g, '');
        if (digits) {
          kap = digits;
        } else if (!kap || isNaN(Number(kap))) {
          kap = '28';
        }
        const cleanSopir = t.namaSopir ? t.namaSopir.trim() : '';
        return {
          ...t,
          depo: t.depo || 'Karawang',
          kapasitas: kap,
          namaSopir: cleanSopir,
          kesiapan: t.kesiapan || (t.status === 'Nonaktif' ? 'Tidak Ready' : 'Ready'),
          keterangan: t.keterangan || '',
        };
      });
      return sanitized;
    }
  } catch (e) {
    console.error('Failed to load trucks from localStorage', e);
  }
  return INITIAL_TRUCKS;
}

export function saveLocalTrucks(trucks: TruckRecord[]): void {
  try {
    const cleanTrucks = trucks.filter((t) => !t.id?.startsWith('TRK-') && Boolean(t.nomorPolisi));
    const targetToSave = cleanTrucks.length > 0 ? cleanTrucks : trucks;
    localStorage.setItem(STORAGE_KEYS.TRUCKS, JSON.stringify(targetToSave));
    // Automatically record today's snapshot
    const todayStr = getWIBDateString();
    recordDailySnapshot(todayStr, targetToSave);
  } catch (e) {
    console.error('Failed to save trucks', e);
  }
}

export function getStoredDailyHistory(): DailyHistoryMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DAILY_HISTORY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load daily history', e);
  }
  return {};
}

export function saveStoredDailyHistory(history: DailyHistoryMap): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DAILY_HISTORY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save daily history', e);
  }
}

export function recordDailySnapshot(dateStr: string, trucks: TruckRecord[]): void {
  try {
    const cleanTrucks = trucks.filter((t) => !t.id?.startsWith('TRK-') && Boolean(t.nomorPolisi));
    const targetSnapshot = cleanTrucks.length > 0 ? cleanTrucks : trucks;
    const history = getStoredDailyHistory();
    const dayMap: Record<string, TruckDailyHistoryEntry> = history[dateStr] || {};
    targetSnapshot.forEach((t) => {
      dayMap[t.id] = {
        kesiapan: t.kesiapan,
        keterangan: t.keterangan || '',
        terakhirUpdate: t.terakhirUpdate || '',
        status: t.status,
      };
    });
    history[dateStr] = dayMap;
    saveStoredDailyHistory(history);

    // Also persist permanently to Database Cloud/Server
    saveSnapshotToDatabase(dateStr, targetSnapshot).catch(() => {});
  } catch (e) {
    console.error('Failed to record daily snapshot', e);
  }
}

export async function saveSnapshotToDatabase(dateStr: string, trucks: TruckRecord[]): Promise<boolean> {
  try {
    const res = await fetch('/api/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr, trucks }),
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (err) {
    console.warn('Failed to save snapshot to database:', err);
    return false;
  }
}

export async function fetchSnapshotFromDatabase(dateStr: string): Promise<{ success: boolean; trucks?: TruckRecord[]; summary?: any }> {
  try {
    const res = await fetch(`/api/snapshots/${dateStr}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('Failed to fetch snapshot from database:', err);
    return { success: false };
  }
}

export async function fetchAvailableSnapshotDates(): Promise<string[]> {
  try {
    const res = await fetch('/api/snapshots');
    const data = await res.json();
    return Array.isArray(data.dates) ? data.dates : [];
  } catch {
    return [];
  }
}

export async function fetchAllDatabaseSnapshots(): Promise<{
  dates: string[];
  snapshots: Record<string, { date: string; savedAt: string; count: number; summary?: any }>;
}> {
  try {
    const res = await fetch('/api/snapshots');
    const data = await res.json();
    if (data && data.success) {
      return {
        dates: Array.isArray(data.dates) ? data.dates : [],
        snapshots: data.snapshots || {},
      };
    }
  } catch (err) {
    console.warn('Failed to fetch snapshot list from database:', err);
  }
  return { dates: [], snapshots: {} };
}

export function downloadDateSnapshotCsv(dateStr: string): void {
  const a = document.createElement('a');
  a.href = `/api/snapshots/download/${dateStr}`;
  a.download = `Rekap_Armada_SIAPIN_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function checkAndApplyDailyReset(currentTrucks: TruckRecord[]): {
  trucks: TruckRecord[];
  didReset: boolean;
} {
  const todayStr = getWIBDateString();
  let lastActiveDate = '';
  try {
    lastActiveDate = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE_DATE) || '';
  } catch {}

  // If same day, ensure tanggalUpdate is populated
  if (lastActiveDate === todayStr) {
    const updated = currentTrucks.map((t) => ({
      ...t,
      tanggalUpdate: t.tanggalUpdate || todayStr,
    }));
    return { trucks: updated, didReset: false };
  }

  // If previous day exists, record snapshot for that previous day
  if (lastActiveDate && lastActiveDate !== todayStr) {
    recordDailySnapshot(lastActiveDate, currentTrucks);
  }

  // ATURAN RETENSI PERSISTEN HARIAN (PERMINTAAN USER):
  // 1. Status Aktif / Nonaktif: Tetap persisten antar-hari (tidak pernah direset otomatis)
  // 2. Kesiapan Ready / Tidak Ready: Tetap persisten antar-hari!
  //    - Truk yang Tidak Ready (misal rusak/bengkel) TETAP 'Tidak Ready' beserta keterangannya sampai diubah manual oleh transporter.
  //    - Truk yang Nonaktif TETAP 'Tidak Ready'.
  //    - Truk yang Ready TETAP 'Ready'.
  // 3. Riwayat Terakhir Update: Ditandai 'Belum update hari ini' agar jelas unit mana yang belum dikonfirmasi hari ini.
  const resetTrucks = currentTrucks.map((t) => {
    const isNonaktif = t.status === 'Nonaktif';
    const effectiveKesiapan = isNonaktif ? 'Tidak Ready' : (t.kesiapan || 'Ready');
    return {
      ...t,
      status: t.status, // Manual status preserved
      kesiapan: effectiveKesiapan as ReadinessStatus, // Retain readiness across days
      keterangan: effectiveKesiapan === 'Ready' ? '' : (t.keterangan || ''), // Retain keterangan if Tidak Ready
      terakhirUpdate: 'Belum update hari ini',
      tanggalUpdate: todayStr,
    };
  });

  try {
    localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE_DATE, todayStr);
    localStorage.setItem(STORAGE_KEYS.TRUCKS, JSON.stringify(resetTrucks));
    // Reset confirmation timestamps for new day
    const emptyTimes: Record<string, string> = { TM: '', RJTM: '', WSS: '', SBR: '' };
    localStorage.setItem(STORAGE_KEYS.CONFIRMED_TIMES, JSON.stringify(emptyTimes));
  } catch (e) {
    console.error('Failed to persist daily reset', e);
  }

  // Record initial snapshot for today
  recordDailySnapshot(todayStr, resetTrucks);

  return { trucks: resetTrucks, didReset: true };
}

export function getStoredGasUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.GAS_URL) || '';
  } catch {
    return '';
  }
}

export function saveStoredGasUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.GAS_URL, url.trim());
  } catch (e) {
    console.error('Failed to save GAS url', e);
  }
}

export function getStoredConfirmedTimes(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIRMED_TIMES);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {
    TM: '25 Sep 2026, 14:15 WIB',
    RJTM: '25 Sep 2026, 13:40 WIB',
    WSS: '25 Sep 2026, 12:10 WIB',
    SBR: '25 Sep 2026, 14:00 WIB',
  };
}

export function saveStoredConfirmedTimes(times: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CONFIRMED_TIMES, JSON.stringify(times));
  } catch (e) {
    console.error('Failed to save confirmed times', e);
  }
}

// Google Apps Script API synchronization
export async function syncWithGoogleSheets(gasUrl: string): Promise<{
  success: boolean;
  users?: UserRecord[];
  trucks?: TruckRecord[];
  message?: string;
}> {
  if (!gasUrl) {
    return { success: false, message: 'Google Apps Script URL belum diisi' };
  }

  try {
    const fetchUrl = new URL(gasUrl);
    fetchUrl.searchParams.append('action', 'getData');

    const res = await fetch(fetchUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.status === 'success' || data.users || data.trucks) {
      return {
        success: true,
        users: data.users || undefined,
        trucks: data.trucks || undefined,
      };
    }

    return {
      success: false,
      message: data.message || 'Format respon Google Apps Script tidak sesuai',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Gagal menghubungi Google Apps Script Web App',
    };
  }
}

export async function sendGasAction(
  gasUrl: string,
  payload: Record<string, any>
): Promise<{ success: boolean; message?: string }> {
  if (!gasUrl) return { success: true }; // Offline mode operates smoothly

  try {
    // Note: Google Apps Script Web App redirects POST, so text/plain or URLSearchParams is recommended
    const res = await fetch(gasUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
    });

    const data = await res.json().catch(() => ({ status: 'success' }));
    return { success: true, message: data.message };
  } catch (err: any) {
    console.warn('Google Sheets background sync notice:', err.message);
    // Don't block the UI if GAS is unresponsive, local state is already saved
    return { success: false, message: err.message };
  }
}

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `/**
 * GOOGLE APPS SCRIPT BACKEND - FLEET READINESS INTEGRATION
 * Spreadsheet ID : 17Kjn7YSBjt6p3FaNTofmqtfjAl2DjekO
 * Sheet Target   : MD to Dealer
 * 
 * Kolom yang dikelola aplikasi (Safe Partial Update):
 * 1. ID
 * 2. Transporter
 * 3. Nomor Polisi
 * 4. Nama Sopir (disimpan nama depan saja)
 * 5. Kapasitas
 * 6. Status Truk (Aktif / Nonaktif)
 * 7. Log (Riwayat konfirmasi / update terakhir)
 * 
 * Semua 60+ kolom audit, spesifikasi, dan foto lainnya AMAN dan TIDAK AKAN TERTAMPA.
 */

var SPREADSHEET_ID = "17Kjn7YSBjt6p3FaNTofmqtfjAl2DjekO";
var SHEET_NAME = "MD to Dealer 2";

function getTargetSpreadsheet() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (err) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

function getHeaderMap(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return {};
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var headerName = String(headers[i]).trim();
    if (headerName) {
      map[headerName] = i + 1; // 1-based index untuk getRange
    }
  }

  // Jika kolom 'Status Truk' tidak ada tapi ada 'Status', gunakan 'Status'
  if (!map['Status Truk'] && map['Status']) {
    map['Status Truk'] = map['Status'];
  }

  // Otomatis buat kolom 'Log' jika belum ada di sheet
  if (!map['Log']) {
    var newCol = lastCol + 1;
    sheet.getRange(1, newCol).setValue('Log');
    map['Log'] = newCol;
  }

  return map;
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'getData';
  var ss = getTargetSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Sheet "' + SHEET_NAME + '" tidak ditemukan di Spreadsheet!'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var headerMap = getHeaderMap(sheet);
  var lastRow = sheet.getLastRow();
  var trucks = [];

  if (lastRow > 1) {
    var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var idColIdx = headerMap['ID'] ? headerMap['ID'] - 1 : 0;
      var idVal = String(row[idColIdx] || '').trim();

      if (idVal) {
        var rawSopir = headerMap['Nama Sopir'] ? String(row[headerMap['Nama Sopir'] - 1] || '').trim() : '';
        var namaDepan = rawSopir ? rawSopir.split(/\\s+/)[0] : '';

        var rawKap = headerMap['Kapasitas'] ? String(row[headerMap['Kapasitas'] - 1] || '').replace(/\\D/g, '') : '28';
        if (!rawKap || rawKap === '0') rawKap = '28';

        var rawStatus = headerMap['Status Truk'] ? String(row[headerMap['Status Truk'] - 1] || '').trim() : 'Aktif';
        var status = (rawStatus.toLowerCase() === 'nonaktif' || rawStatus.toLowerCase() === 'non-aktif') ? 'Nonaktif' : 'Aktif';

        var logVal = headerMap['Log'] ? String(row[headerMap['Log'] - 1] || '').trim() : '';

        trucks.push({
          id: idVal,
          transporter: headerMap['Transporter'] ? String(row[headerMap['Transporter'] - 1] || '').trim() : '',
          nomorPolisi: headerMap['Nomor Polisi'] ? String(row[headerMap['Nomor Polisi'] - 1] || '').trim().toUpperCase() : '',
          namaSopir: namaDepan || rawSopir,
          kapasitas: rawKap,
          status: status,
          terakhirUpdate: logVal
        });
      }
    }
  }

  // Jika ada sheet Users terpisah di spreadsheet yang sama, baca data user
  var users = [];
  var usersSheet = ss.getSheetByName('Users');
  if (usersSheet && usersSheet.getLastRow() > 1) {
    var uData = usersSheet.getDataRange().getValues();
    for (var u = 1; u < uData.length; u++) {
      if (uData[u][0]) {
        users.push({
          email: String(uData[u][0]).trim(),
          namaTransporter: String(uData[u][1] || '').trim(),
          role: String(uData[u][2] || 'transporter').trim(),
          kodeTransporter: String(uData[u][3] || 'TM').trim()
        });
      }
    }
  }

  var response = {
    status: 'success',
    sheetName: SHEET_NAME,
    total: trucks.length,
    trucks: trucks
  };

  if (users.length > 0) {
    response.users = users;
  }

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var ss = getTargetSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Sheet "' + SHEET_NAME + '" tidak ditemukan!'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var headerMap = getHeaderMap(sheet);
    var lastRow = sheet.getLastRow();

    // 1. UPDATE DATA TRUK (Inline Edit / Autosave)
    if (action === 'updateTruck') {
      var t = body.truck;
      var foundRow = -1;

      if (lastRow > 1 && headerMap['ID']) {
        var idColumnValues = sheet.getRange(2, headerMap['ID'], lastRow - 1, 1).getValues();
        for (var r = 0; r < idColumnValues.length; r++) {
          if (String(idColumnValues[r][0]).trim() === String(t.id).trim()) {
            foundRow = r + 2;
            break;
          }
        }
      }

      if (foundRow > 0) {
        // Safe Partial Update: HANYA ubah cell yang relevan
        if (headerMap['Nomor Polisi'] && t.nomorPolisi !== undefined) {
          sheet.getRange(foundRow, headerMap['Nomor Polisi']).setValue(t.nomorPolisi);
        }
        if (headerMap['Nama Sopir'] && t.namaSopir !== undefined) {
          var namaDepan = String(t.namaSopir).trim().split(/\\s+/)[0];
          sheet.getRange(foundRow, headerMap['Nama Sopir']).setValue(namaDepan);
        }
        if (headerMap['Kapasitas'] && t.kapasitas !== undefined) {
          sheet.getRange(foundRow, headerMap['Kapasitas']).setValue(t.kapasitas);
        }
        if (headerMap['Status Truk'] && t.status !== undefined) {
          sheet.getRange(foundRow, headerMap['Status Truk']).setValue(t.status);
        }
        if (headerMap['Log'] && t.terakhirUpdate !== undefined) {
          sheet.getRange(foundRow, headerMap['Log']).setValue(t.terakhirUpdate);
        }
      } else {
        // Jika belum ada, buat baris baru aman (dengan padding 60+ kolom)
        var newRowArray = new Array(sheet.getLastColumn()).fill('');
        if (headerMap['ID']) newRowArray[headerMap['ID'] - 1] = t.id;
        if (headerMap['Transporter']) newRowArray[headerMap['Transporter'] - 1] = t.transporter;
        if (headerMap['Nomor Polisi']) newRowArray[headerMap['Nomor Polisi'] - 1] = t.nomorPolisi;
        if (headerMap['Nama Sopir']) newRowArray[headerMap['Nama Sopir'] - 1] = String(t.namaSopir).trim().split(/\\s+/)[0];
        if (headerMap['Kapasitas']) newRowArray[headerMap['Kapasitas'] - 1] = t.kapasitas;
        if (headerMap['Status Truk']) newRowArray[headerMap['Status Truk'] - 1] = t.status;
        if (headerMap['Log']) newRowArray[headerMap['Log'] - 1] = t.terakhirUpdate;
        sheet.appendRow(newRowArray);
      }

      return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2. TAMBAH ARMADA BARU
    if (action === 'addTruck') {
      var newTruck = body.truck;
      var rowArr = new Array(sheet.getLastColumn()).fill('');
      if (headerMap['ID']) rowArr[headerMap['ID'] - 1] = newTruck.id;
      if (headerMap['Transporter']) rowArr[headerMap['Transporter'] - 1] = newTruck.transporter;
      if (headerMap['Nomor Polisi']) rowArr[headerMap['Nomor Polisi'] - 1] = newTruck.nomorPolisi;
      if (headerMap['Nama Sopir']) rowArr[headerMap['Nama Sopir'] - 1] = String(newTruck.namaSopir).trim().split(/\\s+/)[0];
      if (headerMap['Kapasitas']) rowArr[headerMap['Kapasitas'] - 1] = newTruck.kapasitas;
      if (headerMap['Status Truk']) rowArr[headerMap['Status Truk'] - 1] = newTruck.status;
      if (headerMap['Log']) rowArr[headerMap['Log'] - 1] = newTruck.terakhirUpdate;
      sheet.appendRow(rowArr);

      return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 3. HAPUS ARMADA
    if (action === 'deleteTruck') {
      var deleteId = String(body.truckId).trim();
      if (lastRow > 1 && headerMap['ID']) {
        var idVals = sheet.getRange(2, headerMap['ID'], lastRow - 1, 1).getValues();
        for (var d = 0; d < idVals.length; d++) {
          if (String(idVals[d][0]).trim() === deleteId) {
            sheet.deleteRow(d + 2);
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 4. SIMPAN DATA / KONFIRMASI KESELURUHAN (Update kolom 'Log')
    if (action === 'confirmAll') {
      var targetTransporter = body.transporter;
      var timestamp = body.timestamp;

      if (lastRow > 1 && headerMap['Log']) {
        if (targetTransporter === 'ALL' || !headerMap['Transporter']) {
          // Update semua baris
          var logRange = sheet.getRange(2, headerMap['Log'], lastRow - 1, 1);
          var fillVals = [];
          for (var f = 0; f < lastRow - 1; f++) fillVals.push([timestamp]);
          logRange.setValues(fillVals);
        } else {
          // Update baris transporter yang bersangkutan
          var transValues = sheet.getRange(2, headerMap['Transporter'], lastRow - 1, 1).getValues();
          for (var tr = 0; tr < transValues.length; tr++) {
            if (String(transValues[tr][0]).trim() === targetTransporter) {
              sheet.getRange(tr + 2, headerMap['Log']).setValue(timestamp);
            }
          }
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'unknown_action' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
`;
