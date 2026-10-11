import { TruckRecord } from '../types';
import { getAccessToken } from './googleAuth';

export const DEFAULT_SPREADSHEET_ID = '17Kjn7YSBjt6p3FaNTofmqtfjAl2DjekO';
export const DEFAULT_SHEET_NAME = 'MD to Dealer 2';

const STORAGE_KEYS = {
  SPREADSHEET_ID: 'fleet_google_spreadsheet_id',
  SHEET_NAME: 'fleet_google_sheet_name',
};

export function getStoredSpreadsheetId(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.SPREADSHEET_ID) || DEFAULT_SPREADSHEET_ID;
  } catch {
    return DEFAULT_SPREADSHEET_ID;
  }
}

export function saveStoredSpreadsheetId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SPREADSHEET_ID, id.trim());
  } catch (e) {
    console.error('Failed to save spreadsheet ID', e);
  }
}

export function getStoredSheetName(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.SHEET_NAME) || DEFAULT_SHEET_NAME;
  } catch {
    return DEFAULT_SHEET_NAME;
  }
}

export function saveStoredSheetName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SHEET_NAME, name.trim());
  } catch (e) {
    console.error('Failed to save sheet name', e);
  }
}

function colIndexToA1(colIdx: number): string {
  let temp = colIdx + 1;
  let letter = '';
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

// 1. Fetch all rows from Google Sheet
export async function fetchFromGoogleSheets(
  token?: string,
  spreadsheetId = getStoredSpreadsheetId(),
  sheetName = getStoredSheetName()
): Promise<{
  success: boolean;
  trucks?: TruckRecord[];
  message?: string;
}> {
  try {
    const accessToken = token || (await getAccessToken());
    if (!accessToken) {
      return { success: false, message: 'Google Auth Token tidak tersedia. Silakan hubungkan akun Google.' };
    }

    const range = encodeURIComponent(`'${sheetName}'!A1:ZZ`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.error?.message || `HTTP ${res.status}: Gagal membaca spreadsheet`);
    }

    const data = await res.json();
    const rows: string[][] = data.values || [];

    if (rows.length < 2) {
      return { success: true, trucks: [], message: 'Spreadsheet kosong atau hanya berisi header' };
    }

    const headers = rows[0].map((h) => String(h || '').trim());
    const headerMap: Record<string, number> = {};
    headers.forEach((h, idx) => {
      if (h) headerMap[h] = idx;
    });

    // Helper to get value
    const getVal = (row: string[], name: string, fallbackIdx = -1) => {
      if (headerMap[name] !== undefined && row[headerMap[name]] !== undefined) {
        return String(row[headerMap[name]] || '').trim();
      }
      if (fallbackIdx >= 0 && row[fallbackIdx] !== undefined) {
        return String(row[fallbackIdx] || '').trim();
      }
      return '';
    };

    const trucks: TruckRecord[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const id = getVal(row, 'ID', 0);
      if (!id) continue;

      const rawTransporter = getVal(row, 'Transporter', 1);
      let transporter = 'TM';
      const tUpper = rawTransporter.toUpperCase();
      if (tUpper.includes('RODA') || tUpper.includes('RJTM')) transporter = 'RJTM';
      else if (tUpper.includes('WAHANA') || tUpper.includes('WSS')) transporter = 'WSS';
      else if (tUpper.includes('SARI') || tUpper.includes('SBR')) transporter = 'SBR';
      else if (tUpper.includes('TUNAS') || tUpper.includes('TM')) transporter = 'TM';

      const depo = getVal(row, 'Lokasi Audit') || getVal(row, 'Depo') || 'Karawang';
      const nomorPolisi = getVal(row, 'Nomor Polisi', 2).toUpperCase();
      const rawSopir = getVal(row, 'Nama Sopir', 3);
      const namaSopir = rawSopir.split(/\s+/)[0] || rawSopir;
      const rawKap = getVal(row, 'Kapasitas', 4).replace(/\D/g, '') || '28';
      const rawStatus = getVal(row, 'Status Truk') || getVal(row, 'Status') || 'Aktif';
      const status = rawStatus.toLowerCase().includes('non') ? 'Nonaktif' : 'Aktif';
      const rawKesiapan = getVal(row, 'Kesiapan') || getVal(row, 'Status Kesiapan') || '';
      const kesiapan = (rawKesiapan.toLowerCase().includes('tidak') || status === 'Nonaktif')
        ? 'Tidak Ready'
        : 'Ready';
      const keterangan = getVal(row, 'Keterangan') || getVal(row, 'Catatan') || '';
      const terakhirUpdate = getVal(row, 'Log') || getVal(row, 'Tgl Pemeriksaan') || '';

      trucks.push({
        id,
        transporter,
        depo,
        nomorPolisi,
        namaSopir,
        kapasitas: rawKap,
        status,
        kesiapan,
        keterangan,
        terakhirUpdate,
      });
    }

    return {
      success: true,
      trucks,
      message: `Berhasil memuat ${trucks.length} armada dari Google Sheets (${sheetName})`,
    };
  } catch (err: any) {
    console.error('Fetch Google Sheets error:', err);
    return { success: false, message: err.message };
  }
}

