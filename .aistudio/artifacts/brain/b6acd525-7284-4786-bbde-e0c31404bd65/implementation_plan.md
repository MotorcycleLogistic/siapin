# Integrasi Pemilihan Akun Google Resmi & Penguncian Transporter-Depo di Cloud Firestore

Rencana perbaikan autentikasi Google untuk menampilkan daftar seluruh akun Google di HP/perangkat pengguna via Google Account Picker resmi, serta pengikatan (*locking*) akun ke satu Transporter & Depo secara terpusat di Cloud Firestore dengan penolakan ketat (*strict rejection*) jika digunakan untuk transporter atau depo lain.

## User Review & Critical Decisions

> [!IMPORTANT]
> Keputusan arsitektur dan alur berikut telah dikonfirmasi melalui klarifikasi kebutuhan pengguna:

- **Pemilihan Akun Google**: Menampilkan popup resmi Google OAuth dengan parameter `prompt: 'select_account'` sehingga pengguna di HP/browser langsung melihat daftar seluruh akun Google yang tersimpan di perangkatnya untuk dipilih.
- **Penyimpanan Terpusat**: Data pengikatan (*binding*) akun Google ke Transporter dan Depo disimpan secara permanen di database Cloud Firestore (`transporter_bindings`) agar aturan penguncian berlaku lintas perangkat, lintas browser, dan tidak dapat dimanipulasi melalui local storage.
- **Aturan Penolakan Ketat (*Strict Rejection*)**: Jika sebuah akun Google telah terdaftar dan terikat pada salah satu kombinasi Transporter dan Depo (misal: *PT. Tunas Muda - Karawang*), maka ketika akun tersebut dicoba digunakan untuk mendaftar atau mengakses Transporter lain (misal: *RJTM / WSS / SBR*) atau Depo lain (misal: *Baros / Cirebon*), sistem akan **langsung menolak proses pendaftaran/akses** dengan notifikasi peringatan yang jelas dan membatalkan proses.

---

## 1. Overview & Core Concept

### Masalah Saat Ini
1. Tombol "Hubungkan Google" pada alur pendaftaran transporter sebelumnya menggunakan simulasi *timeout* dengan fallback email statis (`safaria347@gmail.com`), bukan membuka dialog pemilihan akun resmi Google.
2. Pengikatan akun transporter hanya disimpan di `localStorage` perangkat browser klien, sehingga belum ada validasi lintas perangkat dan belum ada aturan validasi yang menolak jika akun Google yang sama dipakai mendaftar di transporter/depo lain.

### Solusi yang Direncanakan
1. **Google Account Picker Resmi**: Mengaktifkan `signInWithPopup` Firebase Auth dengan `GoogleAuthProvider` dan `prompt: 'select_account'` untuk menampilkan popup pemilih akun resmi Google di HP/laptop pengguna.
2. **Cloud Firestore Schema (`transporter_bindings`)**: Membuat koleksi data terpusat di Firestore dengan ID dokumen berupa alamat email pengguna (`email.toLowerCase()`).
3. **Mekanisme Validasi & Penolakan (*Strict Locking Guard*)**:
   - Saat akun Google dipilih, sistem memeriksa status di Firestore:
     - **Jika Belum Terdaftar**: Pengguna melanjutkan ke Langkah 2 untuk memilih Transporter dan Depo resmi. Setelah selesai, akun langsung dikunci di Firestore.
     - **Jika Sudah Terdaftar**:
       - Jika Transporter & Depo yang dipilih cocok: Pengguna langsung diarahkan login.
       - Jika Transporter atau Depo berbeda: Sistem **menolak akses**, menampilkan dialog/banner penolakan merah yang menyatakan akun sudah terkunci untuk transporter & depo aslinya, serta mereset proses pendaftaran.

---

## 2. User Experience & Visual Design

### Alur Antarmuka Pengguna (User Flow)

