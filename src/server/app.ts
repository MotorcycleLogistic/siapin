import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

export const app = express();
app.use(express.json());

// Persistent Directory for Snapshots & Bindings (Serverless Safe with Try-Catch)
const SNAPSHOTS_DIR = path.join(process.cwd(), 'data', 'snapshots');
try {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
} catch (err: any) {
  // Read-only filesystem in serverless environments (e.g., Vercel)
}

const BINDINGS_DIR = path.join(process.cwd(), 'data', 'bindings');
try {
  if (!fs.existsSync(BINDINGS_DIR)) {
    fs.mkdirSync(BINDINGS_DIR, { recursive: true });
  }
} catch (err: any) {
  // Read-only filesystem in serverless environments (e.g., Vercel)
}

// Cloud Firestore Database Instance (Dual-Source: Env Var for Vercel & Config File for Local)
export let firestoreDb: any = null;
let firestoreInitPromise: Promise<any> | null = null;

export async function initFirestoreConnection() {
  if (firestoreDb) return firestoreDb;
  if (firestoreInitPromise) return firestoreInitPromise;

  firestoreInitPromise = (async () => {
    try {
      let firebaseConfig: any = null;

      if (process.env.FIREBASE_CONFIG) {
        try {
          firebaseConfig = typeof process.env.FIREBASE_CONFIG === 'string'
            ? JSON.parse(process.env.FIREBASE_CONFIG)
            : process.env.FIREBASE_CONFIG;
        } catch (e: any) {
          console.warn('Gagal membaca FIREBASE_CONFIG dari env:', e.message);
        }
      } else if (process.env.FIREBASE_PROJECT_ID) {
        firebaseConfig = {
          projectId: process.env.FIREBASE_PROJECT_ID,
          apiKey: process.env.FIREBASE_API_KEY || '',
          authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
          firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || undefined,
        };
      } else {
        const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(firebaseConfigPath)) {
          try {
            firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));
          } catch {}
        }
      }

      // Authoritative fallback config for SIAPIN Vercel Serverless
      if (!firebaseConfig) {
        firebaseConfig = {
          projectId: "gen-lang-client-0286495500",
          appId: "1:899690953368:web:2d6e7aa901dda1363f6eed",
          apiKey: "AIzaSyBhfJMosbTICiAEXvxnnTxyTsYRJm61tnM",
          authDomain: "gen-lang-client-0286495500.firebaseapp.com",
          firestoreDatabaseId: "ai-studio-siapin-b6acd525-7284-4786-bbde-e0c31404bd65",
          storageBucket: "gen-lang-client-0286495500.firebasestorage.app",
          messagingSenderId: "899690953368",
        };
      }

      if (firebaseConfig) {
        const { initializeApp: initFirebaseApp, getApps: getFirebaseApps } = await import('firebase/app');
        const { getFirestore: initFirestore } = await import('firebase/firestore');
        const fbApp = getFirebaseApps().length === 0 ? initFirebaseApp(firebaseConfig) : getFirebaseApps()[0];
        firestoreDb = initFirestore(fbApp, firebaseConfig.firestoreDatabaseId || undefined);
        console.log('Cloud Firestore initialized for SIAPIN database');
        return firestoreDb;
      }
    } catch (err: any) {
      console.warn('Firestore initial connection note:', err.message);
    }
    return null;
  })();

  return firestoreInitPromise;
}

// Initialize Firestore on startup
initFirestoreConnection();

// AppSheet Credentials (configured server-side)
const APPSHEET_APP_ID = process.env.APPSHEET_APP_ID || '8b71fdfd-7dcb-4c5f-944f-8491406b0c5a';
const APPSHEET_ACCESS_KEY = process.env.APPSHEET_ACCESS_KEY || 'V2-X58uw-q1bpM-xtN9s-cz1XH-FYbdl-1B2g3-lNZ0H-AGHoc';

let currentTableName = (process.env.APPSHEET_TABLE && !process.env.APPSHEET_TABLE.startsWith('DocId=') && process.env.APPSHEET_TABLE !== 'MD to Dealer')
  ? process.env.APPSHEET_TABLE
  : 'MD to Dealer 2';

export function normalizeTransporterCode(val: string): string {
  const upper = String(val || '').trim().toUpperCase();
  if (upper.includes('TUNAS MUDA') || upper === 'TM') return 'TM';
  if (upper.includes('RODA JAGAT') || upper.includes('TUNAS MAS') || upper.includes('RIAU JAYA') || upper === 'RJTM') return 'RJTM';
  if (upper.includes('WAHANA') || upper.includes('SUMBER SAKTI') || upper === 'WSS') return 'WSS';
  if (upper.includes('SARI BUMI') || upper === 'SBR') return 'SBR';
  return val.trim() || 'TM';
}

export function getAppSheetTransporterName(code: string): string {
  const upper = String(code || '').trim().toUpperCase();
  if (upper === 'TM' || upper.includes('TUNAS MUDA')) return 'PT. Tunas Muda';
  if (upper === 'RJTM' || upper.includes('RODA JAGAT') || upper.includes('TUNAS MAS')) return 'PT. Roda Jagat Tunas Mas';
  if (upper === 'WSS' || upper.includes('WAHANA')) return 'PT. Wahana Sumber Sakti';
  if (upper === 'SBR' || upper.includes('SARI BUMI')) return 'PT. Sari Bumi Raya';
  return code;
}

export function getDepoAbbreviation(depo: string): string {
  const d = String(depo || '').trim().toLowerCase();
  if (d.includes('baros') || d === 'brs') return 'BRS';
  if (d.includes('cirebon') || d === 'crb') return 'CRB';
  return 'KRW';
}

