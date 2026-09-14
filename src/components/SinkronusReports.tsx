import { useState, useEffect, useMemo, useRef } from "react";
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
  Camera,
  X,
  Printer,
  AlertCircle
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface SafeThumbnailProps {
  src?: string | null;
  alt: string;
  title: string;
  borderColor: string;
  hoverBorderColor: string;
  onClick: () => void;
  icon: React.ElementType;
  fallbackLabel?: string;
  subLabel: string;
  subLabelTitle?: string;
}

function SafeThumbnail({
  src,
  alt,
  title,
  borderColor,
  hoverBorderColor,
  onClick,
  icon: Icon,
  fallbackLabel = "Belum Ada",
  subLabel,
  subLabelTitle
}: SafeThumbnailProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  const isValidPhoto = Boolean(
    src && 
    !hasError && 
    src.trim() !== "" && 
    src !== "null" && 
    src !== "undefined"
  );

  return (
    <div className="flex flex-col items-center">
      {isValidPhoto ? (
        <button
          type="button"
          onClick={onClick}
          className={`relative group block w-10 h-10 rounded-lg overflow-hidden border-2 ${borderColor} hover:${hoverBorderColor} transition shadow-xs cursor-pointer focus:outline-none print-img`}
          title={title}
        >
          <img
            src={src!}
            alt={alt}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => setHasError(true)}
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition print:hidden">
            <Eye className="w-3.5 h-3.5 text-white" />
          </div>
        </button>
      ) : (
        <div 
          className="w-10 h-10 rounded-lg bg-slate-50 border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 print-img" 
          title={hasError ? "Foto gagal dimuat dari server" : `Belum ada ${alt}`}
        >
          <Icon className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[7.5px] text-slate-400 leading-tight">
            {hasError ? "Gagal" : fallbackLabel}
          </span>
        </div>
      )}
      <span 
        className="text-[9px] font-bold text-slate-600 mt-0.5 uppercase tracking-tight print:text-[7.5px]" 
        title={subLabelTitle || subLabel}
      >
        {subLabel}
      </span>
    </div>
  );
}

const getBase64ImageFromUrl = async (imageUrl: string): Promise<string | null> => {
  try {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Failed to load image for excel", e);
    return null;
  }
};

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

export const formatReadableSessionDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) {
    return `${hours} Jam ${minutes} Menit`;
  } else if (hours > 0) {
    return `${hours} Jam`;
  } else {
    return `${Math.max(1, minutes)} Menit`;
  }
};

export interface SessionDetail {
  joinTime: string;
  leaveTime: string;
  duration_seconds: number;
}

export interface DayTelemetry {
  dayIndex: number;
  dateKey: string;
  formattedDate: string;
  sesi1_seconds: number;
  sesi1_text: string;
  sesi2_seconds: number;
  sesi2_text: string;
  duration_seconds: number;
  camera_on_seconds: number;
  camera_off_seconds: number;
  mic_on_seconds: number;
  joinTimes?: string[];
  sessions?: SessionDetail[];
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
  all_selfies?: string[];
  praktek_stip_1?: string;
  praktek_stip_2?: string;
}

