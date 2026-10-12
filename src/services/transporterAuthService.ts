import { TransporterCode } from '../types';

export interface TransporterBindingRecord {
  email: string;
  googleUid?: string;
  displayName?: string;
  kodeTransporter: TransporterCode;
  namaTransporter: string;
  depo: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BindingCheckResult {
  allowed: boolean;
  isNew: boolean;
  existingBinding?: TransporterBindingRecord | null;
  message?: string;
}

const STORAGE_TRANSPORTER_ACCOUNT = 'siapin_transporter_account';

/**
 * Mengambil data pengikatan akun Google transporter dari server/Cloud Firestore
 */
export async function getTransporterBinding(email: string): Promise<TransporterBindingRecord | null> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) return null;

  try {
    const res = await fetch(`/api/transporter-binding/${encodeURIComponent(cleanEmail)}`);
    if (res.ok) {
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data.success && data.binding) {
          return data.binding as TransporterBindingRecord;
        }
      } catch {}
    }
  } catch (err) {
    console.warn('Gagal memuat binding dari server, cek local fallback:', err);
  }

  // Fallback ke localStorage jika koneksi server sedang terkendala
  try {
    const local = localStorage.getItem(STORAGE_TRANSPORTER_ACCOUNT);
    if (local) {
      const parsed = JSON.parse(local);
      if (parsed.email && parsed.email.toLowerCase() === cleanEmail) {
        return {
          email: parsed.email.toLowerCase(),
          kodeTransporter: parsed.kodeTransporter,
          namaTransporter: parsed.namaTransporter,
          depo: parsed.depo,
          createdAt: parsed.createdAt,
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Memeriksa apakah akun Google diizinkan untuk transporter & depo target
 */
export async function checkTransporterBinding(
  email: string,
  targetTransporter?: TransporterCode,
  targetDepo?: string
): Promise<BindingCheckResult> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) {
    return { allowed: false, isNew: false, message: 'Email tidak valid' };
  }

  try {
    const res = await fetch('/api/transporter-binding/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        kodeTransporter: targetTransporter,
        depo: targetDepo,
      }),
    });

    if (res.ok) {
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        return {
          allowed: Boolean(data.allowed),
          isNew: Boolean(data.isNew),
          existingBinding: data.existingBinding || null,
          message: data.message,
        };
      } catch {}
    }
  } catch (err) {
    console.warn('Pengecekan binding ke server gagal:', err);
  }

  // Fallback offline check
  const localBinding = await getTransporterBinding(cleanEmail);
  if (!localBinding) {
    return { allowed: true, isNew: true };
  }

  if (targetTransporter && targetDepo) {
    const matchTrans = localBinding.kodeTransporter.toUpperCase() === targetTransporter.toUpperCase();
    const matchDepo = localBinding.depo.toLowerCase() === targetDepo.toLowerCase();
    if (!matchTrans || !matchDepo) {
      return {
        allowed: false,
        isNew: false,
        existingBinding: localBinding,
        message: `Akun Google ${cleanEmail} telah terdaftar untuk ${localBinding.namaTransporter} (${localBinding.depo}). Anda tidak diizinkan menggunakan akun ini untuk Transporter atau Depo lain.`,
      };
    }
  }

  return { allowed: true, isNew: false, existingBinding: localBinding };
}

/**
 * Menyimpan pengikatan akun Google ke Transporter & Depo secara permanen di Cloud Firestore
 */
export async function saveTransporterBinding(
  binding: TransporterBindingRecord
): Promise<{ success: boolean; rejected?: boolean; existingBinding?: TransporterBindingRecord; message?: string }> {
  const cleanEmail = binding.email.trim().toLowerCase();

  try {
    const res = await fetch('/api/transporter-binding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...binding,
        email: cleanEmail,
      }),
    });

    let data: any = null;
    const textRes = await res.text();
    try {
      data = JSON.parse(textRes);
    } catch {
      // If serverless response is plain text/HTML (e.g. 504 / cold start error)
      console.warn('Server non-JSON response:', textRes);
    }

    if (res.status === 403 || data?.rejected) {
      return {
        success: false,
        rejected: true,
        existingBinding: data?.existingBinding,
        message: data?.message || `Akun Google ini telah terdaftar untuk ${data?.existingBinding?.namaTransporter || 'transporter lain'} dan ditolak untuk transporter lain.`,
      };
    }

    if (!res.ok || (data && !data.success)) {
      console.warn('Server storage warning, saved locally:', data?.message || textRes);
    }

    // Perbarui cache localStorage setelah sukses tersimpan
    const userRecord = {
      email: cleanEmail,
      namaTransporter: binding.namaTransporter,
      kodeTransporter: binding.kodeTransporter,
      depo: binding.depo,
      role: 'transporter',
    };
    localStorage.setItem(STORAGE_TRANSPORTER_ACCOUNT, JSON.stringify(userRecord));

    return {
      success: true,
      message: data?.message || 'Pendaftaran transporter berhasil disimpan.',
    };
  } catch (err: any) {
    console.warn('Network issue during saveTransporterBinding, continuing with local storage:', err);
    // Graceful offline fallback: allow user to finish registration smoothly
    const userRecord = {
      email: cleanEmail,
      namaTransporter: binding.namaTransporter,
      kodeTransporter: binding.kodeTransporter,
      depo: binding.depo,
      role: 'transporter',
    };
    localStorage.setItem(STORAGE_TRANSPORTER_ACCOUNT, JSON.stringify(userRecord));
    return {
      success: true,
      message: 'Pendaftaran tersimpan di sesi perangkat Anda.',
    };
  }
}
