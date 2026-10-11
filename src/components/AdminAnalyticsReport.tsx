import React, { useState, useMemo, useEffect } from 'react';
import { TruckRecord } from '../types';
import { TRANSPORTER_NAMES } from '../services/mockData';
import { getWIBDateString, formatWIBDateIndo, getWIBDate } from '../utils/timeUtils';

interface AdminAnalyticsReportProps {
  trucks: TruckRecord[];
  onOpenShareModal?: () => void;
  onSelectVendorFilter?: (vendor: string) => void;
}

// Cek apakah tanggal adalah hari Minggu atau hari libur nasional
function checkHolidayOrSunday(dateStr: string): { isHoliday: boolean; label: string } {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      if (d.getDay() === 0) {
        return { isHoliday: true, label: 'Minggu' };
      }
      const mmdd = `${parts[1]}-${parts[2]}`;
      const nationalHolidays: Record<string, string> = {
        '01-01': 'Tahun Baru',
        '05-01': 'Hari Buruh',
        '06-01': 'Pancasila',
        '08-17': 'HUT RI',
        '12-25': 'Natal',
      };
      if (nationalHolidays[mmdd]) {
        return { isHoliday: true, label: nationalHolidays[mmdd] };
      }
    }
  } catch {}
  return { isHoliday: false, label: '' };
}

// Format bulan dan tahun dalam bahasa Indonesia
function getMonthYearIndo(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    const m = months[Number(parts[1]) - 1];
    return `${m} ${parts[0]}`;
  } catch {
    return dateStr;
  }
}

