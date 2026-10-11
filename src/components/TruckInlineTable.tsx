import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TruckRecord, TruckStatus, ReadinessStatus, SaveStatus } from '../types';
import { FloatingBatchFooter } from './FloatingBatchFooter';
import { EmptyStateTrucks } from './EmptyStateTrucks';
import { formatWIBDateIndo, isConfirmedToday } from '../utils/timeUtils';
import { resolveOperationalKeterangan } from '../utils/keteranganUtils';

interface TruckInlineTableProps {
  trucks: TruckRecord[];
  isLocked: boolean;
  isAdmin: boolean;
  onUpdateTruck: (truck: TruckRecord) => Promise<boolean>;
  onBulkStatusChange?: (truckIds: string[], newStatus: TruckStatus) => Promise<boolean>;
  onBulkReadinessChange?: (truckIds: string[], newReadiness: ReadinessStatus) => Promise<boolean>;
  onDeleteRequest: (truck: TruckRecord) => void;
  onMassDeleteRequest?: (trucks: TruckRecord[]) => void;
  showTransporterColumn?: boolean;
  searchQuery?: string;
  statusFilter?: 'ALL' | 'Aktif' | 'Nonaktif';
  readinessFilter?: 'ALL' | 'Ready' | 'Tidak Ready';
  depoFilter?: 'ALL' | 'Karawang' | 'Baros' | 'Cirebon';
  selectedVendorFilter?: string;
  onResetFilters?: () => void;
  onOpenAddModal?: () => void;
  operationalDate?: string;
  lastConfirmedTime?: string;
}

interface RowState {
  nomorPolisi: string;
  namaSopir: string;
  kapasitas: string;
  status: TruckStatus;
  kesiapan: ReadinessStatus;
  keterangan: string;
  depo: string;
  saveStatus: SaveStatus;
}