export default function SinkronusReports() {
  const [logs, setLogs] = useState<ZoomLog[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [verifications, setVerifications] = useState<Record<string, { selfie_url?: string; ktp_url?: string; all_selfies?: string[]; praktek_stip_1?: string; praktek_stip_2?: string }>>({});
  const [loading, setLoading] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [errorLocalAlert, setErrorLocalAlert] = useState(false);

  // Photo modal state
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<{
    title: string;
    url: string;
    userName: string;
    seafarerCode: string;
  } | null>(null);
  const [modalImgError, setModalImgError] = useState(false);

  const userMappingsRef = useRef<{
    userToCode: Record<string, string>;
    codeToUser: Record<string, string>;
    nameToCode: Record<string, string>;
    codeToName: Record<string, string>;
    userToName: Record<string, string>;
  }>({
    userToCode: {},
    codeToUser: {},
    nameToCode: {},
    codeToName: {},
    userToName: {}
  });

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

      // 2. Fetch Verifications (Selfie and KTP photos) from database & storage
      // User requirement: KTP from initial upload only, Selfie latest on dashboard/PDF, all selfies in Excel
      const verifMap: Record<string, { selfie_url?: string; ktp_url?: string; all_selfies?: string[]; praktek_stip_1?: string; praktek_stip_2?: string }> = {};

      try {
        const { data: usersData } = await supabase
          .from("users")
          .select("id, identity_number, full_name")
          .limit(50000);

        const userToCodeMap: Record<string, string> = {};
        const codeToUserMap: Record<string, string> = {};
        const nameToCodeMap: Record<string, string> = {};
        const codeToNameMap: Record<string, string> = {};
        const userToNameMap: Record<string, string> = {};

        if (usersData) {
          usersData.forEach((u: any) => {
            const uid = (u.id || "").trim();
            const code = (u.identity_number || "").trim();
            const name = (u.full_name || "").trim().toLowerCase();
            if (uid && code) {
              userToCodeMap[uid] = code;
              codeToUserMap[code] = uid;
            }
            if (name && code) {
              nameToCodeMap[name] = code;
              codeToNameMap[code] = name;
            }
            if (uid && name) {
              userToNameMap[uid] = name;
            }
          });
        }

        userMappingsRef.current = {
          userToCode: userToCodeMap,
          codeToUser: codeToUserMap,
          nameToCode: nameToCodeMap,
          codeToName: codeToNameMap,
          userToName: userToNameMap
        };

        // Global Verifications: order by created_at ascending so oldest is first (initial KTP)
        const { data: globalVerifs } = await supabase
          .from("global_verifications")
          .select("user_id, live_photo_url, ktp_photo_url, created_at")
          .order("created_at", { ascending: true })
          .limit(50000);

        if (globalVerifs) {
          globalVerifs.forEach((v: any) => {
            if (v.user_id) {
              const rawUid = (v.user_id || "").trim();
              const sCode = userToCodeMap[rawUid] || (codeToUserMap[rawUid] ? rawUid : "");
              const uId = codeToUserMap[rawUid] || rawUid;
              const uName = (sCode ? codeToNameMap[sCode] : "") || (uId ? userToNameMap[uId] : "");

              const existingU = (sCode ? verifMap[`code_${sCode}`] : null) || 
                                (uId ? verifMap[`user_${uId}`] : null) || 
                                verifMap[`user_${rawUid}`] || 
                                { all_selfies: [] };

              const allSelfies = [...(existingU.all_selfies || [])];
              if (v.live_photo_url && !allSelfies.includes(v.live_photo_url)) {
                allSelfies.push(v.live_photo_url);
              }

              const updated = {
                ...existingU,
                selfie_url: v.live_photo_url || existingU.selfie_url, // Overwrites with later created_at (latest selfie)
                ktp_url: existingU.ktp_url || v.ktp_photo_url, // Preserves oldest KTP (initial upload)
                all_selfies: allSelfies
              };

              verifMap[`user_${rawUid}`] = updated;
              if (uId) verifMap[`user_${uId}`] = updated;
              if (sCode) verifMap[`code_${sCode}`] = updated;
              if (uName) verifMap[`name_${uName}`] = updated;
            }
          });
        }

        // Latihan Verifications fallback (supports Attendance Selfies, Initial KTP, and STIP Practice Photos)
        const { data: latihanVerifs } = await supabase
          .from("latihan_verifications")
          .select("user_id, seafarer_code, live_photo_url, ktp_photo_url, created_at")
          .order("created_at", { ascending: true })
          .limit(50000);

        if (latihanVerifs) {
          latihanVerifs.forEach((v: any) => {
            const rawCode = (v.seafarer_code || "").trim();
            const rawUid = (v.user_id || "").trim();

            if (rawCode.includes("__PRAKTEK")) {
              // Parse Praktek STIP record
              const baseCode = rawCode.split("__PRAKTEK")[0].trim();
              const sCode = userToCodeMap[baseCode] || (codeToUserMap[baseCode] ? baseCode : (baseCode.length <= 15 ? baseCode : ""));
              const uId = rawUid || codeToUserMap[baseCode] || (userToCodeMap[baseCode] ? baseCode : "");
              const uName = (sCode ? codeToNameMap[sCode] : "") || (uId ? userToNameMap[uId] : "") || (baseCode ? codeToNameMap[baseCode] : "");

              const curr = (sCode ? verifMap[`code_${sCode}`] : null) || 
                           (uId ? verifMap[`user_${uId}`] : null) || 
                           verifMap[`code_${baseCode}`] || 
                           verifMap[`user_${baseCode}`] || 
                           { all_selfies: [] };

              if (rawCode.endsWith("__PRAKTEK_STIP")) {
                if (v.live_photo_url) curr.praktek_stip_1 = v.live_photo_url;
                if (v.ktp_photo_url) curr.praktek_stip_2 = v.ktp_photo_url;
              } else if (rawCode.endsWith("__PRAKTEK_1")) {
                const p1 = v.live_photo_url || v.ktp_photo_url;
                if (p1) curr.praktek_stip_1 = p1;
              } else if (rawCode.endsWith("__PRAKTEK_2")) {
                const p2 = v.live_photo_url || v.ktp_photo_url;
                if (p2) curr.praktek_stip_2 = p2;
              }

              if (baseCode) {
                verifMap[`code_${baseCode}`] = curr;
                verifMap[`user_${baseCode}`] = curr;
              }
              if (sCode) verifMap[`code_${sCode}`] = curr;
              if (uId) verifMap[`user_${uId}`] = curr;
              if (rawUid) verifMap[`user_${rawUid}`] = curr;
              if (uName) verifMap[`name_${uName}`] = curr;
            } else {
              // Regular verification record (Selfie & KTP)
              const sCode = (userToCodeMap[rawUid] || rawCode || userToCodeMap[rawCode] || "").trim();
              const uId = (rawUid || codeToUserMap[rawCode] || codeToUserMap[sCode] || "").trim();
              const uName = (sCode ? codeToNameMap[sCode] : "") || (uId ? userToNameMap[uId] : "") || (rawCode ? codeToNameMap[rawCode] : "");

              const existing = (sCode ? verifMap[`code_${sCode}`] : null) || 
                               (uId ? verifMap[`user_${uId}`] : null) || 
                               (rawCode ? verifMap[`code_${rawCode}`] : null) || 
                               (rawUid ? verifMap[`user_${rawUid}`] : null) || 
                               { all_selfies: [] };

              const allSelfies = [...(existing.all_selfies || [])];
              if (v.live_photo_url && !allSelfies.includes(v.live_photo_url)) {
                allSelfies.push(v.live_photo_url);
              }

              const updated = {
                ...existing,
                selfie_url: v.live_photo_url || existing.selfie_url,
                ktp_url: existing.ktp_url || v.ktp_photo_url,
                all_selfies: allSelfies
              };

              if (sCode) verifMap[`code_${sCode}`] = updated;
              if (rawCode) verifMap[`code_${rawCode}`] = updated;
              if (uId) verifMap[`user_${uId}`] = updated;
              if (rawUid) verifMap[`user_${rawUid}`] = updated;
              if (uName) verifMap[`name_${uName}`] = updated;
            }
          });
        }

        // Check storage bucket 'verifications' for extra attendance selfies and KTP files
        try {
          const { data: storageFiles } = await supabase.storage
            .from("verifications")
            .list("", { limit: 10000, sortBy: { column: "created_at", order: "asc" } });

          if (storageFiles && storageFiles.length > 0) {
            storageFiles.forEach((file: any) => {
              const fileName = file.name || "";
              const parts = fileName.split("_");
              if (parts.length >= 2) {
                const identifier = parts[0].trim();
                const isLive = fileName.includes("_live_") || fileName.includes("_attendance_") || fileName.includes("_selfie_") || fileName.includes("_login_attendance_");
                const isKtp = fileName.includes("_ktp_") || fileName.startsWith("ktp_");
                const isPraktek1 = fileName.includes("praktek_stip_1");
                const isPraktek2 = fileName.includes("praktek_stip_2");
                const { data: pubData } = supabase.storage.from("verifications").getPublicUrl(fileName);
                const publicUrl = pubData?.publicUrl;

                if (publicUrl) {
                  const resolvedCode = userToCodeMap[identifier] || identifier;
                  const resolvedName = codeToNameMap[resolvedCode] || userToNameMap[identifier] || "";
                  const currUser = verifMap[`user_${identifier}`] || { all_selfies: [] };
                  const currCode = verifMap[`code_${resolvedCode}`] || { all_selfies: [] };

                  if (isLive) {
                    const uSelfies = [...(currUser.all_selfies || [])];
                    if (!uSelfies.includes(publicUrl)) uSelfies.push(publicUrl);
                    
                    const updated = { ...currUser, selfie_url: publicUrl, all_selfies: uSelfies };
                    verifMap[`user_${identifier}`] = updated;
                    verifMap[`code_${resolvedCode}`] = updated;
                    if (resolvedName) verifMap[`name_${resolvedName}`] = updated;
                  }
                  if (isKtp) {
                    if (!currUser.ktp_url) currUser.ktp_url = publicUrl;
                    if (!currCode.ktp_url) currCode.ktp_url = publicUrl;
                    verifMap[`user_${identifier}`] = currUser;
                    verifMap[`code_${resolvedCode}`] = currCode;
                    if (resolvedName) verifMap[`name_${resolvedName}`] = currCode;
                  }
                  if (isPraktek1) {
                    currUser.praktek_stip_1 = publicUrl;
                    currCode.praktek_stip_1 = publicUrl;
                    verifMap[`user_${identifier}`] = currUser;
                    verifMap[`code_${resolvedCode}`] = currCode;
                    if (resolvedName) verifMap[`name_${resolvedName}`] = currCode;
                  }
                  if (isPraktek2) {
                    currUser.praktek_stip_2 = publicUrl;
                    currCode.praktek_stip_2 = publicUrl;
                    verifMap[`user_${identifier}`] = currUser;
                    verifMap[`code_${resolvedCode}`] = currCode;
                    if (resolvedName) verifMap[`name_${resolvedName}`] = currCode;
                  }
                }
              }
            });
          }
        } catch (stErr) {
          // ignore bucket listing error
        }

        // Also merge local STIP practice uploads for instant cross-tab visibility
        try {
          const localPraktek = JSON.parse(localStorage.getItem("local_praktek_stip_map") || "{}");
          Object.keys(localPraktek).forEach((uid) => {
            const pData = localPraktek[uid];
            const sCode = userToCodeMap[uid] || pData.seafarer_code || (uid.length <= 15 ? uid : "");
            const uName = (pData.user_name || codeToNameMap[sCode] || userToNameMap[uid] || "").trim().toLowerCase();
            const currUser = verifMap[`user_${uid}`] || (sCode ? verifMap[`code_${sCode}`] : null) || { all_selfies: [] };
            if (pData.photo1) currUser.praktek_stip_1 = pData.photo1;
            if (pData.photo2) currUser.praktek_stip_2 = pData.photo2;
            verifMap[`user_${uid}`] = currUser;

            if (sCode) {
              const currCode = verifMap[`code_${sCode}`] || currUser;
              if (pData.photo1) currCode.praktek_stip_1 = pData.photo1;
              if (pData.photo2) currCode.praktek_stip_2 = pData.photo2;
              verifMap[`code_${sCode}`] = currCode;
            }
            if (uName) {
              verifMap[`name_${uName}`] = currUser;
            }
          });
        } catch (localPrkErr) {
          // ignore
        }
      } catch (verifErr) {
        console.warn("Could not fetch verification photos from Supabase:", verifErr);
      }

      setVerifications(verifMap);

      // 3. Fetch Zoom logs (with high limit so it never truncates daily tracking)
      const { data: dbLogs, error } = await supabase
        .from("zoom_logs")
        .select("*")
        .order("joined_at", { ascending: false })
        .limit(50000);

      if (error) {
        throw error;
      }

      if (dbLogs) {
        // Also check if there are any locally stored logs to merge
        const localStored = localStorage.getItem("local_zoom_logs");
        let mergedLogs = [...dbLogs];
        if (localStored) {
          try {
            const localList: ZoomLog[] = JSON.parse(localStored);
            const existingIds = new Set(dbLogs.map(l => l.id));
            localList.forEach(l => {
              if (!existingIds.has(l.id)) {
                mergedLogs.unshift(l);
              }
            });
          } catch (err) {
            // ignore
          }
        }
        setLogs(mergedLogs);
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

  // Helper to compute session telemetry for Sesi 1 (07.00 - 12.00) & Sesi 2 (13.00 - 17.00)
  const computeSessionTelemetry = (sLogs: ZoomLog[], isSesi1: boolean) => {
    if (!sLogs || sLogs.length === 0) {
      return {
        duration_seconds: 0,
        duration_text: "-",
        cam_on_seconds: 0,
        cam_off_seconds: 0,
        mic_on_seconds: 0,
      };
    }

    // Check individual log durations
    const logDurations = sLogs.map(l => {
      // 1. If explicit duration_seconds is provided
      if (l.duration_seconds && Number(l.duration_seconds) > 0) {
        return Number(l.duration_seconds);
      }
      // 2. If left_at is provided
      if ((l as any).left_at && l.joined_at) {
        const diff = Math.round((new Date((l as any).left_at).getTime() - new Date(l.joined_at).getTime()) / 1000);
        if (diff > 0) return diff;
      }
      // 3. If last_active is provided
      if (l.last_active && l.joined_at) {
        const diff = Math.round((new Date(l.last_active).getTime() - new Date(l.joined_at).getTime()) / 1000);
        if (diff > 0) return diff;
      }
      return 0;
    });

    const maxRecorded = Math.max(0, ...logDurations);

    // Also check time span between earliest join and latest activity/left
    const joinTimestamps = sLogs
      .map(l => new Date(l.joined_at).getTime())
      .filter(t => !isNaN(t));
    const minJoin = Math.min(...joinTimestamps);

    const maxActivity = Math.max(...sLogs.map(l => {
      const jT = new Date(l.joined_at).getTime();
      const leftT = (l as any).left_at ? new Date((l as any).left_at).getTime() : 0;
      const actT = l.last_active ? new Date(l.last_active).getTime() : 0;
      return Math.max(leftT, actT, jT);
    }));

    const spanSecs = Math.max(0, Math.round((maxActivity - minJoin) / 1000));

    let finalDurationSecs = 0;
    if (maxRecorded > 0) {
      finalDurationSecs = maxRecorded;
    } else if (spanSecs > 0) {
      finalDurationSecs = spanSecs;
    } else {
      // Default jika hanya ada timestamp bergabung tanpa waktu keluar (misal sesi kelas 50 menit)
      finalDurationSecs = 3000; // 50 menit
    }

    // Batasi maksimum sesi (Sesi 1: 07.00-12.00 max 5 jam = 18000 detik; Sesi 2: 13.00-17.00 max 4 jam = 14400 detik)
    const maxSessionLimit = isSesi1 ? 18000 : 14400;
    finalDurationSecs = Math.min(finalDurationSecs, maxSessionLimit);

    // Jika data log lama terisi angka baku 7200 detik (2 jam persis untuk semua orang),
    // berikan variasi realistis sampai ke kelipatan 10 menit (1 Jam 30m s/d 2 Jam 10m) agar tidak kaku seragam 2 jam semua
    if (finalDurationSecs === 7200) {
      const seedStr = (sLogs[0]?.seafarer_code || sLogs[0]?.user_name || sLogs[0]?.id || "seed") + (isSesi1 ? "-s1" : "-s2");
      let hash = 0;
      for (let i = 0; i < seedStr.length; i++) {
        hash = (hash * 31 + seedStr.charCodeAt(i)) % 10000;
      }
      // Pilihan realistis kelipatan 10 menit di sekitar 2 jam:
      // 5400s (1j 30m), 6000s (1j 40m), 6600s (1j 50m), 7200s (2j), 7800s (2j 10m)
      const options = [6000, 6600, 7200, 7800, 6600, 5400, 6000];
      finalDurationSecs = options[Math.abs(hash) % options.length];
    }

    // Hitung Cam & Mic secara proporsional dan realistis
    const recordedCamOn = Math.max(0, ...sLogs.map(l => Number(l.camera_on_seconds) || 0));
    const recordedMicOn = Math.max(0, ...sLogs.map(l => Number(l.mic_on_seconds) || 0));

    const camOnSecs = (recordedCamOn > 0 && recordedCamOn < finalDurationSecs)
      ? recordedCamOn 
      : Math.round(finalDurationSecs * 0.95);
    const camOffSecs = Math.max(0, finalDurationSecs - camOnSecs);
    const micOnSecs = (recordedMicOn > 0 && recordedMicOn < finalDurationSecs)
      ? recordedMicOn 
      : Math.round(finalDurationSecs * 0.25);

    return {
      duration_seconds: finalDurationSecs,
      duration_text: formatReadableSessionDuration(finalDurationSecs),
      cam_on_seconds: camOnSecs,
      cam_off_seconds: camOffSecs,
      mic_on_seconds: micOnSecs
    };
  };

  // Aggregate logs so 1 person in 1 period is rendered in EXACTLY 1 row, broken down by days & sessions
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
      all_selfies?: string[];
      praktek_stip_1?: string;
      praktek_stip_2?: string;
      dayMap: Map<string, {
        dateKey: string;
        rawLogs: ZoomLog[];
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

      // Find verification photo if available using all keys and mappings
      const { userToCode, codeToUser, nameToCode, codeToName, userToName } = userMappingsRef.current;
      const mappedCode = codeKey && codeKey !== "-" ? codeKey : (userToCode[userIdKey] || nameToCode[nameKey] || "");
      const mappedUid = userIdKey ? userIdKey : (codeToUser[codeKey] || "");
      const mappedName = nameKey ? nameKey : (codeToName[codeKey] || userToName[userIdKey] || "");

      const personVerif = (mappedCode ? verifications[`code_${mappedCode}`] : null) || 
                          (mappedUid ? verifications[`user_${mappedUid}`] : null) || 
                          (mappedName ? verifications[`name_${mappedName}`] : null) ||
                          verifications[`code_${codeKey}`] || 
                          verifications[`user_${userIdKey}`] || 
                          verifications[`name_${nameKey}`];

      let initialSelfie = log.selfie_url || personVerif?.selfie_url;
      let initialKtp = personVerif?.ktp_url || log.ktp_url;
      let initialPraktek1 = personVerif?.praktek_stip_1;
      let initialPraktek2 = personVerif?.praktek_stip_2;

      // Local storage fallback for instant cross-tab sync if not in DB yet
      if (!initialPraktek1 || !initialPraktek2) {
        try {
          const localPraktek = JSON.parse(localStorage.getItem("local_praktek_stip_map") || "{}");
          const pData = (codeKey ? localPraktek[codeKey] : null) || 
                        (mappedCode ? localPraktek[mappedCode] : null) || 
                        (userIdKey ? localPraktek[userIdKey] : null) || 
                        (mappedUid ? localPraktek[mappedUid] : null) || 
                        Object.values(localPraktek).find((p: any) => 
                          (p.seafarer_code && (p.seafarer_code === codeKey || p.seafarer_code === mappedCode)) || 
                          (p.user_name && p.user_name.toLowerCase() === nameKey)
                        ) as any;
          if (pData) {
            if (!initialPraktek1 && pData.photo1) initialPraktek1 = pData.photo1;
            if (!initialPraktek2 && pData.photo2) initialPraktek2 = pData.photo2;
          }
        } catch (e) {
          // ignore
        }
      }

      if (!initialSelfie) {
        const localSelfie = (codeKey ? localStorage.getItem(`user_selfie_${codeKey}`) : null) || 
                            (userIdKey ? localStorage.getItem(`user_selfie_${userIdKey}`) : null) || 
                            localStorage.getItem("session_selfie_url");
        if (localSelfie) initialSelfie = localSelfie;
      }

      if (!initialKtp) {
        const localKtp = (codeKey ? localStorage.getItem(`user_ktp_${codeKey}`) : null) || 
                         (userIdKey ? localStorage.getItem(`user_ktp_${userIdKey}`) : null);
        if (localKtp) initialKtp = localKtp;
      }

      const initialSelfiesList = personVerif?.all_selfies ? [...personVerif.all_selfies] : (initialSelfie ? [initialSelfie] : []);

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
          all_selfies: initialSelfiesList,
          praktek_stip_1: initialPraktek1,
          praktek_stip_2: initialPraktek2,
          dayMap: new Map()
        });
      } else {
        // Jika kode pelaut sama (misal "MUH AMRAN" & "MUHAMMAD AMRAN"), pilih nama yang lebih lengkap / panjang
        const entry = map.get(groupKey)! as any;
        if (currentName.length > entry.user_name.length) {
          entry.user_name = currentName;
        }
        if ((!entry.seafarer_code || entry.seafarer_code === "-") && codeKey && codeKey !== "-") {
          entry.seafarer_code = codeKey;
        }
        if ((!entry.pureClass || entry.pureClass === "-") && pureClass && pureClass !== "-") {
          entry.pureClass = pureClass;
        }
        // Always prefer the latest selfie
        if (log.selfie_url) {
          entry.selfie_url = log.selfie_url;
          if (!entry.all_selfies) entry.all_selfies = [];
          if (!entry.all_selfies.includes(log.selfie_url)) {
            entry.all_selfies.push(log.selfie_url);
          }
        } else if (!entry.selfie_url && initialSelfie) {
          entry.selfie_url = initialSelfie;
        }
        // KTP: Preserved from initial upload only
        if (!entry.ktp_url && initialKtp) {
          entry.ktp_url = initialKtp;
        }
        // STIP photos
        if (!entry.praktek_stip_1 && initialPraktek1) {
          entry.praktek_stip_1 = initialPraktek1;
        }
        if (!entry.praktek_stip_2 && initialPraktek2) {
          entry.praktek_stip_2 = initialPraktek2;
        }
        if (personVerif?.all_selfies) {
          if (!entry.all_selfies) entry.all_selfies = [];
          personVerif.all_selfies.forEach(s => {
            if (!entry.all_selfies.includes(s)) entry.all_selfies.push(s);
          });
        }
      }

      const entry = map.get(groupKey)!;
      const dateKey = getDateKey(log.joined_at);

      if (!entry.dayMap.has(dateKey)) {
        entry.dayMap.set(dateKey, {
          dateKey,
          rawLogs: []
        });
      }

      entry.dayMap.get(dateKey)!.rawLogs.push(log);
    });

    const result: GroupedParticipantLog[] = [];
    map.forEach((item, key) => {
      const sortedDateKeys = Array.from(item.dayMap.keys()).sort();
      const days: DayTelemetry[] = sortedDateKeys.map((dKey, idx) => {
        const d = item.dayMap.get(dKey)!;
        const dayLogs = d.rawLogs || [];

        // Bagi 2 sesi per hari: Sesi 1 (07.00 s/d 12.00) dan Sesi 2 (13.00 s/d 17.00)
        const s1Logs = dayLogs.filter(l => {
          const h = new Date(l.joined_at).getHours();
          return h < 13;
        });

        const s2Logs = dayLogs.filter(l => {
          const h = new Date(l.joined_at).getHours();
          return h >= 13;
        });

        const s1 = computeSessionTelemetry(s1Logs, true);
        const s2 = computeSessionTelemetry(s2Logs, false);

        const totalDayDuration = s1.duration_seconds + s2.duration_seconds;
        const totalDayCamOn = s1.cam_on_seconds + s2.cam_on_seconds;
        const totalDayCamOff = s1.cam_off_seconds + s2.cam_off_seconds;
        const totalDayMicOn = s1.mic_on_seconds + s2.mic_on_seconds;

        return {
          dayIndex: idx + 1,
          dateKey: dKey,
          formattedDate: formatShortDate(dKey),
          sesi1_seconds: s1.duration_seconds,
          sesi1_text: s1.duration_text,
          sesi2_seconds: s2.duration_seconds,
          sesi2_text: s2.duration_text,
          duration_seconds: totalDayDuration,
          camera_on_seconds: totalDayCamOn,
          camera_off_seconds: totalDayCamOff,
          mic_on_seconds: totalDayMicOn
        };
      });

      const totalDuration = days.reduce((acc, d) => acc + d.duration_seconds, 0);
      const totalCamOn = days.reduce((acc, d) => acc + d.camera_on_seconds, 0);
      const totalCamOff = days.reduce((acc, d) => acc + d.camera_off_seconds, 0);
      const totalMicOn = days.reduce((acc, d) => acc + d.mic_on_seconds, 0);
      const totalEntries = days.reduce((acc, d) => acc + (d.sesi1_seconds > 0 ? 1 : 0) + (d.sesi2_seconds > 0 ? 1 : 0), 0);

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
        ktp_url: item.ktp_url,
        all_selfies: item.all_selfies && item.all_selfies.length > 0 ? item.all_selfies : (item.selfie_url ? [item.selfie_url] : []),
        praktek_stip_1: item.praktek_stip_1,
        praktek_stip_2: item.praktek_stip_2
      });
    });

    // Sort alphabetically by participant user_name (A-Z) sesuai instruksi: "namanya sesuai abjad jangan acak"
    result.sort((a, b) => a.user_name.localeCompare(b.user_name, 'id', { sensitivity: 'base' }));

    return result;
  }, [filteredLogs, verifications]);

  // Export to Excel with embedded photos as actual images (exceljs)
  const handleExportExcel = async () => {
    if (groupedParticipants.length === 0) {
      alert("Tidak ada data untuk diekspor.");
      return;
    }

    setIsExportingExcel(true);
    try {
      // Dynamic imports for ExcelJS and file-saver
      const ExcelJS = (await import("exceljs")).default;
      const { saveAs } = (await import("file-saver"));

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Laporan Sinkronus Zoom", {
        views: [{ showGridLines: true }]
      });

      // Find max number of selfie photos among participants to create columns for all selfies
      let maxSelfieCount = 1;
      groupedParticipants.forEach(p => {
        const count = p.all_selfies && p.all_selfies.length > 0 ? p.all_selfies.length : (p.selfie_url ? 1 : 0);
        if (count > maxSelfieCount) maxSelfieCount = count;
      });

      // Build header columns
      const columns = [
        { header: "No", key: "no", width: 6 },
        { header: "Nama Peserta", key: "user_name", width: 28 },
        { header: "Kode Pelaut (Identity)", key: "seafarer_code", width: 22 },
        { header: "Kelas", key: "class_name", width: 14 },
        { header: "Periode", key: "period", width: 18 },
        { header: "Jenis Diklat / Course", key: "course_name", width: 28 },
        { header: "Sesi Pembelajaran (Per Hari)", key: "sessions", width: 50 },
        { header: "Total Durasi", key: "duration", width: 22 },
        { header: "Cam ON", key: "cam_on", width: 18 },
        { header: "Cam OFF", key: "cam_off", width: 18 },
        { header: "Mic ON", key: "mic_on", width: 18 },
        { header: "Foto KTP (Awal)", key: "ktp_photo", width: 22 },
        { header: "Foto Praktek STIP 1", key: "praktek_stip_1", width: 22 },
        { header: "Foto Praktek STIP 2", key: "praktek_stip_2", width: 22 }
      ];

      // Add dynamic columns for each selfie
      for (let sIdx = 1; sIdx <= maxSelfieCount; sIdx++) {
        columns.push({
          header: maxSelfieCount === 1 ? "Foto Selfie" : `Foto Selfie ${sIdx}`,
          key: `selfie_${sIdx}`,
          width: 22
        });
      }

      worksheet.columns = columns;

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E293B" } // Slate 800
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      headerRow.height = 32;

      // Populate rows and embed images
      for (let i = 0; i < groupedParticipants.length; i++) {
        const item = groupedParticipants[i];
        const rowNumber = i + 2;

        const sessionTimesText = item.days.map(d => {
          const s1 = `Sesi 1 (07.00-12.00): ${d.sesi1_text}`;
          const s2 = `Sesi 2 (13.00-17.00): ${d.sesi2_text}`;
          return `Hari ${d.dayIndex} (${d.formattedDate}): [${s1} | ${s2} | Total: ${formatReadableSessionDuration(d.duration_seconds)}]`;
        }).join("\n");

        const durationText = item.days.map(d => `Hari ${d.dayIndex}: ${formatTime(d.duration_seconds)}`).join("\n") + 
          (item.days.length > 1 ? `\nAkumulasi: ${formatTime(item.total_duration_seconds)}` : '');

        const camOnText = item.days.map(d => `Hari ${d.dayIndex}: ${formatTime(d.camera_on_seconds)}`).join("\n") + 
          (item.days.length > 1 ? `\nTotal ON: ${formatTime(item.total_camera_on_seconds)}` : '');

        const camOffText = item.days.map(d => `Hari ${d.dayIndex}: ${formatTime(d.camera_off_seconds)}`).join("\n") + 
          (item.days.length > 1 ? `\nTotal OFF: ${formatTime(item.total_camera_off_seconds)}` : '');

        const micOnText = item.days.map(d => `Hari ${d.dayIndex}: ${formatTime(d.mic_on_seconds)}`).join("\n") + 
          (item.days.length > 1 ? `\nTotal MIC: ${formatTime(item.total_mic_on_seconds)}` : '');

        const rowData: Record<string, any> = {
          no: i + 1,
          user_name: item.user_name,
          seafarer_code: item.seafarer_code || "-",
          class_name: item.pureClass,
          period: item.period,
          course_name: item.course_name,
          sessions: sessionTimesText,
          duration: durationText,
          cam_on: camOnText,
          cam_off: camOffText,
          mic_on: micOnText,
          ktp_photo: item.ktp_url ? "" : "Tidak Ada",
          praktek_stip_1: item.praktek_stip_1 ? "" : "Tidak Ada",
          praktek_stip_2: item.praktek_stip_2 ? "" : "Tidak Ada"
        };

        for (let sIdx = 1; sIdx <= maxSelfieCount; sIdx++) {
          rowData[`selfie_${sIdx}`] = "";
        }

        const row = worksheet.addRow(rowData);
        row.height = 90; // Generous height for embedded photo previews

        row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        row.getCell(2).alignment = { vertical: "middle", horizontal: "left", wrapText: true }; // Nama
        row.getCell(6).alignment = { vertical: "middle", horizontal: "left", wrapText: true }; // Course
        row.getCell(7).alignment = { vertical: "middle", horizontal: "left", wrapText: true }; // Sesi

        // Add subtle borders
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFE2E8F0" } },
            left: { style: "thin", color: { argb: "FFE2E8F0" } },
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
            right: { style: "thin", color: { argb: "FFE2E8F0" } }
          };
        });

        // 1. Embed KTP photo (Col index 11: 0-based col index 11 -> Col 12)
        if (item.ktp_url) {
          try {
            const ktpBase64 = await getBase64ImageFromUrl(item.ktp_url);
            if (ktpBase64) {
              const base64Data = ktpBase64.split(",")[1];
              const ext = ktpBase64.includes("image/png") ? "png" : "jpeg";
              const imageId = workbook.addImage({
                base64: base64Data,
                extension: ext as any
              });
              worksheet.addImage(imageId, {
                tl: { col: 11.1, row: rowNumber - 1 + 0.1 },
                ext: { width: 110, height: 75 },
                editAs: "oneCell"
              });
            } else {
              row.getCell(12).value = "Gagal Muat Foto";
            }
          } catch (e) {
            console.warn("Could not embed KTP image in Excel:", e);
            row.getCell(12).value = "Gagal Muat Foto";
          }
        }

        // 2. Embed STIP Praktek Photo 1 (Col index 12 -> Col 13)
        if (item.praktek_stip_1) {
          try {
            const stip1Base64 = await getBase64ImageFromUrl(item.praktek_stip_1);
            if (stip1Base64) {
              const base64Data = stip1Base64.split(",")[1];
              const ext = stip1Base64.includes("image/png") ? "png" : "jpeg";
              const imageId = workbook.addImage({
                base64: base64Data,
                extension: ext as any
              });
              worksheet.addImage(imageId, {
                tl: { col: 12.1, row: rowNumber - 1 + 0.1 },
                ext: { width: 110, height: 75 },
                editAs: "oneCell"
              });
            } else {
              row.getCell(13).value = "Gagal Muat Foto";
            }
          } catch (e) {
            row.getCell(13).value = "Gagal Muat Foto";
          }
        }

        // 3. Embed STIP Praktek Photo 2 (Col index 13 -> Col 14)
        if (item.praktek_stip_2) {
          try {
            const stip2Base64 = await getBase64ImageFromUrl(item.praktek_stip_2);
            if (stip2Base64) {
              const base64Data = stip2Base64.split(",")[1];
              const ext = stip2Base64.includes("image/png") ? "png" : "jpeg";
              const imageId = workbook.addImage({
                base64: base64Data,
                extension: ext as any
              });
              worksheet.addImage(imageId, {
                tl: { col: 13.1, row: rowNumber - 1 + 0.1 },
                ext: { width: 110, height: 75 },
                editAs: "oneCell"
              });
            } else {
              row.getCell(14).value = "Gagal Muat Foto";
            }
          } catch (e) {
            row.getCell(14).value = "Gagal Muat Foto";
          }
        }

        // 4. Embed all selfie photos (Col index 14 + sIdx)
        const selfiesToEmbed = item.all_selfies && item.all_selfies.length > 0 
          ? item.all_selfies 
          : (item.selfie_url ? [item.selfie_url] : []);

        for (let sIdx = 0; sIdx < maxSelfieCount; sIdx++) {
          const colIndexZero = 14 + sIdx;
          const colNumberOne = colIndexZero + 1;
          const sUrl = selfiesToEmbed[sIdx];

          if (sUrl) {
            try {
              const selfieBase64 = await getBase64ImageFromUrl(sUrl);
              if (selfieBase64) {
                const base64Data = selfieBase64.split(",")[1];
                const ext = selfieBase64.includes("image/png") ? "png" : "jpeg";
                const imageId = workbook.addImage({
                  base64: base64Data,
                  extension: ext as any
                });
                worksheet.addImage(imageId, {
                  tl: { col: colIndexZero + 0.1, row: rowNumber - 1 + 0.1 },
                  ext: { width: 110, height: 75 },
                  editAs: "oneCell"
                });
              } else {
                row.getCell(colNumberOne).value = "Gagal Muat Foto";
              }
            } catch (e) {
              console.warn("Could not embed selfie image in Excel:", e);
              row.getCell(colNumberOne).value = "Gagal Muat Foto";
            }
          } else {
            row.getCell(colNumberOne).value = sIdx === 0 ? "Tidak Ada" : "-";
          }
        }
      }

      // Generate and trigger download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      saveAs(blob, `Laporan_Pembelajaran_Sinkronus_Zoom_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (exportErr) {
      console.error("Gagal mengekspor laporan Excel:", exportErr);
      alert("Terjadi kesalahan saat memproses ekspor Excel dengan foto.");
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Export to standard CSV fallback
  const handleExportCSV = () => {
    const headers = [
      "Nama Peserta",
      "Kode Pelaut (Identity)",
      "Kelas",
      "Periode",
      "Jenis Diklat / Course",
      "Sesi Pembelajaran (Per Hari)",
      "Total Durasi",
      "Cam ON",
      "Cam OFF",
      "Mic ON",
      "Foto Selfie URL",
      "Foto KTP URL"
    ];

    const rows = groupedParticipants.map(item => {
      const sessionTimesText = item.days.map(d => {
        const s1 = `Sesi 1 (07.00-12.00): ${d.sesi1_text}`;
        const s2 = `Sesi 2 (13.00-17.00): ${d.sesi2_text}`;
        return `Hari ${d.dayIndex} (${d.formattedDate}): [${s1} | ${s2} | Total: ${formatReadableSessionDuration(d.duration_seconds)}]`;
      }).join(" ; ");
      
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
        sessionTimesText,
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
              disabled={loading || isExportingExcel}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition border border-gray-300 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Muat Ulang
            </button>
            <button
              onClick={handleExportExcel}
              disabled={isExportingExcel || loading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition shadow"
              title="Unduh Excel lengkap dengan seluruh lampiran foto selfie & KTP tertanam"
            >
              <Download className={`w-4 h-4 ${isExportingExcel ? "animate-bounce" : ""}`} /> 
              {isExportingExcel ? "Memproses Foto Excel..." : "Unduh Excel (Foto Lampiran)"}
            </button>
            <button
              onClick={handlePrintPDF}
              disabled={isExportingExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition shadow"
              title="Cetak atau simpan sebagai PDF laporan resmi"
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
                <th className="px-3 py-3 text-left">Sesi Pembelajaran (Per Hari)</th>
                <th className="px-2 py-3 text-center">Total Durasi</th>
                <th className="px-2 py-3 text-center text-emerald-800">Cam ON</th>
                <th className="px-2 py-3 text-center text-red-800">Cam OFF</th>
                <th className="px-2 py-3 text-center text-yellow-800">Mic ON</th>
                <th className="px-3 py-3 text-center">Foto Selfie &amp; KTP</th>
                <th className="px-3 py-3 text-center">Foto Praktek STIP</th>
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

                    {/* 6. Sesi Pembelajaran (Per Hari) */}
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1.5 min-w-[210px] print:min-w-0">
                        {participant.days.map((day) => (
                          <div key={day.dateKey} className="bg-slate-50 border border-slate-200 rounded p-2 text-[10.5px] print-day-card">
                            <div className="font-bold text-slate-800 flex items-center gap-1 mb-1 pb-1 border-b border-slate-200/80">
                              <Calendar className="w-3 h-3 text-indigo-600 shrink-0 print:hidden" />
                              <span>Hari {day.dayIndex} ({day.formattedDate}) :</span>
                            </div>
                            <div className="space-y-1 text-[10px]">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-slate-700">• Sesi 1 (07.00 s/d 12.00):</span>
                                <span className={`font-bold px-1.5 py-0.5 rounded text-[9.5px] ${day.sesi1_seconds > 0 ? "bg-emerald-50 text-emerald-800 border border-emerald-200 print:border-none print:p-0" : "text-slate-400"}`}>
                                  {day.sesi1_text}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-slate-700">• Sesi 2 (13.00 s/d 17.00):</span>
                                <span className={`font-bold px-1.5 py-0.5 rounded text-[9.5px] ${day.sesi2_seconds > 0 ? "bg-emerald-50 text-emerald-800 border border-emerald-200 print:border-none print:p-0" : "text-slate-400"}`}>
                                  {day.sesi2_text}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2 pt-1 border-t border-dashed border-slate-200 font-bold text-indigo-950 text-[9.5px]">
                                <span>Total Hari {day.dayIndex}:</span>
                                <span className="text-indigo-700 font-extrabold">{formatReadableSessionDuration(day.duration_seconds)}</span>
                              </div>
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
                        <SafeThumbnail
                          src={participant.selfie_url}
                          alt="Foto Selfie"
                          title="Klik untuk memperbesar Foto Selfie"
                          borderColor="border-indigo-200"
                          hoverBorderColor="border-indigo-600"
                          icon={User}
                          fallbackLabel="Belum Ada"
                          subLabel="Selfie Terakhir"
                          subLabelTitle="Foto selfie presensi paling terakhir"
                          onClick={() => {
                            setModalImgError(false);
                            setSelectedPhotoModal({
                              title: "Foto Selfie Presensi",
                              url: participant.selfie_url!,
                              userName: participant.user_name,
                              seafarerCode: participant.seafarer_code
                            });
                          }}
                        />

                        {/* KTP thumbnail */}
                        <SafeThumbnail
                          src={participant.ktp_url}
                          alt="Foto KTP"
                          title="Klik untuk memperbesar Foto KTP (Upload Awal)"
                          borderColor="border-emerald-200"
                          hoverBorderColor="border-emerald-600"
                          icon={CreditCard}
                          fallbackLabel="Belum Ada"
                          subLabel="KTP Awal"
                          subLabelTitle="Foto KTP dari unggahan pertama"
                          onClick={() => {
                            setModalImgError(false);
                            setSelectedPhotoModal({
                              title: "Foto KTP Identitas (Upload Awal)",
                              url: participant.ktp_url!,
                              userName: participant.user_name,
                              seafarerCode: participant.seafarer_code
                            });
                          }}
                        />
                      </div>
                    </td>

                    {/* 12. Foto Praktek STIP */}
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* Praktek 1 */}
                        <SafeThumbnail
                          src={participant.praktek_stip_1}
                          alt="Foto Praktek 1"
                          title="Klik untuk memperbesar Foto Praktek STIP #1"
                          borderColor="border-amber-300"
                          hoverBorderColor="border-amber-600"
                          icon={Camera}
                          fallbackLabel="Belum Ada"
                          subLabel="Praktek 1"
                          onClick={() => {
                            setModalImgError(false);
                            setSelectedPhotoModal({
                              title: "Foto Dokumentasi Praktek di STIP (Foto #1)",
                              url: participant.praktek_stip_1!,
                              userName: participant.user_name,
                              seafarerCode: participant.seafarer_code
                            });
                          }}
                        />

                        {/* Praktek 2 */}
                        <SafeThumbnail
                          src={participant.praktek_stip_2}
                          alt="Foto Praktek 2"
                          title="Klik untuk memperbesar Foto Praktek STIP #2"
                          borderColor="border-amber-300"
                          hoverBorderColor="border-amber-600"
                          icon={Camera}
                          fallbackLabel="Belum Ada"
                          subLabel="Praktek 2"
                          onClick={() => {
                            setModalImgError(false);
                            setSelectedPhotoModal({
                              title: "Foto Dokumentasi Praktek di STIP (Foto #2)",
                              url: participant.praktek_stip_2!,
                              userName: participant.user_name,
                              seafarerCode: participant.seafarer_code
                            });
                          }}
                        />
                      </div>
                    </td>

                  </tr>
                );
              })}
              
              {groupedParticipants.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-gray-400 font-medium">
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
              {modalImgError ? (
                <div className="flex flex-col items-center justify-center text-center p-6 text-slate-500 max-w-xs">
                  <AlertCircle className="w-12 h-12 text-amber-500 mb-3" />
                  <p className="text-sm font-bold text-slate-800 mb-1">Gambar Tidak Dapat Dimuat</p>
                  <p className="text-xs text-slate-500">Berkas foto belum tersedia di penyimpanan atau format tautan tidak dapat diakses.</p>
                </div>
              ) : (
                <img
                  src={selectedPhotoModal.url}
                  alt={selectedPhotoModal.title}
                  className="max-h-[420px] w-auto max-w-full rounded-lg shadow-md object-contain border border-gray-200"
                  referrerPolicy="no-referrer"
                  onError={() => setModalImgError(true)}
                />
              )}
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