export function cleanDriverNameKeepFull(name: string): string {
  if (!name || !name.trim()) return '';
  return name
    .toLowerCase()
    .replace(/\b(pt\.?|tunas|muda|roda|jagat|mas|wahana|sumber|sakti|sari|bumi|raya)\b/gi, ' ')
    .replace(/\b(tm|rjtm|wss|sbr)\b/gi, ' ')
    .replace(/\b(karawang|baros|cirebon|krw|brs|crb|md-?d|md)\b/gi, ' ')
    .replace(/\b(pak|bapak|bpk|driver|sopir)\b/gi, ' ')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function formatDriverNameStandard(rawName: string, transporter: string, depo?: string): string {
  if (!rawName || !rawName.trim()) return '';
  const transCode = normalizeTransporterCode(transporter);
  const depoAbbr = getDepoAbbreviation(depo || '');
  const clean = cleanDriverNameKeepFull(rawName);
  if (!clean) return '';

  return `${clean} ${transCode} ${depoAbbr}`;
}

// In-memory cache for Data Truk 2 to avoid redundant round-trips
let dataTrukCache: { rows: any[]; timestamp: number } | null = null;
const DATA_TRUK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

async function getCachedDataTrukRows(): Promise<any[]> {
  const now = Date.now();
  if (dataTrukCache && now - dataTrukCache.timestamp < DATA_TRUK_CACHE_TTL_MS) {
    return dataTrukCache.rows;
  }
  const raw = await callAppSheetApi('Find', [], 'Data Truk 2');
  if (Array.isArray(raw)) {
    dataTrukCache = { rows: raw, timestamp: now };
    return raw;
  }
  return dataTrukCache ? dataTrukCache.rows : [];
}

// Update driver in master table "Data Truk 2" (Key = Nama Driver, anchored by ID)
export async function syncDriverToDataTruk2(
  driverNameFormatted: string,
  originalName?: string,
  transporter?: string,
  status: string = 'Aktif',
  targetId?: string
) {
  if (!driverNameFormatted || !driverNameFormatted.trim()) return;
  try {
    const rawRows = await getCachedDataTrukRows();
    if (!Array.isArray(rawRows)) return;

    const cleanTarget = cleanDriverNameKeepFull(driverNameFormatted);
    if (!cleanTarget) return;
    const transCode = transporter ? normalizeTransporterCode(transporter).toLowerCase() : '';
    const targetStatus = status || 'Aktif';

    // 1. Patokan Utama: Cek kecocokan ID jika targetId tersedia
    let matched: any = null;
    if (targetId && targetId.trim()) {
      matched = rawRows.find((r: any) => {
        const route = String(r['Rute'] || '').trim().toUpperCase();
        if (route !== 'MD-D') return false;
        return String(r['ID'] || '').trim() === targetId.trim();
      });
    }

    // 2. Jika belum cocok by ID, cari baris yang Nama Driver persis sama (case-insensitive)
    if (!matched) {
      matched = rawRows.find((r: any) => {
        const route = String(r['Rute'] || '').trim().toUpperCase();
        if (route !== 'MD-D') return false;

        const existingName = String(r['Nama Driver'] || '').trim();
        if (!existingName) return false;

        if (existingName.toLowerCase() === driverNameFormatted.toLowerCase()) return true;
        if (originalName && existingName.toLowerCase() === originalName.trim().toLowerCase()) return true;

        if (cleanDriverNameKeepFull(existingName) === cleanTarget) {
          const lower = existingName.toLowerCase();
          if (transCode && (lower.includes(transCode) || lower.includes('wss') || lower.includes('tm') || lower.includes('rjtm') || lower.includes('sbr'))) {
            return lower.includes(transCode);
          }
          return true;
        }
        return false;
      });
    }

    if (matched) {
      const currentAppSheetKey = String(matched['Nama Driver'] || '').trim();
      const existingId = matched['ID'] || targetId || ('DRV-' + Math.random().toString(36).substring(2, 9).toUpperCase());

      if (currentAppSheetKey === driverNameFormatted) {
        if (matched['Status'] !== targetStatus || matched['Rute'] !== 'MD-D') {
          await callAppSheetApi('Edit', [{
            'Nama Driver': driverNameFormatted,
            'Status': targetStatus,
            'Rute': 'MD-D',
            'ID': existingId,
          }], 'Data Truk 2');
          matched['Status'] = targetStatus;
          matched['Rute'] = 'MD-D';
        }
      } else {
        const newRow = {
          'ID': existingId,
          'Nama Driver': driverNameFormatted,
          'Status': targetStatus,
          'Rute': 'MD-D',
        };
        await callAppSheetApi('Add', [newRow], 'Data Truk 2');
        if (currentAppSheetKey) {
          await callAppSheetApi('Delete', [{ 'Nama Driver': currentAppSheetKey }], 'Data Truk 2').catch(() => {});
        }
        matched['Nama Driver'] = driverNameFormatted;
        matched['Status'] = targetStatus;
        matched['Rute'] = 'MD-D';
        matched['ID'] = existingId;
      }
    } else {
      const newDriverId = targetId || ('DRV-' + Math.random().toString(36).substring(2, 9).toUpperCase());
      const newRow = {
        'ID': newDriverId,
        'Nama Driver': driverNameFormatted,
        'Status': targetStatus,
        'Rute': 'MD-D',
      };
      await callAppSheetApi('Add', [newRow], 'Data Truk 2');
      rawRows.push(newRow);
    }
  } catch (err: any) {
    console.warn('Sync to Data Truk 2 note:', err.message);
  }
}

// Ultra-safe batch synchronization to Data Truk 2 (Anchor ID, Key = Nama Driver)
export async function batchSyncDriversToDataTruk2(
  trucks: Array<{ namaSopir: string; transporter: string; depo?: string; status?: string; id?: string }>
) {
  try {
    const rawRows = await getCachedDataTrukRows();
    if (!Array.isArray(rawRows)) return;

    const edits: any[] = [];
    const adds: any[] = [];
    const deletes: any[] = [];
    const seenNames = new Set<string>();

    for (const t of trucks) {
      if (!t || !t.namaSopir || !t.transporter) continue;
      const formattedSopir = formatDriverNameStandard(t.namaSopir, t.transporter, t.depo);
      if (!formattedSopir) continue;
      if (seenNames.has(formattedSopir.toLowerCase())) continue;
      seenNames.add(formattedSopir.toLowerCase());

      const cleanTarget = cleanDriverNameKeepFull(formattedSopir);
      const transCode = t.transporter ? normalizeTransporterCode(t.transporter).toLowerCase() : '';
      const targetStatus = t.status || 'Aktif';
      const targetId = t.id;

      let matched: any = null;
      if (targetId && targetId.trim()) {
        matched = rawRows.find((r: any) => {
          const route = String(r['Rute'] || '').trim().toUpperCase();
          if (route !== 'MD-D') return false;
          return String(r['ID'] || '').trim() === targetId.trim();
        });
      }

      if (!matched) {
        matched = rawRows.find((r: any) => {
          const route = String(r['Rute'] || '').trim().toUpperCase();
          if (route !== 'MD-D') return false;
          const existingName = String(r['Nama Driver'] || '').trim();
          if (existingName.toLowerCase() === formattedSopir.toLowerCase()) return true;
          if (cleanTarget && cleanDriverNameKeepFull(existingName) === cleanTarget) {
            const lower = existingName.toLowerCase();
            if (transCode && (lower.includes(transCode) || lower.includes('wss') || lower.includes('tm') || lower.includes('rjtm') || lower.includes('sbr'))) {
              return lower.includes(transCode);
            }
            return true;
          }
          return false;
        });
      }

      if (matched) {
        const currentAppSheetKey = String(matched['Nama Driver'] || '').trim();
        const existingId = matched['ID'] || targetId || ('DRV-' + Math.random().toString(36).substring(2, 9).toUpperCase());

        if (currentAppSheetKey === formattedSopir) {
          if (matched['Status'] !== targetStatus || matched['Rute'] !== 'MD-D') {
            edits.push({
              'Nama Driver': formattedSopir,
              'Status': targetStatus,
              'Rute': 'MD-D',
              'ID': existingId,
            });
            matched['Status'] = targetStatus;
            matched['Rute'] = 'MD-D';
          }
        } else {
          adds.push({
            'ID': existingId,
            'Nama Driver': formattedSopir,
            'Status': targetStatus,
            'Rute': 'MD-D',
          });
          if (currentAppSheetKey) {
            deletes.push({ 'Nama Driver': currentAppSheetKey });
          }
          matched['Nama Driver'] = formattedSopir;
          matched['Status'] = targetStatus;
          matched['Rute'] = 'MD-D';
          matched['ID'] = existingId;
        }
      } else {
        const newId = targetId || ('DRV-' + Math.random().toString(36).substring(2, 9).toUpperCase());
        const newRow = {
          'ID': newId,
          'Nama Driver': formattedSopir,
          'Status': targetStatus,
          'Rute': 'MD-D',
        };
        adds.push(newRow);
        rawRows.push(newRow);
      }
    }

    if (adds.length > 0) {
      await callAppSheetApi('Add', adds, 'Data Truk 2').catch((e) => console.warn('Batch add Data Truk 2 notice:', e.message));
    }
    if (edits.length > 0) {
      await callAppSheetApi('Edit', edits, 'Data Truk 2').catch((e) => console.warn('Batch edit Data Truk 2 notice:', e.message));
    }
    if (deletes.length > 0) {
      await callAppSheetApi('Delete', deletes, 'Data Truk 2').catch((e) => console.warn('Batch delete old keys Data Truk 2 notice:', e.message));
    }
  } catch (err: any) {
    console.warn('Batch sync drivers notice:', err.message);
  }
}

export function getAppSheetUrl(tableName?: string) {
  const target = (tableName || currentTableName).trim();
  return `https://api.appsheet.com/api/v2/apps/${APPSHEET_APP_ID}/tables/${encodeURIComponent(target)}/Action`;
}

export async function callAppSheetApi(action: string, rows: Record<string, any>[] = [], customTable?: string) {
  const targetTable = (customTable || currentTableName).trim();
  const url = getAppSheetUrl(targetTable);

  const payload = {
    Action: action,
    Properties: {
      Locale: 'id-ID',
      Timezone: 'Asia/Jakarta',
    },
    Rows: rows,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'ApplicationAccessKey': APPSHEET_ACCESS_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { rawText: text };
  }

  if (!response.ok) {
    const errorDetail = data?.detail || data?.message || text || `HTTP ${response.status}`;
    const err: any = new Error(errorDetail);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Admin Authentication Endpoint (Server-Side Protected)
app.post('/api/admin/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '').trim();

  const VALID_ADMIN_EMAIL = 'ari.imam@daya-motora.com';
  const VALID_ADMIN_PASS = 'mustika123';

  if (
    (cleanEmail === VALID_ADMIN_EMAIL || cleanEmail === 'admin.md@logistik.id' || cleanEmail === 'admin@daya-motora.com') &&
    cleanPassword === VALID_ADMIN_PASS
  ) {
    return res.json({
      success: true,
      user: {
        email: cleanEmail,
        namaTransporter: 'Ari Imam (Admin Distribusi)',
        role: 'admin',
        kodeTransporter: 'ALL',
        depo: 'Karawang',
      },
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Kombinasi email dan kata sandi admin salah.',
  });
});

// Transporter Google Account Binding in Cloud Firestore & Local Backup
export async function getBindingFromStorage(cleanEmail: string) {
  if (!cleanEmail) return null;
  
  await initFirestoreConnection();

  // 1. Try Cloud Firestore (Primary)
  if (firestoreDb) {
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const ref = doc(firestoreDb, 'transporter_bindings', cleanEmail);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        return snap.data();
      }
    } catch (e: any) {
      console.warn('Firestore get binding error:', e.message);
    }
  }

  // 2. Fallback to local storage file if exists
  try {
    const localFile = path.join(BINDINGS_DIR, `${encodeURIComponent(cleanEmail)}.json`);
    if (fs.existsSync(localFile)) {
      return JSON.parse(fs.readFileSync(localFile, 'utf-8'));
    }
  } catch {}
  return null;
}

export async function saveBindingToStorage(binding: any) {
  const cleanEmail = String(binding.email || '').trim().toLowerCase();
  if (!cleanEmail) return;

  await initFirestoreConnection();

  // 1. Save to local storage file (Safe non-blocking on serverless)
  try {
    const localFile = path.join(BINDINGS_DIR, `${encodeURIComponent(cleanEmail)}.json`);
    fs.writeFileSync(localFile, JSON.stringify(binding, null, 2), 'utf-8');
  } catch (fsErr: any) {
    // Expected on read-only serverless platforms like Vercel
  }

  // 2. Save to Cloud Firestore (Authoritative)
  if (firestoreDb) {
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const ref = doc(firestoreDb, 'transporter_bindings', cleanEmail);
      await setDoc(ref, binding, { merge: true });
    } catch (e: any) {
      console.warn('Firestore save binding error:', e.message);
    }
  }
}

