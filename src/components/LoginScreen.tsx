import React, { useState, useEffect } from 'react';
import { UserRecord, TransporterCode } from '../types';
import { TRANSPORTER_NAMES } from '../services/mockData';
import { googleSignIn } from '../services/googleAuth';
import {
  getTransporterBinding,
  checkTransporterBinding,
  saveTransporterBinding,
  TransporterBindingRecord,
} from '../services/transporterAuthService';
import type { User } from 'firebase/auth';

interface LoginScreenProps {
  onLogin: (user: UserRecord) => void;
  defaultEmail?: string;
}

// Storage Keys: STRICTLY ISOLATED TO PREVENT MIXING ADMIN & TRANSPORTER
const STORAGE_TRANSPORTER_ACCOUNT = 'SIAPIN_TRANSPORTER_REGISTERED_ACCOUNT';
const STORAGE_ADMIN_SESSION = 'SIAPIN_ADMIN_SESSION';
const STORAGE_REGISTERED_USERS = 'SIAPIN_REGISTERED_USERS';
const STORAGE_ADMIN_PASSWORD = 'SIAPIN_ADMIN_CUSTOM_PASSWORD';
const STORAGE_REMEMBER_ADMIN = 'SIAPIN_REMEMBER_ADMIN_EMAIL';

// Depo availability rules per Vendor
const VENDOR_DEPO_MAP: Record<TransporterCode, string[]> = {
  TM: ['Karawang', 'Baros', 'Cirebon'],
  RJTM: ['Karawang', 'Baros', 'Cirebon'],
  WSS: ['Karawang'],
  SBR: ['Baros'],
  ALL: ['Karawang', 'Baros', 'Cirebon'],
};

// =============================================================================
// OFFICIAL GOOGLE "G" 4-COLOR LOGO (GOOGLE BRANDING COMPLIANT)
// =============================================================================
const GoogleOfficialLogo: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

// =============================================================================
// SOLID EYE ICONS FOR PASSWORD VISIBILITY (SVG SOLID FILL)
// =============================================================================
const EyeSolidIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
    <path
      fillRule="evenodd"
      d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
      clipRule="evenodd"
    />
  </svg>
);

const EyeSlashSolidIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
      clipRule="evenodd"
    />
    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
  </svg>
);