export const TruckInlineTable: React.FC<TruckInlineTableProps> = ({
  trucks,
  isLocked,
  isAdmin,
  onUpdateTruck,
  onBulkStatusChange,
  onBulkReadinessChange,
  onDeleteRequest,
  onMassDeleteRequest,
  showTransporterColumn = false,
  searchQuery = '',
  statusFilter = 'ALL',
  readinessFilter = 'ALL',
  depoFilter = 'ALL',
  selectedVendorFilter = 'ALL',
  onResetFilters,
  onOpenAddModal,
  operationalDate,
  lastConfirmedTime,
}) => {
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Floating Note Modal for "Tidak Ready"
  const [floatingNoteTruck, setFloatingNoteTruck] = useState<TruckRecord | null>(null);
  const [floatingNoteText, setFloatingNoteText] = useState('');
  const [isNoteModalInEditMode, setIsNoteModalInEditMode] = useState(false);

  const handleOpenNoteModal = (truck: TruckRecord) => {
    const existingNote = rowStates[truck.id]?.keterangan || '';
    setFloatingNoteTruck(truck);
    setFloatingNoteText(existingNote);
    // If note already exists, open in locked view mode; otherwise in edit mode
    setIsNoteModalInEditMode(!existingNote);
  };

  const handleSaveFloatingNote = () => {
    if (!floatingNoteTruck) return;
    const noteText = floatingNoteText.trim();
    const newReadiness: ReadinessStatus = 'Tidak Ready';
    const autoKeterangan = resolveOperationalKeterangan({
      action: 'set_readiness',
      prevTruck: floatingNoteTruck,
      newKesiapan: newReadiness,
      customNote: noteText,
    });

    setRowStates((prev) => ({
      ...prev,
      [floatingNoteTruck.id]: {
        ...(prev[floatingNoteTruck.id] || {
          nomorPolisi: floatingNoteTruck.nomorPolisi,
          namaSopir: floatingNoteTruck.namaSopir,
          kapasitas: floatingNoteTruck.kapasitas,
          status: floatingNoteTruck.status,
          depo: floatingNoteTruck.depo || 'Karawang',
          saveStatus: 'idle',
        }),
        kesiapan: newReadiness,
        keterangan: autoKeterangan,
      },
    }));

    triggerSave(floatingNoteTruck.id, {
      kesiapan: newReadiness,
      keterangan: autoKeterangan,
    });

    setIsNoteModalInEditMode(false);
    setFloatingNoteTruck(null);
  };

  const handleDeleteFloatingNote = () => {
    if (!floatingNoteTruck) return;
    handleFieldChange(floatingNoteTruck.id, 'keterangan', '');
    setFloatingNoteText('');
    setIsNoteModalInEditMode(true);
    setFloatingNoteTruck(null);
  };

  // Floating Confirmation for Status Aktif/Nonaktif
  const [statusConfirmTruck, setStatusConfirmTruck] = useState<TruckRecord | null>(null);

  const handleConfirmToggleStatus = () => {
    if (!statusConfirmTruck) return;
    handleToggleStatus(statusConfirmTruck.id);
    setStatusConfirmTruck(null);
  };

  // Floating Row Editor Modal (Role Transporter)
  const [editingTruck, setEditingTruck] = useState<TruckRecord | null>(null);
  const [editingRowIndex, setEditingRowIndex] = useState<number>(1);
  const [editDraft, setEditDraft] = useState<{
    nomorPolisi: string;
    namaSopir: string;
    kapasitas: string;
  }>({ nomorPolisi: '', namaSopir: '', kapasitas: '28' });

  const handleOpenRowEdit = (truck: TruckRecord, rowIndex: number = 1) => {
    if (isLocked) return;
    const currentRow = rowStates[truck.id] || {
      nomorPolisi: truck.nomorPolisi,
      namaSopir: truck.namaSopir,
      kapasitas: truck.kapasitas,
    };
    setEditingTruck(truck);
    setEditingRowIndex(rowIndex);
    setEditDraft({
      nomorPolisi: (currentRow.nomorPolisi || '').toUpperCase(),
      namaSopir: (currentRow.namaSopir || '').toUpperCase(),
      kapasitas: String(currentRow.kapasitas || '28').replace(/\D/g, '') || '28',
    });
  };

  const handleSaveRowEdit = () => {
    if (!editingTruck) return;
    const cleanNopol = editDraft.nomorPolisi.trim().toUpperCase();
    const cleanSopir = editDraft.namaSopir.trim().toUpperCase();
    const cleanKap = editDraft.kapasitas.replace(/\D/g, '') || '28';

    const currentRow = rowStates[editingTruck.id] || {
      status: editingTruck.status,
      kesiapan: editingTruck.kesiapan || 'Ready',
      keterangan: editingTruck.keterangan || '',
      depo: editingTruck.depo || 'Karawang',
      saveStatus: 'idle',
    };

    const autoKeterangan = resolveOperationalKeterangan({
      action: 'edit_row',
      prevTruck: editingTruck,
      newNopol: cleanNopol,
      newSopir: cleanSopir,
      newStatus: currentRow.status,
      newKesiapan: currentRow.kesiapan,
      customNote: currentRow.keterangan,
    });

    setRowStates((prev) => ({
      ...prev,
      [editingTruck.id]: {
        ...currentRow,
        nomorPolisi: cleanNopol,
        namaSopir: cleanSopir,
        kapasitas: cleanKap,
        keterangan: autoKeterangan,
      },
    }));

    triggerSave(editingTruck.id, {
      nomorPolisi: cleanNopol,
      namaSopir: cleanSopir,
      kapasitas: cleanKap,
      keterangan: autoKeterangan,
    });

    setEditingTruck(null);
  };

  // Keyboard shortcut: Escape to close Floating Row Editor
  useEffect(() => {
    if (!editingTruck) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingTruck(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingTruck]);

  // Keyboard shortcut: Escape / Enter for status confirmation
  useEffect(() => {
    if (!statusConfirmTruck) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStatusConfirmTruck(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirmToggleStatus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [statusConfirmTruck]);

  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const fadeTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // Sync internal state when trucks prop changes
  useEffect(() => {
    setRowStates((prev) => {
      const next = { ...prev };
      trucks.forEach((t) => {
        const cleanKap = String(t.kapasitas || '28').replace(/\D/g, '') || '28';
        const cleanSopir = (t.namaSopir || '').trim();
        const cleanKesiapan: ReadinessStatus = t.kesiapan || (t.status === 'Nonaktif' ? 'Tidak Ready' : 'Ready');
        const cleanKeterangan = t.keterangan || '';
        const cleanDepo = t.depo || 'Karawang';

        if (!next[t.id]) {
          next[t.id] = {
            nomorPolisi: t.nomorPolisi,
            namaSopir: cleanSopir,
            kapasitas: cleanKap,
            status: t.status,
            kesiapan: cleanKesiapan,
            keterangan: cleanKeterangan,
            depo: cleanDepo,
            saveStatus: 'idle',
          };
        } else {
          if (next[t.id].saveStatus === 'idle') {
            next[t.id] = {
              ...next[t.id],
              nomorPolisi: t.nomorPolisi,
              namaSopir: cleanSopir,
              kapasitas: cleanKap,
              status: t.status,
              kesiapan: cleanKesiapan,
              keterangan: cleanKeterangan,
              depo: cleanDepo,
            };
          }
        }
      });
      return next;
    });

    setSelectedIds((prev) => {
      const validIds = new Set<string>();
      prev.forEach((id) => {
        if (trucks.some((t) => t.id === id)) {
          validIds.add(id);
        }
      });
      return validIds;
    });
  }, [trucks]);

  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
      Object.values(fadeTimers.current).forEach(clearTimeout);
    };
  }, []);

  const triggerSave = useCallback(
    async (truckId: string, updatedFields: Partial<RowState>) => {
      const truckOriginal = trucks.find((t) => t.id === truckId);
      if (!truckOriginal) return;

      const currentState = rowStates[truckId] || {
        nomorPolisi: truckOriginal.nomorPolisi,
        namaSopir: truckOriginal.namaSopir,
        kapasitas: String(truckOriginal.kapasitas).replace(/\D/g, '') || '28',
        status: truckOriginal.status,
        kesiapan: truckOriginal.kesiapan || 'Ready',
        keterangan: truckOriginal.keterangan || '',
        depo: truckOriginal.depo || 'Karawang',
        saveStatus: 'idle',
      };

      const newState = { ...currentState, ...updatedFields };

      // JIKA KESIAPAN BERUBAH KE READY: RESET KETERANGAN
      if (updatedFields.kesiapan === 'Ready') {
        newState.keterangan = '';
      }

      // ATURAN 1: JIKA STATUS BERUBAH KE AKTIF: KESIAPAN OTOMATIS READY
      if (updatedFields.status === 'Aktif' && truckOriginal.status === 'Nonaktif') {
        newState.kesiapan = 'Ready';
        newState.keterangan = '';
      } else if (updatedFields.status === 'Nonaktif') {
        newState.kesiapan = 'Tidak Ready';
      }

      setRowStates((prev) => ({
        ...prev,
        [truckId]: {
          ...newState,
          saveStatus: 'saving',
        },
      }));

      const testKap = (updatedFields.kapasitas !== undefined ? updatedFields.kapasitas : newState.kapasitas).trim();
      const sanitizedKap = testKap && /^[1-9]\d*$/.test(testKap) ? testKap : '28';

      const payload: TruckRecord = {
        ...truckOriginal,
        depo: newState.depo || 'Karawang',
        nomorPolisi: newState.nomorPolisi.trim(),
        namaSopir: newState.namaSopir.trim(),
        kapasitas: sanitizedKap,
        status: newState.status,
        kesiapan: newState.kesiapan,
        keterangan: newState.keterangan.trim(),
        terakhirUpdate: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB',
      };

      const success = await onUpdateTruck(payload);

      setRowStates((prev) => ({
        ...prev,
        [truckId]: {
          ...newState,
          kapasitas: sanitizedKap,
          saveStatus: success ? 'saved' : 'error',
        },
      }));

      if (fadeTimers.current[truckId]) {
        clearTimeout(fadeTimers.current[truckId]);
      }
      fadeTimers.current[truckId] = setTimeout(() => {
        setRowStates((prev) => {
          if (!prev[truckId]) return prev;
          return {
            ...prev,
            [truckId]: {
              ...prev[truckId],
              saveStatus: 'idle',
            },
          };
        });
      }, 2500);
    },
    [trucks, rowStates, onUpdateTruck]
  );

  const handleFieldChange = (
    truckId: string,
    field: keyof RowState,
    value: string
  ) => {
    if (isLocked) return;

    const extraUpdates: Partial<RowState> = {};
    if (field === 'kesiapan' && value === 'Ready') {
      extraUpdates.keterangan = '';
    }
    // ATURAN 1: Ketika status diubah ke Aktif -> Kesiapan otomatis Ready
    if (field === 'status' && value === 'Aktif') {
      extraUpdates.kesiapan = 'Ready';
      extraUpdates.keterangan = '';
    } else if (field === 'status' && value === 'Nonaktif') {
      extraUpdates.kesiapan = 'Tidak Ready';
    }

    setRowStates((prev) => ({
      ...prev,
      [truckId]: {
        ...(prev[truckId] || {
          nomorPolisi: '',
          namaSopir: '',
          kapasitas: '28',
          status: 'Aktif',
          kesiapan: 'Ready',
          keterangan: '',
          depo: 'Karawang',
          saveStatus: 'idle',
        }),
        [field]: value,
        ...extraUpdates,
      },
    }));

    if (debounceTimers.current[truckId]) {
      clearTimeout(debounceTimers.current[truckId]);
    }

    debounceTimers.current[truckId] = setTimeout(() => {
      triggerSave(truckId, { [field]: value, ...extraUpdates });
    }, 700);
  };

  const handleToggleStatus = (truckId: string) => {
    if (isLocked) return;
    const currentStatus = rowStates[truckId]?.status || 'Aktif';
    const newStatus: TruckStatus = currentStatus === 'Aktif' ? 'Nonaktif' : 'Aktif';
    // ATURAN: Ketika dikembalikan menjadi Aktif -> Kesiapan otomatis Ready & keterangan kosong
    const newReadiness: ReadinessStatus = newStatus === 'Nonaktif' ? 'Tidak Ready' : 'Ready';
    const targetTruck = trucks.find((t) => t.id === truckId);
    const newKeterangan = resolveOperationalKeterangan({
      action: 'toggle_status',
      prevTruck: targetTruck,
      newStatus,
      newKesiapan: newReadiness,
      customNote: rowStates[truckId]?.keterangan,
    });

    setRowStates((prev) => ({
      ...prev,
      [truckId]: {
        ...prev[truckId],
        status: newStatus,
        kesiapan: newReadiness,
        keterangan: newKeterangan,
      },
    }));

    triggerSave(truckId, { status: newStatus, kesiapan: newReadiness, keterangan: newKeterangan });
  };

  const handleToggleReadiness = (truck: TruckRecord) => {
    if (isLocked) return;
    const currentReadiness = rowStates[truck.id]?.kesiapan || 'Ready';

    // JIKA STATUS SEKARANG ADALAH READY:
    // Jangan langsung ubah ke Tidak Ready!
    // Buka formulir catatan alasan terlebih dahulu.
    // Kesiapan baru berubah menjadi Tidak Ready ketika tombol simpan pada modal ditekan.
    // Jika dibatalkan / ditutup tanpa simpan, kesiapan tetap Ready.
    if (currentReadiness === 'Ready') {
      setFloatingNoteTruck(truck);
      setFloatingNoteText('');
      setIsNoteModalInEditMode(true);
      return;
    }

    // JIKA STATUS SEKARANG ADALAH TIDAK READY:
    // Mengembalikan ke Ready langsung dan mereset keterangan
    const newReadiness: ReadinessStatus = 'Ready';
    const newKeterangan = '';

    setRowStates((prev) => ({
      ...prev,
      [truck.id]: {
        ...prev[truck.id],
        kesiapan: newReadiness,
        keterangan: newKeterangan,
      },
    }));

    triggerSave(truck.id, { kesiapan: newReadiness, keterangan: newKeterangan });
  };

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedIds.size === trucks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(trucks.map((t) => t.id)));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBatchStatus = async (status: TruckStatus) => {
    if (isLocked || selectedIds.size === 0) return;
    setIsBulkUpdating(true);
    const ids = Array.from(selectedIds);
    const readiness: ReadinessStatus = status === 'Nonaktif' ? 'Tidak Ready' : 'Ready';
    const autoKeterangan = status === 'Nonaktif' ? '[Nonaktif]' : '';
    if (onBulkStatusChange) {
      await onBulkStatusChange(ids, status);
    } else {
      for (const id of ids) {
        await triggerSave(id, { status, kesiapan: readiness, keterangan: autoKeterangan });
      }
    }
    setIsBulkUpdating(false);
    setSelectedIds(new Set());
  };

  const handleBatchReadiness = async (readiness: ReadinessStatus) => {
    if (isLocked || selectedIds.size === 0) return;
    setIsBulkUpdating(true);
    const ids = Array.from(selectedIds);
    const autoKeterangan = readiness === 'Ready' ? '' : '[Tidak Ready]';
    if (onBulkReadinessChange) {
      await onBulkReadinessChange(ids, readiness);
    } else {
      for (const id of ids) {
        await triggerSave(id, { kesiapan: readiness, keterangan: autoKeterangan });
      }
    }
    setIsBulkUpdating(false);
    setSelectedIds(new Set());
  };

  const handleBatchDelete = () => {
    if (isLocked || selectedIds.size === 0) return;
    const toDelete = trucks.filter((t) => selectedIds.has(t.id));
    if (onMassDeleteRequest && toDelete.length > 0) {
      onMassDeleteRequest(toDelete);
    }
  };

  // Sort trucks strictly A-Z by driver name
  const sortedTrucks = [...trucks].sort((a, b) => {
    const nameA = (a.namaSopir || '').trim().toLowerCase();
    const nameB = (b.namaSopir || '').trim().toLowerCase();
    if (!nameA && !nameB) return a.nomorPolisi.localeCompare(b.nomorPolisi);
    if (!nameA) return 1;
    if (!nameB) return -1;
    return nameA.localeCompare(nameB);
  });

  if (trucks.length === 0) {
    return (
      <EmptyStateTrucks
        searchQuery={searchQuery}
        statusFilter={statusFilter}
        readinessFilter={readinessFilter}
        selectedVendorFilter={selectedVendorFilter}
        isLocked={isLocked}
        onResetFilters={onResetFilters}
        onOpenAddModal={onOpenAddModal}
      />
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col flex-1 min-h-0">
      {/* ========================================================================= */}
      {/* 1. TRANSPORTER VIEW: AKTIF TABLE (TOP) & NONAKTIF TABLE (SEPARATED BOTTOM) */}
      {/* ========================================================================= */}
      {!isAdmin ? (
        <div className="bg-white w-full border-y sm:border border-slate-200 overflow-hidden shadow-2xs flex-1 flex flex-col min-h-0">
          
          {/* Slim Elegant Locked Notification Bar */}
          {isLocked && (
            <div className="bg-slate-900 text-slate-200 text-xs py-1.5 px-3 border-b border-slate-800 flex items-center justify-between shrink-0 shadow-2xs">
              <span className="font-medium text-xs text-slate-200">
                Pengisian Terkunci (Batas Cut-Off 17:00 WIB) — Mode Hanya Baca
              </span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Akses edit dapat dibuka oleh Admin Distribusi
              </span>
            </div>
          )}

          {/* Compact Status Bar */}
          <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 flex items-center justify-between text-xs shrink-0 select-none">
            <span className="text-xs font-semibold text-slate-800">
              {formatWIBDateIndo(operationalDate)}
            </span>
            <div>
              {isConfirmedToday(lastConfirmedTime) ? (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Terkonfirmasi
                </span>
              ) : (
                <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Belum Konfirmasi
                </span>
              )}
            </div>
          </div>

          <div className="w-full overflow-y-auto overflow-x-hidden flex-1 max-h-[calc(100dvh-165px)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            
            {/* TABEL ARMADA AKTIF */}
            <table className="w-full table-fixed text-left border-collapse">
              <colgroup>
                <col className="w-5 sm:w-7" />
                <col className="w-[85px] sm:w-[115px]" />
                <col className="w-[70px] sm:w-[100px]" />
                <col className="w-[26px] sm:w-[34px]" />
                <col className="w-[24px] sm:w-[32px]" />
                <col className="w-[66px] sm:w-[82px]" />
              </colgroup>
              <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider select-none">
                <tr>
                  <th className="py-2 px-1 text-center">#</th>
                  <th className="py-2 px-1 whitespace-nowrap">No. Polisi</th>
                  <th className="py-2 px-1">Sopir</th>
                  <th className="py-2 px-1 text-center">Kap</th>
                  <th className="py-2 px-1 text-center" title="Status Armada: Aktif/Nonaktif">
                    Aktif
                  </th>
                  <th className="py-2 px-1 text-center">Kesiapan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {sortedTrucks
                  .filter((t) => (rowStates[t.id]?.status || t.status) === 'Aktif')
                  .map((truck, index) => {
                    const row = rowStates[truck.id] || {
                      nomorPolisi: truck.nomorPolisi,
                      namaSopir: truck.namaSopir,
                      kapasitas: truck.kapasitas,
                      status: truck.status,
                      kesiapan: truck.kesiapan || 'Ready',
                      keterangan: truck.keterangan || '',
                      depo: truck.depo || 'Karawang',
                      saveStatus: 'idle',
                    };
                    const isReady = row.kesiapan === 'Ready';

                    return (
                      <tr
                        key={truck.id}
                        onClick={() => !isLocked && handleOpenRowEdit(truck, index + 1)}
                        className={`transition-colors ${
                          !isLocked
                            ? 'cursor-pointer hover:bg-slate-50'
                            : 'hover:bg-slate-50/50'
                        }`}
                      >
                        {/* No */}
                        <td className="py-1.5 px-1 text-center font-mono text-[11px] text-slate-400 select-none">
                          {index + 1}
                        </td>

                        {/* Nomor Polisi */}
                        <td className="py-1.5 px-1">
                          <span className="font-mono font-semibold text-xs text-slate-900 block truncate">
                            {row.nomorPolisi || '-'}
                          </span>
                          {isConfirmedToday(truck.terakhirUpdate) && (
                            <div className="mt-0.5">
                              <span
                                className="text-[10px] font-mono text-emerald-700"
                                title={`Riwayat update: ${truck.terakhirUpdate}`}
                              >
                                {truck.terakhirUpdate.split(',')[1]?.trim() || truck.terakhirUpdate}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Nama Sopir */}
                        <td className="py-1.5 px-1">
                          <span
                            className="font-medium text-xs text-slate-800 block truncate uppercase"
                            title={row.namaSopir || 'Belum diisi'}
                          >
                            {row.namaSopir || <span className="text-slate-400 italic font-normal">-</span>}
                          </span>
                        </td>

                        {/* Kapasitas */}
                        <td className="py-1.5 px-1 text-center">
                          <span className="font-mono font-medium text-xs text-slate-700 block">
                            {row.kapasitas || '28'}
                          </span>
                        </td>

                        {/* Status Armada Toggle */}
                        <td className="py-1.5 px-1 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatusConfirmTruck(truck);
                            }}
                            disabled={isLocked}
                            title="Armada Aktif (Klik untuk Nonaktifkan)"
                            className="p-1 rounded-md hover:bg-slate-100 transition cursor-pointer inline-flex items-center justify-center text-emerald-600"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </td>

                        {/* Kesiapan Kirim */}
                        <td className="py-1.5 px-1 text-center">
                          {isReady ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleReadiness(truck);
                              }}
                              disabled={isLocked}
                              title="Status Ready (Klik untuk ubah ke Tidak Ready)"
                              className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium px-2.5 py-1 rounded-md transition cursor-pointer shadow-xs leading-none"
                            >
                              Ready
                            </button>
                          ) : (
                            <div className="inline-flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleReadiness(truck);
                                }}
                                disabled={isLocked}
                                title="Status Tidak Ready (Klik untuk ubah ke Ready)"
                                className="bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-medium px-2 py-1 rounded-md transition cursor-pointer shadow-xs leading-none"
                              >
                                Tidak
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenNoteModal(truck);
                                }}
                                title={
                                  row.keterangan
                                    ? `Alasan: "${row.keterangan}"`
                                    : 'Isi Alasan'
                                }
                                className={`p-1 rounded-md transition cursor-pointer shrink-0 border ${
                                  row.keterangan
                                    ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200'
                                    : 'text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200'
                                }`}
                              >
                                <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                  />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>

            {/* TABEL TERPISAH: ARMADA NONAKTIF */}
            {sortedTrucks.filter((t) => (rowStates[t.id]?.status || t.status) === 'Nonaktif').length > 0 && (
              <div className="mt-3 border-t border-slate-200 bg-slate-50/70">
                <div className="bg-slate-100 px-3 py-1.5 flex items-center justify-between border-b border-slate-200 select-none">
                  <span className="text-xs font-semibold text-slate-700">
                    Armada Nonaktif ({sortedTrucks.filter((t) => (rowStates[t.id]?.status || t.status) === 'Nonaktif').length} Truk)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Klik ✕ untuk aktifkan kembali
                  </span>
                </div>
                <table className="w-full table-fixed text-left border-collapse">
                  <colgroup>
                    <col className="w-5 sm:w-7" />
                    <col className="w-[85px] sm:w-[115px]" />
                    <col className="w-[70px] sm:w-[100px]" />
                    <col className="w-[26px] sm:w-[34px]" />
                    <col className="w-[24px] sm:w-[32px]" />
                    <col className="w-[66px] sm:w-[82px]" />
                  </colgroup>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    {sortedTrucks
                      .filter((t) => (rowStates[t.id]?.status || t.status) === 'Nonaktif')
                      .map((truck, index) => {
                        const row = rowStates[truck.id] || {
                          nomorPolisi: truck.nomorPolisi,
                          namaSopir: truck.namaSopir,
                          kapasitas: truck.kapasitas,
                          status: truck.status,
                          kesiapan: truck.kesiapan || 'Tidak Ready',
                          keterangan: truck.keterangan || '',
                          depo: truck.depo || 'Karawang',
                          saveStatus: 'idle',
                        };

                        return (
                          <tr
                            key={truck.id}
                            onClick={() => !isLocked && handleOpenRowEdit(truck, index + 1)}
                            className={`transition-colors ${
                              !isLocked
                                ? 'cursor-pointer hover:bg-slate-100'
                                : 'hover:bg-slate-100/50'
                            }`}
                          >
                            <td className="py-1.5 px-1 text-center font-mono text-[11px] text-slate-400 select-none">
                              {index + 1}
                            </td>
                            <td className="py-1.5 px-1">
                              <span className="font-mono font-medium text-xs text-slate-600 block truncate">
                                {row.nomorPolisi || '-'}
                              </span>
                            </td>
                            <td className="py-1.5 px-1">
                              <span className="font-medium text-xs text-slate-600 block truncate uppercase">
                                {row.namaSopir || '-'}
                              </span>
                            </td>
                            <td className="py-1.5 px-1 text-center">
                              <span className="font-mono font-medium text-xs text-slate-600 block">
                                {row.kapasitas || '28'}
                              </span>
                            </td>
                            <td className="py-1.5 px-1 text-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setStatusConfirmTruck(truck);
                                }}
                                disabled={isLocked}
                                title="Armada Nonaktif (Klik untuk Aktifkan kembali)"
                                className="p-1 rounded-md hover:bg-slate-200 transition cursor-pointer inline-flex items-center justify-center text-slate-400 hover:text-slate-700"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </td>
                            <td className="py-1.5 px-1 text-center">
                              <span className="text-[11px] font-medium text-slate-400">
                                Nonaktif
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* 2. ADMIN VIEW: COMPLETE ENTERPRISE TABLE WITH FULL CONTROLS & DEPO COLUMN  */
        /* ========================================================================= */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs flex-1 flex flex-col min-h-0">
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100dvh-200px)] flex-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-50 shadow-2xs border-b border-slate-200 text-slate-700 font-bold uppercase text-[11px] tracking-wider select-none">
                <tr>
                  <th className="py-3 px-3 w-10 text-center bg-slate-50">
                    <input
                      type="checkbox"
                      checked={trucks.length > 0 && selectedIds.size === trucks.length}
                      onChange={handleToggleSelectAll}
                      disabled={isLocked}
                      className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-2 w-12 text-center text-slate-500 bg-slate-50">No.</th>
                  {showTransporterColumn && <th className="py-3 px-3 w-28 bg-slate-50">Vendor</th>}
                  <th className="py-3 px-3 w-28 bg-slate-50">Depo (Lokasi)</th>
                  <th className="py-3 px-3 w-36 whitespace-nowrap bg-slate-50">Nomor Polisi</th>
                  <th className="py-3 px-3 w-40 bg-slate-50">Nama Sopir (A-Z)</th>
                  <th className="py-3 px-3 w-20 text-center bg-slate-50">Kapasitas</th>
                  <th className="py-3 px-3 w-24 text-center bg-slate-50">Status Armada</th>
                  <th className="py-3 px-3 w-32 text-center bg-slate-50">Kesiapan Kirim</th>
                  <th className="py-3 px-3 bg-slate-50">Keterangan</th>
                  <th className="py-3 px-3 w-28 text-right bg-slate-50">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {sortedTrucks.map((truck, index) => {
                  const row = rowStates[truck.id] || {
                    nomorPolisi: truck.nomorPolisi,
                    namaSopir: truck.namaSopir,
                    kapasitas: truck.kapasitas,
                    status: truck.status,
                    kesiapan: truck.kesiapan || 'Ready',
                    keterangan: truck.keterangan || '',
                    depo: truck.depo || 'Karawang',
                    saveStatus: 'idle',
                  };
                  const isSelected = selectedIds.has(truck.id);
                  const isReady = row.kesiapan === 'Ready';
                  const isAktif = row.status === 'Aktif';

                  return (
                    <tr
                      key={truck.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-red-50/40'
                          : !isAktif
                          ? 'bg-slate-50/60'
                          : 'hover:bg-slate-50/70'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(truck.id)}
                          disabled={isLocked}
                          className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
                        />
                      </td>

                      {/* Nomor Urut */}
                      <td className="py-2.5 px-2 text-center font-mono text-slate-500 font-bold text-xs">
                        {index + 1}
                      </td>

                      {/* Transporter (Admin Only) */}
                      {showTransporterColumn && (
                        <td className="py-2.5 px-3">
                          <span className="font-bold px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-800 border border-slate-200">
                            {truck.transporter}
                          </span>
                        </td>
                      )}

                      {/* Depo (Lokasi Audit) */}
                      <td className="py-2.5 px-3">
                        {isLocked ? (
                          <span className="font-semibold text-slate-800">{row.depo}</span>
                        ) : (
                          <select
                            value={row.depo}
                            onChange={(e) => handleFieldChange(truck.id, 'depo', e.target.value)}
                            className="px-2 py-1 rounded border border-transparent hover:border-slate-300 focus:border-red-500 focus:bg-white text-xs font-semibold text-slate-800 bg-transparent"
                          >
                            <option value="Karawang">Karawang</option>
                            <option value="Baros">Baros</option>
                            <option value="Cirebon">Cirebon</option>
                          </select>
                        )}
                      </td>

                      {/* Nomor Polisi */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap min-w-[100px]">
                        {isLocked ? (
                          <span>{row.nomorPolisi}</span>
                        ) : (
                          <input
                            type="text"
                            value={row.nomorPolisi}
                            onChange={(e) =>
                              handleFieldChange(truck.id, 'nomorPolisi', e.target.value.toUpperCase())
                            }
                            className="w-full px-2 py-1 rounded border border-transparent hover:border-slate-300 focus:border-red-500 focus:bg-white focus:outline-hidden font-mono font-bold text-xs"
                          />
                        )}
                      </td>

                      {/* Nama Sopir */}
                      <td className="py-2.5 px-3 text-slate-900">
                        {isLocked ? (
                          <span>{row.namaSopir || '-'}</span>
                        ) : (
                          <input
                            type="text"
                            value={row.namaSopir}
                            onChange={(e) =>
                              handleFieldChange(
                                truck.id,
                                'namaSopir',
                                e.target.value.trim().split(/\s+/)[0] || e.target.value
                              )
                            }
                            placeholder="Nama sopir"
                            className="w-full px-2 py-1 rounded border border-transparent hover:border-slate-300 focus:border-red-500 focus:bg-white focus:outline-hidden text-xs"
                          />
                        )}
                      </td>

                      {/* Kapasitas */}
                      <td className="py-2.5 px-3 text-center font-mono">
                        {isLocked ? (
                          <span className="font-bold text-slate-800">{row.kapasitas}</span>
                        ) : (
                          <input
                            type="text"
                            value={row.kapasitas}
                            onChange={(e) =>
                              handleFieldChange(truck.id, 'kapasitas', e.target.value.replace(/\D/g, ''))
                            }
                            className="w-16 px-1.5 py-1 text-center font-mono font-bold rounded border border-transparent hover:border-slate-300 focus:border-red-500 focus:bg-white focus:outline-hidden text-xs mx-auto"
                          />
                        )}
                      </td>

                      {/* Status Armada: Icon & Label */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(truck.id)}
                          disabled={isLocked}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer border ${
                            isAktif
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                              : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
                          }`}
                        >
                          {isAktif ? (
                            <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                          )}
                          <span>{isAktif ? 'Aktif' : 'Nonaktif'}</span>
                        </button>
                      </td>

                      {/* Kesiapan Kirim */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleReadiness(truck)}
                          disabled={isLocked}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer border ${
                            isReady
                              ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700 shadow-2xs'
                              : 'bg-red-600 hover:bg-red-700 text-white border-red-700 shadow-2xs'
                          }`}
                        >
                          {isReady ? 'READY' : 'TIDAK'}
                        </button>
                      </td>

                      {/* Keterangan */}
                      <td className="py-2.5 px-3">
                        {isLocked ? (
                          <span className="text-slate-600 text-xs">{row.keterangan || '-'}</span>
                        ) : (
                          <input
                            type="text"
                            value={row.keterangan}
                            onChange={(e) => handleFieldChange(truck.id, 'keterangan', e.target.value)}
                            placeholder="Tambah keterangan (opsional)..."
                            className="w-full px-2.5 py-1 rounded border border-transparent hover:border-slate-300 focus:border-red-500 focus:bg-white focus:outline-hidden text-xs text-slate-800 placeholder:text-slate-400"
                          />
                        )}
                      </td>

                      {/* Action Column */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {row.saveStatus === 'saving' && (
                            <span className="text-[10px] text-slate-400 font-medium">Menyimpan...</span>
                          )}
                          {row.saveStatus === 'saved' && (
                            <span className="text-[10px] text-emerald-600 font-medium">Tersimpan</span>
                          )}
                          {row.saveStatus === 'error' && (
                            <span className="text-[10px] text-red-600 font-medium">Gagal</span>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteRequest(truck)}
                            disabled={isLocked}
                            className="px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 rounded font-medium transition cursor-pointer"
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. FLOATING NOTE MODAL (POPOVER UNTUK ALASAN TIDAK READY)                  */}
      {/* ========================================================================= */}
      {floatingNoteTruck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full p-4 sm:p-5 text-left">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  Alasan Tidak Ready
                </span>
                <h3 className="font-mono font-semibold text-xs sm:text-sm text-slate-900 mt-1">
                  {floatingNoteTruck.nomorPolisi} ({floatingNoteTruck.namaSopir || 'Sopir'})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFloatingNoteTruck(null)}
                className="text-slate-400 hover:text-slate-700 text-xs px-1.5 py-0.5 rounded hover:bg-slate-100 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Terbagi antara Mode Terkunci (Lihat Alasan) & Mode Edit */}
            {!isNoteModalInEditMode && (rowStates[floatingNoteTruck.id]?.keterangan || floatingNoteText) ? (
              /* A. MODE TERKUNCI: TAMPILKAN ALASAN DENGAN ICON GEMBOK UNTUK BUKA KUNCINYA */
              <div className="mt-3.5 space-y-3">
                <div className="text-[11px] font-medium text-slate-600">
                  Alasan Terpilih:
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center justify-between gap-2 shadow-2xs">
                  <div className="text-xs font-semibold text-rose-700 bg-rose-50/80 border border-rose-200 px-2.5 py-1.5 rounded-md flex-1 truncate">
                    {floatingNoteText || rowStates[floatingNoteTruck.id]?.keterangan}
                  </div>

                  {/* Tombol Buka Kunci */}
                  <button
                    type="button"
                    onClick={() => setIsNoteModalInEditMode(true)}
                    title="Buka Kunci untuk Mengedit Alasan"
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-medium text-xs flex items-center gap-1 shadow-xs transition cursor-pointer shrink-0"
                  >
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    <span>Buka Kunci</span>
                  </button>
                </div>

                <div className="text-[11px] text-slate-500">
                  Alasan terkunci. Klik <strong>Buka Kunci</strong> jika ingin mengubah.
                </div>

                {/* Footer Mode Terkunci */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleDeleteFloatingNote}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    Hapus Alasan
                  </button>
                  <button
                    type="button"
                    onClick={() => setFloatingNoteTruck(null)}
                    className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-xs cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            ) : (
              /* B. MODE EDIT: PILIH ATAU KETIK ALASAN */
              <div className="mt-3.5 space-y-3">
                <label className="block text-xs font-medium text-slate-700">
                  Pilih atau Ketik Alasan:
                </label>

                {/* Quick Reason Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Servis di Bengkel',
                    'Perbaikan Rem',
                    'Ganti Ban & Oli',
                    'Sopir Izin Sakit',
                    'Uji KIR / STNK',
                    'Standby Cadangan',
                  ].map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setFloatingNoteText(reason)}
                      className={`text-[11px] px-2.5 py-1 rounded-md font-medium border transition cursor-pointer ${
                        floatingNoteText === reason
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  autoFocus
                  value={floatingNoteText}
                  onChange={(e) => setFloatingNoteText(e.target.value)}
                  placeholder="Ketik keterangan alasan..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 focus:border-red-500 focus:outline-hidden"
                />

                {/* Footer Mode Edit */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (rowStates[floatingNoteTruck.id]?.keterangan) {
                        setIsNoteModalInEditMode(false);
                      } else {
                        setFloatingNoteTruck(null);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveFloatingNote}
                    className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium shadow-xs cursor-pointer"
                  >
                    Simpan
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Floating Status Confirmation Modal */}
      {statusConfirmTruck && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setStatusConfirmTruck(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-slate-200 p-4 w-full max-w-sm animate-in zoom-in-95 duration-150 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs sm:text-sm font-medium text-slate-800">
              {(rowStates[statusConfirmTruck.id]?.status || statusConfirmTruck.status) === 'Aktif'
                ? `Nonaktifkan armada ${rowStates[statusConfirmTruck.id]?.nomorPolisi || statusConfirmTruck.nomorPolisi}?`
                : `Aktifkan kembali armada ${rowStates[statusConfirmTruck.id]?.nomorPolisi || statusConfirmTruck.nomorPolisi}?`}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStatusConfirmTruck(null)}
                title="Batal (Esc)"
                className="w-10 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 flex items-center justify-center font-bold text-sm transition cursor-pointer"
              >
                ✕
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleStatus}
                title="Konfirmasi (Enter)"
                className="w-12 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white flex items-center justify-center font-bold text-base shadow-xs transition cursor-pointer"
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ultra-Clean Floating Row Editor (Role Transporter) */}
      {editingTruck && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setEditingTruck(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-slate-200 p-2.5 sm:p-3 w-full max-w-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveRowEdit();
              }}
              className="flex flex-col gap-1 w-full"
            >
              {/* Baris 1: Data Armada [ 1 ] [ No. Polisi ] [ Nama Sopir ] [ Kapasitas ] */}
              <div className="flex items-center gap-1.5 sm:gap-2 w-full">
                {/* Kotak 1: Nomor Urut [ 1 ] */}
                <div className="shrink-0 w-8 sm:w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-mono font-medium text-xs sm:text-sm text-slate-700 select-none">
                  {editingRowIndex}
                </div>

                {/* Kotak 2: No. Polisi [ B 9322 UIP ] */}
                <input
                  type="text"
                  autoFocus
                  value={editDraft.nomorPolisi}
                  onChange={(e) =>
                    setEditDraft((prev) => ({
                      ...prev,
                      nomorPolisi: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="No. Polisi"
                  className="w-28 sm:w-36 h-10 px-2.5 sm:px-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-mono font-semibold text-xs sm:text-sm text-slate-900 uppercase transition outline-hidden"
                />

                {/* Kotak 3: Nama Sopir [ ADUNG TM KRW ] */}
                <input
                  type="text"
                  value={editDraft.namaSopir}
                  onChange={(e) =>
                    setEditDraft((prev) => ({
                      ...prev,
                      namaSopir: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="Nama Sopir"
                  className="flex-1 min-w-[110px] h-10 px-2.5 sm:px-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-medium text-xs sm:text-sm text-slate-800 uppercase transition outline-hidden"
                />

                {/* Kotak 4: Kapasitas [ 28 ] */}
                <input
                  type="text"
                  value={editDraft.kapasitas}
                  onChange={(e) =>
                    setEditDraft((prev) => ({
                      ...prev,
                      kapasitas: e.target.value.replace(/\D/g, ''),
                    }))
                  }
                  placeholder="KAP"
                  className="w-12 sm:w-16 h-10 px-1 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-mono font-semibold text-xs sm:text-sm text-center text-slate-900 transition outline-hidden"
                />
              </div>

              {/* Baris 2: Tombol Aksi di Bawahnya [ ✕ ] [ ✓ ] */}
              <div className="flex items-center justify-end gap-2 w-full pt-1.5 sm:pt-2">
                {/* [ ✕ ] : Tombol ikon silang untuk membatalkan perubahan atau menutup modal */}
                <button
                  type="button"
                  onClick={() => setEditingTruck(null)}
                  title="Batal (Esc)"
                  className="w-9 sm:w-10 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 flex items-center justify-center font-bold text-sm transition cursor-pointer"
                >
                  ✕
                </button>

                {/* [ ✓ ] : Tombol ikon centang biru untuk menyimpan perubahan */}
                <button
                  type="submit"
                  title="Simpan (Enter)"
                  className="w-12 sm:w-14 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white flex items-center justify-center font-bold text-base shadow-xs transition cursor-pointer"
                >
                  ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Batch Footer */}
      <FloatingBatchFooter
        selectedCount={selectedIds.size}
        isLocked={isLocked}
        isAdmin={isAdmin}
        isUpdating={isBulkUpdating}
        onSetStatus={handleBatchStatus}
        onSetReadiness={handleBatchReadiness}
        onMassDelete={handleBatchDelete}
        onClearSelection={() => setSelectedIds(new Set())}
      />
    </div>
  );
};