// 2. Update single truck row in Google Sheet
export async function updateGoogleSheetTruck(
  truck: TruckRecord,
  token?: string,
  spreadsheetId = getStoredSpreadsheetId(),
  sheetName = getStoredSheetName()
): Promise<{ success: boolean; message?: string }> {
  try {
    const accessToken = token || (await getAccessToken());
    if (!accessToken) {
      return { success: false, message: 'Google Auth token belum tersedia' };
    }

    // First fetch headers and ID column to find exact row
    const range = encodeURIComponent(`'${sheetName}'!A1:ZZ`);
    const fetchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!fetchRes.ok) {
      throw new Error(`Gagal membaca struktur spreadsheet (HTTP ${fetchRes.status})`);
    }

    const fetchJson = await fetchRes.json();
    const rows: string[][] = fetchJson.values || [];
    if (rows.length < 2) return { success: false, message: 'Sheet tidak memiliki data' };

    const headers = rows[0].map((h) => String(h || '').trim());
    const headerMap: Record<string, number> = {};
    headers.forEach((h, idx) => {
      if (h) headerMap[h] = idx;
    });

    const idColIdx = headerMap['ID'] !== undefined ? headerMap['ID'] : 0;
    let targetRowIndex = -1;

    for (let r = 1; r < rows.length; r++) {
      if (String(rows[r][idColIdx] || '').trim() === String(truck.id).trim()) {
        targetRowIndex = r + 1; // 1-based index in sheets
        break;
      }
    }

    if (targetRowIndex === -1) {
      // Row not found, append as new row
      return appendGoogleSheetTruck(truck, accessToken, spreadsheetId, sheetName);
    }

    // Build values to update matching header columns
    const dataUpdates: { range: string; values: any[][] }[] = [];

    const setCol = (colName: string, value: any) => {
      if (headerMap[colName] !== undefined) {
        const colLetter = colIndexToA1(headerMap[colName]);
        dataUpdates.push({
          range: `'${sheetName}'!${colLetter}${targetRowIndex}`,
          values: [[value]],
        });
      }
    };

    setCol('Nomor Polisi', truck.nomorPolisi);
    setCol('Nama Sopir', (truck.namaSopir || '').split(/\s+/)[0]);
    setCol('Kapasitas', truck.kapasitas);
    setCol('Status Truk', truck.status);
    setCol('Status', truck.status);
    setCol('Kesiapan', truck.kesiapan || 'Ready');
    setCol('Keterangan', truck.keterangan || '');
    setCol('Log', truck.terakhirUpdate || new Date().toLocaleString('id-ID'));
    if (truck.depo) setCol('Lokasi Audit', truck.depo);

    // Execute batch update
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: dataUpdates,
        }),
      }
    );

    if (!updateRes.ok) {
      const errJson = await updateRes.json().catch(() => ({}));
      throw new Error(errJson?.error?.message || `HTTP ${updateRes.status}: Gagal memperbarui data di spreadsheet`);
    }

    return { success: true, message: `Armada ${truck.nomorPolisi} berhasil terupdate ke Google Spreadsheet` };
  } catch (err: any) {
    console.warn('Update Google Sheets error:', err);
    return { success: false, message: err.message };
  }
}