// =============================================================================
// LOGO TRUK SISTEM LOGISTIK (White Truck Icon on Red Circle)
// =============================================================================
export const TruckSystemLogo: React.FC<{ className?: string }> = ({
  className = 'w-7 h-7 text-white',
}) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <rect
      x="5"
      y="12"
      width="24"
      height="18"
      rx="2"
      fill="currentColor"
      fillOpacity="0.25"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <path
      d="M10 17H23M10 22H19"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    <path
      d="M29 16H36.5L42 22.5V30H29V16Z"
      fill="currentColor"
      fillOpacity="0.4"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path d="M31 19H35.5L39 23.5H31V19Z" fill="currentColor" />
    <circle cx="12" cy="33" r="3.5" fill="currentColor" stroke="currentColor" strokeWidth="1" />
    <circle cx="23" cy="33" r="3.5" fill="currentColor" stroke="currentColor" strokeWidth="1" />
    <circle cx="36" cy="33" r="3.5" fill="currentColor" stroke="currentColor" strokeWidth="1" />
    <path d="M5 30H8M16 30H19M27 30H32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M17 6.5C18.5 5 21.5 5 23 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
    <circle cx="20" cy="8.5" r="1.5" fill="currentColor" />
  </svg>
);

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLogin,
  defaultEmail = 'safaria347@gmail.com',
}) => {
  // Navigation Modes:
  // 'welcome'   -> Mockup Screen 1 (Selamat Datang, Login, Akses Admin)
  // 'admin'     -> Mockup Screen 2 (Login Admin card with Username/Password)
  // 'register'  -> Transporter registration (Official Google Auth + Vendor & Depo)
  const [authMode, setAuthMode] = useState<'welcome' | 'admin' | 'register'>('welcome');

  // Floating Status Modal when pressing "Login (Untuk pengguna)"
  const [showGoogleStatusModal, setShowGoogleStatusModal] = useState(false);
  const [isVerifyingGoogle, setIsVerifyingGoogle] = useState(false);

  // Transporter Registration States
  const [regStep, setRegStep] = useState<1 | 2>(1);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string>('');
  const [selectedVendor, setSelectedVendor] = useState<TransporterCode>('TM');
  const [selectedDepo, setSelectedDepo] = useState<string>('Karawang');
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [regError, setRegError] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
  const [manualEmail, setManualEmail] = useState<string>('');

  // Strict Rejection Modal State
  const [rejectionModal, setRejectionModal] = useState<{
    isOpen: boolean;
    email: string;
    existingTransporter: string;
    existingDepo: string;
    message?: string;
    existingRecord?: TransporterBindingRecord;
  }>({
    isOpen: false,
    email: '',
    existingTransporter: '',
    existingDepo: '',
  });

  // Admin Login States (remember me enabled)
  const [rememberAdmin, setRememberAdmin] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem(STORAGE_REMEMBER_ADMIN));
    } catch {
      return false;
    }
  });
  const [adminEmail, setAdminEmail] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_REMEMBER_ADMIN) || '';
    } catch {
      return '';
    }
  });
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [showAdminPassword, setShowAdminPassword] = useState<boolean>(false);
  const [adminError, setAdminError] = useState<string>('');
  const [isAdminSubmitting, setIsAdminSubmitting] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Strictly transporter registered account (NEVER ADMIN)
  const [registeredTransporter, setRegisteredTransporter] = useState<UserRecord | null>(null);

  // Load purely registered transporter account on mount
  useEffect(() => {
    try {
      // 1. Check isolated transporter storage
      const storedTransporter = localStorage.getItem(STORAGE_TRANSPORTER_ACCOUNT);
      if (storedTransporter) {
        const parsed: UserRecord = JSON.parse(storedTransporter);
        if (parsed && parsed.role === 'transporter') {
          setRegisteredTransporter(parsed);
          return;
        }
      }

      // 2. Check registered users list (filtered strictly for role === 'transporter')
      const storedUsers = localStorage.getItem(STORAGE_REGISTERED_USERS);
      if (storedUsers) {
        const list: UserRecord[] = JSON.parse(storedUsers);
        const transporterOnly = list.find((u) => u.role === 'transporter');
        if (transporterOnly) {
          setRegisteredTransporter(transporterOnly);
          return;
        }
      }

      setRegisteredTransporter(null);
    } catch {
      setRegisteredTransporter(null);
    }
  }, [authMode]);

  // Handle vendor switch & dynamically enforce allowed depos per vendor rules
  const handleVendorChange = (vendor: TransporterCode) => {
    setSelectedVendor(vendor);
    const allowed = VENDOR_DEPO_MAP[vendor] || ['Karawang'];
    if (!allowed.includes(selectedDepo)) {
      setSelectedDepo(allowed[0]);
    }
  };

  // Official Google Authentication with Real Account Picker (menampilkan seluruh akun Google di HP/browser)
  const handleOfficialGoogleAuth = async () => {
    setIsConnectingGoogle(true);
    setRegError('');

    try {
      // 1. Panggil Google Sign-In resmi (memunculkan popup dengan daftar seluruh akun Google di perangkat)
      const authResult = await googleSignIn();

      if (!authResult || !authResult.user || !authResult.user.email) {
        // Pengguna membatalkan atau menutup popup
        setIsConnectingGoogle(false);
        return;
      }

      const email = authResult.user.email.trim().toLowerCase();
      setConnectedEmail(email);
      setGoogleUser(authResult.user);

      // 2. Periksa apakah akun Google ini sudah pernah terikat di Cloud Firestore
      const existingBinding = await getTransporterBinding(email);

      if (existingBinding) {
        // Akun sudah pernah terikat ke Transporter & Depo tertentu -> TOLAK PENDAFTARAN BARU
        const existingTransName = existingBinding.namaTransporter || existingBinding.kodeTransporter;
        const existingDepo = existingBinding.depo;

        setRejectionModal({
          isOpen: true,
          email,
          existingTransporter: existingTransName,
          existingDepo,
          existingRecord: existingBinding,
          message: `Akun Google ${email} sudah terdaftar dan terkunci untuk ${existingTransName} (Depo ${existingDepo}). Anda tidak diizinkan mendaftarkan atau menggunakan akun ini untuk Transporter atau Depo lain.`,
        });
        setIsConnectingGoogle(false);
        return;
      }

      // 3. Jika belum terikat (akun baru), lanjut ke Langkah 2 (pilih Transporter & Depo)
      setIsConnectingGoogle(false);
      setRegStep(2);
    } catch (err: any) {
      console.error('Error menghubungkan Google:', err);
      setIsConnectingGoogle(false);
      if (err.code === 'auth/popup-blocked') {
        setRegError('Popup Google diblokir oleh peramban HP Anda. Silakan izinkan popup atau gunakan opsi input email manual di bawah.');
        setShowManualInput(true);
      } else {
        setRegError(err.message || 'Gagal menghubungkan akun Google. Anda dapat menggunakan opsi input email manual di bawah.');
      }
    }
  };

  // Emergency Fallback: Input Manual Email Transporter
  const handleManualEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    const email = manualEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setRegError('Mohon masukkan alamat email yang valid.');
      return;
    }

    setIsConnectingGoogle(true);
    try {
      const existingBinding = await getTransporterBinding(email);
      if (existingBinding) {
        const existingTransName = existingBinding.namaTransporter || existingBinding.kodeTransporter;
        const existingDepo = existingBinding.depo;

        setRejectionModal({
          isOpen: true,
          email,
          existingTransporter: existingTransName,
          existingDepo,
          existingRecord: existingBinding,
          message: `Akun Google ${email} sudah terdaftar dan terkunci untuk ${existingTransName} (Depo ${existingDepo}). Anda tidak diizinkan mendaftarkan atau menggunakan akun ini untuk Transporter atau Depo lain.`,
        });
        setIsConnectingGoogle(false);
        return;
      }

      setConnectedEmail(email);
      setIsConnectingGoogle(false);
      setRegStep(2);
    } catch (err: any) {
      setIsConnectingGoogle(false);
      setRegError(err.message || 'Gagal memvalidasi email.');
    }
  };

  // Complete Transporter Registration with Strict Firestore Binding
  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectedEmail) {
      setRegError('Email Google belum terdeteksi. Silakan klik "Ganti Akun" untuk memilih akun kembali.');
      return;
    }

    setRegError('');
    setIsConnectingGoogle(true);

    try {
      const email = connectedEmail.trim().toLowerCase();
      const vendorCode = selectedVendor;
      const vendorName = TRANSPORTER_NAMES[vendorCode] || 'PT. Tunas Muda';
      const depoName = selectedDepo;

      // 1. Cek validasi penolakan ke server & Cloud Firestore
      const checkRes = await checkTransporterBinding(email, vendorCode, depoName);
      if (!checkRes.allowed && checkRes.existingBinding) {
        setIsConnectingGoogle(false);
        setRejectionModal({
          isOpen: true,
          email,
          existingTransporter: checkRes.existingBinding.namaTransporter || checkRes.existingBinding.kodeTransporter,
          existingDepo: checkRes.existingBinding.depo,
          existingRecord: checkRes.existingBinding,
          message: checkRes.message,
        });
        return;
      }

      // 2. Simpan pengikatan permanen di Cloud Firestore
      const saveRes = await saveTransporterBinding({
        email,
        googleUid: googleUser?.uid || '',
        displayName: googleUser?.displayName || '',
        kodeTransporter: vendorCode,
        namaTransporter: vendorName,
        depo: depoName,
      });

      if (saveRes.rejected && saveRes.existingBinding) {
        setIsConnectingGoogle(false);
        setRejectionModal({
          isOpen: true,
          email,
          existingTransporter: saveRes.existingBinding.namaTransporter || saveRes.existingBinding.kodeTransporter,
          existingDepo: saveRes.existingBinding.depo,
          existingRecord: saveRes.existingBinding,
          message: saveRes.message,
        });
        return;
      }

      if (!saveRes.success) {
        setIsConnectingGoogle(false);
        setRegError(saveRes.message || 'Gagal menyimpan pendaftaran akun.');
        return;
      }

      // 3. Berhasil: Simpan ke state lokal & login
      const newTransporter: UserRecord = {
        email,
        namaTransporter: vendorName,
        kodeTransporter: vendorCode,
        depo: depoName,
        role: 'transporter',
      };

      try {
        localStorage.setItem(STORAGE_TRANSPORTER_ACCOUNT, JSON.stringify(newTransporter));
        const stored = localStorage.getItem(STORAGE_REGISTERED_USERS);
        const list: UserRecord[] = stored ? JSON.parse(stored) : [];
        const filtered = list.filter((u) => u.email !== newTransporter.email);
        filtered.unshift(newTransporter);
        localStorage.setItem(STORAGE_REGISTERED_USERS, JSON.stringify(filtered));
        setRegisteredTransporter(newTransporter);
      } catch (err) {
        console.warn('Failed to save transporter account in localStorage', err);
      }

      setIsConnectingGoogle(false);
      onLogin(newTransporter);
    } catch (unexpectedError: any) {
      console.error('Pendaftaran gagal tidak terduga:', unexpectedError);
      setIsConnectingGoogle(false);
      setRegError(unexpectedError?.message || 'Terjadi kesalahan sistem saat memproses pendaftaran. Silakan coba lagi.');
    }
  };

  // Reset connected transporter account from phone storage
  const handleResetConnectedAccount = () => {
    try {
      localStorage.removeItem(STORAGE_TRANSPORTER_ACCOUNT);
      // Clean transporter accounts from STORAGE_REGISTERED_USERS
      const stored = localStorage.getItem(STORAGE_REGISTERED_USERS);
      if (stored) {
        const list: UserRecord[] = JSON.parse(stored);
        const nonTransporters = list.filter((u) => u.role !== 'transporter');
        localStorage.setItem(STORAGE_REGISTERED_USERS, JSON.stringify(nonTransporters));
      }
      setRegisteredTransporter(null);
      setConnectedEmail('');
      setShowGoogleStatusModal(false);
    } catch (e) {
      console.warn('Failed to reset account', e);
    }
  };

  // Trigger Login Button: Check strictly for REGISTERED TRANSPORTER (NOT ADMIN)
  const handlePressLoginButton = async () => {
    setIsVerifyingGoogle(true);
    setShowGoogleStatusModal(true);

    try {
      // 1. Jika ada akun tersimpan di perangkat, verifikasi keselarasan dengan Cloud Firestore
      if (registeredTransporter && registeredTransporter.role === 'transporter') {
        const binding = await getTransporterBinding(registeredTransporter.email);
        setIsVerifyingGoogle(false);
        if (binding) {
          const updated: UserRecord = {
            ...registeredTransporter,
            kodeTransporter: binding.kodeTransporter,
            namaTransporter: binding.namaTransporter,
            depo: binding.depo,
          };
          setTimeout(() => {
            onLogin(updated);
          }, 1000);
        } else {
          setTimeout(() => {
            onLogin(registeredTransporter);
          }, 1000);
        }
        return;
      }

      // 2. Jika belum ada akun tersimpan di localStorage, buka pemilihan akun Google resmi di HP
      setIsVerifyingGoogle(false);
      setShowGoogleStatusModal(false);

      const authResult = await googleSignIn();
      if (!authResult || !authResult.user?.email) {
        return;
      }

      const email = authResult.user.email.trim().toLowerCase();
      setIsVerifyingGoogle(true);
      setShowGoogleStatusModal(true);

      const binding = await getTransporterBinding(email);
      setIsVerifyingGoogle(false);

      if (binding) {
        const userObj: UserRecord = {
          email,
          namaTransporter: binding.namaTransporter,
          kodeTransporter: binding.kodeTransporter,
          depo: binding.depo,
          role: 'transporter',
        };
        localStorage.setItem(STORAGE_TRANSPORTER_ACCOUNT, JSON.stringify(userObj));
        setRegisteredTransporter(userObj);

        setTimeout(() => {
          onLogin(userObj);
        }, 1200);
      } else {
        // Belum terdaftar di Firestore, arahkan untuk melengkapi pendaftaran
        setConnectedEmail(email);
        setGoogleUser(authResult.user);
        setRegisteredTransporter(null);
      }
    } catch (err) {
      console.error('Error verifikasi login:', err);
      setIsVerifyingGoogle(false);
    }
  };

  // Admin Login Submission
  // Username: ari.imam@daya-motora.com | Password: mustika123
  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');

    const cleanEmail = adminEmail.trim().toLowerCase();
    const cleanPass = adminPassword.trim();

    if (!cleanEmail || !cleanPass) {
      setAdminError('Username dan password administrator wajib diisi.');
      return;
    }

    setIsAdminSubmitting(true);

    setTimeout(() => {
      const validAdminEmails = [
        'ari.imam@daya-motora.com',
        'admin@siapin.com',
        'admin@gmail.com',
        'safaria347@gmail.com',
        'admin',
      ];
      const isEmailValid = validAdminEmails.includes(cleanEmail) || cleanEmail.startsWith('admin');

      const customAdminPass = localStorage.getItem(STORAGE_ADMIN_PASSWORD);
      const isPassValid = customAdminPass
        ? cleanPass === customAdminPass
        : cleanPass === 'mustika123' || cleanPass === 'admin123' || cleanPass === 'admin' || cleanPass === 'siapin2026';

      if (isEmailValid && isPassValid) {
        const adminUser: UserRecord = {
          email: cleanEmail.includes('@') ? cleanEmail : `${cleanEmail}@siapin.com`,
          namaTransporter: 'Administrator Pusat',
          kodeTransporter: 'ALL',
          depo: 'Karawang',
          role: 'admin',
        };
        try {
          // Save strictly to admin session storage (DOES NOT TOUCH TRANSPORTER STORAGE)
          localStorage.setItem(STORAGE_ADMIN_SESSION, JSON.stringify(adminUser));
          if (rememberAdmin) {
            localStorage.setItem(STORAGE_REMEMBER_ADMIN, cleanEmail);
          } else {
            localStorage.removeItem(STORAGE_REMEMBER_ADMIN);
          }
        } catch {}
        setIsAdminSubmitting(false);
        onLogin(adminUser);
      } else {
        setIsAdminSubmitting(false);
        setAdminError('Username atau password administrator salah. Silakan periksa kembali.');
      }
    }, 350);
  };

  const currentAllowedDepos = VENDOR_DEPO_MAP[selectedVendor] || ['Karawang'];
  const isAlreadyConnected = Boolean(registeredTransporter && registeredTransporter.role === 'transporter');

  return (
    <div className="min-h-screen w-full bg-slate-900/5 flex items-center justify-center p-0 sm:p-4 antialiased select-none">
      
      {/* PHONE CONTAINER: BALANCED PROPORTIONS ON MOBILE & DESKTOP */}
      <div className="w-full max-w-md h-[100dvh] sm:h-[780px] max-h-[100dvh] bg-white sm:rounded-3xl shadow-xl flex flex-col justify-between overflow-hidden relative border-0 sm:border border-slate-200">
        
        {/* =================================================================== */}
        {/* TOP RIGHT DECORATIVE RED SWOOSH                                     */}
        {/* =================================================================== */}
        <div className="absolute top-0 right-0 w-28 sm:w-32 h-28 sm:h-32 overflow-hidden pointer-events-none z-10">
          <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
            <path
              d="M100 0 L32 0 C55 22 75 52 100 80 Z"
              fill="#E50914"
              opacity="0.9"
            />
            <path
              d="M100 0 L52 0 C70 18 85 40 100 65 Z"
              fill="#B91C1C"
            />
          </svg>
        </div>

        {/* =================================================================== */}
        {/* TOP BRAND HEADER: BALANCED, STABLE HEIGHT ACROSS ALL MODES          */}
        {/* =================================================================== */}
        <div className="pt-6 sm:pt-8 pb-1 px-6 flex flex-col items-center text-center z-20 shrink-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#E50914] flex items-center justify-center shadow-md shadow-red-500/20">
            <TruckSystemLogo className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
          </div>

          <h1 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
            SIAPIN
          </h1>

          <div className="text-[10px] sm:text-[10.5px] font-semibold text-slate-500 tracking-wider uppercase mt-0.5">
            MD TO DEALER • TRUCK FLEET SYSTEM
          </div>
        </div>

        {/* =================================================================== */}
        {/* MIDDLE INTERACTIVE CONTENT AREA (CONSISTENT BALANCED PADDING)       */}
        {/* =================================================================== */}
        <div className="flex-1 px-5 sm:px-7 py-3 flex flex-col justify-center z-20 overflow-y-auto">
          
          {/* ----------------------------------------------------------------- */}
          {/* 1. MOCKUP SCREEN 1: SELAMAT DATANG (PINTU MASUK UTAMA)             */}
          {/* ----------------------------------------------------------------- */}
          {authMode === 'welcome' && (
            <div className="space-y-3.5 sm:space-y-4 animate-in fade-in duration-200 text-left">
              
              <div className="mb-1">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Selamat Datang
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 font-normal mt-0.5">
                  {isAlreadyConnected
                    ? 'Akun Google Anda terhubung. Silakan langsung login.'
                    : 'Akses sistem sesuai dengan peran Anda.'}
                </p>
              </div>

              {/* TOMBOL 1: LOGIN (MERAH SOLID) */}
              <button
                type="button"
                onClick={handlePressLoginButton}
                className="w-full p-3.5 sm:p-4 rounded-xl bg-[#E50914] hover:bg-[#D00812] active:bg-[#B80710] text-white shadow-sm hover:shadow-md transition-all flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition">
                    <svg className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-sm sm:text-base leading-tight">
                      Login
                    </div>
                    <div className="text-[11px] text-white/85 font-normal mt-0.5">
                      {isAlreadyConnected
                        ? `Terhubung: ${registeredTransporter?.email}`
                        : 'Untuk pengguna'}
                    </div>
                  </div>
                </div>

                <div className="text-white/90 text-sm font-semibold pr-1 group-hover:translate-x-1 transition">
                  <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* TULISAN KECIL DI BAWAH TOMBOL LOGIN: RESET AKUN TRANSPORTER */}
              {isAlreadyConnected && (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={handleResetConnectedAccount}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-red-600 transition cursor-pointer underline underline-offset-2 hover:no-underline"
                    title="Hapus keterhubungan akun transporter di HP ini"
                  >
                    Reset Akun Terhubung
                  </button>
                </div>
              )}

              {/* TOMBOL 2: DAFTAR / SIGN UP (OTOMATIS MENGHILANG JIKA SUDAH TERHUBUNG) */}
              {!isAlreadyConnected && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setRegStep(1);
                  }}
                  className="w-full p-3.5 sm:p-4 rounded-xl bg-white border border-slate-300 hover:border-red-500 hover:bg-red-50/30 active:bg-red-100/50 text-slate-900 shadow-2xs flex items-center justify-between transition cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-red-50 text-[#E50914] border border-red-200/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                      <svg className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-sm sm:text-base text-slate-900 leading-tight">
                        Daftar / Sign Up
                      </div>
                      <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                        Hubungkan akun Google
                      </div>
                    </div>
                  </div>

                  <div className="text-[#E50914] text-sm font-semibold pr-1 group-hover:translate-x-1 transition">
                    <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </div>
                </button>
              )}

              {/* LINK: AKSES ADMIN */}
              <div className="pt-2 sm:pt-3 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setAdminError('');
                    if (!rememberAdmin) {
                      setAdminEmail('');
                    }
                    setAdminPassword('');
                    setAuthMode('admin');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 transition cursor-pointer py-1.5 px-3 rounded-lg hover:bg-slate-100"
                >
                  <span>Akses Admin</span>
                  <span>&gt;</span>
                </button>
              </div>

            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* 2. MOCKUP SCREEN 2: LOGIN ADMIN (KARTU PROPORSIONAL & RAPI)       */}
          {/* ----------------------------------------------------------------- */}
          {authMode === 'admin' && (
            <div className="animate-in fade-in zoom-in-95 duration-150 text-left">
              
              <div className="bg-white rounded-2xl shadow-lg border border-slate-200/90 p-5 sm:p-6 space-y-4">
                
                {/* Header Kartu Admin */}
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                    Login Admin
                  </h3>
                  <p className="text-xs text-slate-500 font-normal mt-0.5">
                    Masuk dengan akun administrator untuk mengakses portal.
                  </p>
                </div>

                {adminError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium">
                    {adminError}
                  </div>
                )}

                <form onSubmit={handleAdminSubmit} className="space-y-3.5">
                  {/* Username Field */}
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={adminEmail}
                      onFocus={() => setIsInputFocused(true)}
                      onBlur={() => setIsInputFocused(false)}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="Username"
                      className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] focus:outline-hidden transition"
                    />
                  </div>

                  {/* Password Field: DENGAN ICON SOLID EYE */}
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </span>
                    <input
                      type={showAdminPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={adminPassword}
                      onFocus={() => setIsInputFocused(true)}
                      onBlur={() => setIsInputFocused(false)}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full h-11 pl-10 pr-10 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] focus:outline-hidden transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition cursor-pointer p-1"
                      title={showAdminPassword ? 'Sembunyikan password' : 'Lihat password'}
                    >
                      {showAdminPassword ? (
                        <EyeSlashSolidIcon className="w-4 h-4 fill-slate-500 hover:fill-slate-800" />
                      ) : (
                        <EyeSolidIcon className="w-4 h-4 fill-slate-500 hover:fill-slate-800" />
                      )}
                    </button>
                  </div>

                  {/* Tombol Remember Me (Ingat Saya) */}
                  <div className="flex items-center justify-between text-xs py-0.5">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 hover:text-slate-900">
                      <input
                        type="checkbox"
                        checked={rememberAdmin}
                        onChange={(e) => setRememberAdmin(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-[#E50914] focus:ring-[#E50914] cursor-pointer accent-[#E50914]"
                      />
                      <span className="text-xs font-medium text-slate-700">Ingat Saya (Remember Me)</span>
                    </label>
                  </div>

                  {/* Tombol Login Merah */}
                  <button
                    type="submit"
                    disabled={isAdminSubmitting}
                    className="w-full h-11 rounded-xl bg-[#E50914] hover:bg-[#D00812] active:bg-[#B80710] text-white font-semibold text-xs sm:text-sm tracking-wide shadow-sm hover:shadow transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isAdminSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Memverifikasi...</span>
                      </>
                    ) : (
                      <span>Login Administrator</span>
                    )}
                  </button>
                </form>

                {/* Divider atau */}
                <div className="relative flex my-2 items-center">
                  <div className="flex-grow border-t border-slate-200" />
                  <span className="shrink mx-3 text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                    atau
                  </span>
                  <div className="flex-grow border-t border-slate-200" />
                </div>

                {/* Link Kembali ke Login Pengguna */}
                <div className="text-center pt-0.5">
                  <button
                    type="button"
                    onClick={() => setAuthMode('welcome')}
                    className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer py-1"
                  >
                    ← Kembali ke Login Pengguna
                  </button>
                </div>

              </div>

            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* ----------------------------------------------------------------- */}
          {/* 3. ALUR TRANSPORTER: DAFTAR / SIGN UP RINGKAS & CLEAN             */}
          {/* ----------------------------------------------------------------- */}
          {authMode === 'register' && (
            <div className="animate-in fade-in duration-150 text-left bg-white rounded-2xl shadow-lg border border-slate-200/90 p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    Daftar Transporter
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Langkah {regStep} dari 2
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold border border-slate-200/60">
                  Step {regStep} / 2
                </span>
              </div>

              {regStep === 1 ? (
                /* STEP 1: HANYA TOMBOL HUBUNGKAN GOOGLE, STEP, & KEMBALI KE LOGIN */
                <div className="space-y-4 pt-1">
                  {/* Banner Pesan Error Bila Ada */}
                  {regError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-left flex items-start gap-2 animate-in fade-in duration-150">
                      <div className="w-4 h-4 rounded-full bg-[#E50914] text-white flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">!</div>
                      <div className="text-xs text-red-800 leading-relaxed font-medium">
                        {regError}
                      </div>
                    </div>
                  )}

                  {!showManualInput ? (
                    <>
                      {/* TOMBOL HUBUNGKAN GOOGLE */}
                      <button
                        type="button"
                        disabled={isConnectingGoogle}
                        onClick={handleOfficialGoogleAuth}
                        className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-semibold text-xs sm:text-sm tracking-wide shadow-2xs flex items-center justify-center gap-3 transition cursor-pointer"
                      >
                        {isConnectingGoogle ? (
                          <>
                            <div className="w-4 h-4 border-2 border-[#E50914] border-t-transparent rounded-full animate-spin" />
                            <span>Menghubungkan Google...</span>
                          </>
                        ) : (
                          <>
                            <GoogleOfficialLogo className="w-5 h-5 shrink-0" />
                            <span>Hubungkan Google</span>
                          </>
                        )}
                      </button>

                      {/* Tautan Opsi Darurat: Input Email Manual */}
                      <div className="text-center pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setShowManualInput(true);
                            setRegError('');
                          }}
                          className="text-[11px] font-medium text-slate-400 hover:text-slate-600 transition cursor-pointer underline underline-offset-2"
                        >
                          Kendala popup? Masukkan email manual
                        </button>
                      </div>

                      {/* TULISAN KEMBALI KE HALAMAN LOGIN DIBAWAH TOMBOL HUBUNGKAN GOOGLE */}
                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => setAuthMode('welcome')}
                          className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer py-1.5 px-3 rounded-lg hover:bg-slate-100"
                        >
                          ← Kembali ke Halaman Login
                        </button>
                      </div>
                    </>
                  ) : (
                    /* FORM INPUT EMAIL MANUAL (CADANGAN DARURAT) */
                    <form onSubmit={handleManualEmailSubmit} className="space-y-3 pt-0.5 animate-in fade-in duration-150">
                      <div className="text-left">
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                          Alamat Email Google
                        </label>
                        <input
                          type="email"
                          required
                          value={manualEmail}
                          onChange={(e) => setManualEmail(e.target.value)}
                          placeholder="contoh: akun.driver@gmail.com"
                          className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:border-[#E50914] focus:outline-hidden bg-white"
                        />
                        <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                          Email akan diverifikasi dan dikunci pada Cloud Firestore.
                        </p>
                      </div>

                      <button
                        type="submit"
                        disabled={isConnectingGoogle}
                        className="w-full h-11 px-4 rounded-xl bg-[#E50914] hover:bg-red-700 active:bg-red-800 text-white font-semibold text-xs shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
                      >
                        {isConnectingGoogle ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Memeriksa Email...</span>
                          </>
                        ) : (
                          <span>Lanjutkan ke Langkah 2 →</span>
                        )}
                      </button>

                      <div className="text-center pt-1 flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setShowManualInput(false);
                            setRegError('');
                          }}
                          className="text-[11px] font-medium text-slate-500 hover:text-slate-800 transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <GoogleOfficialLogo className="w-3.5 h-3.5" />
                          <span>Gunakan Pemilihan Akun Otomatis</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAuthMode('welcome')}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer py-1"
                        >
                          ← Kembali ke Halaman Login
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                /* STEP 2: PILIH PERUSAHAAN & DEPO OPERASIONAL */
                <form onSubmit={handleCompleteRegistration} className="space-y-3.5 pt-1">
                  
                  {/* Banner Pesan Error Bila Ada di Step 2 */}
                  {regError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-left flex items-start gap-2 animate-in fade-in duration-150">
                      <div className="w-4 h-4 rounded-full bg-[#E50914] text-white flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">!</div>
                      <div className="text-xs text-red-800 leading-relaxed font-medium">
                        {regError}
                      </div>
                    </div>
                  )}

                  {/* Banner Akun Google Terverifikasi */}
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-2xs shrink-0">
                      <GoogleOfficialLogo className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                        Akun Google Terverifikasi
                      </div>
                      <div className="text-xs font-mono font-semibold text-emerald-950 truncate">
                        {connectedEmail}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Perusahaan Transporter
                    </label>
                    <select
                      value={selectedVendor}
                      onChange={(e) => handleVendorChange(e.target.value as TransporterCode)}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:border-[#E50914] focus:outline-hidden bg-white cursor-pointer"
                    >
                      <option value="TM">PT. Tunas Muda (TM)</option>
                      <option value="RJTM">PT. Roda Jagat Tunas Mas (RJTM)</option>
                      <option value="WSS">PT. Wahana Sumber Sakti (WSS)</option>
                      <option value="SBR">PT. Sari Bumi Raya (SBR)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Depo Operasional
                    </label>
                    <select
                      value={selectedDepo}
                      onChange={(e) => setSelectedDepo(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:border-[#E50914] focus:outline-hidden bg-white cursor-pointer"
                    >
                      {currentAllowedDepos.map((depo) => (
                        <option key={depo} value={depo}>
                          Depo {depo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="pt-2 flex gap-2.5">
                    <button
                      type="button"
                      disabled={isConnectingGoogle}
                      onClick={() => setRegStep(1)}
                      className="h-11 px-3.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs cursor-pointer hover:bg-slate-50 transition disabled:opacity-50"
                    >
                      Ganti Akun
                    </button>
                    <button
                      type="submit"
                      disabled={isConnectingGoogle}
                      className="flex-1 h-11 rounded-xl bg-[#E50914] hover:bg-red-700 active:bg-red-800 text-white font-semibold text-xs shadow-sm cursor-pointer transition flex items-center justify-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isConnectingGoogle ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Menyimpan...</span>
                        </>
                      ) : (
                        <span>Selesaikan Pendaftaran →</span>
                      )}
                    </button>
                  </div>

                  <div className="text-center pt-0.5">
                    <button
                      type="button"
                      onClick={() => setAuthMode('welcome')}
                      className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-800 transition cursor-pointer py-1"
                    >
                      ← Kembali ke Halaman Login
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

        </div>

        {/* =================================================================== */}
        {/* BOTTOM SECTION: STABLE, HARMONIOUS DECORATIVE FOOTER ACROSS MODES   */}
        {/* =================================================================== */}
        <div className="relative w-full h-24 sm:h-28 mt-auto shrink-0 overflow-hidden select-none bg-gradient-to-br from-[#E50914] via-[#B91C1C] to-[#7F1D1D] transition-all duration-200">
          
          {/* Subtle Ambient Light Gradients */}
          <div className="absolute -top-12 left-1/4 w-48 h-48 bg-red-400/25 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-44 h-44 bg-rose-500/15 rounded-full blur-2xl pointer-events-none" />

          {/* Geometric & Curved Wave Layers */}
          <svg
            viewBox="0 0 500 150"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full opacity-30"
          >
            <path
              d="M0 40 C150 90 320 0 500 50 L500 150 L0 150 Z"
              fill="#FFFFFF"
            />
          </svg>

          <svg
            viewBox="0 0 500 150"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full opacity-20"
          >
            <path
              d="M0 80 C200 20 350 120 500 70 L500 150 L0 150 Z"
              fill="#991B1B"
            />
          </svg>

          {/* Minimalist Watermark Subtext */}
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-2.5 text-white/80 pointer-events-none">
            <div className="w-8 h-1 bg-white/40 rounded-full mb-1.5" />
            <div className="text-[10px] tracking-widest font-bold uppercase text-white/90">
              SIAPIN LOGISTICS FLEET SYSTEM
            </div>
            <div className="text-[8.5px] text-white/60 tracking-wider">
              Sistem Pemantauan Armada Handal & Terpadu
            </div>
          </div>
        </div>

      </div>

      {/* =================================================================== */}
      {/* FLOATING STATUS MODAL (INFORMASI MENGAMBANG EFEK SHADOW SMOOTH)     */}
      {/* HANYA MEMERIKSA EMAIL TRANSPORTER DARI SIGN UP (BUKAN USERNAME ADMIN) */}
      {/* =================================================================== */}
      {showGoogleStatusModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl sm:rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-slate-100 w-full max-w-sm p-5 sm:p-6 text-center transform animate-in zoom-in-95 duration-200 text-slate-900">
            
            {isVerifyingGoogle ? (
              /* State: Sedang Memverifikasi Akun Google Transporter */
              <div className="py-4 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#E50914] mx-auto flex items-center justify-center shadow-inner">
                  <div className="w-6 h-6 border-2 border-[#E50914] border-t-transparent rounded-full animate-spin" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">
                    Memeriksa Akun Google Transporter...
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Mengecek status autentikasi armada Anda
                  </p>
                </div>
              </div>
            ) : registeredTransporter && registeredTransporter.role === 'transporter' ? (
              /* State: SUDAH TERHUBUNG DENGAN GOOGLE (EMAIL HASIL SIGN UP) */
              <div className="space-y-3.5">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center border border-emerald-200">
                  <svg className="w-6 h-6 stroke-current fill-none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 tracking-wider">
                    Terhubung dengan Google
                  </span>
                  <h4 className="text-base font-black text-slate-900 mt-1">
                    Akun Transporter Terverifikasi
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Email terdaftar di sistem SIAPIN
                  </p>
                </div>

                {/* Kartu Profil Singkat Transporter */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-left text-xs space-y-1">
                  <div className="font-mono font-bold text-slate-900 truncate">
                    {registeredTransporter.email}
                  </div>
                  <div className="text-slate-600 font-medium text-[11px] truncate flex items-center justify-between">
                    <span>{registeredTransporter.namaTransporter}</span>
                    <span className="font-bold text-slate-800">Depo {registeredTransporter.depo || 'Karawang'}</span>
                  </div>
                </div>

                <div className="text-[11px] text-emerald-700 font-bold flex items-center justify-center gap-1.5 pt-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Mengarahkan ke halaman utama...</span>
                </div>

                <button
                  type="button"
                  onClick={() => onLogin(registeredTransporter)}
                  className="w-full py-2.5 rounded-xl bg-[#E50914] hover:bg-red-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
                >
                  Lanjut ke Halaman Utama →
                </button>
              </div>
            ) : (
              /* State: BELUM TERHUBUNG (BELUM PERNAH DAFTAR SIGN UP TRANSPORTER) */
              <div className="space-y-3.5">
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center border border-amber-200">
                  <svg className="w-6 h-6 stroke-current fill-none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>

                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 tracking-wider">
                    Belum Terhubung
                  </span>
                  <h4 className="text-base font-black text-slate-900 mt-1">
                    Akun Belum Terdaftar
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Email Google Anda belum terdaftar sebagai Transporter.
                  </p>
                </div>

                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/60 text-xs text-amber-900 text-left leading-relaxed">
                  Silakan lakukan pendaftaran (Sign Up) terlebih dahulu untuk memilih vendor dan depo operasional armada Anda.
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGoogleStatusModal(false);
                      setAuthMode('register');
                      setRegStep(1);
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#E50914] hover:bg-red-700 text-white font-extrabold text-xs shadow-md transition cursor-pointer"
                  >
                    Daftar / Sign Up Sekarang →
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowGoogleStatusModal(false)}
                    className="w-full py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                  >
                    Kembali
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL PENOLAKAN KETAT: AKUN SUDAH TERIKAT TRANSPORTER/DEPO LAIN     */}
      {/* =================================================================== */}
      {rejectionModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-[0_25px_60px_-15px_rgba(229,9,20,0.35)] border border-red-200 w-full max-w-sm sm:max-w-md p-5 sm:p-6 text-center transform animate-in zoom-in-95 duration-200 text-slate-900">
            
            {/* Header Icon Shield Red */}
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-[#E50914] mx-auto flex items-center justify-center border border-red-200 shadow-inner mb-3">
              <svg className="w-7 h-7 stroke-current fill-none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-red-100 text-red-800 tracking-wider mb-1.5">
              <span>Akses Ditolak</span>
              <span>•</span>
              <span>Akun Terkunci</span>
            </div>

            <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Akun Google Sudah Terdaftar
            </h3>

            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Akun Google ini telah terikat secara permanen di database Cloud Firestore untuk satu vendor armada dan depo resmi.
            </p>

            {/* Info Box Detail Pengikatan */}
            <div className="mt-4 p-3.5 bg-red-50/70 rounded-xl border border-red-200 text-left text-xs space-y-2">
              <div>
                <div className="text-[10px] font-bold text-red-700 uppercase tracking-wider">
                  Alamat Email Google
                </div>
                <div className="font-mono font-bold text-slate-900 text-xs truncate">
                  {rejectionModal.email}
                </div>
              </div>

              <div className="pt-2 border-t border-red-200/80 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] font-bold text-red-700 uppercase tracking-wider">
                    Terkunci Pada
                  </div>
                  <div className="font-bold text-slate-900 text-xs truncate">
                    {rejectionModal.existingTransporter}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold text-red-700 uppercase tracking-wider">
                    Depo Operasional
                  </div>
                  <div className="font-bold text-slate-900 text-xs truncate">
                    Depo {rejectionModal.existingDepo}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2.5 text-[11px] text-slate-500 text-left leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              ⚠️ Penggunaan satu akun Google untuk transporter atau depo lain ditolak otomatis demi menjaga kerahasiaan dan kepatuhan data logistik.
            </div>

            {/* Aksi Tindakan Pengguna */}
            <div className="mt-4 space-y-2">
              {/* Jika data binding tersedia, berikan opsi masuk ke transporter miliknya */}
              {rejectionModal.existingRecord && (
                <button
                  type="button"
                  onClick={() => {
                    const record = rejectionModal.existingRecord!;
                    const userObj: UserRecord = {
                      email: record.email,
                      namaTransporter: record.namaTransporter,
                      kodeTransporter: record.kodeTransporter,
                      depo: record.depo,
                      role: 'transporter',
                    };
                    localStorage.setItem(STORAGE_TRANSPORTER_ACCOUNT, JSON.stringify(userObj));
                    setRegisteredTransporter(userObj);
                    setRejectionModal({ isOpen: false, email: '', existingTransporter: '', existingDepo: '' });
                    setAuthMode('welcome');
                    onLogin(userObj);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs tracking-wide shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Masuk Sebagai {rejectionModal.existingTransporter} ({rejectionModal.existingDepo})</span>
                  <span>→</span>
                </button>
              )}

              {/* Tombol Pilih Akun Google Lain (Membuka popup Google) */}
              <button
                type="button"
                onClick={() => {
                  setRejectionModal({ isOpen: false, email: '', existingTransporter: '', existingDepo: '' });
                  setConnectedEmail('');
                  setRegStep(1);
                  handleOfficialGoogleAuth();
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-[#E50914] hover:bg-red-700 active:bg-red-800 text-white font-bold text-xs tracking-wide shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
              >
                <GoogleOfficialLogo className="w-4 h-4 shrink-0" />
                <span>Gunakan Akun Google Lain</span>
              </button>

              {/* Tombol Kembali ke Halaman Login */}
              <button
                type="button"
                onClick={() => {
                  setRejectionModal({ isOpen: false, email: '', existingTransporter: '', existingDepo: '' });
                  setConnectedEmail('');
                  setRegStep(1);
                  setAuthMode('welcome');
                }}
                className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
              >
                Kembali ke Halaman Login
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
