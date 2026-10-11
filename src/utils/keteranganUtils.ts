import { TruckRecord } from '../types';

/**
 * Utilitas pemformatan penanda otomatis (Auto-Tagging) untuk kolom Keterangan
 * spreadsheet AppSheet / Google Sheets "MD to Dealer 2".
 */

export interface KeteranganResolveOptions {
  action?: 'add' | 'edit_row' | 'toggle_status' | 'set_readiness' | 'batch_update';
  prevTruck?: TruckRecord | null;
  newNopol?: string;
  newSopir?: string;
  newStatus?: 'Aktif' | 'Nonaktif';
  newKesiapan?: 'Ready' | 'Tidak Ready';
  customNote?: string;
}

/**
 * Membersihkan format nama sopir untuk tampilan tag ringkas
 */
export function cleanDriverNameShort(name: string): string {
  if (!name) return '';
  return name.trim().toUpperCase();
}

/**
 * Menghasilkan penanda ringkas otomatis untuk kolom Keterangan
 */
export function resolveOperationalKeterangan(options: KeteranganResolveOptions): string {
  const {
    action,
    prevTruck,
    newNopol,
    newSopir,
    newStatus,
    newKesiapan,
    customNote,
  } = options;

  // 1. ATURAN PENAMBAHAN UNIT BARU
  if (action === 'add') {
    const note = (customNote || '').trim();
    if (note && !note.startsWith('[')) {
      return `[Unit Baru] ${note}`.trim();
    }
    return note || '[Unit Baru]';
  }

  // 2. ATURAN AKTIFKAN KEMBALI ATAU DIUBAH KE READY
  if (
    (action === 'toggle_status' && newStatus === 'Aktif') ||
    (action === 'set_readiness' && newKesiapan === 'Ready')
  ) {
    return '';
  }

  // 3. ATURAN NONAKTIF
  const effectiveStatus = newStatus !== undefined ? newStatus : prevTruck?.status || 'Aktif';
  if (effectiveStatus === 'Nonaktif') {
    const note = (customNote || '').trim();
    if (note && !note.includes('[Nonaktif]')) {
      return `[Nonaktif] ${note}`.trim();
    }
    return note || '[Nonaktif]';
  }

  // 4. ATURAN TIDAK READY (Armada Mengalami Kendala Operasional)
  const effectiveKesiapan = newKesiapan !== undefined ? newKesiapan : prevTruck?.kesiapan || 'Ready';
  if (effectiveKesiapan === 'Tidak Ready' && action !== 'edit_row') {
    const note = (customNote || prevTruck?.keterangan || '').trim();
    if (note) {
      if (note.startsWith('[')) {
        return note;
      }
      return `[Tidak Ready: ${note}]`;
    }
    return '[Tidak Ready]';
  }

  // 5. ATURAN PERUBAHAN BARIS (Ganti Sopir / Ganti Nopol via Row Editor)
  if (action === 'edit_row' && prevTruck) {
    const tags: string[] = [];

    if (newSopir !== undefined) {
      const cleanOldSopir = cleanDriverNameShort(prevTruck.namaSopir || '');
      const cleanNewSopir = cleanDriverNameShort(newSopir);
      if (cleanNewSopir && cleanOldSopir && cleanNewSopir !== cleanOldSopir) {
        const shortName = cleanNewSopir.split(' ')[0] || cleanNewSopir;
        tags.push(`[Ganti Sopir: ${shortName}]`);
      }
    }

    if (newNopol !== undefined) {
      const cleanOldNopol = (prevTruck.nomorPolisi || '').trim().toUpperCase();
      const cleanNewNopol = newNopol.trim().toUpperCase();
      if (cleanNewNopol && cleanOldNopol && cleanNewNopol !== cleanOldNopol) {
        tags.push(`[Ganti Nopol: ${cleanNewNopol}]`);
      }
    }

    if (tags.length > 0) {
      const existing = (customNote || prevTruck.keterangan || '').trim();
      if (existing && !tags.some((t) => existing.includes(t))) {
        return `${tags.join(' ')} ${existing}`.trim();
      }
      return tags.join(' ');
    }
  }

  // 6. DEFAULT JIKA READY: Kolom keterangan bersih ("")
  if (effectiveStatus === 'Aktif' && effectiveKesiapan === 'Ready') {
    return '';
  }

  // Default fallback
  return (customNote !== undefined ? customNote : prevTruck?.keterangan || '').trim();
}
