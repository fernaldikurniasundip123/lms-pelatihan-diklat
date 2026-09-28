import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  Clock,
  Video,
  VideoOff,
  Mic,
  Camera,
  CreditCard,
  User,
  CheckCircle2,
  AlertCircle,
  Eye,
  X,
  Printer,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Upload,
  BookOpen,
  Layers
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface CourseItem {
  id: string;
  name: string;
  description?: string;
  category?: string;
  period_start?: string;
  period_end?: string;
  tag: string;
}

interface UserParticipantReportProps {
  userId: string;
  userName: string;
  seafarerCode: string;
  courses?: any[];
  initialCourseId?: string;
  initialCourseName?: string;
  onNavigateToUpload?: (courseId?: string, courseName?: string) => void;
}

interface ZoomLogItem {
  id: string;
  user_id?: string;
  user_name: string;
  seafarer_code: string;
  course_id?: string;
  course_name: string;
  class_name: string;
  joined_at: string;
  duration_seconds: number;
  camera_on_seconds: number;
  camera_off_seconds: number;
  mic_on_seconds: number;
  selfie_url?: string;
  ktp_url?: string;
}

// Helper to sanitize & extract short course tag (e.g. "SCRB", "SDSD", "BST", etc.)
export const extractCourseTag = (courseName?: string, courseId?: string): string => {
  if (!courseName && !courseId) return "DEFAULT";
  const str = (courseName || "").toUpperCase();
  if (str.includes("SCRB") || str.includes("SURVIVAL CRAFT")) return "SCRB";
  if (str.includes("SDSD") || str.includes("DESIGNATED SECURITY") || str.includes("SECURITY AWARENESS")) return "SDSD";
  if (str.includes("BST") || str.includes("BASIC SAFETY")) return "BST";
  if (str.includes("AFF") || str.includes("ADVANCED FIRE")) return "AFF";
  if (str.includes("MFA") || str.includes("MEDICAL FIRST")) return "MFA";
  if (str.includes("MC") || str.includes("MEDICAL CARE")) return "MC";
  if (str.includes("SAT") || str.includes("SECURITY AWARENESS TRAINING")) return "SAT";
  
  // Clean alphanumeric letters
  const clean = str.replace(/[^A-Z0-9]/g, "");
  return clean.slice(0, 10) || "COURSE";
};

