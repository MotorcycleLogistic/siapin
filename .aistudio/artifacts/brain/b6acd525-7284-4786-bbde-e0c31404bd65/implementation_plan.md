# Rencana Perbaikan Error 403 Google Verification & Akses Akun Bebas Blokir

Rencana teknis untuk mengatasi kendala `Error 403: access_denied` (*Access blocked: gen-lang-client-0286495500.firebaseapp.com has not completed the Google verification process*) pada saat menekan tombol Hubungkan Google, serta penyediaan opsi cadangan darurat (*fallback*) jika popup Google di perangkat tertentu mengalami kendala.

## User Review & Critical Decisions

> [!IMPORTANT]
> Keputusan perbaikan berikut telah dikonfirmasi melalui klarifikasi kebutuhan pengguna:

- **Pembersihan Izin Sensitif (OAuth Scopes)**: Menghapus izin sensitif `spreadsheets` dan `drive.file` dari `GoogleAuthProvider` untuk alur autentikasi transporter. Autentikasi Google hanya akan meminta identitas dasar (`email`, `profile`, `openid`). Hal ini membuat Google Sign-In **100% bebas dari kewajiban verifikasi Google Trust & Safety**, sehingga dapat digunakan langsung oleh **seluruh akun Google di perangkat mana pun tanpa diblokir Error 403**.
- **Opsi Darurat Input Email Manual**: Menyediakan tombol alternatif jika popup Google diblokir oleh browser bawaan HP (*in-app browser* WhatsApp/Telegram) atau terkendala jaringan, di mana pengguna dapat memasukkan email Google mereka secara langsung dan tetap divalidasi dengan aturan penguncian Cloud Firestore.
- **Konsistensi Penguncian Transporter & Depo**: Aturan penguncian terpusat di Cloud Firestore (`transporter_bindings`) tetap berjalan ketat; satu akun Google hanya berlaku untuk satu Transporter dan satu Depo resmi.

---

## 1. Overview & Root Cause Analysis

### Akar Masalah (Root Cause)
Pesan error:
```
Access blocked: gen-lang-client-0286495500.firebaseapp.com has not completed the Google verification process.
The app is currently being tested, and can only be accessed by developer-approved testers.
Error 403: access_denied
```
terjadi karena di file `src/services/googleAuth.ts` terdapat konfigurasi izin:
```typescript
export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];
SCOPES.forEach((scope) => provider.addScope(scope));
```
Google mengklasifikasikan `spreadsheets` dan `drive.file` sebagai **Sensitive/Restricted Scopes**. Setiap aplikasi web yang meminta izin ini wajib melalui proses verifikasi resmi Google atau dibatasi hanya untuk akun yang terdaftar manual di *Google Cloud Console Test Users*.

Padahal, untuk alur pendaftaran dan login Transporter di SIAPIN, aplikasi hanya membutuhkan verifikasi identitas email Google (`email` & `profile`). Sinkronisasi spreadsheet utama aplikasi SIAPIN dikelola melalui AppSheet REST API di sisi server yang tidak memerlukan token akses OAuth dari browser klien.

### Solusi
1. Pisahkan provider login umum dari provider spreadsheet sensitif. Provider login utama hanya meminta scope standar: `email`, `profile`, `openid`.
2. Hapus `provider.addScope` untuk scope drive/sheets pada alur Sign-In Transporter.
3. Tambahkan penanganan error khusus: jika browser memblokir popup (`auth/popup-blocked`), berikan opsi alternatif input email secara bersih.

---

## 2. User Experience & Visual Design

### Alur Antarmuka Pengguna (User Flow)

```
[Layar Sign Up Transporter: Step 1]
┌──────────────────────────────────────────────┐
│  • Indikator Step (1 dari 2)                 │
│  • [ G  Hubungkan Google ]                   │
│    (Meminta izin Profil & Email Dasar Saja)  │
│                                              │
│  • "Kendala popup? Masukkan email manual"    │
│  • "← Kembali ke Halaman Login"              │
└──────────────────────┬───────────────────────┘
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
[Popup Google Resmi]            [Input Email Manual (Fallback)]
• Langsung Terbuka              • Tampil kolom input email
• Tanpa Layar Error 403         • Klik "Lanjutkan"
• Pilih Akun di HP              • Verifikasi ke Firestore
       │                               │
       └───────────────┬───────────────┘
                       ▼
┌──────────────────────────────────────────────┐
│ Validasi Pengikatan di Cloud Firestore       │
│ • Jika Terdaftar di Vendor Lain: TOLAK       │
│ • Jika Akun Baru: Lanjut ke Step 2 (Pilih)   │
└──────────────────────────────────────────────┘
```