// Check transporter binding endpoint
app.get('/api/transporter-binding/:email', async (req: Request, res: Response) => {
  try {
    const email = String(req.params.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email tidak valid' });
    }

    const existing = await getBindingFromStorage(email);
    return res.json({
      success: true,
      binding: existing || null,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Server error' });
  }
});

// Save or validate transporter binding endpoint
app.post('/api/transporter-binding', async (req: Request, res: Response) => {
  try {
    const { email, googleUid, displayName, kodeTransporter, namaTransporter, depo } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !kodeTransporter || !depo) {
      return res.status(400).json({
        success: false,
        message: 'Email, Kode Transporter, dan Depo wajib diisi',
      });
    }

    const existing = await getBindingFromStorage(cleanEmail);

    // STRICT REJECTION: Jika akun sudah pernah terdaftar untuk transporter atau depo lain
    if (existing) {
      const existingTrans = String(existing.kodeTransporter || '').trim().toUpperCase();
      const existingDepo = String(existing.depo || '').trim().toLowerCase();
      const targetTrans = String(kodeTransporter).trim().toUpperCase();
      const targetDepo = String(depo).trim().toLowerCase();

      if (existingTrans !== targetTrans || existingDepo !== targetDepo) {
        return res.status(403).json({
          success: false,
          rejected: true,
          existingBinding: existing,
          message: `Akun Google ${cleanEmail} telah terdaftar dan terkunci untuk ${existing.namaTransporter || existingTrans} (Depo ${existing.depo}). Anda tidak diizinkan menggunakan akun ini untuk Transporter atau Depo lain.`,
        });
      }
    }

    const now = new Date().toISOString();
    const bindingData = {
      email: cleanEmail,
      googleUid: googleUid || existing?.googleUid || '',
      displayName: displayName || existing?.displayName || '',
      kodeTransporter: String(kodeTransporter).trim().toUpperCase(),
      namaTransporter: namaTransporter || getAppSheetTransporterName(kodeTransporter),
      depo: String(depo).trim(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await saveBindingToStorage(bindingData);

    return res.json({
      success: true,
      binding: bindingData,
      message: `Akun Google berhasil dihubungkan dan dikunci untuk ${bindingData.namaTransporter} (${bindingData.depo})`,
    });
  } catch (err: any) {
    console.error('Error saving transporter binding:', err);
    return res.status(500).json({
      success: false,
      message: err?.message || 'Terjadi kesalahan pada server saat memproses data pendaftaran.',
    });
  }
});

// Check access permission without modifying
app.post('/api/transporter-binding/check', async (req: Request, res: Response) => {
  try {
    const { email, kodeTransporter, depo } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({ success: false, message: 'Email tidak valid' });
    }

    const existing = await getBindingFromStorage(cleanEmail);
    if (!existing) {
      return res.json({
        allowed: true,
        isNew: true,
        binding: null,
      });
    }

    const existingTrans = String(existing.kodeTransporter || '').trim().toUpperCase();
    const existingDepo = String(existing.depo || '').trim().toLowerCase();
    const targetTrans = String(kodeTransporter || '').trim().toUpperCase();
    const targetDepo = String(depo || '').trim().toLowerCase();

    if (targetTrans && targetDepo && (existingTrans !== targetTrans || existingDepo !== targetDepo)) {
      return res.json({
        allowed: false,
        isNew: false,
        existingBinding: existing,
        message: `Akun Google ${cleanEmail} telah terdaftar untuk ${existing.namaTransporter || existingTrans} (Depo ${existing.depo}). Penolakan akses untuk Transporter atau Depo lain.`,
      });
    }

    return res.json({
      allowed: true,
      isNew: false,
      existingBinding: existing,
    });
  } catch (err: any) {
    return res.status(500).json({
      allowed: false,
      isNew: false,
      message: err?.message || 'Server error',
    });
  }
});

// 1. Status Check
app.get('/api/appsheet/status', (_req: Request, res: Response) => {
  res.json({
    configured: Boolean(APPSHEET_APP_ID && APPSHEET_ACCESS_KEY),
    appId: APPSHEET_APP_ID ? `${APPSHEET_APP_ID.substring(0, 8)}...` : '',
    tableName: currentTableName,
  });
});

// Update table name
app.post('/api/appsheet/set-table', (req: Request, res: Response) => {
  const { tableName } = req.body;
  if (tableName && typeof tableName === 'string' && tableName.trim()) {
    currentTableName = tableName.trim();
  }
  res.json({ success: true, tableName: currentTableName });
});

// 2. Fetch all trucks from AppSheet
app.get('/api/appsheet/trucks', async (req: Request, res: Response) => {
  try {
    const tableParam = req.query.table as string | undefined;
    if (tableParam && tableParam.trim()) {
      const cleanParam = tableParam.trim();
      if (cleanParam.startsWith('DocId=') || cleanParam === '17Kjn7YSBjt6p3FaNTofmqtfjAl2DjekO') {
        return res.json({
          success: false,
          isTableNotFound: true,
          message: "ID Dokumen / Spreadsheet ('" + cleanParam + "') bukan Nama Tabel AppSheet. Di AppSheet API, Nama Tabel adalah nama tabel yang tertera di menu Data > Tables (atau lihat link 'View API documentation').",
          tableName: currentTableName,
        });
      }
      currentTableName = (cleanParam === 'MD to Dealer') ? 'MD to Dealer 2' : cleanParam;
    } else {
      currentTableName = 'MD to Dealer 2';
    }

    const rawRows = await callAppSheetApi('Find', [], currentTableName);
    const rowsArray = Array.isArray(rawRows) ? rawRows : [];

    const trucks = rowsArray.map((row: any) => {
      const nomorPolisi = String(row['Nomor Polisi'] || '').trim().toUpperCase();
      const rawId = String(row['ID'] || '').trim();
      const id = nomorPolisi || rawId || String(row['_RowNumber'] || '').trim();
      const transporter = normalizeTransporterCode(String(row['Transporter'] || ''));
      const rawDepo = String(row['Lokasi Audit'] || row['Depo'] || '').trim();
      const depo = rawDepo || 'Karawang';
      const fullSopir = String(row['Nama Sopir'] || '').trim();
      const namaSopir = formatDriverNameStandard(fullSopir, transporter, depo) || fullSopir;
      const cleanKap = String(row['Kapasitas'] || '28').replace(/\D/g, '') || '28';
      const rawStatus = String(row['Status Truk'] || row['Status'] || 'Aktif').trim();
      const status = (rawStatus.toLowerCase() === 'nonaktif' || rawStatus.toLowerCase() === 'non-aktif')
        ? 'Nonaktif'
        : 'Aktif';
      const rawKesiapan = String(row['Kesiapan'] || row['Status Kesiapan'] || '').trim().toLowerCase();
      const kesiapan = (rawKesiapan.includes('tidak') || rawKesiapan.includes('not') || rawKesiapan.includes('belum') || status === 'Nonaktif')
        ? 'Tidak Ready'
        : 'Ready';
      const keterangan = String(row['Keterangan'] || row['Catatan'] || row['Alasan'] || '').trim();
      const terakhirUpdate = String(row['Log'] || row['Tgl Pemeriksaan'] || '').trim();

      return {
        id,
        transporter,
        depo,
        nomorPolisi,
        namaSopir,
        kapasitas: cleanKap,
        status,
        kesiapan,
        keterangan,
        terakhirUpdate,
      };
    });

    res.json({ success: true, trucks, total: trucks.length, tableName: currentTableName });

    // Non-blocking background archive to daily snapshot database
    if (trucks.length > 0) {
      const todayStr = new Date().toLocaleDateString('en-CA');
      saveDailySnapshotInternal(todayStr, trucks).catch(() => {});
    }
  } catch (err: any) {
    const isApiDisabled = Boolean(err.message?.includes('The API is not enabled'));
    const isTableNotFound = Boolean(err.message?.includes('was not found'));

    res.json({
      success: false,
      message: err.message,
      status: err.status || 400,
      isApiDisabled,
      isTableNotFound,
      tableName: currentTableName,
    });
  }
});

// 3. Update single truck (Edit Action by Nomor Polisi Key)
app.post('/api/appsheet/update-truck', async (req: Request, res: Response) => {
  try {
    const { truck } = req.body;
    if (!truck || (!truck.id && !truck.nomorPolisi)) {
      return res.status(400).json({ success: false, message: 'Invalid truck payload' });
    }

    const formattedSopir = formatDriverNameStandard(truck.namaSopir, truck.transporter, truck.depo);

    const editRow: Record<string, any> = {
      'Nomor Polisi': truck.nomorPolisi,
      'Transporter': getAppSheetTransporterName(truck.transporter),
      'Lokasi Audit': truck.depo || 'Karawang',
      'Nama Sopir': formattedSopir || truck.namaSopir || '',
      'Kapasitas': truck.kapasitas,
      'Status Truk': truck.status || 'Aktif',
      'Kesiapan': truck.kesiapan || 'Ready',
      'Keterangan': truck.keterangan || '',
      'Log': truck.terakhirUpdate,
    };

    if (truck.id && !truck.id.startsWith('TRK-') && truck.id !== truck.nomorPolisi) {
      editRow['ID'] = truck.id;
    }

    const result = await callAppSheetApi('Edit', [editRow], 'MD to Dealer 2');

    if (formattedSopir) {
      syncDriverToDataTruk2(formattedSopir, truck.namaSopir, truck.transporter, truck.status || 'Aktif').catch(() => {});
    }

    const todayStr = new Date().toLocaleDateString('en-CA');
    saveDailySnapshotInternal(todayStr, [truck]).catch(() => {});

    res.json({ success: true, result, tableName: 'MD to Dealer 2' });
  } catch (err: any) {
    res.json({
      success: false,
      message: err.message,
      isApiDisabled: err.message?.includes('The API is not enabled'),
      isTableNotFound: err.message?.includes('was not found'),
      tableName: 'MD to Dealer 2',
    });
  }
});

// 4. Add new truck (Add Action by Nomor Polisi Key)
app.post('/api/appsheet/add-truck', async (req: Request, res: Response) => {
  try {
    const { truck } = req.body;
    if (!truck || !truck.nomorPolisi) {
      return res.status(400).json({ success: false, message: 'Invalid truck payload' });
    }

    const formattedSopir = formatDriverNameStandard(truck.namaSopir, truck.transporter, truck.depo);

    const newRow: Record<string, any> = {
      'Nomor Polisi': truck.nomorPolisi,
      'Transporter': getAppSheetTransporterName(truck.transporter),
      'Lokasi Audit': truck.depo || 'Karawang',
      'Nama Sopir': formattedSopir || truck.namaSopir || '',
      'Kapasitas': truck.kapasitas,
      'Status Truk': truck.status || 'Aktif',
      'Kesiapan': truck.kesiapan || 'Ready',
      'Keterangan': truck.keterangan || '',
      'Log': truck.terakhirUpdate,
    };

    if (truck.id && !truck.id.startsWith('TRK-') && truck.id !== truck.nomorPolisi) {
      newRow['ID'] = truck.id;
    }

    const result = await callAppSheetApi('Add', [newRow], 'MD to Dealer 2');

    if (formattedSopir) {
      syncDriverToDataTruk2(formattedSopir, truck.namaSopir, truck.transporter, truck.status || 'Aktif').catch(() => {});
    }

    const todayStr = new Date().toLocaleDateString('en-CA');
    saveDailySnapshotInternal(todayStr, [truck]).catch(() => {});

    res.json({ success: true, result, tableName: 'MD to Dealer 2' });
  } catch (err: any) {
    res.json({
      success: false,
      message: err.message,
      isApiDisabled: err.message?.includes('The API is not enabled'),
      isTableNotFound: err.message?.includes('was not found'),
      tableName: 'MD to Dealer 2',
    });
  }
});

// 5. Delete truck (Delete Action by Nomor Polisi Key)
app.post('/api/appsheet/delete-truck', async (req: Request, res: Response) => {
  try {
    const { truckId, nomorPolisi } = req.body;
    const targetKey = nomorPolisi || truckId;
    if (!targetKey) {
      return res.status(400).json({ success: false, message: 'Invalid truck identifier' });
    }

    const deleteRow: Record<string, any> = {
      'Nomor Polisi': targetKey,
    };
    if (truckId && !truckId.startsWith('TRK-') && truckId !== targetKey) {
      deleteRow['ID'] = truckId;
    }

    const result = await callAppSheetApi('Delete', [deleteRow], 'MD to Dealer 2');
    res.json({ success: true, result, tableName: 'MD to Dealer 2' });
  } catch (err: any) {
    res.json({
      success: false,
      message: err.message,
      isApiDisabled: err.message?.includes('The API is not enabled'),
      isTableNotFound: err.message?.includes('was not found'),
      tableName: 'MD to Dealer 2',
    });
  }
});

// 6. Confirm All / Bulk Update (Edit Action by Nomor Polisi Key)
app.post('/api/appsheet/confirm-all', async (req: Request, res: Response) => {
  try {
    const { trucks } = req.body;
    if (!Array.isArray(trucks) || trucks.length === 0) {
      return res.json({ success: true, message: 'No trucks to update' });
    }

    const rowsToEdit = trucks.map((t: any) => {
      const formattedSopir = formatDriverNameStandard(t.namaSopir, t.transporter, t.depo);
      const row: Record<string, any> = {
        'Nomor Polisi': t.nomorPolisi,
        'Transporter': getAppSheetTransporterName(t.transporter),
        'Lokasi Audit': t.depo || 'Karawang',
        'Nama Sopir': formattedSopir || t.namaSopir || '',
        'Kapasitas': t.kapasitas,
        'Status Truk': t.status || 'Aktif',
        'Kesiapan': t.kesiapan || 'Ready',
        'Keterangan': t.keterangan || '',
        'Log': t.terakhirUpdate,
      };
      if (t.id && !t.id.startsWith('TRK-') && t.id !== t.nomorPolisi) {
        row['ID'] = t.id;
      }
      return row;
    });

    const result = await callAppSheetApi('Edit', rowsToEdit, 'MD to Dealer 2');

    res.json({ success: true, result, count: rowsToEdit.length, tableName: 'MD to Dealer 2' });

    batchSyncDriversToDataTruk2(trucks).catch((err) => {
      console.warn('Background batch sync Data Truk 2 notice:', err.message);
    });

    const todayStr = new Date().toLocaleDateString('en-CA');
    saveDailySnapshotInternal(todayStr, trucks);
  } catch (err: any) {
    res.json({
      success: false,
      message: err.message,
      isApiDisabled: err.message?.includes('The API is not enabled'),
      isTableNotFound: err.message?.includes('was not found'),
      tableName: 'MD to Dealer 2',
    });
  }
});

// 7. Full Reconciliation / Batch Sync Drivers to "Data Truk 2"
app.post('/api/appsheet/sync-master-drivers', async (_req: Request, res: Response) => {
  try {
    const rawMD = await callAppSheetApi('Find', [], 'MD to Dealer 2');
    const rawTruk = await callAppSheetApi('Find', [], 'Data Truk 2');

    if (!Array.isArray(rawMD) || !Array.isArray(rawTruk)) {
      return res.json({ success: false, message: 'Gagal mengambil data dari AppSheet' });
    }

    const updates: Array<{ ID: string; 'Nama Driver': string; Status?: string; Rute?: string }> = [];
    const report: Array<{ id: string; oldName: string; newName: string; status?: string }> = [];
    const seenIds = new Set<string>();

    for (const mdRow of rawMD) {
      const rawSopir = String(mdRow['Nama Sopir'] || '').trim();
      if (!rawSopir) continue;
      const trans = String(mdRow['Transporter'] || '');
      const depo = String(mdRow['Lokasi Audit'] || mdRow['Depo'] || '');
      const targetName = formatDriverNameStandard(rawSopir, trans, depo);
      const core = cleanDriverNameKeepFull(rawSopir);
      if (!core || !targetName) continue;

      const transCode = normalizeTransporterCode(trans).toLowerCase();

      const matched = rawTruk.find((t: any) => {
        const route = String(t['Rute'] || '').trim().toUpperCase();
        if (route !== 'MD-D') return false;

        const existingName = String(t['Nama Driver'] || '');
        const tCore = cleanDriverNameKeepFull(existingName);
        if (tCore === core) {
          const lower = existingName.toLowerCase();
          if (transCode && (lower.includes(transCode) || lower.includes('wss') || lower.includes('tm') || lower.includes('rjtm') || lower.includes('sbr'))) {
            return lower.includes(transCode);
          }
          return true;
        }
        return false;
      });

      if (matched && matched.ID && !seenIds.has(matched.ID)) {
        seenIds.add(matched.ID);
        const currentName = String(matched['Nama Driver'] || '').trim();
        const currentStatus = String(matched['Status'] || '').trim();
        const targetStatus = String(mdRow['Status Truk'] || 'Aktif').trim();

        const needsNameUpdate = currentName !== targetName;
        const needsStatusUpdate = currentStatus !== targetStatus;
        const needsRouteUpdate = String(matched['Rute'] || '') !== 'MD-D';

        if (needsNameUpdate || needsStatusUpdate || needsRouteUpdate) {
          updates.push({
            ID: matched.ID,
            'Nama Driver': targetName,
            'Status': targetStatus,
            'Rute': 'MD-D',
          });
          report.push({
            id: matched.ID,
            oldName: currentName,
            newName: targetName,
            status: targetStatus,
          });
        }
      }
    }

    if (updates.length === 0) {
      return res.json({
        success: true,
        message: 'Semua nama sopir di Data Truk 2 sudah selaras dan terstandarisasi.',
        count: 0,
        updated: [],
      });
    }

    const BATCH_SIZE = 25;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const chunk = updates.slice(i, i + BATCH_SIZE);
      await callAppSheetApi('Edit', chunk, 'Data Truk 2');
    }

    res.json({
      success: true,
      message: `Berhasil menstandarisasi ${updates.length} data sopir di tabel Data Truk 2.`,
      count: updates.length,
      updated: report,
    });
  } catch (err: any) {
    res.json({
      success: false,
      message: err.message,
    });
  }
});

// 8. Snapshot Database Management (Daily Archiving & Downloads)
export async function saveDailySnapshotInternal(dateStr: string, trucks: any[]) {
  try {
    const filePath = path.join(SNAPSHOTS_DIR, `${dateStr}.json`);
    
    // Filter out dummy/mock trucks (e.g. TRK-*)
    const incomingClean = (Array.isArray(trucks) ? trucks : []).filter((t: any) => {
      if (!t || !t.nomorPolisi) return false;
      const idStr = String(t.id || '');
      if (idStr.startsWith('TRK-')) return false;
      return true;
    });

    let mergedList: any[] = [];

    // If incoming clean trucks is a complete fleet (>= 100 units), use it as authoritative
    if (incomingClean.length >= 100) {
      mergedList = incomingClean;
    } else {
      let existingTrucks: any[] = [];
      try {
        if (fs.existsSync(filePath)) {
          const prev = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (Array.isArray(prev.trucks)) {
            existingTrucks = prev.trucks.filter((t: any) => {
              const idStr = String(t.id || '');
              return !idStr.startsWith('TRK-') && Boolean(t.nomorPolisi);
            });
          }
        }
      } catch {}

      // If local file wasn't found or empty, try reading existing trucks from Cloud Firestore
      if (existingTrucks.length === 0 && firestoreDb) {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const ref = doc(firestoreDb, 'daily_snapshots', dateStr);
          const snap = await getDoc(ref);
          if (snap.exists() && Array.isArray(snap.data()?.trucks)) {
            existingTrucks = snap.data().trucks.filter((t: any) => {
              const idStr = String(t.id || '');
              return !idStr.startsWith('TRK-') && Boolean(t.nomorPolisi);
            });
          }
        } catch {}
      }

      const mergedMap = new Map<string, any>();
      existingTrucks.forEach((t) => mergedMap.set(t.nomorPolisi || t.id, t));
      incomingClean.forEach((t) => mergedMap.set(t.nomorPolisi || t.id, t));
      mergedList = Array.from(mergedMap.values());
    }

    const summary = {
      total: mergedList.length,
      ready: mergedList.filter((t) => t.kesiapan === 'Ready').length,
      tidakReady: mergedList.filter((t) => t.kesiapan === 'Tidak Ready').length,
      aktif: mergedList.filter((t) => t.status === 'Aktif').length,
      nonaktif: mergedList.filter((t) => t.status === 'Nonaktif').length,
    };

    const data = {
      date: dateStr,
      savedAt: new Date().toISOString(),
      summary,
      trucks: mergedList,
    };

    // Save to local server database storage (safe non-blocking in serverless)
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {}

    // Dual-archive to Cloud Firestore (Primary for Serverless/Vercel)
    if (firestoreDb) {
      try {
        const { doc, setDoc } = await import('firebase/firestore');
        const ref = doc(firestoreDb, 'daily_snapshots', dateStr);
        await setDoc(ref, {
          date: dateStr,
          savedAt: data.savedAt,
          summary,
          trucks: mergedList,
        }, { merge: true });
      } catch (fErr: any) {
        console.warn('Firestore snapshot background sync note:', fErr.message);
      }
    }
  } catch (err: any) {
    console.warn('Snapshot internal note:', err.message);
  }
}

