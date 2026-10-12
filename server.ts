import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { app, saveDailySnapshotInternal, normalizeTransporterCode, callAppSheetApi } from './src/server/app';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const SNAPSHOTS_DIR = path.join(process.cwd(), 'data', 'snapshots');

// Automated Daily Snapshot Scheduler (Memastikan snapshot harian selalu tersimpan otomatis di database saat server Node aktif)
setInterval(async () => {
  try {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const filePath = path.join(SNAPSHOTS_DIR, `${todayStr}.json`);
    if (!fs.existsSync(filePath)) {
      const currentTableName = (process.env.APPSHEET_TABLE && !process.env.APPSHEET_TABLE.startsWith('DocId=') && process.env.APPSHEET_TABLE !== 'MD to Dealer')
        ? process.env.APPSHEET_TABLE
        : 'MD to Dealer 2';
      const raw = await callAppSheetApi('Find', [], currentTableName);
      if (Array.isArray(raw) && raw.length > 0) {
        const autoTrucks = raw.map((r: any) => ({
          id: r['ID'] || r['Nomor Polisi'],
          nomorPolisi: r['Nomor Polisi'] || '',
          transporter: normalizeTransporterCode(r['Transporter'] || ''),
          depo: r['Lokasi Audit'] || r['Depo'] || 'Karawang',
          namaSopir: r['Nama Sopir'] || '',
          kapasitas: String(r['Kapasitas'] || '28'),
          status: r['Status Truk'] || r['Status'] || 'Aktif',
          kesiapan: r['Kesiapan'] || 'Ready',
          keterangan: r['Keterangan'] || '',
          terakhirUpdate: r['Log'] || '',
        }));
        await saveDailySnapshotInternal(todayStr, autoTrucks);
        console.log(`[Auto-Snapshot] Berhasil mengarsipkan otomatis ${autoTrucks.length} unit armada untuk tanggal ${todayStr}`);
      }
    }
  } catch (err: any) {
    // Silent non-blocking fail-safe
  }
}, 15 * 60 * 1000); // Cek berkala setiap 15 menit

// Vite & Static file serving setup for AI Studio & Node.js host
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const portNumber = Number(PORT) || 3000;
  app.listen(portNumber, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${portNumber}`);
  });
}

startServer();