### Penyesuaian Komponen UI
1. **Tombol "Hubungkan Google"**:
   - Menghubungkan akun secara instan tanpa layar peringatan "App not verified".
2. **Tautan Opsi Darurat (Emergency Fallback)**:
   - Terletak rapi di bawah tombol Google: teks kecil bersih `Kendala popup? Masukkan email manual`.
   - Mengubah tampilan menjadi form input email sederhana tanpa merusak estetika clean yang diinginkan pengguna.
3. **Pesan Penolakan Bersih**:
   - Jika email yang dimasukkan (baik via Google popup maupun manual) sudah terikat pada Transporter atau Depo lain, modal penolakan merah tetap memblokir proses secara ketat.

---

## 3. Key Product Decisions & Trade-Offs

| Skenario | Keputusan Sistem | Alasan & Manfaat |
| :--- | :--- | :--- |
| **Izin OAuth** | Hanya minta scope standar (`email`, `profile`) | Membebaskan aplikasi dari Error 403 Google Verification selamanya |
| **Penyimpanan Database** | Tetap menggunakan Cloud Firestore `transporter_bindings` | Keamanan dan validasi penguncian akun tetap 100% terpusat dan andal |
| **Fallback Manual** | Disediakan jika popup diblokir oleh browser HP | Menghindari kegagalan registrasi pada peramban mobile (seperti in-app browser) |
| **Google Sheets Service** | Scope sheets dipisahkan ke fungsi khusus admin | Tidak membebani pengguna transporter lapangan dengan izin berbahaya |

---

## 4. Technical Architecture & Implementation Steps

### Step 1: Modifikasi `src/services/googleAuth.ts`
- Hapus penambahan scope `https://www.googleapis.com/auth/spreadsheets` dan `https://www.googleapis.com/auth/drive.file` pada provider utama.
- Konfigurasikan `GoogleAuthProvider` murni dengan parameter `prompt: 'select_account'` untuk menampilkan seluruh akun di HP tanpa trigger verifikasi privasi Google.
- Sediakan provider terpisah jika fitur ekspor admin Google Sheets spesifik membutuhkan izin tambahan di kemudian hari.

### Step 2: Pembaruan `src/components/LoginScreen.tsx`
- Tambahkan penanganan kondisi error `auth/popup-blocked` atau `auth/cancelled-popup-request`.
- Sediakan toggle opsi darurat: `showManualEmailInput` jika pengguna mengalami kendala teknis pada browser HP.
- Pastikan email manual yang dimasukkan tetap melalui validasi Firestore yang sama persis (`checkTransporterBinding` dan `getTransporterBinding`).

### Step 3: Verifikasi Kompilasi & Pengujian
- Jalankan `npm run lint` dan `npm run build` untuk memastikan tidak ada kesalahan tipe.
- Uji alur klik "Hubungkan Google": pastikan popup langsung menampilkan daftar akun tanpa pesan "Access blocked: gen-lang-client...".

---

## 5. Security & Boundary Hardening

1. **Email Format Validation**: Sanitasi ketat untuk email yang diinput manual (wajib format email valid dan diubah ke huruf kecil).
2. **Firestore Locking Persistence**: Email manual tidak dapat melewati penguncian Firestore; jika sudah terikat ke transporter/depo lain, sistem tetap melempar penolakan 403.
3. **No Sensitive Tokens in LocalStorage**: Hanya data identitas profil yang disimpan secara lokal.

---

## 6. Acceptance Criteria & Test Plan

1. **Uji Bebas Error 403**:
   - Klik "Hubungkan Google" di perangkat HP maupun browser desktop.
   - Popup Google terbuka langsung dengan daftar akun Google tanpa menampilkan pesan "Access blocked / Error 403: access_denied".
2. **Uji Pemilihan Akun**:
   - Memilih salah satu akun Google berhasil mengekstrak email dan mengarahkan ke Step 2 (Pilih Transporter & Depo).
3. **Uji Penguncian Akun**:
   - Akun yang sudah didaftarkan pada satu Transporter & Depo tetap ditolak jika dicoba didaftarkan kembali ke vendor/depo lain.
4. **Uji Opsi Darurat Manual**:
   - Jika toggle manual email dipilih, pengguna dapat menginput email dan melanjutkan proses registrasi dengan validasi Firestore yang sama.
