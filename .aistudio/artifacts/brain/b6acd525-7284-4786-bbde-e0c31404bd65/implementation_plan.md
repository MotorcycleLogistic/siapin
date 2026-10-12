# Rencana Migrasi & Deployment Aplikasi SIAPIN ke Vercel

Rencana perbaikan dan panduan arsitektur komprehensif untuk mendistribusikan aplikasi **SIAPIN (Sistem Kesiapan Transporter)** ke platform **Vercel** tanpa mengurangi maupun mengubah satupun fitur, fungsi, atau antarmuka yang ada saat ini.

---

## 1. Kesimpulan Kelayakan (Feasibility Verdict)

> [!IMPORTANT]
> **APAKAH APLIKASI BISA DI-DEPLOY KE VERCEL TANPA MENGUBAH FITUR DAN FUNGSI?**
> **JAWABAN: BISA 100%.**
>
> Seluruh fitur yang ada saat ini tetap berfungsi normal:
> 1. ✅ **PWA (Progressive Web App)**: Installable di perangkat Android/iOS/Desktop dengan Service Worker & cache offline.
> 2. ✅ **Autentikasi Akun Google Resmi**: Pemilihan akun Google dan penguncian 1 Akun ke 1 Transporter & 1 Depo.
> 3. ✅ **Integrasi AppSheet MD to Dealer 2**: Sinkronisasi data armada, jadwal, dan status inspeksi via REST API.
> 4. ✅ **Daily Snapshots & Laporan**: Arsip harian dan rekap kesiapan armada.
> 5. ✅ **Admin Control Panel**: Manajemen transporter, pembatalan tautan akun, dan inspeksi lapangan.

---

## 2. Perbedaan Lingkungan Runtime (Cloud Run vs Vercel Serverless)

Aplikasi saat ini berjalan di container Node.js stateful (port 3000). Saat dipindahkan ke Vercel, arsitektur berubah menjadi **Serverless & Static Edge**:

```
[Arsitektur Saat Ini - Stateful Node.js]
Klien Browser ──► Express Server (server.ts) ──► File Lokal (data/snapshots/) + Firestore
                                            ──► AppSheet API

[Arsitektur Vercel - Serverless & Edge CDN]
Klien Browser ──► Vercel Edge CDN (dist/ - Vite SPA & PWA)
              ──► /api/* ──► Vercel Serverless Function (api/index.ts) ──► Cloud Firestore (Cloud)
                                                                     ──► AppSheet API
```

| Aspek | Lingkungan Saat Ini | Lingkungan Vercel | Tindakan Penyesuaian |
| :--- | :--- | :--- | :--- |
| **Frontend** | Dilayani oleh Express `dist/` | Static Asset di Edge CDN Vercel | Konfigurasi rewrite SPA di `vercel.json` |
| **Backend API** | Server Express terus aktif (`app.listen`) | Serverless Function (`api/index.ts`) | Pisahkan logika rute Express dari `app.listen` agar dapat diekspor ke Vercel |
| **Penyimpanan Data** | File lokal `./data/` & Cloud Firestore | Read-only filesystem / Ephemeral | Alihkan 100% penyimpanan harian & binding ke Cloud Firestore |
| **File Konfigurasi** | `firebase-applet-config.json` lokal | Environment Variables di Vercel Dashboard | Dukung pembacaan config dari `process.env.FIREBASE_CONFIG` |
| **Google Auth Domain** | Domain AI Studio dev/pre | Domain Vercel (`*.vercel.app`) | Tambahkan domain Vercel ke Authorized Domains di Firebase |

---

## 3. Komponen yang Perlu Diperbaiki & Disesuaikan

### A. Modularisasi Express Server (`server.ts` & `api/index.ts`)
* **Masalah**: `server.ts` saat ini memanggil `app.listen(PORT)` secara langsung. Di Vercel, fungsi backend dipanggil sebagai Serverless Handler tanpa `app.listen`.
* **Solusi Perbaikan**:
  1. Pisahkan deklarasi Express app, middleware, rute API, dan integrasi Firestore ke modul tersendiri (misal: `src/server/app.ts` atau fungsi `createServerApp()`).
  2. File `server.ts` tetap dipertahankan untuk lingkungan pengembangan lokal dan AI Studio (`app.listen(3000)`).
  3. Buat file `api/index.ts` yang mengimpor Express app tersebut dan mengekspornya sebagai default handler untuk Vercel:
     ```typescript
     import app from '../src/server/app';
     export default app;
     ```

