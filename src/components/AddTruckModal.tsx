import React, { useState } from 'react';
import { TruckRecord, TruckStatus, ReadinessStatus } from '../types';
import { resolveOperationalKeterangan } from '../utils/keteranganUtils';

interface AddTruckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTruck: (truckData: Omit<TruckRecord, 'id' | 'terakhirUpdate'>) => void;
  activeTransporter: string;
  isAdmin: boolean;
  availableTransporters: string[];
}

export const AddTruckModal: React.FC<AddTruckModalProps> = ({
  isOpen,
  onClose,
  onAddTruck,
  activeTransporter,
  isAdmin,
  availableTransporters,
}) => {
  const defaultTransporter = activeTransporter === 'ALL' ? 'TM' : activeTransporter;
  const [transporter, setTransporter] = useState<string>(defaultTransporter);
  const [depo, setDepo] = useState<string>('Karawang');
  const [nomorPolisi, setNomorPolisi] = useState('');
  const [namaSopir, setNamaSopir] = useState('');
  const [kapasitas, setKapasitas] = useState('28');
  const [status, setStatus] = useState<TruckStatus>('Aktif');
  const [kesiapan, setKesiapan] = useState<ReadinessStatus>('Ready');
  const [keterangan, setKeterangan] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomorPolisi.trim()) {
      setError('Nomor Polisi wajib diisi');
      return;
    }
    const cleanSopir = namaSopir.trim().split(/\s+/)[0];
    if (!cleanSopir) {
      setError('Nama Sopir (Nama Depan) wajib diisi');
      return;
    }
    const cleanKap = kapasitas.trim();
    if (!cleanKap || !/^[1-9]\d*$/.test(cleanKap)) {
      setError('Kapasitas armada wajib berupa angka bulat positif (contoh: 28)');
      return;
    }

    const finalKeterangan = resolveOperationalKeterangan({
      action: 'add',
      newStatus: status,
      newKesiapan: kesiapan,
      customNote: keterangan.trim(),
    });

    onAddTruck({
      transporter: activeTransporter === 'ALL' ? transporter : activeTransporter,
      depo,
      nomorPolisi: nomorPolisi.trim().toUpperCase(),
      namaSopir: cleanSopir,
      kapasitas: cleanKap,
      status,
      kesiapan,
      keterangan: finalKeterangan,
    });

    // Reset form
    setNomorPolisi('');
    setNamaSopir('');
    setKapasitas('28');
    setStatus('Aktif');
    setKesiapan('Ready');
    setKeterangan('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[92dvh] flex flex-col overflow-hidden">
        
        {/* Header (Kompak) */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-600" />
            <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 uppercase tracking-tight">
              Tambah Unit Truk Baru
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-800 rounded-full hover:bg-slate-200 transition cursor-pointer text-xs font-bold"
          >
            ✕
          </button>
        </div>

        {/* Form Body (Scrollable bila layar HP kecil) */}
        <form onSubmit={handleSubmit} className="p-3 sm:p-4 space-y-2.5 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] font-medium">
              {error}
            </div>
          )}

          {/* Vendor & Depo (2 Kolom) */}
          <div className="grid grid-cols-2 gap-2">
            {isAdmin ? (
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Vendor
                </label>
                <select
                  value={transporter}
                  onChange={(e) => setTransporter(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:border-red-500 focus:outline-hidden cursor-pointer"
                >
                  {availableTransporters.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Vendor
                </label>
                <div className="px-2.5 py-1.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-bold text-red-700">
                  {activeTransporter}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Depo
              </label>
              <select
                value={depo}
                onChange={(e) => setDepo(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:border-red-500 focus:outline-hidden cursor-pointer"
              >
                <option value="Karawang">Karawang</option>
                <option value="Baros">Baros</option>
                <option value="Cirebon">Cirebon</option>
              </select>
            </div>
          </div>

          {/* Nopol & Kapasitas (2 Kolom) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Nomor Polisi *
              </label>
              <input
                type="text"
                required
                value={nomorPolisi}
                onChange={(e) => setNomorPolisi(e.target.value.toUpperCase())}
                placeholder="B 1234 XX"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-xs uppercase focus:border-red-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Kapasitas *
              </label>
              <input
                type="number"
                min="1"
                required
                value={kapasitas}
                onChange={(e) => setKapasitas(e.target.value)}
                placeholder="28"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-xs focus:border-red-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Nama Sopir */}
          <div>
            <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Nama Sopir (Nama Depan) *
            </label>
            <input
              type="text"
              required
              value={namaSopir}
              onChange={(e) => setNamaSopir(e.target.value)}
              placeholder="Contoh: Asep"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold text-xs focus:border-red-500 focus:outline-hidden"
            />
          </div>

          {/* Status & Kesiapan (2 Kolom) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Status Armada
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TruckStatus)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white focus:border-red-500 focus:outline-hidden cursor-pointer"
              >
                <option value="Aktif">Aktif</option>
                <option value="Nonaktif">Nonaktif</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Kesiapan
              </label>
              <select
                value={kesiapan}
                onChange={(e) => setKesiapan(e.target.value as ReadinessStatus)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-bold bg-white focus:border-red-500 focus:outline-hidden cursor-pointer"
              >
                <option value="Ready">Ready</option>
                <option value="Tidak Ready">Tidak Ready</option>
              </select>
            </div>
          </div>

          {/* Keterangan Tambahan (opsional) */}
          <div>
            <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Catatan / Keterangan (Opsional)
            </label>
            <input
              type="text"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Catatan alasan jika tidak ready..."
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs focus:border-red-500 focus:outline-hidden"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-[#FF0000] hover:bg-[#D90000] active:bg-[#B30000] text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              Simpan Unit Truk →
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
