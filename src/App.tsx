/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  UserRecord,
  TruckRecord,
  TruckStatus,
  ReadinessStatus,
  CutOffMode,
} from './types';
import {
  getLocalUsers,
  saveLocalUsers,
  getLocalTrucks,
  saveLocalTrucks,
  getStoredGasUrl,
  saveStoredGasUrl,
  getStoredConfirmedTimes,
  saveStoredConfirmedTimes,
  syncWithGoogleSheets,
  sendGasAction,
  getStoredSyncMode,
  saveStoredSyncMode,
  syncWithAppSheet,
  sendAppSheetAction,
  SyncMode,
  checkAndApplyDailyReset,
  getStoredDailyHistory,
  getStoredCutOffMode,
  saveStoredCutOffMode,
  saveSnapshotToDatabase,
  fetchSnapshotFromDatabase,
  downloadDateSnapshotCsv,
  STORAGE_KEYS,
} from './services/apiService';
import { INITIAL_USERS, INITIAL_TRUCKS, TRANSPORTER_NAMES } from './services/mockData';
import {
  formatWIBDateTime,
  formatWIBTime,
  isPastWIB17Cutoff,
  getWIBDateString,
  formatWIBDateIndo,
} from './utils/timeUtils';
import {
  generateWhatsAppMessage,
  generateMasterAdminWhatsAppMessage,
  openWhatsAppWithText,
} from './utils/whatsapp';
import { Navbar } from './components/Navbar';
import { AdminDashboard } from './components/AdminDashboard';
import { CutOffBanner } from './components/CutOffBanner';
import { QuickConfirmCard } from './components/QuickConfirmCard';
import { TruckInlineTable } from './components/TruckInlineTable';
import { AddTruckModal } from './components/AddTruckModal';
import { WeeklyEmailDrawer } from './components/WeeklyEmailDrawer';
import { ApiSettingsModal } from './components/ApiSettingsModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { UnauthorizedScreen } from './components/UnauthorizedScreen';
import { LoginScreen } from './components/LoginScreen';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { PWAInstallFloatingModal } from './components/PWAInstallFloatingModal';