// 3. Batch Update multiple trucks (Quick Confirm All / Bulk update)
export async function batchUpdateGoogleSheetTrucks(
  trucks: TruckRecord[],
  token?: string,
  spreadsheetId = getStoredSpreadsheetId(),
  sheetName = getStoredSheetName()
): Promise<{ success: boolean; message?: string }> {
  try {
    if (trucks.length === 0) return { success: true };
    const accessToken = token || (await getAccessToken());
    if (!accessToken) {
      return { success: false, message: 'Google Auth token belum tersedia' };
    }

    // Read headers & IDs
    const range = encodeURIComponent(`'${sheetName}'!A1:ZZ`);
    const fetchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!fetchRes.ok) {
      throw new Error(`Gagal membaca spreadsheet (HTTP ${fetchRes.status})`);
    }

    const fetchJson = await fetchRes.json();
    const rows: string[][] = fetchJson.values || [];
    if (rows.length < 2) return { success: false, message: 'Sheet tidak memiliki data' };

    const headers = rows[0].map((h) => String(h || '').trim());
    const headerMap: Record<string, number> = {};
    headers.forEach((h, idx) => {
      if (h) headerMap[h] = idx;
    });

    const idColIdx = headerMap['ID'] !== undefined ? headerMap['ID'] : 0;
    const rowIdMap: Record<string, number> = {};

    for (let r = 1; r < rows.length; r++) {
      const idVal = String(rows[r][idColIdx] || '').trim();
      if (idVal) {
        rowIdMap[idVal] = r + 1; // 1-based index
      }
    }

    const dataUpdates: { range: string; values: any[][] }[] = [];

    trucks.forEach((truck) => {
      const targetRow = rowIdMap[truck.id];
      if (targetRow) {
        const setCol = (colName: string, value: any) => {
          if (headerMap[colName] !== undefined) {
            const colLetter = colIndexToA1(headerMap[colName]);
            dataUpdates.push({
              range: `'${sheetName}'!${colLetter}${targetRow}`,
              values: [[value]],
            });
          }
        };

        setCol('Nomor Polisi', truck.nomorPolisi);
        setCol('Nama Sopir', (truck.namaSopir || '').split(/\s+/)[0]);
        setCol('Kapasitas', truck.kapasitas);
        setCol('Status Truk', truck.status);
        setCol('Status', truck.status);
        setCol('Kesiapan', truck.kesiapan || 'Ready');
        setCol('Keterangan', truck.keterangan || '');
        setCol('Log', truck.terakhirUpdate);
        if (truck.depo) setCol('Lokasi Audit', truck.depo);
      }
    });

    if (dataUpdates.length === 0) {
      return { success: true, message: 'Tidak ada baris yang perlu diperbarui di spreadsheet' };
    }

    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: dataUpdates,
        }),
      }
    );

    if (!updateRes.ok) {
      const errJson = await updateRes.json().catch(() => ({}));
      throw new Error(errJson?.error?.message || `HTTP ${updateRes.status}: Gagal batch update ke spreadsheet`);
    }

    return { success: true, message: `Berhasil sinkronisasi ${trucks.length} unit ke Google Spreadsheet` };
  } catch (err: any) {
    console.warn('Batch Update Google Sheets error:', err);
    return { success: false, message: err.message };
  }
}

// 4. Append new truck row in Google Sheet
export async function appendGoogleSheetTruck(
  truck: TruckRecord,
  token?: string,
  spreadsheetId = getStoredSpreadsheetId(),
  sheetName = getStoredSheetName()
): Promise<{ success: boolean; message?: string }> {
  try {
    const accessToken = token || (await getAccessToken());
    if (!accessToken) {
      return { success: false, message: 'Google Auth token belum tersedia' };
    }

    // Read header row
    const fetchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${sheetName}'!1:1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!fetchRes.ok) {
      throw new Error(`Gagal membaca header spreadsheet (HTTP ${fetchRes.status})`);
    }

    const fetchJson = await fetchRes.json();
    const headers: string[] = (fetchJson.values && fetchJson.values[0]) || [];

    const newRowValues: any[] = headers.map((header) => {
      const h = String(header || '').trim();
      if (h === 'ID') return truck.id;
      if (h === 'Transporter') return truck.transporter;
      if (h === 'Lokasi Audit' || h === 'Depo') return truck.depo || 'Karawang';
      if (h === 'Nomor Polisi') return truck.nomorPolisi;
      if (h === 'Nama Sopir') return (truck.namaSopir || '').split(/\s+/)[0];
      if (h === 'Kapasitas') return truck.kapasitas;
      if (h === 'Status Truk' || h === 'Status') return truck.status;
      if (h === 'Kesiapan' || h === 'Status Kesiapan') return truck.kesiapan || 'Ready';
      if (h === 'Keterangan' || h === 'Catatan') return truck.keterangan || '';
      if (h === 'Log' || h === 'Tgl Pemeriksaan') return truck.terakhirUpdate || new Date().toLocaleString('id-ID');
      return '';
    });

    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${sheetName}'!A:ZZ:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [newRowValues],
        }),
      }
    );

    if (!appendRes.ok) {
      const errJson = await appendRes.json().catch(() => ({}));
      throw new Error(errJson?.error?.message || `HTTP ${appendRes.status}: Gagal menambahkan armada ke spreadsheet`);
    }

    return { success: true, message: `Armada baru ${truck.nomorPolisi} berhasil ditambahkan ke Google Spreadsheet` };
  } catch (err: any) {
    console.warn('Append Google Sheets error:', err);
    return { success: false, message: err.message };
  }
}