export const AdminAnalyticsReport: React.FC<AdminAnalyticsReportProps> = ({ trucks }) => {
  const todayStr = useMemo(() => getWIBDateString(), []);

  // 1. Filter Rentang Tanggal (Date Range)
  const defaultStart = useMemo(() => {
    try {
      const d = getWIBDate();
      d.setDate(d.getDate() - 6);
      return getWIBDateString(d);
    } catch {
      return todayStr;
    }
  }, [todayStr]);

  const [startDate, setStartDate] = useState<string>(defaultStart);
  const [endDate, setEndDate] = useState<string>(todayStr);

  // 2. Filter Transporter & Gudang
  const [selectedTransporter, setSelectedTransporter] = useState<string>('ALL');
  const [selectedDepo, setSelectedDepo] = useState<string>('ALL');

  // 3. State Data Multi-Snapshot dari Database
  const [snapshotsMap, setSnapshotsMap] = useState<Record<string, { trucks: TruckRecord[] }>>({});
  const [isLoadingRange, setIsLoadingRange] = useState<boolean>(false);
  const [downloadReady, setDownloadReady] = useState<{
    url: string;
    fileName: string;
    fileBlob: Blob;
    count: number;
  } | null>(null);

  // Ambil list tanggal lengkap di antara startDate dan endDate (inklusif)
  const dateRangeList = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return [];
    const list: string[] = [];
    try {
      const cur = new Date(startDate);
      const stop = new Date(endDate);
      while (cur <= stop) {
        list.push(getWIBDateString(cur));
        cur.setDate(cur.getDate() + 1);
      }
    } catch {}
    return list;
  }, [startDate, endDate]);

  // Nama Bulan yang Ditampilkan di Luar Tabel
  const displayMonthLabel = useMemo(() => {
    if (dateRangeList.length === 0) return 'Periode Kosong';
    const firstMonth = getMonthYearIndo(dateRangeList[0]);
    const lastMonth = getMonthYearIndo(dateRangeList[dateRangeList.length - 1]);
    if (firstMonth === lastMonth) {
      return `Bulan: ${firstMonth}`;
    }
    return `Periode: ${firstMonth} – ${lastMonth}`;
  }, [dateRangeList]);

  // Fetch data rentang tanggal dari /api/snapshots/range
  useEffect(() => {
    if (!startDate || !endDate) return;
    setIsLoadingRange(true);
    setDownloadReady(null);

    fetch(`/api/snapshots/range?start=${startDate}&end=${endDate}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.success && data.snapshots) {
          const map = { ...data.snapshots };
          if (dateRangeList.includes(todayStr) && (!map[todayStr] || !map[todayStr].trucks?.length)) {
            map[todayStr] = { trucks };
          }
          setSnapshotsMap(map);
        } else {
          const fallback: Record<string, { trucks: TruckRecord[] }> = {};
          if (dateRangeList.includes(todayStr)) {
            fallback[todayStr] = { trucks };
          }
          setSnapshotsMap(fallback);
        }
      })
      .catch(() => {
        const fallback: Record<string, { trucks: TruckRecord[] }> = {};
        if (dateRangeList.includes(todayStr)) {
          fallback[todayStr] = { trucks };
        }
        setSnapshotsMap(fallback);
      })
      .finally(() => setIsLoadingRange(false));
  }, [startDate, endDate, dateRangeList, todayStr, trucks]);

  // Kumpulkan seluruh data master truk unik dari semua tanggal dalam rentang
  const matrixData = useMemo(() => {
    const trucksMap = new Map<string, {
      nomorPolisi: string;
      transporter: string;
      depo: string;
      namaSopir: string;
      kapasitas: string;
      status: string;
      days: Record<string, {
        status: 'ready' | 'tidak' | 'libur' | 'nodata';
        keterangan: string;
      }>;
      readyCount: number;
      recordedDaysCount: number;
      percentage: number | null;
    }>();

    // Inisialisasi daftar armada dari props.trucks
    trucks.forEach((t) => {
      const plat = t.nomorPolisi?.trim();
      if (!plat) return;
      // Filter out dummy/mock trucks
      if (t.id && t.id.startsWith('TRK-')) return;

      trucksMap.set(plat, {
        nomorPolisi: plat,
        transporter: t.transporter,
        depo: t.depo || 'Karawang',
        namaSopir: t.namaSopir || '',
        kapasitas: t.kapasitas || '28',
        status: t.status || 'Aktif',
        days: {},
        readyCount: 0,
        recordedDaysCount: 0,
        percentage: null as number | null,
      });
    });


    // Evaluasi status setiap truk untuk setiap tanggal dalam rentang murni dari database
    trucksMap.forEach((truckObj, plat) => {
      let readyCount = 0;
      let recordedDaysCount = 0; // Hanya hitung hari yang benar-benar tercatat di database

      dateRangeList.forEach((dateStr) => {
        const holidayInfo = checkHolidayOrSunday(dateStr);

        // Jika hari Minggu atau tanggal merah
        if (holidayInfo.isHoliday) {
          truckObj.days[dateStr] = {
            status: 'libur',
            keterangan: holidayInfo.label,
          };
          return;
        }

        // Cek rekaman database pada tanggal ini
        const snap = snapshotsMap[dateStr];
        let foundTruck: TruckRecord | undefined;

        if (snap && Array.isArray(snap.trucks) && snap.trucks.length > 0) {
          foundTruck = snap.trucks.find(
            (item) => item.nomorPolisi?.trim().toLowerCase() === plat.toLowerCase()
          );
          if (foundTruck && foundTruck.terakhirUpdate === 'Belum update hari ini') {
            foundTruck = undefined;
          }
        } else if (dateStr === todayStr && trucks && trucks.length > 0) {
          foundTruck = trucks.find(
            (item) => item.nomorPolisi?.trim().toLowerCase() === plat.toLowerCase()
          );
          if (foundTruck && foundTruck.terakhirUpdate === 'Belum update hari ini') {
            foundTruck = undefined;
          }
        }

        if (foundTruck) {
          // Armada tercatat valid di database pada tanggal ini
          recordedDaysCount += 1;
          const isReady = foundTruck.kesiapan === 'Ready';
          if (isReady) {
            readyCount += 1;
            truckObj.days[dateStr] = {
              status: 'ready',
              keterangan: '',
            };
          } else {
            truckObj.days[dateStr] = {
              status: 'tidak',
              keterangan: foundTruck.keterangan || 'Kendala Teknis',
            };
          }
        } else {
          // Tanggal belum ada arsip di database atau armada tidak tercatat: KOSONGKAN (JANGAN DUMMY)
          truckObj.days[dateStr] = {
            status: 'nodata',
            keterangan: '',
          };
        }
      });

      truckObj.readyCount = readyCount;
      truckObj.recordedDaysCount = recordedDaysCount;
      // Persentase hanya dihitung jika ada hari yang tercatat data di database
      truckObj.percentage = recordedDaysCount > 0
        ? Math.round((readyCount / recordedDaysCount) * 100)
        : null;
    });

    return Array.from(trucksMap.values());
  }, [trucks, snapshotsMap, dateRangeList, todayStr]);

  // Filter matriks berdasarkan Transporter & Gudang
  const filteredMatrix = useMemo(() => {
    return matrixData.filter((t) => {
      if (selectedTransporter !== 'ALL' && t.transporter !== selectedTransporter) {
        return false;
      }
      if (selectedDepo !== 'ALL' && t.depo.toLowerCase() !== selectedDepo.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [matrixData, selectedTransporter, selectedDepo]);

  // Generate File Excel Matriks Berwarna Sesuai Spesifikasi Persis
  const handleExportColoredExcel = () => {
    const now = getWIBDate();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const fileName = `readinesstruk_${dd}-${mm}-${yyyy}.xls`;

    // Kolom-kolom tanggal angka murni (1, 2, 3...)
    const dateHeadersHtml = dateRangeList
      .map((d) => {
        const dayNumber = Number(d.split('-')[2]);
        const hol = checkHolidayOrSunday(d);
        if (hol.isHoliday) {
          return `<th style="width: 48px; background-color: #DC2626; color: #FFFFFF; font-weight: bold; border: 1px solid #B91C1C;">${dayNumber}</th>`;
        }
        return `<th style="width: 45px; background-color: #0F172A; color: #FFFFFF; font-weight: bold; border: 1px solid #334155;">${dayNumber}</th>`;
      })
      .join('');

    const rowsHtml = filteredMatrix
      .map((t, idx) => {
        const vendorName = TRANSPORTER_NAMES[t.transporter] || t.transporter;

        const dayCellsHtml = dateRangeList
          .map((d) => {
            const dayData = t.days[d];
            if (!dayData || dayData.status === 'nodata') {
              // Jika tidak ada catatan di database: KOSONGKAN TOTAL (tanpa warna & tanpa simbol)
              return `<td style="border: 1px solid #CBD5E1; text-align: center;"></td>`;
            }
            if (dayData.status === 'libur') {
              return `<td style="background-color: #E2E8F0; color: #64748B; text-align: center; font-weight: bold; border: 1px solid #CBD5E1;">-</td>`;
            }
            if (dayData.status === 'ready') {
              return `<td style="background-color: #DCFCE7; color: #166534; text-align: center; font-weight: bold; font-size: 11pt; border: 1px solid #CBD5E1;">✓</td>`;
            }
            // Tidak Ready: simbol x + keterangan kendala asli
            const ket = dayData.keterangan ? ` (${dayData.keterangan})` : '';
            return `<td style="background-color: #FEE2E2; color: #991B1B; text-align: center; font-weight: bold; font-size: 9pt; border: 1px solid #CBD5E1;">✗${ket}</td>`;
          })
          .join('');

        const percentText = t.percentage !== null ? `${t.percentage}%` : '-';
        const percentColor = t.percentage !== null
          ? (t.percentage >= 90 ? '#166534' : t.percentage >= 75 ? '#B45309' : '#991B1B')
          : '#64748B';

        return `
          <tr>
            <td style="text-align: center; border: 1px solid #CBD5E1;">${idx + 1}</td>
            <td style="font-family: monospace; font-weight: bold; border: 1px solid #CBD5E1; text-align: center;">${t.nomorPolisi}</td>
            <td style="border: 1px solid #CBD5E1;">${vendorName}</td>
            <td style="text-align: center; border: 1px solid #CBD5E1;">${t.depo}</td>
            <td style="border: 1px solid #CBD5E1;">${t.namaSopir || '-'}</td>
            ${dayCellsHtml}
            <td style="text-align: center; font-weight: bold; color: ${percentColor}; border: 1px solid #CBD5E1; background-color: #F8FAFC;">${percentText}</td>
          </tr>
        `;
      })
      .join('');

    const totalCols = 5 + dateRangeList.length + 1;

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"/>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Matriks Kesiapan Armada</x:Name>
                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; }
          .title { font-size: 15pt; font-weight: bold; color: #0F172A; text-align: left; }
          .month-badge { font-size: 12pt; font-weight: bold; color: #DC2626; margin-bottom: 6px; }
          .subtitle { font-size: 9.5pt; color: #475569; margin-bottom: 12px; }
          th { padding: 7px; text-align: center; }
          td { padding: 5px 8px; vertical-align: middle; }
        </style>
      </head>
      <body>
        <table>
          <tr><td colspan="${totalCols}" class="title">REKAP MATRIKS KESIAPAN ARMADA LOGISTIK MD TO DEALER</td></tr>
          <tr><td colspan="${totalCols}" class="month-badge">${displayMonthLabel}</td></tr>
          <tr><td colspan="${totalCols}" class="subtitle">Rentang Tanggal: ${formatWIBDateIndo(startDate)} s/d ${formatWIBDateIndo(endDate)} | Total Armada: ${filteredMatrix.length} Unit</td></tr>
          <tr><td colspan="${totalCols}"></td></tr>
          <thead>
            <tr>
              <th style="width: 40px; background-color: #0F172A; color: #FFFFFF; font-weight: bold; border: 1px solid #334155;">No</th>
              <th style="width: 115px; background-color: #0F172A; color: #FFFFFF; font-weight: bold; border: 1px solid #334155;">Nomor Polisi</th>
              <th style="width: 170px; background-color: #0F172A; color: #FFFFFF; font-weight: bold; border: 1px solid #334155;">Transporter</th>
              <th style="width: 110px; background-color: #0F172A; color: #FFFFFF; font-weight: bold; border: 1px solid #334155;">Depo</th>
              <th style="width: 160px; background-color: #0F172A; color: #FFFFFF; font-weight: bold; border: 1px solid #334155;">Nama Sopir</th>
              ${dateHeadersHtml}
              <th style="width: 90px; background-color: #0F172A; color: #FFFFFF; font-weight: bold; border: 1px solid #334155;">% Kesiapan</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    setDownloadReady({
      url,
      fileName,
      fileBlob: blob,
      count: filteredMatrix.length,
    });
  };

  // Bagikan File Langsung (Web Share API Native dengan Fallback WhatsApp)
  const handleShareFileDirect = async () => {
    if (!downloadReady) return;

    try {
      const file = new File([downloadReady.fileBlob], downloadReady.fileName, {
        type: 'application/vnd.ms-excel',
      });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: downloadReady.fileName,
          text: `Rekap Matriks Kesiapan Armada Logistik MD to Dealer (${downloadReady.count} unit armada)`,
        });
        return;
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: downloadReady.fileName,
          text: `Rekap Matriks Kesiapan Armada Logistik MD to Dealer (${downloadReady.count} unit armada)`,
          url: window.location.href,
        });
        return;
      } catch (e: any) {
        if (e.name === 'AbortError') return;
      }
    }

    // Fallback WhatsApp
    const waText = encodeURIComponent(
      `*REKAP MATRIKS KESIAPAN ARMADA LOGISTIK MD TO DEALER*\nFile: ${downloadReady.fileName}\nPeriode: ${startDate} s/d ${endDate}\nTotal: ${downloadReady.count} Unit Armada.`
    );
    window.open(`https://api.whatsapp.com/send?text=${waText}`, '_blank');
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-3 animate-in fade-in duration-150 text-left font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Kartu Utama Filter Ringkas, Modern & Clean (1 Layar Tanpa Scroll) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-3">
        
        {/* Baris Filter Terpadu: Rentang Tanggal, Transporter, Gudang (Clean & Modern Layout) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
          
          {/* 1. Rentang Tanggal (Mulai -> Akhir) - 6 Kolom */}
          <div className="md:col-span-6 bg-slate-50 p-2 rounded-xl border border-slate-200/80">
            <label className="text-[10px] uppercase font-semibold text-slate-500 mb-1 block">
              Rentang Tanggal
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDownloadReady(null);
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-red-500 transition cursor-pointer shadow-2xs"
              />
              <span className="text-slate-400 font-bold text-xs shrink-0">→</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={todayStr}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDownloadReady(null);
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-red-500 transition cursor-pointer shadow-2xs"
              />
            </div>
          </div>

          {/* 2. Dropdown Transporter - 3 Kolom */}
          <div className="md:col-span-3">
            <label className="text-[10px] uppercase font-semibold text-slate-500 mb-1 block">
              Transporter
            </label>
            <select
              value={selectedTransporter}
              onChange={(e) => {
                setSelectedTransporter(e.target.value);
                setDownloadReady(null);
              }}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-red-500 transition cursor-pointer shadow-2xs"
            >
              <option value="ALL">Semua Transporter</option>
              <option value="TM">TM - PT Tunas Muda</option>
              <option value="RJTM">RJTM - PT Roda Jagat Tunas Mas</option>
              <option value="WSS">WSS - PT Wahana Sumber Sakti</option>
              <option value="SBR">SBR - PT Sari Bumi Raya</option>
            </select>
          </div>

          {/* 3. Dropdown Gudang - 3 Kolom */}
          <div className="md:col-span-3">
            <label className="text-[10px] uppercase font-semibold text-slate-500 mb-1 block">
              Gudang (Depo)
            </label>
            <select
              value={selectedDepo}
              onChange={(e) => {
                setSelectedDepo(e.target.value);
                setDownloadReady(null);
              }}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-red-500 transition cursor-pointer shadow-2xs"
            >
              <option value="ALL">Semua Gudang</option>
              <option value="Karawang">Depo Karawang</option>
              <option value="Baros">Depo Baros</option>
              <option value="Cirebon">Depo Cirebon</option>
            </select>
          </div>

        </div>

        {/* Baris Ringkasan & Tombol Export Utama */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-100">
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-slate-600">Total Truk: <strong>{filteredMatrix.length}</strong></span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-600">Durasi: <strong>{dateRangeList.length} Hari</strong></span>
          </div>

          <button
            type="button"
            onClick={handleExportColoredExcel}
            disabled={isLoadingRange || filteredMatrix.length === 0}
            className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs flex items-center justify-center shadow-xs transition cursor-pointer"
          >
            <span>{isLoadingRange ? 'Memuat Data...' : 'Export'}</span>
          </button>
        </div>

        {/* Setelah Export Ditekan: Kartu File Muncul Ringkas Tanpa Uraian Panjang & Tanpa Ikon */}
        {downloadReady && (
          <div className="p-3.5 rounded-2xl bg-emerald-50/90 border border-emerald-300/80 space-y-3 animate-in fade-in zoom-in-95 duration-150">
            {/* Baris Atas: Nama File & Tombol X */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-mono font-extrabold text-emerald-950 truncate">
                {downloadReady.fileName}
              </span>
              <button
                type="button"
                onClick={() => setDownloadReady(null)}
                className="w-6 h-6 rounded-full hover:bg-emerald-200/70 active:bg-emerald-300 text-emerald-800 flex items-center justify-center text-xs font-bold transition cursor-pointer shrink-0"
                title="Tutup"
              >
                ✕
              </button>
            </div>

            {/* Dua Tombol Aksi di Bawah Nama File (Hanya Tulisan Bagikan dan Download, Tanpa Ikon) */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleShareFileDirect}
                className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-emerald-100 active:bg-emerald-200 text-emerald-900 border border-emerald-300 font-extrabold text-xs shadow-2xs transition cursor-pointer text-center"
              >
                Bagikan
              </button>

              <a
                href={downloadReady.url}
                download={downloadReady.fileName}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-extrabold text-xs shadow-xs transition cursor-pointer text-center"
              >
                Download
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