### B. Migrasi Persistensi Penuh ke Cloud Firestore (Anti-Crash Serverless)
* **Masalah**: Pada `server.ts`, terdapat kode `fs.mkdirSync(SNAPSHOTS_DIR)` dan `fs.writeFileSync` ke folder `data/snapshots/` dan `data/bindings/`. Pada Vercel Serverless, filesystem bersifat read-only (`EROFS`) atau dihapus otomatis setiap kali lambda instance berakhir.
* **Solusi Perbaikan**:
  1. Alihkan persistensi `Daily Snapshots` dan `Transporter Bindings` untuk selalu membaca dan menulis ke **Cloud Firestore** sebagai sumber utama (*primary storage*).
  2. Bungkus operasi filesystem lokal dengan blok `try-catch` yang aman agar tidak terjadi error fatal (*unhandled exception*) saat berjalan di serverless.

### C. Pembuatan Konfigurasi `vercel.json`
* **Solusi Perbaikan**: Buat file `vercel.json` di root proyek untuk mengatur routing API, SPA fallback, serta header keamanan dan PWA:
  ```json
  {
    "version": 2,
    "framework": "vite",
    "rewrites": [
      {
        "source": "/api/(.*)",
        "destination": "/api/index.ts"
      },
      {
        "source": "/((?!api/|sw.js|manifest.webmanifest|icons/).*)",
        "destination": "/index.html"
      }
    ]
  }
  ```

### D. Standarisasi Pengambilan Kredensial via Environment Variables
* **Masalah**: `firebase-applet-config.json` adalah file lokal yang tidak boleh sembarangan di-push ke repositori publik jika menggunakan GitHub publik.
* **Solusi Perbaikan**:
  1. Perbarui loader Firebase di backend agar memprioritaskan `process.env.FIREBASE_CONFIG` (dalam format JSON string) atau variabel individual:
     - `FIREBASE_PROJECT_ID`
     - `FIREBASE_DATABASE_ID`
     - `FIREBASE_API_KEY`
     - `FIREBASE_AUTH_DOMAIN`
  2. Tetap sediakan pembacaan file `firebase-applet-config.json` sebagai fallback jika file tersedia di disk.
  3. Pastikan `APPSHEET_APP_ID`, `APPSHEET_ACCESS_KEY`, dan `APPSHEET_TABLE` terbaca langsung dari `process.env`.

### E. Otorisasi Domain di Firebase Authentication Console
* **Masalah**: Google Sign-In akan menolak login (`auth/unauthorized-domain`) jika domain aplikasi belum didaftarkan di Firebase Console.
* **Solusi**:
  1. Saat aplikasi sudah dideploy ke Vercel dan mendapatkan domain (contoh: `siapin-transporter.vercel.app`), pengguna cukup membuka **Firebase Console** -> **Authentication** -> **Settings** -> **Authorized Domains**.
  2. Tambahkan domain Vercel tersebut ke daftar domain yang diizinkan.

---

## 4. Panduan Langkah Deployment ke Vercel (Step-by-Step)

```
┌─────────────────────────┐
│ 1. Git Push ke GitHub   │
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│ 2. Import di Vercel     │ ──► Framework Preset: Vite
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│ 3. Isi Environment Vars │ ──► FIREBASE_CONFIG, APPSHEET_APP_ID, APPSHEET_ACCESS_KEY
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│ 4. Deploy & Verifikasi  │ ──► Tambahkan domain *.vercel.app ke Firebase Auth Console
└─────────────────────────┘
```

### Daftar Variabel Lingkungan di Vercel Dashboard:
| Nama Variabel | Keterangan | Nilai Contoh |
| :--- | :--- | :--- |
| `FIREBASE_CONFIG` | Konfigurasi JSON Firebase | `{"projectId":"...","firestoreDatabaseId":"..."}` |
| `APPSHEET_APP_ID` | ID Aplikasi AppSheet | `8b71fdfd-7dcb-4c5f-944f-8491406b0c5a` |
| `APPSHEET_ACCESS_KEY`| Access Key REST API AppSheet | `V2-X58uw-q1bpM-xtN9s-cz1XH-...` |
| `APPSHEET_TABLE` | Nama Tabel AppSheet | `MD to Dealer 2` |

---

## 5. Rencana Eksekusi Kode di Proyek

Setelah rencana ini disetujui, langkah teknis yang akan langsung diimplementasikan adalah:
1. **Membuat `src/server/app.ts`**: Mengekstrak aplikasi Express dari `server.ts` agar bersih dan dapat digunakan ganda (dual-target: lokal & serverless).
2. **Membuat `api/index.ts`**: Menjadi serverless entry point resmi Vercel.
3. **Memperbarui `server.ts`**: Mengimpor `app` dari `src/server/app.ts` untuk server lokal di AI Studio.
4. **Membuat `vercel.json`**: Menentukan routing API dan SPA rewrites.
5. **Menambahkan file `.env.example`**: Dokumentasi lengkap variabel lingkungan untuk kemudahan copy-paste ke Vercel Dashboard.
6. **Validasi Kompilasi & Build**: Memastikan `npm run build` dan TypeScript linter lulus 100% tanpa error.