```
[Layar Login Transporter]
         │
         ▼ Klik "Daftar Akun Baru"
[Langkah 1: Konsep Ringkas & Clean]
┌──────────────────────────────────────────────┐
│  • Indikator Step (1 dari 2)                 │
│  • [ G  Hubungkan Google ]                   │
│  • "Kembali ke Halaman Login"                │
└──────────────────────┬───────────────────────┘
                       │
                       ▼ Klik "Hubungkan Google"
┌──────────────────────────────────────────────┐
│ Popup Resmi Google Account Picker            │
│ "Pilih akun untuk melanjutkan ke SIAPIN"     │
│ [ Akun 1: user1@gmail.com ]                  │
│ [ Akun 2: user2@gmail.com ]                  │
│ [ Tambahkan akun lain...  ]                  │
└──────────────────────┬───────────────────────┘
                       │ Akun Google terpilih
                       ▼
┌──────────────────────────────────────────────┐
│ Cek Status Pengikatan di Cloud Firestore    │
└──────────────┬───────────────────────────────┘
               │
      ┌────────┴───────────────────────────────┐
      │                                        │
      ▼ (Belum Terdaftar)                      ▼ (Sudah Terdaftar di Firestore)
[Langkah 2: Pilih Transporter & Depo]          │
┌──────────────────────────────────────┐       ├─► Jika Transporter & Depo SAMA:
│ Email: [ akun@gmail.com (Terkunci) ] │       │   Langsung login ke Dashboard
│ Pilih Transporter: [ TM / RJTM / ..] │       │
│ Pilih Depo: [ Karawang / Baros / ..] │       └─► Jika Transporter ATAU Depo BEDA:
│ [ Simpan & Kunci Akun ]              │           ▼
└──────────────────┬───────────────────┘       ┌─────────────────────────────────────┐
                   │                           │ 🚫 PENOLAKAN KETAT (MODAL/ALERT)    │
                   ▼                           │ "Akun Google akun@gmail.com sudah   │
    Simpan & Kunci ke Firestore                │ terdaftar untuk PT. Tunas Muda -    │
    `transporter_bindings/{email}`             │ Karawang. Dilarang memakai akun ini │
                   │                           │ untuk Transporter atau Depo lain!"  │
                   ▼                           └─────────────────────────────────────┘
         Masuk ke Dashboard
```

### Desain Visual & Komponen UI
1. **Modal / Banner Penolakan (*Access Denied Alert*)**:
   - Warna: Latar belakang lembut dengan aksen *Crimson Red* (`border-red-200 bg-red-50 text-red-900`).
   - Ikon: `ShieldAlert` atau `AlertTriangle` berukuran jelas.
   - Isi Pesan: Memperlihatkan secara transparan email Google yang digunakan, nama transporter yang saat ini terikat, dan depo yang terikat, disertai tombol "Kembali / Ganti Akun Google".
2. **Step 1 Layar Pendaftaran**:
   - Mempertahankan konsep *ultra-clean* yang sudah diminta: Hanya tombol resmi Google "Hubungkan Google", indikator step ringkas, dan tautan teks "Kembali ke Halaman Login".
3. **Loading State yang Responsif**:
   - Saat popup Google sedang aktif atau sedang memverifikasi ke Firestore, tombol menampilkan spinner halus tanpa glitch.

---

## 3. Key Product Decisions & Trade-Offs

| Skenario | Keputusan Sistem | Alasan & Manfaat |
| :--- | :--- | :--- |
| **Pemilihan Akun di HP** | Memanggil `signInWithPopup` dengan `prompt: 'select_account'` | Memungkinkan pengguna yang memiliki lebih dari satu akun Google di HP memilih akun spesifik untuk operasional |
| **Perangkat Mobile / PWA** | Fallback ramah popup & penanganan pembatalan (*popup closed by user*) | Mencegah aplikasi macet jika pengguna menutup jendela popup Google |
| **Penolakan Akun Ganda** | Penolakan langsung (*hard-block*) saat mencoba mendaftarkan transporter/depo lain | Menjaga integritas data logistik armada agar tidak ada benturan hak akses antar transporter |
| **Penyimpanan Firestore** | Dokumen per email di koleksi `transporter_bindings` | Memberikan query instan berkecepatan tinggi O(1) via `getDoc(doc(db, 'transporter_bindings', email))` |
| **Sinkronisasi Cache Lokal** | Cache lokal tetap diupdate setelah verifikasi Firestore sukses | Memastikan jika jaringan sementara offline, aplikasi tetap mengingat sesi login terakhir yang sah |

---

## 4. Technical Architecture & System Design

### A. Struktur Data Cloud Firestore

Koleksi: `transporter_bindings`
Dokumen ID: `email.toLowerCase()` (contoh: `safaria347@gmail.com`)