// Endpoint to reset all truck readiness to clean state
app.post('/api/admin/reset-readiness-clean', async (_req: Request, res: Response) => {
  try {
    const rawRows = await callAppSheetApi('Find', [], currentTableName);
    const rowsArray = Array.isArray(rawRows) ? rawRows : [];

    const cleanTrucks = rowsArray.map((row: any) => {
      const nomorPolisi = String(row['Nomor Polisi'] || '').trim().toUpperCase();
      const rawId = String(row['ID'] || '').trim();
      const id = nomorPolisi || rawId || String(row['_RowNumber'] || '').trim();
      const transporter = normalizeTransporterCode(String(row['Transporter'] || ''));
      const rawDepo = String(row['Lokasi Audit'] || row['Depo'] || '').trim();
      const depo = rawDepo || 'Karawang';
      const fullSopir = String(row['Nama Sopir'] || '').trim();
      const namaSopir = formatDriverNameStandard(fullSopir, transporter, depo) || fullSopir;
      const cleanKap = String(row['Kapasitas'] || '28').replace(/\D/g, '') || '28';
      const rawStatus = String(row['Status Truk'] || row['Status'] || 'Aktif').trim();
      const status = (rawStatus.toLowerCase() === 'nonaktif' || rawStatus.toLowerCase() === 'non-aktif')
        ? 'Nonaktif'
        : 'Aktif';
      const isNonaktif = status === 'Nonaktif';
      const kesiapan = isNonaktif ? 'Tidak Ready' : 'Ready';

      return {
        id,
        transporter,
        depo,
        nomorPolisi,
        namaSopir,
        kapasitas: cleanKap,
        status,
        kesiapan,
        keterangan: '',
        terakhirUpdate: 'Belum update hari ini',
      };
    }).filter((t: any) => !t.id?.startsWith('TRK-') && Boolean(t.nomorPolisi));

    const todayStr = new Date().toLocaleDateString('en-CA');
    const summary = {
      total: cleanTrucks.length,
      ready: cleanTrucks.filter((t: any) => t.kesiapan === 'Ready').length,
      tidakReady: cleanTrucks.filter((t: any) => t.kesiapan === 'Tidak Ready').length,
      aktif: cleanTrucks.filter((t: any) => t.status === 'Aktif').length,
      nonaktif: cleanTrucks.filter((t: any) => t.status === 'Nonaktif').length,
    };

    const snapshotData = {
      date: todayStr,
      savedAt: new Date().toISOString(),
      summary,
      trucks: cleanTrucks,
    };

    try {
      const filePath = path.join(SNAPSHOTS_DIR, `${todayStr}.json`);
      fs.writeFileSync(filePath, JSON.stringify(snapshotData, null, 2), 'utf-8');
    } catch {}

    if (firestoreDb) {
      try {
        const { doc, setDoc } = await import('firebase/firestore');
        const ref = doc(firestoreDb, 'daily_snapshots', todayStr);
        await setDoc(ref, snapshotData);
      } catch (fErr: any) {
        console.warn('Firestore reset sync note:', fErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Semua riwayat update kesiapan armada hari ini telah berhasil dibersihkan.',
      trucks: cleanTrucks,
      total: cleanTrucks.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint to completely wipe all historical snapshots
app.post('/api/admin/wipe-all-snapshots', async (_req: Request, res: Response) => {
  try {
    try {
      if (fs.existsSync(SNAPSHOTS_DIR)) {
        const files = fs.readdirSync(SNAPSHOTS_DIR);
        for (const f of files) {
          try {
            fs.unlinkSync(path.join(SNAPSHOTS_DIR, f));
          } catch {}
        }
      }
    } catch {}

    if (firestoreDb) {
      try {
        const { collection, getDocs, deleteDoc, doc } = await import('firebase/firestore');
        const snap = await getDocs(collection(firestoreDb, 'daily_snapshots'));
        for (const d of snap.docs) {
          await deleteDoc(doc(firestoreDb, 'daily_snapshots', d.id));
        }
      } catch (fErr: any) {
        console.warn('Firestore wipe note:', fErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Seluruh arsip database tanggal-tanggal sebelumnya telah berhasil dihapus total dari database server dan Cloud Firestore.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Save or update snapshot in database
app.post('/api/snapshots', async (req: Request, res: Response) => {
  try {
    const { date, trucks } = req.body;
    if (!date || !Array.isArray(trucks)) {
      return res.status(400).json({ success: false, message: 'Invalid snapshot payload' });
    }
    await saveDailySnapshotInternal(date, trucks);
    res.json({ success: true, message: `Snapshot ${date} berhasil disimpan di database`, date });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get all available snapshot dates
app.get('/api/snapshots', async (_req: Request, res: Response) => {
  try {
    const snapshots: Record<string, any> = {};
    const datesSet = new Set<string>();

    try {
      const files = fs.existsSync(SNAPSHOTS_DIR) ? fs.readdirSync(SNAPSHOTS_DIR).filter((f) => f.endsWith('.json')) : [];
      files.forEach((f) => {
        const date = f.replace('.json', '');
        datesSet.add(date);
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, f), 'utf-8'));
          snapshots[date] = {
            date,
            savedAt: raw.savedAt,
            summary: raw.summary,
            count: raw.trucks?.length || 0,
          };
        } catch {}
      });
    } catch {}

    // Check Cloud Firestore for all snapshot dates
    if (firestoreDb) {
      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const querySnap = await getDocs(collection(firestoreDb, 'daily_snapshots'));
        querySnap.forEach((docSnap) => {
          const d = docSnap.id;
          if (!snapshots[d]) {
            const data = docSnap.data();
            datesSet.add(d);
            snapshots[d] = {
              date: d,
              savedAt: data.savedAt,
              summary: data.summary,
              count: data.trucks?.length || 0,
            };
          }
        });
      } catch {}
    }

    const dates = Array.from(datesSet)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .reverse();
    res.json({ success: true, dates, snapshots });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get snapshots for a date range (Multi-date batch fetch)
app.get('/api/snapshots/range', async (req: Request, res: Response) => {
  try {
    const start = String(req.query.start || '').trim();
    const end = String(req.query.end || '').trim();
    if (!start || !end) {
      return res.status(400).json({ success: false, message: 'Parameter start dan end wajib diisi (YYYY-MM-DD)' });
    }

    const snapshots: Record<string, any> = {};
    const datesSet = new Set<string>();

    try {
      const files = fs.existsSync(SNAPSHOTS_DIR) ? fs.readdirSync(SNAPSHOTS_DIR).filter((f) => f.endsWith('.json')) : [];
      files.forEach((f) => {
        const d = f.replace('.json', '');
        if (d >= start && d <= end) {
          datesSet.add(d);
          try {
            snapshots[d] = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, f), 'utf-8'));
          } catch {}
        }
      });
    } catch {}

    if (firestoreDb) {
      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const querySnap = await getDocs(collection(firestoreDb, 'daily_snapshots'));
        querySnap.forEach((docSnap) => {
          const d = docSnap.id;
          if (d >= start && d <= end && !snapshots[d]) {
            datesSet.add(d);
            snapshots[d] = docSnap.data();
          }
        });
      } catch (fErr: any) {
        console.warn('Firestore range query notice:', fErr.message);
      }
    }

    const dates = Array.from(datesSet).sort();
    res.json({ success: true, dates, snapshots });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get snapshot details for a specific date
app.get('/api/snapshots/:date', async (req: Request, res: Response) => {
  try {
    const { date } = req.params;

    try {
      const filePath = path.join(SNAPSHOTS_DIR, `${date}.json`);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return res.json({ success: true, ...data });
      }
    } catch {}

    if (firestoreDb) {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const docSnap = await getDoc(doc(firestoreDb, 'daily_snapshots', date));
        if (docSnap.exists()) {
          const data = docSnap.data();
          return res.json({ success: true, ...data });
        }
      } catch {}
    }

    res.json({ success: false, message: `Snapshot untuk tanggal ${date} belum tersedia di database` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Download snapshot CSV for a specific date
app.get('/api/snapshots/download/:date', async (req: Request, res: Response) => {
  try {
    const { date } = req.params;
    let snapshot: any = null;

    try {
      const filePath = path.join(SNAPSHOTS_DIR, `${date}.json`);
      if (fs.existsSync(filePath)) {
        snapshot = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch {}

    if (!snapshot && firestoreDb) {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const docSnap = await getDoc(doc(firestoreDb, 'daily_snapshots', date));
        if (docSnap.exists()) {
          snapshot = docSnap.data();
        }
      } catch {}
    }

    if (!snapshot) {
      return res.status(404).send('Snapshot tidak ditemukan di database');
    }

    const trucks = snapshot.trucks || [];

    const headers = [
      'No',
      'Tanggal Laporan',
      'Transporter',
      'Depo (Lokasi Audit)',
      'Nomor Polisi',
      'Nama Sopir',
      'Kapasitas (Unit)',
      'Status Operasional',
      'Kesiapan Armada',
      'Keterangan Kendala',
      'Terakhir Update',
    ];

    const rows = trucks.map((t: any, idx: number) => [
      idx + 1,
      date,
      t.transporter || '',
      t.depo || 'Karawang',
      t.nomorPolisi || '',
      `"${(t.namaSopir || '-').replace(/"/g, '""')}"`,
      t.kapasitas || '28',
      t.status || 'Aktif',
      t.kesiapan || 'Ready',
      `"${(t.keterangan || '').replace(/"/g, '""')}"`,
      `"${(t.terakhirUpdate || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Rekap_Armada_SIAPIN_${date}.csv"`);
    res.send(csvContent);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

// Global fallback error handler to guarantee JSON response on serverless
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    message: err?.message || 'Terjadi kesalahan internal pada server.',
  });
});

export default app;