export default function App() {
  // 1. Data States
  const [users, setUsers] = useState<UserRecord[]>(() => getLocalUsers());
  const [trucks, setTrucks] = useState<TruckRecord[]>(() => getLocalTrucks());
  const [gasUrl, setGasUrl] = useState<string>(() => getStoredGasUrl());
  const [syncMode, setSyncModeState] = useState<SyncMode>(() => getStoredSyncMode());
  const [appSheetApiDisabled, setAppSheetApiDisabled] = useState<boolean>(false);
  const [appSheetTableNotFound, setAppSheetTableNotFound] = useState<boolean>(false);
  const [lastConfirmedTimes, setLastConfirmedTimes] = useState<Record<string, string>>(
    () => getStoredConfirmedTimes()
  );

  // Date selection state: defaults to today's WIB date (YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(() => getWIBDateString());
  const isHistoricalView = selectedDate !== getWIBDateString();

  // Startup check: automatic daily reset of readiness status
  useEffect(() => {
    const { trucks: refreshed, didReset } = checkAndApplyDailyReset(trucks);
    if (didReset) {
      setTrucks(refreshed);
      showToast('Status kesiapan armada telah direset untuk konfirmasi hari ini.', 'info');
    }
  }, []);

  const handleSetSyncMode = (mode: SyncMode) => {
    setSyncModeState(mode);
    saveStoredSyncMode(mode);
  };

  // 2. Authentication & Session State
  const [sessionUser, setSessionUser] = useState<UserRecord | null>(() => {
    try {
      const stored = localStorage.getItem('LOGISTICS_AUTH');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return null;
  });

  const [activeUser, setActiveUser] = useState<UserRecord>(() => {
    try {
      const stored = localStorage.getItem('LOGISTICS_AUTH');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return users[0] || INITIAL_USERS[0];
  });
  const [unauthorizedCode, setUnauthorizedCode] = useState<string | null>(null);

  // 3. Cut-Off Time & Clock state (persisted in localStorage)
  const [cutOffMode, setCutOffModeState] = useState<CutOffMode>(() => getStoredCutOffMode());
  const setCutOffMode = (mode: CutOffMode) => {
    setCutOffModeState(mode);
    saveStoredCutOffMode(mode);
  };
  const [wibClock, setWibClock] = useState<string>(formatWIBTime());

  // 4. Modals and Filter states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [isFleetModalOpen, setIsFleetModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [truckToDelete, setTruckToDelete] = useState<TruckRecord | null>(null);
  const [massTrucksToDelete, setMassTrucksToDelete] = useState<TruckRecord[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const [isSyncingLive, setIsSyncingLive] = useState(false);

  const handleOpenFleetModal = useCallback((vendorCode?: string, depoName?: string) => {
    if (vendorCode) setSelectedVendorFilter(vendorCode);
    if (depoName) setDepoFilter(depoName as any);
    setIsFleetModalOpen(true);
  }, []);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Aktif' | 'Nonaktif'>('ALL');
  const [readinessFilter, setReadinessFilter] = useState<'ALL' | 'Ready' | 'Tidak Ready'>('ALL');
  const [depoFilter, setDepoFilter] = useState<'ALL' | 'Karawang' | 'Baros' | 'Cirebon'>('ALL');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('ALL');

  // Floating Toast & Centered Notification state
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
    isCentered?: boolean;
    title?: string;
  } | null>(null);

  const showToast = useCallback(
    (
      message: string,
      type: 'success' | 'error' | 'info' = 'success',
      options?: { isCentered?: boolean; title?: string }
    ) => {
      setToast({
        message,
        type,
        isCentered: options?.isCentered,
        title: options?.title,
      });
      const duration = options?.isCentered ? 2500 : 3500;
      setTimeout(() => {
        setToast((current) => (current?.message === message ? null : current));
      }, duration);
    },
    []
  );

  // Smooth White Floating Update Modal: Loading -> Success -> Redirect to WhatsApp
  const [floatingUpdateModal, setFloatingUpdateModal] = useState<{
    show: boolean;
    status: 'loading' | 'success';
    title: string;
    subtitle: string;
  } | null>(null);

  // Database Persistent Historical Trucks Cache by Date
  const [dbHistoricalTrucks, setDbHistoricalTrucks] = useState<Record<string, TruckRecord[]>>({});

  // Add ESC key listener for floating fleet modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFleetModalOpen) {
        setIsFleetModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFleetModalOpen]);

  // Update clock every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setWibClock(formatWIBTime());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Handler to fetch trucks from AppSheet REST API
  const handleSyncAppSheet = useCallback(async (customTableName?: string, isSilent: boolean = false): Promise<{
    success: boolean;
    message?: string;
    isApiDisabled?: boolean;
    isTableNotFound?: boolean;
    tableName?: string;
  }> => {
    setIsSyncingLive(true);
    let outcome = { success: false, message: '', isApiDisabled: false, isTableNotFound: false, tableName: '' };
    try {
      const res = await syncWithAppSheet(customTableName);
      outcome = {
        success: res.success,
        message: res.message || '',
        isApiDisabled: Boolean(res.isApiDisabled),
        isTableNotFound: Boolean(res.isTableNotFound),
        tableName: res.tableName || '',
      };

      if (res.success && res.trucks && res.trucks.length > 0) {
        setTrucks(res.trucks);
        saveLocalTrucks(res.trucks);
        setAppSheetApiDisabled(false);
        setAppSheetTableNotFound(false);
        if (!isSilent) {
          showToast(
            `${res.trucks.length} unit armada berhasil disinkronkan (${res.tableName})`,
            'success',
            { isCentered: true, title: 'AppSheet Terhubung' }
          );
        }
      } else if (res.isTableNotFound) {
        setAppSheetTableNotFound(true);
      } else if (res.isApiDisabled) {
        setAppSheetApiDisabled(true);
      }
    } finally {
      setIsSyncingLive(false);
    }
    return outcome;
  }, [showToast]);

  // Initial load: Attempt to sync with AppSheet if in appsheet mode
  useEffect(() => {
    if (syncMode === 'appsheet') {
      handleSyncAppSheet();
    }
  }, [syncMode, handleSyncAppSheet]);

  // Auto-sync berkala (setiap 30 detik) dan saat window/tab kembali aktif (focus)
  // Menjamin jika ada penambahan atau pengurangan armada di AppSheet / Spreadsheet,
  // data langsung termuat dan terbarui otomatis di aplikasi SIAPIN.
  useEffect(() => {
    if (syncMode !== 'appsheet') return;

    // Polling silent setiap 30 detik untuk deteksi penambahan/pengurangan di spreadsheet
    const interval = setInterval(() => {
      handleSyncAppSheet(undefined, true);
    }, 30000);

    // Auto-sync saat pengguna kembali ke tab aplikasi setelah mengedit di spreadsheet
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        handleSyncAppSheet(undefined, true);
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [syncMode, handleSyncAppSheet]);

  // Check URL query parameter `?t=...` on mount and popstate
  const processQueryParam = useCallback(
    (currentUsersList: UserRecord[]) => {
      const params = new URLSearchParams(window.location.search);
      const tParam = params.get('t')?.trim().toUpperCase();

      if (!tParam) {
        setUnauthorizedCode(null);
        return;
      }

      if (tParam === 'ADMIN') {
        const adminUser = currentUsersList.find((u) => u.role === 'admin' || u.kodeTransporter === 'ALL');
        if (adminUser) {
          setActiveUser(adminUser);
          setUnauthorizedCode(null);
          return;
        }
      }

      const matched = currentUsersList.find(
        (u) => u.kodeTransporter.toUpperCase() === tParam
      );

      if (matched) {
        setActiveUser(matched);
        setUnauthorizedCode(null);
      } else {
        setUnauthorizedCode(tParam);
      }
    },
    []
  );

  useEffect(() => {
    processQueryParam(users);

    const handlePopState = () => {
      processQueryParam(users);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [processQueryParam, users]);

  const handleSelectUser = (user: UserRecord) => {
    setActiveUser(user);
    setSessionUser(user);
    localStorage.setItem('LOGISTICS_AUTH', JSON.stringify(user));
    const url = new URL(window.location.href);
    if (user.role === 'admin' || user.kodeTransporter === 'ALL') {
      url.searchParams.set('t', 'ADMIN');
    } else {
      url.searchParams.set('t', user.kodeTransporter);
    }
    window.history.pushState({}, '', url.toString());
  };

  const handleLogin = (user: UserRecord) => {
    setSessionUser(user);
    setActiveUser(user);
    localStorage.setItem('LOGISTICS_AUTH', JSON.stringify(user));
    if (user.role === 'transporter') {
      setSelectedVendorFilter(user.kodeTransporter);
      if (user.depo) setDepoFilter(user.depo as any);
    } else {
      setSelectedVendorFilter('ALL');
    }
    const url = new URL(window.location.href);
    if (user.role === 'admin') {
      url.searchParams.set('t', 'ADMIN');
    } else {
      url.searchParams.set('t', user.kodeTransporter);
    }
    window.history.pushState({}, '', url.toString());
    showToast(`Berhasil masuk sebagai ${user.namaTransporter}`, 'success');
  };

  const handleLogout = () => {
    localStorage.removeItem('LOGISTICS_AUTH');
    setSessionUser(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('t');
    window.history.pushState({}, '', url.toString());
    showToast('Anda telah keluar dari sesi.', 'info');
  };

  // Determine if editing is locked based on cutOffMode, time, and historical archive view
  const isLocked = useMemo(() => {
    if (isHistoricalView) return true; // Archive view is read-only
    if (cutOffMode === 'locked') return true;
    if (cutOffMode === 'unlocked') return false;
    return isPastWIB17Cutoff();
  }, [cutOffMode, isHistoricalView]);

  // Daily history snapshot for historical viewing
  const dailyHistory = useMemo(() => getStoredDailyHistory(), [selectedDate, trucks]);
  const historyForDate = isHistoricalView ? dailyHistory[selectedDate] : null;

  // Load historical snapshot directly from server database when viewing past date
  useEffect(() => {
    if (isHistoricalView && selectedDate && !dbHistoricalTrucks[selectedDate]) {
      fetchSnapshotFromDatabase(selectedDate).then((res) => {
        if (res.success && Array.isArray(res.trucks) && res.trucks.length > 0) {
          setDbHistoricalTrucks((prev) => ({ ...prev, [selectedDate]: res.trucks! }));
        }
      });
    }
  }, [isHistoricalView, selectedDate, dbHistoricalTrucks]);

  // Persist live snapshot of today to database periodically or when trucks are updated
  useEffect(() => {
    if (trucks.length > 0) {
      saveSnapshotToDatabase(getWIBDateString(), trucks).catch(() => {});
    }
  }, [trucks]);

  // Effective trucks based on live data vs database historical archive
  const effectiveTrucks = useMemo(() => {
    if (!isHistoricalView) return trucks;
    // 1. Prioritaskan data snapshot resmi dari database server
    if (dbHistoricalTrucks[selectedDate] && dbHistoricalTrucks[selectedDate].length > 0) {
      return dbHistoricalTrucks[selectedDate];
    }
    // 2. Fallback cadangan dari local history snapshot
    if (historyForDate) {
      return trucks.map((t) => {
        const hist = historyForDate[t.id];
        if (hist) {
          return {
            ...t,
            kesiapan: hist.kesiapan,
            keterangan: hist.keterangan,
            terakhirUpdate: hist.terakhirUpdate,
            status: hist.status || t.status,
          };
        }
        return t;
      });
    }
    return trucks;
  }, [trucks, isHistoricalView, selectedDate, dbHistoricalTrucks, historyForDate]);

  // Download snapshot report for specific date (Excel/CSV with BOM)
  const handleDownloadDateReport = useCallback((dateStr: string) => {
    const targetDate = dateStr || selectedDate || getWIBDateString();
    if (targetDate === getWIBDateString()) {
      saveSnapshotToDatabase(targetDate, trucks).finally(() => {
        downloadDateSnapshotCsv(targetDate);
      });
    } else {
      downloadDateSnapshotCsv(targetDate);
    }
    showToast(`Mengunduh rekap armada (${targetDate})`, 'success');
  }, [selectedDate, trucks, showToast]);

  // Filter trucks based on access control, vendor tab, search, status, and readiness
  const visibleTrucks = useMemo(() => {
    return effectiveTrucks.filter((t) => {
      // 1. Strict Transporter Access Control (Filter by Transporter AND Depo)
      if (activeUser.role === 'transporter') {
        if (t.transporter !== activeUser.kodeTransporter) {
          return false;
        }
        if (activeUser.depo && (t.depo || 'Karawang').toLowerCase() !== activeUser.depo.toLowerCase()) {
          return false;
        }
      } else if (activeUser.role === 'admin') {
        if (selectedVendorFilter !== 'ALL' && t.transporter !== selectedVendorFilter) {
          return false;
        }
      }

      // 2. Status filter
      if (statusFilter !== 'ALL' && t.status !== statusFilter) {
        return false;
      }

      // 3. Readiness filter
      if (readinessFilter !== 'ALL' && (t.kesiapan || 'Ready') !== readinessFilter) {
        return false;
      }

      // 4. Depo filter (Lokasi Audit)
      if (depoFilter !== 'ALL' && (t.depo || 'Karawang') !== depoFilter) {
        return false;
      }

      // 5. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPlat = t.nomorPolisi.toLowerCase().includes(q);
        const matchesSopir = t.namaSopir.toLowerCase().includes(q);
        const matchesKapasitas = t.kapasitas.toLowerCase().includes(q);
        const matchesVendor = t.transporter.toLowerCase().includes(q);
        const matchesDepo = (t.depo || '').toLowerCase().includes(q);
        const matchesKet = (t.keterangan || '').toLowerCase().includes(q);
        if (!matchesPlat && !matchesSopir && !matchesKapasitas && !matchesVendor && !matchesDepo && !matchesKet) {
          return false;
        }
      }

      return true;
    });
  }, [trucks, activeUser, selectedVendorFilter, statusFilter, readinessFilter, depoFilter, searchQuery]);

  // Trucks belonging strictly to current context (for Quick Confirm card)
  const currentContextTrucks = useMemo(() => {
    if (activeUser.role === 'transporter') {
      return trucks.filter((t) => {
        if (t.transporter !== activeUser.kodeTransporter) return false;
        if (activeUser.depo && (t.depo || 'Karawang').toLowerCase() !== activeUser.depo.toLowerCase()) {
          return false;
        }
        return true;
      });
    }
    return trucks.filter((t) => {
      if (selectedVendorFilter !== 'ALL' && t.transporter !== selectedVendorFilter) {
        return false;
      }
      if (depoFilter !== 'ALL' && (t.depo || 'Karawang').toLowerCase() !== depoFilter.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [trucks, activeUser, selectedVendorFilter, depoFilter]);

  // Handler to update a single truck
  const handleUpdateTruck = async (updatedTruck: TruckRecord): Promise<boolean> => {
    if (isLocked) {
      showToast('Akses terkunci: Cut-Off 17:00 WIB', 'error');
      return false;
    }

    const existing = trucks.find((t) => t.id === updatedTruck.id);
    let finalKesiapan = updatedTruck.kesiapan;
    let finalKeterangan = updatedTruck.keterangan || '';

    // ATURAN 1: Ketika armada Nonaktif dikembalikan menjadi Aktif -> Kesiapan otomatis 'Ready'
    if (existing?.status === 'Nonaktif' && updatedTruck.status === 'Aktif') {
      finalKesiapan = 'Ready';
      finalKeterangan = '';
    } else if (updatedTruck.status === 'Nonaktif') {
      finalKesiapan = 'Tidak Ready';
    } else if (finalKesiapan === 'Ready') {
      finalKeterangan = '';
    }

    const timestamp = formatWIBDateTime();
    const truckWithTimestamp: TruckRecord = {
      ...updatedTruck,
      kesiapan: finalKesiapan,
      keterangan: finalKeterangan,
      kapasitas: String(updatedTruck.kapasitas).replace(/\D/g, '') || '28',
      terakhirUpdate: timestamp,
    };

    const nextTrucks = trucks.map((t) =>
      t.id === truckWithTimestamp.id ? truckWithTimestamp : t
    );

    setTrucks(nextTrucks);
    saveLocalTrucks(nextTrucks);

    setLastConfirmedTimes((prev) => {
      const next = { ...prev, [truckWithTimestamp.transporter]: timestamp };
      saveStoredConfirmedTimes(next);
      return next;
    });

    if (syncMode === 'appsheet') {
      sendAppSheetAction('updateTruck', { truck: truckWithTimestamp }).then((res) => {
        if (!res.success && res.message) {
          showToast(`Sinkronisasi AppSheet: ${res.message}`, 'error');
        }
      });
    } else if (gasUrl) {
      sendGasAction(gasUrl, { action: 'updateTruck', truck: truckWithTimestamp });
    }

    return true;
  };

  // Handle bulk status change for multiple selected trucks
  const handleBulkStatusChange = async (
    truckIds: string[],
    newStatus: TruckStatus
  ): Promise<boolean> => {
    if (isLocked) {
      showToast('Operasi ditolak: Akses terkunci cut-off 17:00 WIB', 'error');
      return false;
    }
    if (truckIds.length === 0) return false;

    const timestamp = formatWIBDateTime();
    const idSet = new Set(truckIds);
    const affectedTransporters = new Set<string>();

    const nextTrucks = trucks.map((t) => {
      if (idSet.has(t.id)) {
        affectedTransporters.add(t.transporter);
        const wasNonaktif = t.status === 'Nonaktif';
        let bulkKesiapan = t.kesiapan;
        let bulkKeterangan = t.keterangan || '';

        // ATURAN 1: Ketika armada Nonaktif diaktifkan kembali -> Kesiapan otomatis 'Ready'
        if (newStatus === 'Nonaktif') {
          bulkKesiapan = 'Tidak Ready';
        } else if (newStatus === 'Aktif' && wasNonaktif) {
          bulkKesiapan = 'Ready';
          bulkKeterangan = '';
        }

        return {
          ...t,
          status: newStatus,
          kesiapan: bulkKesiapan,
          keterangan: bulkKeterangan,
          terakhirUpdate: timestamp,
        };
      }
      return t;
    });

    setTrucks(nextTrucks);
    saveLocalTrucks(nextTrucks);

    setLastConfirmedTimes((prev) => {
      const next = { ...prev };
      affectedTransporters.forEach((code) => {
        next[code] = timestamp;
      });
      saveStoredConfirmedTimes(next);
      return next;
    });

    if (syncMode === 'appsheet') {
      const affected = nextTrucks.filter((t) => idSet.has(t.id));
      sendAppSheetAction('confirmAll', { trucks: affected });
    }

    showToast(`Status ${truckIds.length} unit berhasil diubah menjadi ${newStatus}`, 'success');
    return true;
  };

  // Handle bulk readiness change (Ready / Tidak Ready)
  const handleBulkReadinessChange = async (
    truckIds: string[],
    newReadiness: ReadinessStatus
  ): Promise<boolean> => {
    if (isLocked) {
      showToast('Operasi ditolak: Akses terkunci cut-off 17:00 WIB', 'error');
      return false;
    }
    if (truckIds.length === 0) return false;

    const timestamp = formatWIBDateTime();
    const idSet = new Set(truckIds);
    const affectedTransporters = new Set<string>();

    const nextTrucks = trucks.map((t) => {
      if (idSet.has(t.id)) {
        affectedTransporters.add(t.transporter);
        return {
          ...t,
          kesiapan: newReadiness,
          keterangan: newReadiness === 'Ready' ? '' : t.keterangan,
          terakhirUpdate: timestamp,
        };
      }
      return t;
    });

    setTrucks(nextTrucks);
    saveLocalTrucks(nextTrucks);

    setLastConfirmedTimes((prev) => {
      const next = { ...prev };
      affectedTransporters.forEach((code) => {
        next[code] = timestamp;
      });
      saveStoredConfirmedTimes(next);
      return next;
    });

    if (syncMode === 'appsheet') {
      const affected = nextTrucks.filter((t) => idSet.has(t.id));
      sendAppSheetAction('confirmAll', { trucks: affected });
    }

    showToast(`Kesiapan ${truckIds.length} unit berhasil diset menjadi ${newReadiness}`, 'success');
    return true;
  };

  // Handle adding new truck
  const handleAddTruck = (truckData: Omit<TruckRecord, 'id' | 'terakhirUpdate'>) => {
    if (isLocked) {
      showToast('Akses terkunci: Cut-Off 17:00 WIB', 'error');
      return;
    }

    const timestamp = formatWIBDateTime();
    const newTruck: TruckRecord = {
      ...truckData,
      id: `TRK-${Date.now().toString(36).toUpperCase()}`,
      terakhirUpdate: timestamp,
    };

    const nextTrucks = [newTruck, ...trucks];
    setTrucks(nextTrucks);
    saveLocalTrucks(nextTrucks);

    setLastConfirmedTimes((prev) => {
      const next = { ...prev, [newTruck.transporter]: timestamp };
      saveStoredConfirmedTimes(next);
      return next;
    });

    if (syncMode === 'appsheet') {
      sendAppSheetAction('addTruck', { truck: newTruck }).then(() => {
        handleSyncAppSheet(undefined, true);
      });
    }

    showToast(`Armada baru ${newTruck.nomorPolisi} berhasil didaftarkan`, 'success');
  };

  // Handle deleting truck (Admin only)
  const handleDeleteTruck = async (truckId: string) => {
    if (isLocked) {
      showToast('Akses terkunci: Cut-Off 17:00 WIB', 'error');
      return;
    }

    setIsDeleting(true);
    const nextTrucks = trucks.filter((t) => t.id !== truckId);
    setTrucks(nextTrucks);
    saveLocalTrucks(nextTrucks);

    if (syncMode === 'appsheet') {
      const target = trucks.find((t) => t.id === truckId);
      await sendAppSheetAction('deleteTruck', { truckId, nomorPolisi: target?.nomorPolisi });
      handleSyncAppSheet(undefined, true);
    }

    setIsDeleting(false);
    setTruckToDelete(null);
    showToast('Armada berhasil dihapus dari sistem', 'info');
  };

  // Handle mass deleting trucks (Admin only)
  const handleMassDeleteTrucks = async (truckIds: string[]) => {
    if (isLocked) {
      showToast('Akses terkunci: Cut-Off 17:00 WIB', 'error');
      return;
    }

    setIsDeleting(true);
    const idSet = new Set(truckIds);
    const nextTrucks = trucks.filter((t) => !idSet.has(t.id));
    setTrucks(nextTrucks);
    saveLocalTrucks(nextTrucks);

    if (syncMode === 'appsheet') {
      for (const id of truckIds) {
        const target = trucks.find((t) => t.id === id);
        await sendAppSheetAction('deleteTruck', { truckId: id, nomorPolisi: target?.nomorPolisi });
      }
      handleSyncAppSheet(undefined, true);
    }

    setIsDeleting(false);
    setMassTrucksToDelete(null);
    showToast(`${truckIds.length} unit armada berhasil dihapus`, 'info');
  };

  // Quick Action Button: "SIMPAN DATA & KIRIM WA"
  const handleConfirmAll = async () => {
    if (isLocked) {
      showToast('Tidak dapat konfirmasi saat cut-off terkunci (17:00 WIB)', 'error');
      return;
    }

    // 1. Tampilkan modal mengambang putih mulus (Fase Loading)
    setFloatingUpdateModal({
      show: true,
      status: 'loading',
      title: 'Memproses Pembaruan Data...',
      subtitle: 'Menyimpan data armada ke database server...',
    });

    setIsConfirmingAll(true);
    const targetTransporter =
      activeUser.role === 'transporter' ? activeUser.kodeTransporter : selectedVendorFilter;
    const targetDepo =
      activeUser.role === 'transporter' ? activeUser.depo : (depoFilter !== 'ALL' ? depoFilter : null);
    const timestamp = formatWIBDateTime();

    const isTargetScope = (t: TruckRecord) => {
      if (targetTransporter !== 'ALL' && t.transporter !== targetTransporter) return false;
      if (targetDepo && (t.depo || 'Karawang').toLowerCase() !== targetDepo.toLowerCase()) return false;
      return true;
    };

    const nextTrucks = trucks.map((t) => {
      if (isTargetScope(t)) {
        return { ...t, terakhirUpdate: timestamp };
      }
      return t;
    });

    setTrucks(nextTrucks);
    saveLocalTrucks(nextTrucks);

    setLastConfirmedTimes((prev) => {
      const next = { ...prev };
      if (targetTransporter === 'ALL') {
        ['TM', 'RJTM', 'WSS', 'SBR'].forEach((code) => {
          next[code] = timestamp;
          if (targetDepo) next[`${code}_${targetDepo}`] = timestamp;
        });
      } else {
        next[targetTransporter] = timestamp;
        if (targetDepo) next[`${targetTransporter}_${targetDepo}`] = timestamp;
      }
      saveStoredConfirmedTimes(next);
      return next;
    });

    if (syncMode === 'appsheet') {
      const affected = nextTrucks.filter(isTargetScope);
      const syncRes = await sendAppSheetAction('confirmAll', { trucks: affected });
      if (!syncRes.success && syncRes.message) {
        showToast(`Sinkronisasi AppSheet: ${syncRes.message}`, 'error');
      }
    }

    setIsConfirmingAll(false);

    // If Transporter: Transform to success phase then auto-navigate to native WhatsApp app!
    if (activeUser.role === 'transporter') {
      const targetTrucks = nextTrucks.filter(isTargetScope);
      const waText = generateWhatsAppMessage(
        activeUser.namaTransporter,
        activeUser.kodeTransporter,
        targetTrucks,
        activeUser.depo
      );

      // 2. Berubah ke Fase Berhasil
      setFloatingUpdateModal({
        show: true,
        status: 'success',
        title: 'Data Berhasil Disimpan!',
        subtitle: 'Membuka aplikasi WhatsApp...',
      });

      // 3. Jeda visual halus (650ms), lalu langsung luncurkan aplikasi WhatsApp
      setTimeout(() => {
        openWhatsAppWithText(waText);
        setFloatingUpdateModal(null);
      }, 650);
    } else {
      // Admin: Tampilkan status berhasil lalu tutup
      setFloatingUpdateModal({
        show: true,
        status: 'success',
        title: 'Data Berhasil Disimpan!',
        subtitle: 'Seluruh armada berhasil diperbarui ke server.',
      });
      setTimeout(() => {
        setFloatingUpdateModal(null);
      }, 750);
    }
  };

  // Export visible trucks to CSV
  const handleExportCsv = () => {
    const headers = [
      'No',
      'Transporter',
      'Depo (Lokasi Audit)',
      'Nomor Polisi',
      'Nama Sopir',
      'Kapasitas',
      'Status Armada',
      'Kesiapan Kirim',
      'Keterangan',
      'Terakhir Update',
    ];
    const rows = visibleTrucks.map((t, i) => [
      i + 1,
      t.transporter,
      t.depo || 'Karawang',
      t.nomorPolisi,
      t.namaSopir || '-',
      t.kapasitas,
      t.status,
      t.kesiapan || 'Ready',
      `"${(t.keterangan || '').replace(/"/g, '""')}"`,
      t.terakhirUpdate || '-',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kesiapan_armada_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Laporan CSV berhasil diunduh!', 'success');
  };

  const handleOpenMasterWhatsApp = () => {
    const msg = generateMasterAdminWhatsAppMessage(trucks, TRANSPORTER_NAMES);
    openWhatsAppWithText(msg);
  };

  const handleSaveGasUrl = async (url: string) => {
    setGasUrl(url);
    saveStoredGasUrl(url);
    if (!url) return { success: true, message: 'Beralih ke mode penyimpanan lokal browser.' };
    const result = await syncWithGoogleSheets(url);
    if (result.success && result.trucks) {
      setTrucks(result.trucks);
      saveLocalTrucks(result.trucks);
      showToast('Sinkronisasi Google Sheets berhasil!', 'success');
      return { success: true, message: 'Sinkronisasi berhasil!' };
    }
    return { success: false, message: result.message || 'Koneksi gagal' };
  };

  const handleResetData = async () => {
    // Reset confirmation times and clean truck readiness
    const emptyTimes: Record<string, string> = { TM: '', RJTM: '', WSS: '', SBR: '' };
    setLastConfirmedTimes(emptyTimes);
    saveStoredConfirmedTimes(emptyTimes);

    // Wipe local stored daily history
    try {
      localStorage.removeItem(STORAGE_KEYS.DAILY_HISTORY);
    } catch {}

    // Call server to wipe all historical snapshots & reset readiness cleanly
    try {
      await fetch('/api/admin/wipe-all-snapshots', { method: 'POST' });
      const res = await fetch('/api/admin/reset-readiness-clean', { method: 'POST' });
      const data = await res.json();
      if (data.success && Array.isArray(data.trucks) && data.trucks.length > 0) {
        setTrucks(data.trucks);
        saveLocalTrucks(data.trucks);
        showToast('Seluruh data tanggal sebelumnya & riwayat kesiapan berhasil dihapus total dari database.', 'success');
        return;
      }
    } catch {}

    // Fallback: clean current trucks
    const cleaned = trucks
      .filter((t) => !t.id?.startsWith('TRK-') && Boolean(t.nomorPolisi))
      .map((t) => ({
        ...t,
        kesiapan: (t.status === 'Nonaktif' ? 'Tidak Ready' : 'Ready') as ReadinessStatus,
        keterangan: '',
        terakhirUpdate: 'Belum update hari ini',
        tanggalUpdate: getWIBDateString(),
      }));
    setTrucks(cleaned);
    saveLocalTrucks(cleaned);
    showToast('Status update kesiapan hari ini telah dibersihkan.', 'success');
  };

  if (unauthorizedCode) {
    return (
      <UnauthorizedScreen
        attemptedCode={unauthorizedCode}
        availableUsers={users}
        onSelectUser={handleSelectUser}
      />
    );
  }

  // If not logged in, render the dedicated modern login screen
  if (!sessionUser) {
    return (
      <>
        <LoginScreen
          onLogin={handleLogin}
          defaultEmail="safaria347@gmail.com"
        />
        <PWAInstallFloatingModal />
      </>
    );
  }

  const activeTransporterCode =
    activeUser.role === 'transporter' ? activeUser.kodeTransporter : selectedVendorFilter;
  const activeTransporterDepo =
    activeUser.role === 'transporter' ? activeUser.depo : (depoFilter !== 'ALL' ? depoFilter : '');
  const depoKey = activeTransporterDepo ? `${activeTransporterCode}_${activeTransporterDepo}` : '';
  const activeTransporterName =
    activeUser.role === 'transporter'
      ? activeUser.namaTransporter
      : selectedVendorFilter === 'ALL'
      ? 'Semua Transporter'
      : TRANSPORTER_NAMES[selectedVendorFilter] || selectedVendorFilter;
  const currentLastConfirmed =
    (depoKey && lastConfirmedTimes[depoKey]) ||
    lastConfirmedTimes[activeTransporterCode] ||
    'Belum dikonfirmasi hari ini';

  const isAdmin = activeUser.role === 'admin';

  return (
    <div className="h-[100dvh] max-h-[100dvh] bg-slate-50 text-slate-900 flex flex-col font-sans overflow-hidden">
      {/* 1. Universal Top Navigation */}
      <Navbar
        currentUser={activeUser}
        users={users}
        onSelectUser={handleSelectUser}
        onLogout={handleLogout}
        isLocked={isLocked}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenEmailModal={() => setIsEmailModalOpen(true)}
        onOpenApiSettings={() => setIsApiModalOpen(true)}
        hasCustomGasUrl={Boolean(gasUrl)}
        selectedVendorFilter={selectedVendorFilter}
        onSelectVendorFilter={setSelectedVendorFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        readinessFilter={readinessFilter}
        onReadinessFilterChange={setReadinessFilter}
        depoFilter={depoFilter}
        onDepoFilterChange={setDepoFilter}
        trucks={trucks}
        onConfirmAll={handleConfirmAll}
        isConfirmingAll={isConfirmingAll}
        lastConfirmedTime={currentLastConfirmed}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-0 sm:px-4 py-0 sm:py-1 w-full flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* ========================================================================= */}
        {/* A. ADMIN VIEW: FULL 1-LAYAR DASHBOARD INTERAKTIF                          */}
        {/* ========================================================================= */}
        {isAdmin ? (
          <div className="w-full flex-1 min-h-0 overflow-y-auto px-0 md:px-4 py-0 md:py-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <AdminDashboard
              trucks={effectiveTrucks}
              cutOffMode={cutOffMode}
              onCutOffModeChange={setCutOffMode}
              isLocked={isLocked}
              wibClock={wibClock}
              selectedVendorFilter={selectedVendorFilter}
              onSelectVendorFilter={setSelectedVendorFilter}
              onOpenAddModal={() => setIsAddModalOpen(true)}
              onOpenEmailModal={() => setIsEmailModalOpen(true)}
              onOpenApiSettings={() => setIsApiModalOpen(true)}
              onSyncAppSheet={() => handleSyncAppSheet()}
              onExportCsv={handleExportCsv}
              onDownloadDateReport={handleDownloadDateReport}
              onForceSaveTodaySnapshot={async () => {
                await saveSnapshotToDatabase(getWIBDateString(), trucks);
                showToast('Snapshot hari ini berhasil disimpan ke database!', 'success');
              }}
              onOpenMasterWhatsApp={handleOpenMasterWhatsApp}
              onOpenFleetModal={handleOpenFleetModal}
              onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
              onResetReadiness={handleResetData}
              isSyncing={isSyncingLive}
              hasCustomGasUrl={Boolean(gasUrl)}
              lastConfirmedTimes={lastConfirmedTimes}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              readinessFilter={readinessFilter}
              onReadinessFilterChange={setReadinessFilter}
              depoFilter={depoFilter}
              onDepoFilterChange={setDepoFilter}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              isHistoricalView={isHistoricalView}
            />
          </div>
        ) : (
          /* ========================================================================= */
          /* B. TRANSPORTER VIEW: CLEAN, CONCISE, NO ADMIN CONTROLS, A-Z SORTED         */
          /* ========================================================================= */
          <>
            {/* Transporter Table: Sorted A-Z by driver name, numbered, NO delete action, Keterangan input enabled */}
            <TruckInlineTable
              trucks={visibleTrucks}
              isLocked={isLocked}
              isAdmin={false}
              onUpdateTruck={handleUpdateTruck}
              onBulkStatusChange={handleBulkStatusChange}
              onBulkReadinessChange={handleBulkReadinessChange}
              onDeleteRequest={() => {}} // No delete for transporter
              showTransporterColumn={false}
              searchQuery={searchQuery}
              statusFilter={statusFilter}
              readinessFilter={readinessFilter}
              depoFilter={depoFilter}
              selectedVendorFilter={activeUser.kodeTransporter}
              onResetFilters={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
                setReadinessFilter('ALL');
                setDepoFilter('ALL');
              }}
              onOpenAddModal={() => setIsAddModalOpen(true)}
              operationalDate={selectedDate}
              lastConfirmedTime={currentLastConfirmed}
            />
          </>
        )}
      </main>

      {/* Modals */}
      {isAddModalOpen && (
        <AddTruckModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAddTruck={handleAddTruck}
          activeTransporter={activeTransporterCode}
          isAdmin={isAdmin}
          availableTransporters={['TM', 'RJTM', 'WSS', 'SBR']}
        />
      )}

      {isEmailModalOpen && (
        <WeeklyEmailDrawer
          isOpen={isEmailModalOpen}
          onClose={() => setIsEmailModalOpen(false)}
          trucks={trucks}
          users={users}
          lastConfirmedTimes={lastConfirmedTimes}
        />
      )}

      {isApiModalOpen && (
        <ApiSettingsModal
          isOpen={isApiModalOpen}
          onClose={() => setIsApiModalOpen(false)}
          syncMode={syncMode}
          onSetSyncMode={handleSetSyncMode}
          currentGasUrl={gasUrl}
          onSaveGasUrl={handleSaveGasUrl}
          onSyncAppSheet={handleSyncAppSheet}
          onResetData={handleResetData}
          appSheetApiDisabled={appSheetApiDisabled}
        />
      )}

      {truckToDelete && (
        <DeleteConfirmModal
          isOpen={Boolean(truckToDelete)}
          truck={truckToDelete}
          onClose={() => setTruckToDelete(null)}
          onConfirm={handleDeleteTruck}
          isDeleting={isDeleting}
        />
      )}

      {massTrucksToDelete && (
        <DeleteConfirmModal
          isOpen={Boolean(massTrucksToDelete)}
          truck={null}
          massTrucks={massTrucksToDelete}
          onClose={() => setMassTrucksToDelete(null)}
          onConfirm={() => {}}
          onConfirmMass={handleMassDeleteTrucks}
          isDeleting={isDeleting}
        />
      )}

      {isChangePasswordModalOpen && (
        <ChangePasswordModal
          isOpen={isChangePasswordModalOpen}
          onClose={() => setIsChangePasswordModalOpen(false)}
          adminEmail={activeUser.email}
          onSuccess={(msg) => showToast(msg, 'success')}
        />
      )}

      {/* ========================================================================= */}
      {/* FLOATING FLEET TABLE MODAL (TAMPILAN MENGAMBANG SETELAH KLIK TRANSPORTER)  */}
      {/* ========================================================================= */}
      {isFleetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-7xl h-[92vh] max-h-[92vh] flex flex-col overflow-hidden text-left">
            
            {/* Modal Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between gap-3 border-b border-slate-700 shrink-0 select-none">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <div className="truncate">
                  <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-tight truncate">
                    {selectedVendorFilter === 'ALL'
                      ? 'Tabel Konsolidasi Semua Vendor (MD to Dealer)'
                      : `Tabel Armada: ${activeTransporterName} (${selectedVendorFilter})`}
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Menampilkan {visibleTrucks.length} unit armada sesuai filter aktif
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <span className="text-sm font-black leading-none">+</span>
                  <span>Tambah Truk</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFleetModalOpen(false)}
                  title="Tutup Tabel (ESC)"
                  className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition cursor-pointer flex items-center border border-white/20"
                >
                  <span>Tutup</span>
                </button>
              </div>
            </div>

            {/* Modal Filter Toolbar: BISA FILTER BERDASARKAN DEPO, VENDOR, STATUS, KESIAPAN, SEARCH */}
            <div className="bg-slate-100 border-b border-slate-200 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
              
              {/* Vendor Switcher Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                <span className="text-[10.5px] font-extrabold uppercase text-slate-500 mr-1 hidden sm:inline">
                  Vendor:
                </span>
                {['ALL', 'TM', 'RJTM', 'WSS', 'SBR'].map((vCode) => (
                  <button
                    key={vCode}
                    type="button"
                    onClick={() => setSelectedVendorFilter(vCode)}
                    className={`px-2.5 py-1 text-xs font-extrabold rounded-lg transition cursor-pointer shrink-0 ${
                      selectedVendorFilter === vCode
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                    }`}
                  >
                    {vCode === 'ALL' ? 'Semua' : vCode}
                  </button>
                ))}
              </div>

              {/* Filter Dropdowns & Search */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Filter Depo */}
                <select
                  value={depoFilter}
                  onChange={(e) => setDepoFilter(e.target.value as any)}
                  className="py-1 px-2 text-xs font-bold rounded-lg bg-white text-slate-800 border border-slate-300 focus:outline-hidden cursor-pointer"
                >
                  <option value="ALL">Semua Depo</option>
                  <option value="Karawang">Depo Karawang</option>
                  <option value="Baros">Depo Baros</option>
                  <option value="Cirebon">Depo Cirebon</option>
                </select>

                {/* Filter Kesiapan */}
                <select
                  value={readinessFilter}
                  onChange={(e) => setReadinessFilter(e.target.value as any)}
                  className="py-1 px-2 text-xs font-bold rounded-lg bg-white text-slate-800 border border-slate-300 focus:outline-hidden cursor-pointer"
                >
                  <option value="ALL">Kesiapan: Semua</option>
                  <option value="Ready">Ready</option>
                  <option value="Tidak Ready">Tidak Ready</option>
                </select>

                {/* Filter Status */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="py-1 px-2 text-xs font-bold rounded-lg bg-white text-slate-800 border border-slate-300 focus:outline-hidden cursor-pointer"
                >
                  <option value="ALL">Status: Semua</option>
                  <option value="Aktif">Aktif</option>
                  <option value="Nonaktif">Nonaktif</option>
                </select>

                {/* Live Search Input */}
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nopol / sopir..."
                    className="pl-2.5 pr-6 py-1 text-xs font-semibold rounded-lg bg-white text-slate-900 border border-slate-300 focus:border-red-500 focus:outline-hidden w-36 sm:w-44"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-1.5 text-slate-400 hover:text-slate-700 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

            </div>

            {/* Modal Body: Tabel Armada Lengkap */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-50">
              <TruckInlineTable
                trucks={visibleTrucks}
                isLocked={isLocked}
                isAdmin={true}
                onUpdateTruck={handleUpdateTruck}
                onBulkStatusChange={handleBulkStatusChange}
                onBulkReadinessChange={handleBulkReadinessChange}
                onDeleteRequest={(truck) => setTruckToDelete(truck)}
                onMassDeleteRequest={(trucks) => setMassTrucksToDelete(trucks)}
                showTransporterColumn={true}
                searchQuery={searchQuery}
                statusFilter={statusFilter}
                readinessFilter={readinessFilter}
                depoFilter={depoFilter}
                selectedVendorFilter={selectedVendorFilter}
                onResetFilters={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setReadinessFilter('ALL');
                  setDepoFilter('ALL');
                  setSelectedVendorFilter('ALL');
                }}
                onOpenAddModal={() => setIsAddModalOpen(true)}
                operationalDate={selectedDate}
                lastConfirmedTime={currentLastConfirmed}
              />
            </div>

          </div>
        </div>
      )}

      {/* Smooth White Floating Modal: Loading -> Success -> Auto-Redirect to WhatsApp */}
      {floatingUpdateModal && floatingUpdateModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs select-none animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 sm:p-7 shadow-xl border border-slate-100 max-w-xs sm:max-w-sm w-full flex flex-col items-center text-center space-y-4 transform animate-in zoom-in-95 duration-200">
            {floatingUpdateModal.status === 'loading' ? (
              <div className="relative flex items-center justify-center py-2">
                <div className="w-12 h-12 rounded-full border-3 border-slate-200 border-t-red-600 animate-spin" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-500 flex items-center justify-center text-emerald-600 shadow-xs py-2 animate-in zoom-in-75 duration-200">
                <svg className="w-6 h-6 fill-none stroke-current" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}

            <div>
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                {floatingUpdateModal.title}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                {floatingUpdateModal.subtitle}
              </p>
            </div>

            {/* Visual Indicator Line */}
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  floatingUpdateModal.status === 'loading'
                    ? 'w-2/3 bg-red-600 animate-pulse'
                    : 'w-full bg-emerald-500'
                }`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Floating PWA Install Prompt for Mobile & Desktop */}
      <PWAInstallFloatingModal />

      {/* Toast & Centered Floating Notification */}
      {toast && toast.isCentered ? (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50 px-4">
          <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-2xl px-5 py-3.5 flex items-center gap-3.5 max-w-sm w-auto animate-in fade-in zoom-in-95 duration-200 pointer-events-auto">
            <div className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-left min-w-0 pr-1">
              <div className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                {toast.title || 'AppSheet Terhubung'}
              </div>
              <div className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5 truncate">
                {toast.message}
              </div>
            </div>
          </div>
        </div>
      ) : toast && (
        <div className="fixed top-3 right-3 z-50 animate-in fade-in duration-200 pointer-events-none">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold border flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-white text-slate-900 border-slate-200'
                : toast.type === 'error'
                ? 'bg-red-900 text-red-100 border-red-700'
                : 'bg-slate-900 text-white border-slate-700'
            }`}
          >
            {toast.type === 'success' && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