```typescript
interface TransporterBindingRecord {
  email: string;              // Primary Key (email Google hasil OAuth)
  googleUid: string;          // UID autentikasi Firebase
  displayName?: string;       // Nama dari profil Google
  kodeTransporter: 'TM' | 'RJTM' | 'WSS' | 'SBR';
  namaTransporter: string;    // Contoh: "PT. Tunas Muda"
  depo: 'Karawang' | 'Baros' | 'Cirebon';
  createdAt: string;          // ISO Date string
  updatedAt: string;          // ISO Date string
  deviceInfo?: string;        // Ringkasan user agent browser
}
```

### B. Service Firestore & Autentikasi
1. **`src/services/transporterAuthService.ts`**:
   - `checkGoogleBinding(email: string): Promise<TransporterBindingRecord | null>`
     - Membaca dokumen dari Firestore `transporter_bindings/{email}`.
   - `bindGoogleTransporterAccount(binding: TransporterBindingRecord): Promise<{ success: boolean; message?: string }>`
     - Melakukan pengecekan ganda: jika sudah ada dan berbeda transporter/depo, lempar error penolakan.
     - Jika belum ada, simpan data dokumen pengikatan ke Firestore.
   - `verifyTransporterAccess(email: string, targetTransporter: string, targetDepo: string): Promise<{ allowed: boolean; existingBinding?: TransporterBindingRecord; message?: string }>`
     - Memvalidasi kecocokan transporter dan depo.
2. **`src/services/googleAuth.ts`**:
   - Memastikan `googleSignIn()` menggunakan `prompt: 'select_account'`.
   - Mengembalikan data pengguna terautentikasi (`user.email`, `user.displayName`, `user.uid`).
3. **`src/components/LoginScreen.tsx`**:
   - Memodifikasi `handleOfficialGoogleAuth` untuk memanggil `googleSignIn()` secara nyata.
   - Mengintegrasikan pengecekan Firestore sebelum beralih ke Step 2.
   - Menyediakan tampilan modal penolakan jika akun terbukti sudah terikat pada transporter atau depo lain.
4. **Backend API Proxy (Opsional / Pelengkap)**:
   - Endpoint `/api/auth/transporter-binding` pada `server.ts` untuk melayani pembacaan dan penyimpanan binding melalui Firebase Admin/Client jika diperlukan atau secara langsung via Firebase Web SDK di frontend.

---

## 5. Security & Boundary Hardening

1. **Email Normalization**: Alamat email wajib selalu di-trim dan diubah ke huruf kecil (`toLowerCase()`) untuk mencegah perbedaan case-sensitive.
2. **Strict Immutable Binding**: Sekali akun terikat ke Transporter dan Depo, pengikatan tersebut tidak dapat diubah oleh pengguna umum di klien. Hanya admin yang memiliki otorisasi untuk mereset binding bila terjadi mutasi supir/transporter.
3. **Handling Popup Blockers**: Menangani exception `auth/popup-closed-by-user` dan `auth/cancelled-popup-request` dengan anggun tanpa menampilkan crash pada antarmuka pengguna.
4. **Offline Resilience**: Jika koneksi internet bermasalah saat mengecek Firestore, aplikasi menampilkan pesan ramah dan meminta mencoba kembali alih-alih meloloskan pendaftaran secara tidak sah.

---

## 6. Acceptance Criteria & Test Plan

1. **Pengujian Popup Akun Google**:
   - Klik "Daftar Akun Baru" &rarr; Klik "Hubungkan Google".
   - Popup Google resmi terbuka dan menampilkan seluruh akun Google yang aktif di HP/browser.
   - Pemilihan salah satu akun berhasil mengekstrak email akun tersebut ke aplikasi.
2. **Pengujian Pendaftaran Pertama Kali**:
   - Akun Google baru memilih Transporter `PT. Tunas Muda` dan Depo `Karawang`.
   - Klik Simpan Pendaftaran &rarr; Data tersimpan di Cloud Firestore `transporter_bindings`.
   - Pengguna berhasil masuk ke dashboard Transporter.
3. **Pengujian Penolakan Transporter Berbeda**:
   - Klik "Daftar Akun Baru" menggunakan akun Google yang sama.
   - Coba pilih Transporter `PT. Roda Jagat Tunas Mas` (RJTM) atau Depo `Baros`.
   - Sistem **MENOLAK** dengan pesan peringatan: *"Akun Google ini telah terdaftar untuk PT. Tunas Muda (Karawang) dan ditolak untuk transporter atau depo lain."*
4. **Pengujian Login Akun yang Sah**:
   - Pengguna dengan akun Google yang sudah terikat dapat langsung login tanpa diminta mendaftar ulang bila memilih transporter dan depo yang sesuai.
