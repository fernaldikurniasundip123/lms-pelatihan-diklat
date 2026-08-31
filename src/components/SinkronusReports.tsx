import { useState, useEffect, useMemo } from "react";
import { 
  Download, 
  Search, 
  Video, 
  Clock, 
  VideoOff, 
  Mic, 
  RefreshCw, 
  Calendar, 
  FileText, 
  Filter, 
  Users,
  Eye,
  User,
  CreditCard,
  X,
  Printer
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface ZoomLog {
  id: string;
  user_id: string;
  user_name: string;
  seafarer_code: string;
  class_name: string;
  course_id: string;
  course_name: string;
  joined_at: string;
  duration_seconds: number;
  camera_on_seconds: number;
  camera_off_seconds: number;
  mic_on_seconds: number;
  last_active: string;
  selfie_url?: string;
  ktp_url?: string;
}

interface CourseOption {
  id: string;
  name: string;
}

export interface DayTelemetry {
  dayIndex: number;
  dateKey: string;
  formattedDate: string;
  joinTimes: string[];
  duration_seconds: number;
  camera_on_seconds: number;
  camera_off_seconds: number;
  mic_on_seconds: number;
}

export interface GroupedParticipantLog {
  key: string;
  user_name: string;
  seafarer_code: string;
  pureClass: string;
  period: string;
  course_name: string;
  course_id?: string;
  days: DayTelemetry[];
  total_duration_seconds: number;
  total_camera_on_seconds: number;
  total_camera_off_seconds: number;
  total_mic_on_seconds: number;
  total_entries: number;
  selfie_url?: string;
  ktp_url?: string;
}

export default function SinkronusReports() {
  const [logs, setLogs] = useState<ZoomLog[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [verifications, setVerifications] = useState<Record<string, { selfie_url?: string; ktp_url?: string }>>({});
  const [loading, setLoading] = useState(false);
  const [errorLocalAlert, setErrorLocalAlert] = useState(false);

  // Photo modal state
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<{
    title: string;
    url: string;
    userName: string;
    seafarerCode: string;
  } | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("");

  const getLogDetails = (className: string) => {
    let pureClass = className || "-";
    let period = "-";
    
    if (className && className.includes(" (") && className.endsWith(")")) {
      const openIndex = className.indexOf(" (");
      pureClass = className.substring(0, openIndex);
      period = className.substring(openIndex + 2, className.length - 1);
    }
    
    return { pureClass, period };
  };

  useEffect(() => {
    fetchLogsAndOptions();
  }, []);

  const fetchLogsAndOptions = async () => {
    setLoading(true);
    setErrorLocalAlert(false);

    try {
      // 1. Fetch available course options
      const { data: coursesData } = await supabase
        .from("courses")
        .select("id, name")
        .order("name", { ascending: true });
        
      if (coursesData) {
        setCourses(coursesData);
      }

      // 2. Fetch Verifications (Selfie and KTP photos) from database
      const verifMap: Record<string, { selfie_url?: string; ktp_url?: string }> = {};

      try {
        const { data: latihanVerifs } = await supabase
          .from("latihan_verifications")
          .select("user_id, seafarer_code, live_photo_url, ktp_photo_url");

        if (latihanVerifs) {
          latihanVerifs.forEach((v: any) => {
            const dataObj = {
              selfie_url: v.live_photo_url || undefined,
              ktp_url: v.ktp_photo_url || undefined
            };
            if (v.seafarer_code) {
              verifMap[`code_${v.seafarer_code.trim()}`] = dataObj;
            }
            if (v.user_id) {
              verifMap[`user_${v.user_id.trim()}`] = dataObj;
            }
          });
        }

        const { data: globalVerifs } = await supabase
          .from("global_verifications")
          .select("user_id, live_photo_url, ktp_photo_url");

        if (globalVerifs) {
          globalVerifs.forEach((v: any) => {
            if (v.user_id) {
              const existing = verifMap[`user_${v.user_id.trim()}`] || {};
              verifMap[`user_${v.user_id.trim()}`] = {
                selfie_url: v.live_photo_url || existing.selfie_url,
                ktp_url: v.ktp_photo_url || existing.ktp_url
              };
            }
          });
        }
      } catch (verifErr) {
        console.warn("Could not fetch verification photos from Supabase:", verifErr);
      }

      setVerifications(verifMap);

      // 3. Fetch Zoom logs
      const { data: dbLogs, error } = await supabase
        .from("zoom_logs")
        .select("*")
        .order("joined_at", { ascending: false });

      if (error) {
        throw error;
      }

      if (dbLogs) {
        setLogs(dbLogs);
      }
    } catch (e) {
      console.warn("Table zoom_logs not found or setup is missing. Loading from LocalStorage & Mock Fallback...");
      setErrorLocalAlert(true);
      loadMockAndLocalStorageLogs();
    } finally {
      setLoading(false);
    }
  };

  const loadMockAndLocalStorageLogs = () => {
    // 1. Get from localStorage fallback
    const localStored = localStorage.getItem("local_zoom_logs");
    let localLogsList: ZoomLog[] = localStored ? JSON.parse(localStored) : [];

    // 2. Generate multi-day and multi-session mock logs representing realistic scenarios
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);

    const testMockLogs: ZoomLog[] = [
      // Raditia Sanjaya - multiple sessions on the same day
      {
        id: "mock-rs-1",
        user_id: "user-rs",
        user_name: "RADITIA SANJAYA",
        seafarer_code: "6212601946",
        class_name: "Kelas Utama (24/08/2026 s/d 01/09/2026)",
        course_id: "course-sdsd",
        course_name: "SDSD - Ship Security Officer",
        joined_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 13, 12, 14).toISOString(),
        duration_seconds: 1,
        camera_on_seconds: 0,
        camera_off_seconds: 0,
        mic_on_seconds: 0,
        last_active: new Date().toISOString(),
        selfie_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        ktp_url: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=150&auto=format&fit=crop&q=80"
      },
      {
        id: "mock-rs-2",
        user_id: "user-rs",
        user_name: "RADITIA SANJAYA",
        seafarer_code: "6212601946",
        class_name: "Kelas Utama (24/08/2026 s/d 01/09/2026)",
        course_id: "course-sdsd",
        course_name: "SDSD - Ship Security Officer",
        joined_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 49, 57).toISOString(),
        duration_seconds: 7200,
        camera_on_seconds: 7200,
        camera_off_seconds: 0,
        mic_on_seconds: 1800,
        last_active: new Date().toISOString(),
        selfie_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        ktp_url: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=150&auto=format&fit=crop&q=80"
      },
      {
        id: "mock-rs-3",
        user_id: "user-rs",
        user_name: "RADITIA SANJAYA",
        seafarer_code: "6212601946",
        class_name: "Kelas Utama (24/08/2026 s/d 01/09/2026)",
        course_id: "course-sdsd",
        course_name: "SDSD - Ship Security Officer",
        joined_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 50, 27).toISOString(),
        duration_seconds: 3500,
        camera_on_seconds: 3200,
        camera_off_seconds: 300,
        mic_on_seconds: 500,
        last_active: new Date().toISOString()
      },
      {
        id: "mock-rs-4",
        user_id: "user-rs",
        user_name: "RADITIA SANJAYA",
        seafarer_code: "6212601946",
        class_name: "Kelas Utama (24/08/2026 s/d 01/09/2026)",
        course_id: "course-sdsd",
        course_name: "SDSD - Ship Security Officer",
        joined_at: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 9, 15, 0).toISOString(),
        duration_seconds: 5400,
        camera_on_seconds: 5000,
        camera_off_seconds: 400,
        mic_on_seconds: 1200,
        last_active: new Date().toISOString()
      },
      // Budi Santoso - Day 1 & Day 2
      {
        id: "mock-bs-1",
        user_id: "user-bs",
        user_name: "BUDI SANTOSO",
        seafarer_code: "6299102931",
        class_name: "Kelas A (24/08/2026 s/d 01/09/2026)",
        course_id: "course-bst",
        course_name: "BST - Basic Safety Training",
        joined_at: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 8, 30, 0).toISOString(),
        duration_seconds: 7200,
        camera_on_seconds: 6800,
        camera_off_seconds: 400,
        mic_on_seconds: 1500,
        last_active: new Date().toISOString(),
        selfie_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
        ktp_url: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=150&auto=format&fit=crop&q=80"
      },
      {
        id: "mock-bs-2",
        user_id: "user-bs",
        user_name: "BUDI SANTOSO",
        seafarer_code: "6299102931",
        class_name: "Kelas A (24/08/2026 s/d 01/09/2026)",
        course_id: "course-bst",
        course_name: "BST - Basic Safety Training",
        joined_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 45, 0).toISOString(),
        duration_seconds: 7000,
        camera_on_seconds: 6900,
        camera_off_seconds: 100,
        mic_on_seconds: 2100,
        last_active: new Date().toISOString()
      },
      // Siti Aminah
      {
        id: "mock-sa-1",
        user_id: "user-sa",
        user_name: "SITI AMINAH",
        seafarer_code: "6277102948",
        class_name: "Kelas B (01/09/2026 s/d 08/09/2026)",
        course_id: "course-aff",
        course_name: "AFF - Advanced Fire Fighting",
        joined_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0).toISOString(),
        duration_seconds: 4500,
        camera_on_seconds: 4000,
        camera_off_seconds: 500,
        mic_on_seconds: 900,
        last_active: new Date().toISOString(),
        selfie_url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80",
        ktp_url: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=150&auto=format&fit=crop&q=80"
      },
      // Muhammad Amran vs Muh Amran (same seafarer_code test case)
      {
        id: "mock-ma-1",
        user_id: "user-ma",
        user_name: "MUH AMRAN",
        seafarer_code: "6281920381",
        class_name: "Kelas A (07/09/2026 s/d 25/09/2026)",
        course_id: "course-mefa",
        course_name: "MEFA - Medical First Aid",
        joined_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0, 0).toISOString(),
        duration_seconds: 3600,
        camera_on_seconds: 3500,
        camera_off_seconds: 100,
        mic_on_seconds: 600,
        last_active: new Date().toISOString(),
        selfie_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
        ktp_url: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=150&auto=format&fit=crop&q=80"
      },
      {
        id: "mock-ma-2",
        user_id: "user-ma",
        user_name: "MUHAMMAD AMRAN",
        seafarer_code: "6281920381",
        class_name: "Kelas A (07/09/2026 s/d 25/09/2026)",
        course_id: "course-mefa",
        course_name: "MEFA - Medical First Aid",
        joined_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 13, 30, 0).toISOString(),
        duration_seconds: 3600,
        camera_on_seconds: 3400,
        camera_off_seconds: 200,
        mic_on_seconds: 800,
        last_active: new Date().toISOString()
      }
    ];

    // Merge localStorage with default tests, ensuring no duplicates by ID
    const merged = [...localLogsList];
    testMockLogs.forEach(mockLog => {
      if (!merged.some(l => l.id === mockLog.id)) {
        merged.push(mockLog);
      }
    });

    setLogs(merged);
  };

  // Convert seconds to readable style (HH:MM:SS)
  const formatTime = (totalSecs: number) => {
    if (isNaN(totalSecs) || totalSecs < 0) return "00:00:00";
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return [
      hours.toString().padStart(2, "0"),
      minutes.toString().padStart(2, "0"),
      secs.toString().padStart(2, "0")
    ].join(":");
  };

  const getDateKey = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "Invalid Date";
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    } catch {
      return "Invalid Date";
    }
  };

  const formatShortDate = (dateKey: string) => {
    if (dateKey.includes("-")) {
      const [y, m, d] = dateKey.split("-");
      return `${d}/${m}/${y}`;
    }
    return dateKey;
  };

  const formatShortTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      const s = String(d.getSeconds()).padStart(2, "0");
      return `${h}.${m}.${s}`;
    } catch {
      return dateStr;
    }
  };

  // Extract unique classes present in logs for filter
  const availableClasses = Array.from(new Set(logs.map(l => getLogDetails(l.class_name).pureClass).filter(c => c !== "-")));
  const availablePeriods = Array.from(new Set(logs.map(l => getLogDetails(l.class_name).period).filter(p => p !== "-")));

  // Filter logs list
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const { pureClass, period } = getLogDetails(log.class_name);
      
      const term = searchQuery.toLowerCase().trim();
      const matchSearch = !term || 
        log.user_name?.toLowerCase().includes(term) ||
        log.seafarer_code?.includes(term) ||
        log.course_name?.toLowerCase().includes(term);

      const matchCourse = !selectedCourse || log.course_name === selectedCourse || log.course_id === selectedCourse;
      const matchClass = !selectedClass || pureClass === selectedClass;
      const matchPeriod = !selectedPeriod || period === selectedPeriod;

      return matchSearch && matchCourse && matchClass && matchPeriod;
    });
  }, [logs, searchQuery, selectedCourse, selectedClass, selectedPeriod]);

  // Aggregate logs so 1 person in 1 period is rendered in EXACTLY 1 row, broken down by days
  const groupedParticipants = useMemo(() => {
    const map = new Map<string, {
      user_name: string;
      seafarer_code: string;
      pureClass: string;
      period: string;
      course_name: string;
      course_id?: string;
      user_id?: string;
      selfie_url?: string;
      ktp_url?: string;
      dayMap: Map<string, {
        dateKey: string;
        joinTimes: string[];
        duration_seconds: number;
        camera_on_seconds: number;
        camera_off_seconds: number;
        mic_on_seconds: number;
      }>;
    }>();

    filteredLogs.forEach(log => {
      const { pureClass, period } = getLogDetails(log.class_name);
      const codeKey = (log.seafarer_code || "").trim();
      const nameKey = (log.user_name || "").trim().toLowerCase();
      const userIdKey = (log.user_id || "").trim();
      
      // Kunci utama pengelompokan peserta adalah KODE PELAUT jika tersedia,
      // fallback ke user_id / nama hanya jika kode pelaut belum terisi
      const personIdentifier = (codeKey && codeKey !== "-") 
        ? `code_${codeKey}` 
        : (userIdKey ? `user_${userIdKey}` : `name_${nameKey}`);

      const courseKey = (log.course_name || "").trim().toLowerCase();
      const periodKey = (period || "-").trim().toLowerCase();
      const groupKey = `${personIdentifier}_${courseKey}_${periodKey}`;

      const currentName = (log.user_name || "Peserta").trim();

      // Find verification photo if available
      const personVerif = verifications[`code_${codeKey}`] || 
                          verifications[`user_${userIdKey}`] || 
                          verifications[`code_${(log.seafarer_code || "").trim()}`];

      const initialSelfie = log.selfie_url || personVerif?.selfie_url;
      const initialKtp = log.ktp_url || personVerif?.ktp_url;

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          user_name: currentName,
          seafarer_code: (codeKey && codeKey !== "-") ? codeKey : "-",
          pureClass,
          period,
          course_name: log.course_name || "-",
          course_id: log.course_id,
          user_id: log.user_id,
          selfie_url: initialSelfie,
          ktp_url: initialKtp,
          dayMap: new Map()
        });
      } else {
        // Jika kode pelaut sama (misal "MUH AMRAN" & "MUHAMMAD AMRAN"), pilih nama yang lebih lengkap / panjang
        const entry = map.get(groupKey)!;
        if (currentName.length > entry.user_name.length) {
          entry.user_name = currentName;
        }
        if ((!entry.seafarer_code || entry.seafarer_code === "-") && codeKey && codeKey !== "-") {
          entry.seafarer_code = codeKey;
        }
        if ((!entry.pureClass || entry.pureClass === "-") && pureClass && pureClass !== "-") {
          entry.pureClass = pureClass;
        }
        if (!entry.selfie_url && initialSelfie) {
          entry.selfie_url = initialSelfie;
        }
        if (!entry.ktp_url && initialKtp) {
          entry.ktp_url = initialKtp;
        }
      }

      const entry = map.get(groupKey)!;
      const dateKey = getDateKey(log.joined_at);

      if (!entry.dayMap.has(dateKey)) {
        entry.dayMap.set(dateKey, {
          dateKey,
          joinTimes: [],
          duration_seconds: 0,
          camera_on_seconds: 0,
          camera_off_seconds: 0,
          mic_on_seconds: 0
        });
      }

      const dayData = entry.dayMap.get(dateKey)!;
      const timeFormatted = formatShortTime(log.joined_at);
      if (!dayData.joinTimes.includes(timeFormatted)) {
        dayData.joinTimes.push(timeFormatted);
      }
      dayData.duration_seconds += (Number(log.duration_seconds) || 0);
      dayData.camera_on_seconds += (Number(log.camera_on_seconds) || 0);
      dayData.camera_off_seconds += (Number(log.camera_off_seconds) || 0);
      dayData.mic_on_seconds += (Number(log.mic_on_seconds) || 0);
    });

    const result: GroupedParticipantLog[] = [];
    map.forEach((item, key) => {
      const sortedDateKeys = Array.from(item.dayMap.keys()).sort();
      const days: DayTelemetry[] = sortedDateKeys.map((dKey, idx) => {
        const d = item.dayMap.get(dKey)!;
        return {
          dayIndex: idx + 1,
          dateKey: dKey,
          formattedDate: formatShortDate(dKey),
          joinTimes: d.joinTimes,
          duration_seconds: d.duration_seconds,
          camera_on_seconds: d.camera_on_seconds,
          camera_off_seconds: d.camera_off_seconds,
          mic_on_seconds: d.mic_on_seconds
        };
      });

      const totalDuration = days.reduce((acc, d) => acc + d.duration_seconds, 0);
      const totalCamOn = days.reduce((acc, d) => acc + d.camera_on_seconds, 0);
      const totalCamOff = days.reduce((acc, d) => acc + d.camera_off_seconds, 0);
      const totalMicOn = days.reduce((acc, d) => acc + d.mic_on_seconds, 0);
      const totalEntries = days.reduce((acc, d) => acc + d.joinTimes.length, 0);

      result.push({
        key,
        user_name: item.user_name,
        seafarer_code: item.seafarer_code,
        pureClass: item.pureClass,
        period: item.period,
        course_name: item.course_name,
        course_id: item.course_id,
        days,
        total_duration_seconds: totalDuration,
        total_camera_on_seconds: totalCamOn,
        total_camera_off_seconds: totalCamOff,
        total_mic_on_seconds: totalMicOn,
        total_entries: totalEntries,
        selfie_url: item.selfie_url,
        ktp_url: item.ktp_url
      });
    });

    return result;
  }, [filteredLogs, verifications]);

  // Export to standard CSV
  const handleExportCSV = () => {
    const headers = [
      "Nama Peserta",
      "Kode Pelaut (Identity)",
      "Kelas",
      "Periode",
      "Jenis Diklat / Course",
      "Waktu Gabung (Per Hari)",
      "Total Durasi",
      "Cam ON",
      "Cam OFF",
      "Mic ON",
      "Foto Selfie URL",
      "Foto KTP URL"
    ];

    const rows = groupedParticipants.map(item => {
      const joinTimesText = item.days.map(d => `Hari ${d.dayIndex} (${d.formattedDate}): ${d.joinTimes.join(", ")}`).join(" | ");
      
      const durationText = item.days.map(d => `Hari ${d.dayIndex}: ${formatTime(d.duration_seconds)}`).join(" | ") + 
        (item.days.length > 1 ? ` | Akumulasi: ${formatTime(item.total_duration_seconds)}` : '');
        
      const camOnText = item.days.map(d => `Hari ${d.dayIndex}: ${formatTime(d.camera_on_seconds)}`).join(" | ") + 
        (item.days.length > 1 ? ` | Total ON: ${formatTime(item.total_camera_on_seconds)}` : '');

      const camOffText = item.days.map(d => `Hari ${d.dayIndex}: ${formatTime(d.camera_off_seconds)}`).join(" | ") + 
        (item.days.length > 1 ? ` | Total OFF: ${formatTime(item.total_camera_off_seconds)}` : '');

      const micOnText = item.days.map(d => `Hari ${d.dayIndex}: ${formatTime(d.mic_on_seconds)}`).join(" | ") + 
        (item.days.length > 1 ? ` | Total MIC: ${formatTime(item.total_mic_on_seconds)}` : '');

      return [
        item.user_name,
        item.seafarer_code || "-",
        item.pureClass,
        item.period,
        item.course_name,
        joinTimesText,
        durationText,
        camOnText,
        camOffText,
        micOnText,
        item.selfie_url || "-",
        item.ktp_url || "-"
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Laporan_Pembelajaran_Sinkronus_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to PDF by opening standard print view with landscape styling
  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div className="bg-slate-50 text-slate-800 print:bg-white print:p-0">
      
      {/* Dynamic Print CSS for Landscape Fitting */}
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 5mm 6mm 5mm 6mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background-color: #ffffff !important;
            color: #0f172a !important;
          }
          .print-full-width {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .print-clean-table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 8.5px !important;
          }
          .print-clean-table th {
            background-color: #f1f5f9 !important;
            color: #1e293b !important;
            font-weight: 800 !important;
            border: 1px solid #cbd5e1 !important;
            padding: 4px 3px !important;
            text-align: center !important;
          }
          .print-clean-table td {
            border: 1px solid #cbd5e1 !important;
            padding: 3px 3px !important;
            vertical-align: top !important;
          }
          .print-day-card {
            background-color: #f8fafc !important;
            border: 1px solid #e2e8f0 !important;
            padding: 2px !important;
            margin-bottom: 2px !important;
            font-size: 8px !important;
          }
          .print-badge-box {
            padding: 2px !important;
            font-size: 8px !important;
          }
          .print-img {
            width: 26px !important;
            height: 26px !important;
            object-fit: cover !important;
            border-radius: 3px !important;
          }
        }
      `}</style>

      {/* Header specifically for printed reports */}
      <div className="hidden print:block mb-4 pb-2 border-b-2 border-slate-800">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-base font-black uppercase tracking-tight text-slate-950">
              LMS PELATIHAN &amp; DIKLAT KETRAMPILAN PELAUT
            </h1>
            <h2 className="text-xs font-bold text-slate-700">
              REKAPITULASI PRESENSI &amp; TELEMETRI PEMBELAJARAN SINKRONUS ZOOM
            </h2>
          </div>
          <div className="text-right text-[9px] text-slate-600 font-mono">
            <div>Dicetak: {new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
            <div>Total Peserta: {groupedParticipants.length} Orang</div>
          </div>
        </div>
      </div>
      
      {/* Title bar of Reports tab */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6 print:hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full mb-2 inline-block">
              LAPORAN FINAL REKAPITULASI
            </span>
            <h2 className="text-2xl font-black text-gray-950 flex items-center gap-2">
              <Clock className="w-7 h-7 text-indigo-600 animate-spin-slow" /> Rekapitulasi Kehadiran Sinkronus Zoom
            </h2>
            <p className="text-sm text-gray-500 mt-1 max-w-3xl leading-relaxed">
              Daftar rekam jejak presensi peserta <strong>Pembelajaran Sinkronus Zoom Meeting</strong>. Setiap peserta dalam satu periode ditampilkan <strong>1 baris</strong> lengkap dengan rincian durasi kamera, mic, foto selfie, dan KTP.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 flex-shrink-0">
            <button
              onClick={fetchLogsAndOptions}
              disabled={loading}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition border border-gray-300 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Muat Ulang
            </button>
            <button
              onClick={handleExportCSV}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition shadow"
            >
              <Download className="w-4 h-4" /> Ekspor Excel (CSV)
            </button>
            <button
              onClick={handlePrintPDF}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition shadow"
            >
              <Printer className="w-4 h-4" /> Cetak PDF Laporan
            </button>
          </div>
        </div>

        {/* Database Status Alert banner */}
        {errorLocalAlert && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-amber-800 leading-relaxed">
            <RefreshCw className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <strong>Database Table Not Configured:</strong> Tabel <code>zoom_logs</code> tidak terdeteksi di database Supabase. Sistem dialihkan otomatis ke mode emulasi bertenaga LocalStorage &amp; data simulasi.
            </div>
          </div>
        )}
      </div>

      {/* Filter Options bar */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 flex flex-wrap gap-4 items-end shadow-sm print:hidden">
        
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Cari Peserta / Diklat</label>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Ketik Nama, Kode Pelaut, etc..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-slate-50/50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
            />
          </div>
        </div>

        {/* Course Filter */}
        <div className="w-full md:w-60">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Saring Jenis Diklat</label>
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-slate-50/50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
          >
            <option value="">Semua Diklat</option>
            {courses.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Class Filter */}
        <div className="w-full md:w-48">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Saring Kelas</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-slate-50/50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
          >
            <option value="">Semua Kelas</option>
            {availableClasses.map(clsName => (
              <option key={clsName} value={clsName}>{clsName}</option>
            ))}
          </select>
        </div>

        {/* Period Filter */}
        <div className="w-full md:w-48">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Saring Periode</label>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-slate-50/50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
          >
            <option value="">Semua Periode</option>
            {availablePeriods.map(periodName => (
              <option key={periodName} value={periodName}>{periodName}</option>
            ))}
          </select>
        </div>

      </div>

      {/* Main Table reports list */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden print-full-width">
        <div className="p-5 border-b flex justify-between items-center bg-slate-50 print:hidden">
          <span className="text-xs font-extrabold text-indigo-950 uppercase tracking-widest flex items-center gap-1.5">
            <Users className="w-4 h-4 text-indigo-600" /> Hasil Laporan Telemetri ({groupedParticipants.length} Peserta / {filteredLogs.length} Sesi Tergabung)
          </span>
          <span className="text-xs text-slate-500 font-mono">Format: HH:MM:SS</span>
        </div>

        <div className="overflow-x-auto print:overflow-visible">
          <table className="min-w-full divide-y divide-gray-200 text-left text-xs bg-white print-clean-table">
            <thead className="bg-slate-100/80 font-bold text-gray-700 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-3 text-left">Nama Peserta</th>
                <th className="px-3 py-3 text-center">Kode Pelaut (Identity)</th>
                <th className="px-2 py-3 text-center">Kelas</th>
                <th className="px-3 py-3 text-center">Periode</th>
                <th className="px-3 py-3 text-left">Jenis Diklat / Course</th>
                <th className="px-3 py-3 text-left">Waktu Gabung (Per Hari)</th>
                <th className="px-2 py-3 text-center">Total Durasi</th>
                <th className="px-2 py-3 text-center text-emerald-800">Cam ON</th>
                <th className="px-2 py-3 text-center text-red-800">Cam OFF</th>
                <th className="px-2 py-3 text-center text-yellow-800">Mic ON</th>
                <th className="px-3 py-3 text-center">Foto Selfie &amp; KTP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-150 font-medium text-gray-650">
              {groupedParticipants.map(participant => {
                return (
                  <tr key={participant.key} className="hover:bg-slate-50/70 transition align-top">
                    {/* 1. Nama Peserta */}
                    <td className="px-3 py-3 font-medium">
                      <div className="font-extrabold text-slate-900 uppercase leading-snug">{participant.user_name}</div>
                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5 print:text-[8px]">
                        {participant.days.length} Hari Kehadiran ({participant.total_entries} Sesi)
                      </span>
                    </td>

                    {/* 2. Kode Pelaut */}
                    <td className="px-3 py-3 font-mono font-bold text-gray-700 text-center whitespace-nowrap">
                      {participant.seafarer_code || "-"}
                    </td>

                    {/* 3. Kelas */}
                    <td className="px-2 py-3 text-center font-bold">
                      <span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono border text-[10px] whitespace-nowrap print:border-slate-300 print:text-[8px]">
                        {participant.pureClass}
                      </span>
                    </td>

                    {/* 4. Periode */}
                    <td className="px-3 py-3 text-center font-bold">
                      <span className={`px-2 py-0.5 rounded font-mono border text-[10px] inline-block whitespace-nowrap print:text-[8px] ${participant.period !== '-' ? 'bg-indigo-50 text-indigo-800 border-indigo-200 print:border-slate-300' : 'bg-slate-100 text-slate-800'}`}>
                        {participant.period}
                      </span>
                    </td>

                    {/* 5. Jenis Diklat / Course */}
                    <td className="px-3 py-3 font-bold text-indigo-950 text-xs print:text-[8.5px]">
                      {participant.course_name}
                    </td>

                    {/* 6. Waktu Gabung (Per Hari) */}
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1 min-w-[170px] print:min-w-0">
                        {participant.days.map((day) => (
                          <div key={day.dateKey} className="bg-slate-50 border border-slate-200 rounded p-1 text-[10px] font-mono print-day-card">
                            <div className="font-bold text-slate-800 flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5 text-indigo-600 shrink-0 print:hidden" />
                              <span>Hari {day.dayIndex} ({day.formattedDate}) :</span>
                            </div>
                            <div className="text-slate-600 pl-3 break-words leading-tight">
                              {day.joinTimes.join(", ")}
                            </div>
                          </div>
                        ))}
                        {participant.days.length === 0 && <span className="text-gray-400 italic">-</span>}
                      </div>
                    </td>

                    {/* 7. Total Durasi (Komulatif per hari & Total) */}
                    <td className="px-2 py-3 text-center font-mono">
                      <div className="flex flex-col gap-1 items-center">
                        {participant.days.map((day) => (
                          <div key={day.dateKey} className="bg-blue-50/80 border border-blue-200 text-blue-900 px-1.5 py-0.5 rounded text-[10px] font-bold w-full max-w-[110px] text-left print-badge-box">
                            <span className="text-[8px] text-blue-600 block uppercase font-mono tracking-wider">Hari {day.dayIndex}:</span>
                            {formatTime(day.duration_seconds)}
                          </div>
                        ))}
                        {participant.days.length > 1 && (
                          <div className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px] font-black w-full max-w-[110px] text-left print-badge-box">
                            <span className="text-[8px] uppercase tracking-wider block opacity-80">Total:</span>
                            {formatTime(participant.total_duration_seconds)}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 8. Cam ON (Komulatif per hari & Total) */}
                    <td className="px-2 py-3 text-center font-mono">
                      <div className="flex flex-col gap-1 items-center">
                        {participant.days.map((day) => (
                          <div key={day.dateKey} className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded text-[10px] font-bold w-full max-w-[105px] text-left print-badge-box">
                            <span className="text-[8px] text-emerald-600 block uppercase font-mono tracking-wider flex items-center gap-0.5">
                              <Video className="w-2 h-2 text-emerald-600 print:hidden" /> Hari {day.dayIndex}:
                            </span>
                            {formatTime(day.camera_on_seconds)}
                          </div>
                        ))}
                        {participant.days.length > 1 && (
                          <div className="bg-emerald-600 text-white px-1.5 py-0.5 rounded text-[10px] font-black w-full max-w-[105px] text-left print-badge-box">
                            <span className="text-[8px] uppercase tracking-wider block opacity-80">Total:</span>
                            {formatTime(participant.total_camera_on_seconds)}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 9. Cam OFF (Komulatif per hari & Total) */}
                    <td className="px-2 py-3 text-center font-mono">
                      <div className="flex flex-col gap-1 items-center">
                        {participant.days.map((day) => (
                          <div key={day.dateKey} className="bg-red-50 border border-red-200 text-red-800 px-1.5 py-0.5 rounded text-[10px] font-bold w-full max-w-[105px] text-left print-badge-box">
                            <span className="text-[8px] text-red-600 block uppercase font-mono tracking-wider flex items-center gap-0.5">
                              <VideoOff className="w-2 h-2 text-red-600 print:hidden" /> Hari {day.dayIndex}:
                            </span>
                            {formatTime(day.camera_off_seconds)}
                          </div>
                        ))}
                        {participant.days.length > 1 && (
                          <div className="bg-red-600 text-white px-1.5 py-0.5 rounded text-[10px] font-black w-full max-w-[105px] text-left print-badge-box">
                            <span className="text-[8px] uppercase tracking-wider block opacity-80">Total:</span>
                            {formatTime(participant.total_camera_off_seconds)}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 10. Mic ON (Komulatif per hari & Total) */}
                    <td className="px-2 py-3 text-center font-mono">
                      <div className="flex flex-col gap-1 items-center">
                        {participant.days.map((day) => (
                          <div key={day.dateKey} className="bg-amber-50 border border-amber-200 text-amber-900 px-1.5 py-0.5 rounded text-[10px] font-bold w-full max-w-[105px] text-left print-badge-box">
                            <span className="text-[8px] text-amber-700 block uppercase font-mono tracking-wider flex items-center gap-0.5">
                              <Mic className="w-2 h-2 text-amber-600 print:hidden" /> Hari {day.dayIndex}:
                            </span>
                            {formatTime(day.mic_on_seconds)}
                          </div>
                        ))}
                        {participant.days.length > 1 && (
                          <div className="bg-amber-500 text-white px-1.5 py-0.5 rounded text-[10px] font-black w-full max-w-[105px] text-left print-badge-box">
                            <span className="text-[8px] uppercase tracking-wider block opacity-80">Total:</span>
                            {formatTime(participant.total_mic_on_seconds)}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 11. Foto Selfie & KTP */}
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* Selfie thumbnail */}
                        <div className="flex flex-col items-center">
                          {participant.selfie_url ? (
                            <button
                              type="button"
                              onClick={() => setSelectedPhotoModal({
                                title: "Foto Selfie Presensi",
                                url: participant.selfie_url!,
                                userName: participant.user_name,
                                seafarerCode: participant.seafarer_code
                              })}
                              className="relative group block w-10 h-10 rounded-lg overflow-hidden border-2 border-indigo-200 hover:border-indigo-600 transition shadow-xs cursor-pointer focus:outline-none print-img"
                              title="Klik untuk memperbesar Foto Selfie"
                            >
                              <img
                                src={participant.selfie_url}
                                alt="Selfie"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition print:hidden">
                                <Eye className="w-3.5 h-3.5 text-white" />
                              </div>
                            </button>
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 print-img">
                              <User className="w-4 h-4" />
                            </div>
                          )}
                          <span className="text-[9px] font-bold text-slate-600 mt-0.5 uppercase tracking-tight print:text-[7.5px]">Selfie</span>
                        </div>

                        {/* KTP thumbnail */}
                        <div className="flex flex-col items-center">
                          {participant.ktp_url ? (
                            <button
                              type="button"
                              onClick={() => setSelectedPhotoModal({
                                title: "Foto KTP Identitas",
                                url: participant.ktp_url!,
                                userName: participant.user_name,
                                seafarerCode: participant.seafarer_code
                              })}
                              className="relative group block w-10 h-10 rounded-lg overflow-hidden border-2 border-emerald-200 hover:border-emerald-600 transition shadow-xs cursor-pointer focus:outline-none print-img"
                              title="Klik untuk memperbesar Foto KTP"
                            >
                              <img
                                src={participant.ktp_url}
                                alt="KTP"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition print:hidden">
                                <Eye className="w-3.5 h-3.5 text-white" />
                              </div>
                            </button>
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 print-img">
                              <CreditCard className="w-4 h-4" />
                            </div>
                          )}
                          <span className="text-[9px] font-bold text-slate-600 mt-0.5 uppercase tracking-tight print:text-[7.5px]">KTP</span>
                        </div>
                      </div>
                    </td>

                  </tr>
                );
              })}
              
              {groupedParticipants.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-gray-400 font-medium">
                    <Filter className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    Belum ada data rekam presensi sinkronus zoom yang cocok dengan filter saringan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Image Preview Modal for Selfie / KTP Zoom */}
      {selectedPhotoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 print:hidden animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-100">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-sm font-black text-slate-900">{selectedPhotoModal.title}</h3>
                <p className="text-xs text-slate-500">{selectedPhotoModal.userName} (Kode Pelaut: {selectedPhotoModal.seafarerCode})</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhotoModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex items-center justify-center bg-slate-900/5 min-h-[300px]">
              <img
                src={selectedPhotoModal.url}
                alt={selectedPhotoModal.title}
                className="max-h-[420px] w-auto max-w-full rounded-lg shadow-md object-contain border border-gray-200"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="p-4 border-t flex justify-end bg-slate-50">
              <button
                type="button"
                onClick={() => setSelectedPhotoModal(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