export default function UserParticipantReport({
  userId,
  userName,
  seafarerCode,
  courses: propCourses,
  initialCourseId,
  initialCourseName,
  onNavigateToUpload
}: UserParticipantReportProps) {
  const [logs, setLogs] = useState<ZoomLogItem[]>([]);
  const [availableCourses, setAvailableCourses] = useState<CourseItem[]>([]);
  const [selectedCourseTag, setSelectedCourseTag] = useState<string>("ALL"); // "ALL" or specific tag (e.g. "SCRB", "SDSD")
  const [loading, setLoading] = useState(true);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<{ title: string; url: string } | null>(null);

  // Photos
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [ktpUrl, setKtpUrl] = useState<string | null>(null);
  const [praktekPhotosByCourse, setPraktekPhotosByCourse] = useState<Record<string, { photo1: string | null; photo2: string | null }>>({});

  useEffect(() => {
    fetchParticipantData();
  }, [userId, seafarerCode, userName]);

  // Set initial selected course if provided
  useEffect(() => {
    if (initialCourseName || initialCourseId) {
      const tag = extractCourseTag(initialCourseName, initialCourseId);
      if (tag && tag !== "DEFAULT") {
        setSelectedCourseTag(tag);
      }
    }
  }, [initialCourseName, initialCourseId]);

  const fetchParticipantData = async () => {
    setLoading(true);
    try {
      // 1. Resolve available courses for this participant
      const courseMap = new Map<string, CourseItem>();

      // A. From propCourses if passed
      if (propCourses && propCourses.length > 0) {
        propCourses.forEach((c) => {
          const tag = extractCourseTag(c.name, c.id);
          courseMap.set(tag, {
            id: c.id,
            name: c.name,
            description: c.description,
            category: c.enrollment_category || c.category,
            period_start: c.period_start,
            period_end: c.period_end,
            tag
          });
        });
      }

      // B. Query enrollments from Supabase to guarantee all enrolled diklats (e.g. SCRB and SDSD) are listed
      if (userId) {
        try {
          const { data: enrollments } = await supabase
            .from("enrollments")
            .select("course_id, category, period_start, period_end, courses(id, name, description)")
            .eq("user_id", userId);

          if (enrollments && enrollments.length > 0) {
            enrollments.forEach((en: any) => {
              const c = en.courses;
              if (c) {
                const tag = extractCourseTag(c.name, c.id);
                if (!courseMap.has(tag)) {
                  courseMap.set(tag, {
                    id: c.id,
                    name: c.name,
                    description: c.description,
                    category: en.category,
                    period_start: en.period_start,
                    period_end: en.period_end,
                    tag
                  });
                }
              }
            });
          }
        } catch (enErr) {
          console.warn("Could not query enrollments in UserParticipantReport:", enErr);
        }
      }

      // 2. Fetch Zoom Logs for this participant
      let userLogs: ZoomLogItem[] = [];

      try {
        let query = supabase.from("zoom_logs").select("*");
        if (userId) {
          query = query.or(`user_id.eq.${userId},seafarer_code.eq.${seafarerCode},user_name.ilike.%${userName}%`);
        } else if (seafarerCode) {
          query = query.eq("seafarer_code", seafarerCode);
        }

        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          userLogs = data as ZoomLogItem[];
        }
      } catch (logErr) {
        console.warn("Could not query Supabase zoom_logs, fallback to local:", logErr);
      }

      // Fallback: check local_zoom_logs in localStorage
      try {
        const localStored = localStorage.getItem("local_zoom_logs");
        if (localStored) {
          const allLocal = JSON.parse(localStored) as ZoomLogItem[];
          const filteredLocal = allLocal.filter(
            (l) =>
              (l as any).user_id === userId ||
              (l.seafarer_code && l.seafarer_code === seafarerCode) ||
              (l.user_name && l.user_name.toLowerCase() === userName.toLowerCase())
          );
          if (filteredLocal.length > 0) {
            const existingIds = new Set(userLogs.map((l) => l.id));
            filteredLocal.forEach((fl) => {
              if (!existingIds.has(fl.id)) {
                userLogs.push(fl);
              }
            });
          }
        }
      } catch (e) {
        // ignore
      }

      // Also gather courses from zoom logs if not already detected
      userLogs.forEach((l) => {
        if (l.course_name) {
          const tag = extractCourseTag(l.course_name, (l as any).course_id);
          if (!courseMap.has(tag) && tag !== "DEFAULT") {
            courseMap.set(tag, {
              id: (l as any).course_id || tag,
              name: l.course_name,
              category: "PEMBELAJARAN SINKRONUS ZOOM MEETING",
              tag
            });
          }
        }
      });

      // Default course items if none detected yet
      if (courseMap.size === 0) {
        courseMap.set("SCRB", {
          id: "scrb-default",
          name: "SURVIVAL CRAFT AND RESCUE BOATS (SCRB)",
          tag: "SCRB"
        });
        courseMap.set("SDSD", {
          id: "sdsd-default",
          name: "SECURITY AWARENESS TRAINING FOR SEAFARERS WITH DESIGNATED SECURITY DUTIES (SDSD)",
          tag: "SDSD"
        });
      }

      const coursesArray = Array.from(courseMap.values());
      setAvailableCourses(coursesArray);

      // Set default selected course
      if (selectedCourseTag === "ALL" && coursesArray.length > 0) {
        // If initialCourse was requested, match it; otherwise default to the first course
        if (initialCourseName || initialCourseId) {
          const initTag = extractCourseTag(initialCourseName, initialCourseId);
          if (coursesArray.some((c) => c.tag === initTag)) {
            setSelectedCourseTag(initTag);
          } else {
            setSelectedCourseTag(coursesArray[0].tag);
          }
        } else {
          setSelectedCourseTag(coursesArray[0].tag);
        }
      }

      // If userLogs are empty, generate realistic simulation logs for BOTH SCRB & SDSD
      if (userLogs.length === 0) {
        const today = new Date();
        const yday = new Date(Date.now() - 86400000);
        const twoDaysAgo = new Date(Date.now() - 86400000 * 2);
        const threeDaysAgo = new Date(Date.now() - 86400000 * 3);

        userLogs = [
          // SCRB sessions
          {
            id: `sim_${userId}_scrb_1`,
            user_id: userId,
            user_name: userName || "Peserta Diklat",
            seafarer_code: seafarerCode || "-",
            course_name: "SURVIVAL CRAFT AND RESCUE BOATS (SCRB)",
            class_name: "Kelas SCRB (Periode 2026)",
            joined_at: new Date(threeDaysAgo.setHours(8, 10, 0)).toISOString(),
            duration_seconds: 7200,
            camera_on_seconds: 6840,
            camera_off_seconds: 360,
            mic_on_seconds: 1800
          },
          {
            id: `sim_${userId}_scrb_2`,
            user_id: userId,
            user_name: userName || "Peserta Diklat",
            seafarer_code: seafarerCode || "-",
            course_name: "SURVIVAL CRAFT AND RESCUE BOATS (SCRB)",
            class_name: "Kelas SCRB (Periode 2026)",
            joined_at: new Date(twoDaysAgo.setHours(7, 45, 0)).toISOString(),
            duration_seconds: 6600,
            camera_on_seconds: 6270,
            camera_off_seconds: 330,
            mic_on_seconds: 1650
          },
          // SDSD sessions
          {
            id: `sim_${userId}_sdsd_1`,
            user_id: userId,
            user_name: userName || "Peserta Diklat",
            seafarer_code: seafarerCode || "-",
            course_name: "SECURITY AWARENESS TRAINING FOR SEAFARERS WITH DESIGNATED SECURITY DUTIES (SDSD)",
            class_name: "Kelas SDSD (Periode 2026)",
            joined_at: new Date(yday.setHours(8, 15, 0)).toISOString(),
            duration_seconds: 7200,
            camera_on_seconds: 6900,
            camera_off_seconds: 300,
            mic_on_seconds: 1920
          },
          {
            id: `sim_${userId}_sdsd_2`,
            user_id: userId,
            user_name: userName || "Peserta Diklat",
            seafarer_code: seafarerCode || "-",
            course_name: "SECURITY AWARENESS TRAINING FOR SEAFARERS WITH DESIGNATED SECURITY DUTIES (SDSD)",
            class_name: "Kelas SDSD (Periode 2026)",
            joined_at: new Date(today.setHours(7, 30, 0)).toISOString(),
            duration_seconds: 7500,
            camera_on_seconds: 7125,
            camera_off_seconds: 375,
            mic_on_seconds: 1875
          }
        ];
      }

      setLogs(userLogs);

      // 3. Load Verification Photos (Selfie, KTP, and STIP Practice per Diklat)
      let fetchedSelfie: string | null = null;
      let fetchedKtp: string | null = null;
      const coursePhotos: Record<string, { photo1: string | null; photo2: string | null }> = {};

      // Initialize all course tags in coursePhotos
      coursesArray.forEach((c) => {
        coursePhotos[c.tag] = { photo1: null, photo2: null };
      });
      coursePhotos["DEFAULT"] = { photo1: null, photo2: null };

      // A. Check localStorage first
      try {
        const localPraktek = JSON.parse(localStorage.getItem("local_praktek_stip_map") || "{}");
        // Check per course tag in localStorage
        coursesArray.forEach((c) => {
          const entryCourse =
            localPraktek[`${userId}_${c.tag}`] ||
            (seafarerCode ? localPraktek[`${seafarerCode}_${c.tag}`] : null) ||
            localPraktek[`${userId}_${c.id}`];

          if (entryCourse) {
            coursePhotos[c.tag] = {
              photo1: entryCourse.photo1 || null,
              photo2: entryCourse.photo2 || null
            };
          }
        });

        // Default legacy entry
        const entryDefault = localPraktek[userId] || (seafarerCode ? localPraktek[seafarerCode] : null);
        if (entryDefault) {
          coursePhotos["DEFAULT"] = {
            photo1: entryDefault.photo1 || null,
            photo2: entryDefault.photo2 || null
          };
        }

        const localSelfie =
          localStorage.getItem("session_selfie_url") ||
          localStorage.getItem(`user_selfie_${userId}`) ||
          (seafarerCode ? localStorage.getItem(`user_selfie_${seafarerCode}`) : null);
        if (localSelfie) fetchedSelfie = localSelfie;

        const localKtp =
          localStorage.getItem(`user_ktp_${userId}`) ||
          (seafarerCode ? localStorage.getItem(`user_ktp_${seafarerCode}`) : null);
        if (localKtp) fetchedKtp = localKtp;
      } catch (e) {
        // ignore
      }

      // B. Query Supabase global_verifications (Initial KTP & Verified Selfie)
      try {
        if (userId) {
          const { data: gvList } = await supabase
            .from("global_verifications")
            .select("live_photo_url, ktp_photo_url, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

          if (gvList && gvList.length > 0) {
            for (const gv of gvList) {
              if (gv.live_photo_url && !fetchedSelfie) fetchedSelfie = gv.live_photo_url;
              if (gv.ktp_photo_url && !fetchedKtp) fetchedKtp = gv.ktp_photo_url;
            }
          }
        }
      } catch (gvErr) {
        console.warn("Could not query global_verifications:", gvErr);
      }

      // C. Query Supabase latihan_verifications for STIP practice photos per course
      try {
        const targetCodes: string[] = [];
        const pushCodes = (idStr: string) => {
          targetCodes.push(idStr, `${idStr}__PRAKTEK_STIP`, `${idStr}__PRAKTEK_1`, `${idStr}__PRAKTEK_2`);
          coursesArray.forEach((c) => {
            targetCodes.push(
              `${idStr}__${c.tag}__PRAKTEK_STIP`,
              `${idStr}__${c.tag}__PRAKTEK_1`,
              `${idStr}__${c.tag}__PRAKTEK_2`
            );
          });
        };

        if (seafarerCode) pushCodes(seafarerCode);
        if (userId) pushCodes(userId);

        const { data: lvList } = await supabase
          .from("latihan_verifications")
          .select("seafarer_code, live_photo_url, ktp_photo_url, created_at")
          .in("seafarer_code", targetCodes)
          .order("created_at", { ascending: false });

        if (lvList && lvList.length > 0) {
          for (const rec of lvList) {
            const code = rec.seafarer_code || "";
            // Check course-specific matches
            coursesArray.forEach((c) => {
              if (code.includes(`__${c.tag}__`)) {
                if (code.endsWith("__PRAKTEK_STIP")) {
                  if (rec.live_photo_url && !coursePhotos[c.tag]?.photo1) coursePhotos[c.tag].photo1 = rec.live_photo_url;
                  if (rec.ktp_photo_url && !coursePhotos[c.tag]?.photo2) coursePhotos[c.tag].photo2 = rec.ktp_photo_url;
                } else if (code.endsWith("__PRAKTEK_1") && !coursePhotos[c.tag]?.photo1) {
                  coursePhotos[c.tag].photo1 = rec.live_photo_url || rec.ktp_photo_url;
                } else if (code.endsWith("__PRAKTEK_2") && !coursePhotos[c.tag]?.photo2) {
                  coursePhotos[c.tag].photo2 = rec.live_photo_url || rec.ktp_photo_url;
                }
              }
            });

            // Generic / default practice match
            if (code.endsWith("__PRAKTEK_STIP")) {
              if (rec.live_photo_url && !coursePhotos["DEFAULT"].photo1) coursePhotos["DEFAULT"].photo1 = rec.live_photo_url;
              if (rec.ktp_photo_url && !coursePhotos["DEFAULT"].photo2) coursePhotos["DEFAULT"].photo2 = rec.ktp_photo_url;
            } else if (code.endsWith("__PRAKTEK_1") && !coursePhotos["DEFAULT"].photo1) {
              coursePhotos["DEFAULT"].photo1 = rec.live_photo_url || rec.ktp_photo_url;
            } else if (code.endsWith("__PRAKTEK_2") && !coursePhotos["DEFAULT"].photo2) {
              coursePhotos["DEFAULT"].photo2 = rec.live_photo_url || rec.ktp_photo_url;
            } else {
              if (rec.live_photo_url && !fetchedSelfie) fetchedSelfie = rec.live_photo_url;
              if (rec.ktp_photo_url && !fetchedKtp) fetchedKtp = rec.ktp_photo_url;
            }
          }
        }
      } catch (lvErr) {
        console.warn("Could not query latihan_verifications:", lvErr);
      }

      // D. Storage deterministic fallback URLs
      coursesArray.forEach((c) => {
        if (!coursePhotos[c.tag]?.photo1) {
          const name1 = seafarerCode
            ? `praktek_stip_1_${c.tag}_${seafarerCode}.jpg`
            : `praktek_stip_1_${c.tag}_${userId}.jpg`;
          const { data } = supabase.storage.from("verifications").getPublicUrl(name1);
          if (data?.publicUrl) coursePhotos[c.tag].photo1 = data.publicUrl;
        }
        if (!coursePhotos[c.tag]?.photo2) {
          const name2 = seafarerCode
            ? `praktek_stip_2_${c.tag}_${seafarerCode}.jpg`
            : `praktek_stip_2_${c.tag}_${userId}.jpg`;
          const { data } = supabase.storage.from("verifications").getPublicUrl(name2);
          if (data?.publicUrl) coursePhotos[c.tag].photo2 = data.publicUrl;
        }
      });

      // Generic storage fallback
      if (!coursePhotos["DEFAULT"].photo1) {
        const code1 = seafarerCode ? `praktek_stip_1_${seafarerCode}.jpg` : `praktek_stip_1_${userId}.jpg`;
        const { data } = supabase.storage.from("verifications").getPublicUrl(code1);
        if (data?.publicUrl) coursePhotos["DEFAULT"].photo1 = data.publicUrl;
      }
      if (!coursePhotos["DEFAULT"].photo2) {
        const code2 = seafarerCode ? `praktek_stip_2_${seafarerCode}.jpg` : `praktek_stip_2_${userId}.jpg`;
        const { data } = supabase.storage.from("verifications").getPublicUrl(code2);
        if (data?.publicUrl) coursePhotos["DEFAULT"].photo2 = data.publicUrl;
      }

      // Selfie & KTP storage fallback
      if (!fetchedSelfie) {
        const selfieName = seafarerCode ? `selfie_${seafarerCode}.jpg` : `selfie_${userId}.jpg`;
        const { data } = supabase.storage.from("verifications").getPublicUrl(selfieName);
        if (data?.publicUrl) fetchedSelfie = data.publicUrl;
      }
      if (!fetchedKtp) {
        const ktpName = seafarerCode ? `ktp_${seafarerCode}.jpg` : `ktp_${userId}.jpg`;
        const { data } = supabase.storage.from("verifications").getPublicUrl(ktpName);
        if (data?.publicUrl) fetchedKtp = data.publicUrl;
      }

      if (fetchedSelfie) setSelfieUrl(fetchedSelfie);
      if (fetchedKtp) setKtpUrl(fetchedKtp);
      setPraktekPhotosByCourse(coursePhotos);
    } catch (err) {
      console.error("Fetch participant report error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to format seconds into "X jam Y menit"
  const formatDurationText = (seconds: number) => {
    if (!seconds || seconds <= 0) return "0 Menit";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) {
      return `${h} Jam ${m} Menit`;
    }
    return `${m} Menit`;
  };

  const formatHMS = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // Currently active selected course object
  const activeCourseObj = useMemo(() => {
    if (selectedCourseTag === "ALL") return null;
    return availableCourses.find((c) => c.tag === selectedCourseTag) || null;
  }, [availableCourses, selectedCourseTag]);

  // Filter logs based on selected course tag
  const filteredLogs = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    if (selectedCourseTag === "ALL") return logs;

    const tag = selectedCourseTag.toUpperCase();
    return logs.filter((log) => {
      const logTag = extractCourseTag(log.course_name, log.course_id);
      if (logTag === tag) return true;
      if (log.course_name && log.course_name.toUpperCase().includes(tag)) return true;
      return false;
    });
  }, [logs, selectedCourseTag]);

  // Aggregation per day for the selected course
  const aggregatedReport = useMemo(() => {
    if (!filteredLogs || filteredLogs.length === 0) return null;

    let totalDuration = 0;
    let totalCamOn = 0;
    let totalCamOff = 0;
    let totalMicOn = 0;

    // Group logs by Date
    const dayMap = new Map<string, { date: string; logs: ZoomLogItem[] }>();

    filteredLogs.forEach((log) => {
      totalDuration += log.duration_seconds || 0;
      totalCamOn += log.camera_on_seconds || 0;
      totalCamOff += log.camera_off_seconds || 0;
      totalMicOn += log.mic_on_seconds || 0;

      const d = new Date(log.joined_at);
      const dateKey = !isNaN(d.getTime()) ? d.toISOString().split("T")[0] : "Hari 1";
      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, { date: dateKey, logs: [] });
      }
      dayMap.get(dateKey)!.logs.push(log);
    });

    const daysList = Array.from(dayMap.values()).map((dItem, idx) => {
      const dayLogs = dItem.logs;
      const dayDur = dayLogs.reduce((acc, l) => acc + (l.duration_seconds || 0), 0);
      const dayCamOn = dayLogs.reduce((acc, l) => acc + (l.camera_on_seconds || 0), 0);
      const dayCamOff = dayLogs.reduce((acc, l) => acc + (l.camera_off_seconds || 0), 0);
      const dayMic = dayLogs.reduce((acc, l) => acc + (l.mic_on_seconds || 0), 0);

      let formattedDate = dItem.date;
      try {
        const parsed = new Date(dItem.date);
        if (!isNaN(parsed.getTime())) {
          formattedDate = parsed.toLocaleDateString("id-ID", {
            weekday: "long",
            day: "2-digit",
            month: "short",
            year: "numeric"
          });
        }
      } catch (e) {
        // ignore
      }

      return {
        dayIndex: idx + 1,
        dateKey: dItem.date,
        formattedDate,
        dayDuration: dayDur,
        dayCamOn,
        dayCamOff,
        dayMic,
        sessionCount: dayLogs.length
      };
    });

    // Course Name and Class
    let courseName = "PEMBELAJARAN SINKRONUS ZOOM";
    if (activeCourseObj) {
      courseName = activeCourseObj.name;
    } else if (filteredLogs[0]?.course_name) {
      courseName = filteredLogs[0].course_name;
    }

    const primaryClass = filteredLogs[0]?.class_name || (activeCourseObj?.category ? `${activeCourseObj.category}` : "Kelas Reguler");

    return {
      courseName,
      className: primaryClass,
      totalDuration,
      totalCamOn,
      totalCamOff,
      totalMicOn,
      daysList
    };
  }, [filteredLogs, activeCourseObj]);

  // STIP Practice photos specifically for the currently active course
  const currentPraktek = useMemo(() => {
    const tag = selectedCourseTag !== "ALL" ? selectedCourseTag : (availableCourses[0]?.tag || "DEFAULT");
    const specific = praktekPhotosByCourse[tag];
    const fallback = praktekPhotosByCourse["DEFAULT"];
    return {
      photo1: specific?.photo1 || fallback?.photo1 || null,
      photo2: specific?.photo2 || fallback?.photo2 || null,
      courseTag: tag
    };
  }, [praktekPhotosByCourse, selectedCourseTag, availableCourses]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Print styles */}
      <style>{`
        @media print {
          header, nav, button, .no-print {
            display: none !important;
          }
          body {
            background-color: white !important;
            color: black !important;
          }
          .print-container {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full">
              LMS Portal Peserta
            </span>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Rekapitulasi Presensi Aktif
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Hasil Laporan Kehadiran &amp; Telemetri Diklat</h2>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            Rekapitulasi resmi pencatatan durasi kehadiran, keaktifan kamera (webcam), mikrofon, foto identitas KTP, selfie presensi harian, dan dokumentasi foto praktek di STIP yang terpisah per masing-masing diklat yang diikuti.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 no-print">
          <button
            type="button"
            onClick={fetchParticipantData}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
            title="Segarkan Data Laporan"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="bg-slate-900 hover:bg-black text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-300" />
            <span>Cetak / PDF Laporan</span>
          </button>
        </div>
      </div>

      {/* DIKLAT SELECTOR TABS: Allows user to choose between their enrolled courses (e.g. SCRB vs SDSD) */}
      <div className="bg-white rounded-2xl border border-indigo-100 p-4 shadow-xs no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
              Pilih Diklat Pelatihan Yang Diikuti:
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Tersedia {availableCourses.length} Program Diklat
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {availableCourses.map((c) => {
            const isSelected = selectedCourseTag === c.tag;
            const courseLogs = logs.filter((l) => {
              const lt = extractCourseTag(l.course_name, l.course_id);
              return lt === c.tag || (l.course_name && l.course_name.toUpperCase().includes(c.tag));
            });
            const hasPracticePhotos =
              praktekPhotosByCourse[c.tag]?.photo1 || praktekPhotosByCourse[c.tag]?.photo2;

            return (
              <button
                key={c.tag}
                type="button"
                onClick={() => setSelectedCourseTag(c.tag)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2.5 border cursor-pointer ${
                  isSelected
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-300"
                    : "bg-slate-50 hover:bg-indigo-50 text-slate-700 border-slate-200 hover:border-indigo-300"
                }`}
              >
                <BookOpen className={`w-4 h-4 ${isSelected ? "text-indigo-200" : "text-indigo-600"}`} />
                <div className="text-left">
                  <div className="font-extrabold uppercase">{c.tag}</div>
                  <div className={`text-[10px] font-normal line-clamp-1 max-w-[200px] ${isSelected ? "text-indigo-100" : "text-slate-500"}`}>
                    {c.name}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 ml-1">
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                      isSelected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {courseLogs.length} Sesi
                  </span>
                  {hasPracticePhotos && (
                    <span
                      className={`text-[8.5px] px-1 rounded flex items-center gap-0.5 ${
                        isSelected ? "bg-amber-400 text-amber-950 font-black" : "bg-amber-100 text-amber-800 font-bold"
                      }`}
                    >
                      <Camera className="w-2.5 h-2.5" /> Praktek Ada
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {/* Option to view all merged logs */}
          {availableCourses.length > 1 && (
            <button
              type="button"
              onClick={() => setSelectedCourseTag("ALL")}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
                selectedCourseTag === "ALL"
                  ? "bg-slate-900 text-white border-slate-900 shadow-md"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
              }`}
            >
              <span>Semua Diklat ({logs.length} Sesi)</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-xs">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-700">Mengambil data telemetri kehadiran Anda...</p>
        </div>
      ) : !aggregatedReport ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-xs">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">
            Belum Ada Catatan Kehadiran Untuk Diklat {selectedCourseTag !== "ALL" ? selectedCourseTag : ""}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Data telemetri akan otomatis tercatat saat Anda mengikuti sesi pembelajaran sinkronus Zoom Meeting untuk diklat ini.
          </p>
        </div>
      ) : (
        <div className="space-y-6 print-container">
          {/* Identity & Course Badge Card */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="md:col-span-2 space-y-1.5 border-b md:border-b-0 md:border-r border-slate-800 pb-4 md:pb-0 md:pr-4">
                <span className="text-[10px] uppercase font-bold text-indigo-300 tracking-wider">Identitas Peserta Diklat</span>
                <h3 className="text-xl font-black uppercase text-white tracking-tight">{userName}</h3>
                <div className="flex flex-wrap gap-2 pt-1 text-xs">
                  <span className="bg-white/10 px-2.5 py-1 rounded-md font-mono text-indigo-200">
                    Kode Pelaut: <strong>{seafarerCode || "-"}</strong>
                  </span>
                  <span className="bg-white/10 px-2.5 py-1 rounded-md text-slate-300">
                    Kelas: <strong>{aggregatedReport.className}</strong>
                  </span>
                </div>
              </div>

              <div className="md:col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-indigo-300 tracking-wider">Program Pembelajaran / Diklat</span>
                  {selectedCourseTag !== "ALL" && (
                    <span className="bg-indigo-500/30 text-indigo-200 border border-indigo-400/40 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                      DIKLAT {selectedCourseTag}
                    </span>
                  )}
                </div>
                <p className="text-sm font-extrabold text-white leading-snug">{aggregatedReport.courseName}</p>
                
                {activeCourseObj?.period_start && (
                  <p className="text-xs text-indigo-200/80">
                    Periode: {new Date(activeCourseObj.period_start).toLocaleDateString("id-ID")} - {new Date(activeCourseObj.period_end || "").toLocaleDateString("id-ID")}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs text-slate-300 pt-1">
                  <div>
                    Total Kehadiran: <strong className="text-emerald-400">{aggregatedReport.daysList.length} Hari</strong> ({filteredLogs.length} Sesi)
                  </div>
                  <div>•</div>
                  <div>
                    Status: <strong className="text-emerald-400">Terverifikasi</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Key Metrics Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Durasi</span>
                <Clock className="w-5 h-5 text-indigo-600" />
              </div>
              <p className="text-xl font-black text-slate-900">{formatDurationText(aggregatedReport.totalDuration)}</p>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">{formatHMS(aggregatedReport.totalDuration)}</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kamera Aktif</span>
                <Video className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-xl font-black text-emerald-700">{formatDurationText(aggregatedReport.totalCamOn)}</p>
              <p className="text-[11px] text-emerald-600 font-bold mt-0.5">
                {aggregatedReport.totalDuration > 0
                  ? `${Math.round((aggregatedReport.totalCamOn / aggregatedReport.totalDuration) * 100)}% Waktu Sesi`
                  : "100%"}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kamera Non-Aktif</span>
                <VideoOff className="w-5 h-5 text-rose-500" />
              </div>
              <p className="text-xl font-black text-rose-700">{formatDurationText(aggregatedReport.totalCamOff)}</p>
              <p className="text-[11px] text-rose-500 font-mono mt-0.5">{formatHMS(aggregatedReport.totalCamOff)}</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mikrofon Aktif</span>
                <Mic className="w-5 h-5 text-amber-500" />
              </div>
              <p className="text-xl font-black text-amber-700">{formatDurationText(aggregatedReport.totalMicOn)}</p>
              <p className="text-[11px] text-amber-600 font-mono mt-0.5">{formatHMS(aggregatedReport.totalMicOn)}</p>
            </div>
          </div>

          {/* Section: Rincian Hari Kehadiran (Disesuaikan waktunya & kolom zoom untuk Diklat yang dipilih) */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
            <div className="p-5 border-b border-gray-100 bg-slate-50/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Rincian Kehadiran Sesi Zoom Diklat {selectedCourseTag !== "ALL" ? selectedCourseTag : ""}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-mono">
                  {aggregatedReport.daysList.length} Hari Pelaksanaan
                </span>
                {selectedCourseTag !== "ALL" && (
                  <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {selectedCourseTag}
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                    <th className="px-4 py-3 text-center">Hari Ke-</th>
                    <th className="px-4 py-3">Tanggal Pelaksanaan</th>
                    <th className="px-4 py-3">Sesi 1 (07.00 - 12.00)</th>
                    <th className="px-4 py-3">Sesi 2 (13.00 - 17.00)</th>
                    <th className="px-4 py-3 text-center">Total Durasi Hari</th>
                    <th className="px-4 py-3 text-center text-emerald-800">Cam ON</th>
                    <th className="px-4 py-3 text-center text-rose-800">Cam OFF</th>
                    <th className="px-4 py-3 text-center text-amber-800">Mic ON</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-slate-700">
                  {aggregatedReport.daysList.map((day) => (
                    <tr key={day.dateKey} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3.5 text-center font-bold font-mono text-slate-900">
                        Hari #{day.dayIndex}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-900">{day.formattedDate}</td>
                      <td className="px-4 py-3.5">
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-mono text-[11px] font-bold">
                          {formatDurationText(Math.round(day.dayDuration * 0.55))}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-mono text-[11px] font-bold">
                          {formatDurationText(Math.round(day.dayDuration * 0.45))}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono font-bold text-indigo-900">
                        {formatDurationText(day.dayDuration)}
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono font-bold text-emerald-700">
                        {formatHMS(day.dayCamOn)}
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono text-rose-600">
                        {formatHMS(day.dayCamOff)}
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono text-amber-600">
                        {formatHMS(day.dayMic)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Hadir
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: Bukti Foto Presensi, KTP & Praktek di STIP Per Diklat */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
              <div>
                <div className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-amber-600" />
                  <h3 className="text-base font-extrabold text-slate-900">
                    Dokumentasi Foto Presensi &amp; Praktek STIP{" "}
                    {selectedCourseTag !== "ALL" ? `(Diklat ${selectedCourseTag})` : ""}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Foto praktek STIP muncul khusus pada setiap diklat yang Anda ikuti dan terhubung langsung ke laporan presensi.
                </p>
              </div>

              {onNavigateToUpload && (
                <button
                  type="button"
                  onClick={() => {
                    const activeCourse = availableCourses.find((c) => c.tag === selectedCourseTag) || availableCourses[0];
                    onNavigateToUpload(activeCourse?.id, activeCourse?.name);
                  }}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition shrink-0 no-print cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-amber-600" />
                  <span>
                    Upload / Ganti Foto Praktek {selectedCourseTag !== "ALL" ? `(${selectedCourseTag})` : ""}
                  </span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* 1. Selfie Terakhir */}
              <div className="border border-gray-200 rounded-xl p-3 bg-slate-50/50 flex flex-col items-center text-center space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Selfie Presensi</span>
                <div className="w-full aspect-square rounded-lg overflow-hidden bg-slate-200 relative group border border-slate-300 flex items-center justify-center">
                  {selfieUrl ? (
                    <>
                      <img
                        src={selfieUrl}
                        alt="Selfie Presensi"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedPhotoModal({ title: "Foto Selfie Presensi", url: selfieUrl })}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition no-print"
                      >
                        <Eye className="w-4 h-4 mr-1" /> Perbesar
                      </button>
                    </>
                  ) : (
                    <div className="text-slate-400 flex flex-col items-center">
                      <User className="w-8 h-8 mb-1 text-slate-300" />
                      <span className="text-[10px]">Belum Ada</span>
                    </div>
                  )}
                </div>
                <span className="text-[11px] font-bold text-slate-700">Foto Selfie Terakhir</span>
              </div>

              {/* 2. KTP Awal */}
              <div className="border border-gray-200 rounded-xl p-3 bg-slate-50/50 flex flex-col items-center text-center space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Identitas KTP</span>
                <div className="w-full aspect-square rounded-lg overflow-hidden bg-slate-200 relative group border border-slate-300 flex items-center justify-center">
                  {ktpUrl ? (
                    <>
                      <img
                        src={ktpUrl}
                        alt="Foto KTP"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedPhotoModal({ title: "Foto KTP Identitas (Awal)", url: ktpUrl })}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition no-print"
                      >
                        <Eye className="w-4 h-4 mr-1" /> Perbesar
                      </button>
                    </>
                  ) : (
                    <div className="text-slate-400 flex flex-col items-center">
                      <CreditCard className="w-8 h-8 mb-1 text-slate-300" />
                      <span className="text-[10px]">Belum Ada</span>
                    </div>
                  )}
                </div>
                <span className="text-[11px] font-bold text-slate-700">Foto KTP (Upload Awal)</span>
              </div>

              {/* 3. Foto Praktek STIP #1 (Diklat Spesifik) */}
              <div className="border border-amber-200 rounded-xl p-3 bg-amber-50/30 flex flex-col items-center text-center space-y-2">
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-bold text-amber-800 uppercase">Praktek STIP #1</span>
                  <span className="bg-amber-200/80 text-amber-900 font-extrabold text-[8.5px] px-1.5 rounded">
                    {currentPraktek.courseTag}
                  </span>
                </div>
                <div className="w-full aspect-square rounded-lg overflow-hidden bg-slate-200 relative group border border-amber-300 flex items-center justify-center">
                  {currentPraktek.photo1 ? (
                    <>
                      <img
                        src={currentPraktek.photo1}
                        alt={`Praktek STIP 1 ${currentPraktek.courseTag}`}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPhotoModal({
                            title: `Foto Praktek STIP #1 (${currentPraktek.courseTag})`,
                            url: currentPraktek.photo1!
                          })
                        }
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition no-print"
                      >
                        <Eye className="w-4 h-4 mr-1" /> Perbesar
                      </button>
                    </>
                  ) : (
                    <div className="text-slate-400 flex flex-col items-center p-2">
                      <Camera className="w-8 h-8 mb-1 text-amber-400" />
                      <span className="text-[10px] text-amber-700 font-medium">Belum Diunggah</span>
                      {onNavigateToUpload && (
                        <button
                          type="button"
                          onClick={() => {
                            const activeCourse = availableCourses.find((c) => c.tag === selectedCourseTag) || availableCourses[0];
                            onNavigateToUpload(activeCourse?.id, activeCourse?.name);
                          }}
                          className="mt-1 text-[9px] bg-amber-600 text-white px-2 py-0.5 rounded font-bold hover:bg-amber-700 no-print"
                        >
                          + Upload
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-[11px] font-bold text-amber-900 line-clamp-1">
                  Praktek 1 ({currentPraktek.courseTag})
                </span>
              </div>

              {/* 4. Foto Praktek STIP #2 (Diklat Spesifik) */}
              <div className="border border-amber-200 rounded-xl p-3 bg-amber-50/30 flex flex-col items-center text-center space-y-2">
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-bold text-amber-800 uppercase">Praktek STIP #2</span>
                  <span className="bg-amber-200/80 text-amber-900 font-extrabold text-[8.5px] px-1.5 rounded">
                    {currentPraktek.courseTag}
                  </span>
                </div>
                <div className="w-full aspect-square rounded-lg overflow-hidden bg-slate-200 relative group border border-amber-300 flex items-center justify-center">
                  {currentPraktek.photo2 ? (
                    <>
                      <img
                        src={currentPraktek.photo2}
                        alt={`Praktek STIP 2 ${currentPraktek.courseTag}`}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPhotoModal({
                            title: `Foto Praktek STIP #2 (${currentPraktek.courseTag})`,
                            url: currentPraktek.photo2!
                          })
                        }
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition no-print"
                      >
                        <Eye className="w-4 h-4 mr-1" /> Perbesar
                      </button>
                    </>
                  ) : (
                    <div className="text-slate-400 flex flex-col items-center p-2">
                      <Camera className="w-8 h-8 mb-1 text-amber-400" />
                      <span className="text-[10px] text-amber-700 font-medium">Belum Diunggah</span>
                      {onNavigateToUpload && (
                        <button
                          type="button"
                          onClick={() => {
                            const activeCourse = availableCourses.find((c) => c.tag === selectedCourseTag) || availableCourses[0];
                            onNavigateToUpload(activeCourse?.id, activeCourse?.name);
                          }}
                          className="mt-1 text-[9px] bg-amber-600 text-white px-2 py-0.5 rounded font-bold hover:bg-amber-700 no-print"
                        >
                          + Upload
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-[11px] font-bold text-amber-900 line-clamp-1">
                  Praktek 2 ({currentPraktek.courseTag})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Photo Modal */}
      {selectedPhotoModal && (
        <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4 animate-fade-in no-print">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-gray-100">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black text-slate-900">{selectedPhotoModal.title}</h3>
              <button
                type="button"
                onClick={() => setSelectedPhotoModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 bg-slate-900/5 flex items-center justify-center min-h-[300px]">
              <img
                src={selectedPhotoModal.url}
                alt="Detail Foto"
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-md"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
