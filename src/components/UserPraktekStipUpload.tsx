import React, { useState, useEffect, useRef } from "react";
import {
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Eye,
  X,
  RefreshCw,
  FileText,
  ArrowRight,
  BookOpen,
  Layers,
  Sparkles
} from "lucide-react";
import Webcam from "react-webcam";
import { supabase } from "../lib/supabase";
import { compressImageFile } from "../utils/imageCompression";
import { extractCourseTag } from "./UserParticipantReport";

interface CourseItem {
  id: string;
  name: string;
  tag: string;
  category?: string;
}

interface UserPraktekStipUploadProps {
  userId: string;
  userName: string;
  seafarerCode: string;
  courses?: any[];
  selectedCourse?: { id: string; name: string } | null;
  onSelectCourse?: (course: { id: string; name: string }) => void;
  onNavigateToReport?: () => void;
}

export default function UserPraktekStipUpload({
  userId,
  userName,
  seafarerCode,
  courses: propCourses,
  selectedCourse,
  onSelectCourse,
  onNavigateToReport
}: UserPraktekStipUploadProps) {
  const [availableCourses, setAvailableCourses] = useState<CourseItem[]>([]);
  const [activeCourseTag, setActiveCourseTag] = useState<string>("SCRB");
  const [photo1, setPhoto1] = useState<string | null>(null);
  const [photo2, setPhoto2] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingSlot, setUploadingSlot] = useState<1 | 2 | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Camera modal state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeCameraSlot, setActiveCameraSlot] = useState<1 | 2>(1);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const webcamRef = useRef<Webcam>(null);

  // Fullscreen photo preview modal
  const [previewPhotoModal, setPreviewPhotoModal] = useState<{ title: string; url: string } | null>(null);

  // 1. Initialize available courses
  useEffect(() => {
    initCourses();
  }, [propCourses, userId]);

  const initCourses = async () => {
    const map = new Map<string, CourseItem>();

    if (propCourses && propCourses.length > 0) {
      propCourses.forEach((c) => {
        const tag = extractCourseTag(c.name, c.id);
        map.set(tag, {
          id: c.id,
          name: c.name,
          tag,
          category: c.enrollment_category || c.category
        });
      });
    }

    if (userId) {
      try {
        const { data: enrollments } = await supabase
          .from("enrollments")
          .select("course_id, category, courses(id, name)")
          .eq("user_id", userId);

        if (enrollments && enrollments.length > 0) {
          enrollments.forEach((en: any) => {
            if (en.courses) {
              const tag = extractCourseTag(en.courses.name, en.courses.id);
              if (!map.has(tag)) {
                map.set(tag, {
                  id: en.courses.id,
                  name: en.courses.name,
                  tag,
                  category: en.category
                });
              }
            }
          });
        }
      } catch (err) {
        console.warn("Could not query enrollments in UserPraktekStipUpload:", err);
      }
    }

    // Default fallback if no courses detected
    if (map.size === 0) {
      map.set("SCRB", {
        id: "scrb-default",
        name: "SURVIVAL CRAFT AND RESCUE BOATS (SCRB)",
        tag: "SCRB"
      });
      map.set("SDSD", {
        id: "sdsd-default",
        name: "SECURITY AWARENESS TRAINING FOR SEAFARERS WITH DESIGNATED SECURITY DUTIES (SDSD)",
        tag: "SDSD"
      });
    }

    const arr = Array.from(map.values());
    setAvailableCourses(arr);

    // Set active course tag
    if (selectedCourse?.name || selectedCourse?.id) {
      const tag = extractCourseTag(selectedCourse.name, selectedCourse.id);
      setActiveCourseTag(tag);
    } else if (arr.length > 0) {
      setActiveCourseTag(arr[0].tag);
    }
  };

  // Sync selectedCourse from props if changed externally
  useEffect(() => {
    if (selectedCourse?.name || selectedCourse?.id) {
      const tag = extractCourseTag(selectedCourse.name, selectedCourse.id);
      setActiveCourseTag(tag);
    }
  }, [selectedCourse]);

  // Load photos whenever activeCourseTag changes
  useEffect(() => {
    if (activeCourseTag) {
      loadPhotosForCourse(activeCourseTag);
    }
  }, [activeCourseTag, userId, seafarerCode]);

  const isValidUUID = (str?: string) => {
    if (!str) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  };

  const loadPhotosForCourse = async (courseTag: string) => {
    setLoading(true);
    let loaded1: string | null = null;
    let loaded2: string | null = null;

    // 1. Check LocalStorage for course-specific entries
    try {
      const localMap = JSON.parse(localStorage.getItem("local_praktek_stip_map") || "{}");
      const courseEntry =
        localMap[`${userId}_${courseTag}`] ||
        (seafarerCode ? localMap[`${seafarerCode}_${courseTag}`] : null);

      if (courseEntry) {
        if (courseEntry.photo1) loaded1 = courseEntry.photo1;
        if (courseEntry.photo2) loaded2 = courseEntry.photo2;
      }

      // Check generic fallback if not found
      if (!loaded1 || !loaded2) {
        const legacyEntry = localMap[userId] || (seafarerCode ? localMap[seafarerCode] : null);
        if (legacyEntry) {
          if (!loaded1 && legacyEntry.photo1) loaded1 = legacyEntry.photo1;
          if (!loaded2 && legacyEntry.photo2) loaded2 = legacyEntry.photo2;
        }
      }
    } catch (e) {
      console.warn("Could not read local_praktek_stip_map:", e);
    }

    // 2. Query Supabase latihan_verifications table with course tag
    try {
      const targetCodes: string[] = [];
      const addCodes = (idStr: string) => {
        targetCodes.push(
          `${idStr}__${courseTag}__PRAKTEK_STIP`,
          `${idStr}__${courseTag}__PRAKTEK_1`,
          `${idStr}__${courseTag}__PRAKTEK_2`,
          // Legacy fallbacks
          `${idStr}__PRAKTEK_STIP`,
          `${idStr}__PRAKTEK_1`,
          `${idStr}__PRAKTEK_2`
        );
      };

      if (seafarerCode) addCodes(seafarerCode);
      if (userId) addCodes(userId);

      const { data: dbRecords } = await supabase
        .from("latihan_verifications")
        .select("seafarer_code, live_photo_url, ktp_photo_url, created_at")
        .in("seafarer_code", targetCodes)
        .order("created_at", { ascending: false });

      if (dbRecords && dbRecords.length > 0) {
        // Priority 1: Course-specific record
        for (const rec of dbRecords) {
          const code = rec.seafarer_code || "";
          if (code.includes(`__${courseTag}__`)) {
            if (code.endsWith("__PRAKTEK_STIP")) {
              if (rec.live_photo_url && !loaded1) loaded1 = rec.live_photo_url;
              if (rec.ktp_photo_url && !loaded2) loaded2 = rec.ktp_photo_url;
            } else if (code.endsWith("__PRAKTEK_1") && !loaded1) {
              loaded1 = rec.live_photo_url || rec.ktp_photo_url;
            } else if (code.endsWith("__PRAKTEK_2") && !loaded2) {
              loaded2 = rec.live_photo_url || rec.ktp_photo_url;
            }
          }
        }

        // Priority 2: Generic record if still null
        if (!loaded1 || !loaded2) {
          for (const rec of dbRecords) {
            const code = rec.seafarer_code || "";
            if (!code.includes(`__${courseTag}__`)) {
              if (code.endsWith("__PRAKTEK_STIP")) {
                if (rec.live_photo_url && !loaded1) loaded1 = rec.live_photo_url;
                if (rec.ktp_photo_url && !loaded2) loaded2 = rec.ktp_photo_url;
              } else if (code.endsWith("__PRAKTEK_1") && !loaded1) {
                loaded1 = rec.live_photo_url || rec.ktp_photo_url;
              } else if (code.endsWith("__PRAKTEK_2") && !loaded2) {
                loaded2 = rec.live_photo_url || rec.ktp_photo_url;
              }
            }
          }
        }
      }
    } catch (dbErr) {
      console.warn("Could not query latihan_verifications:", dbErr);
    }

    // 3. Storage deterministic fallback URLs
    if (!loaded1) {
      const name = seafarerCode
        ? `praktek_stip_1_${courseTag}_${seafarerCode}.jpg`
        : `praktek_stip_1_${courseTag}_${userId}.jpg`;
      const { data } = supabase.storage.from("verifications").getPublicUrl(name);
      if (data?.publicUrl) loaded1 = data.publicUrl;
    }
    if (!loaded2) {
      const name = seafarerCode
        ? `praktek_stip_2_${courseTag}_${seafarerCode}.jpg`
        : `praktek_stip_2_${courseTag}_${userId}.jpg`;
      const { data } = supabase.storage.from("verifications").getPublicUrl(name);
      if (data?.publicUrl) loaded2 = data.publicUrl;
    }

    // Legacy fallback storage URLs
    if (!loaded1) {
      const code = seafarerCode ? `praktek_stip_1_${seafarerCode}.jpg` : `praktek_stip_1_${userId}.jpg`;
      const { data } = supabase.storage.from("verifications").getPublicUrl(code);
      if (data?.publicUrl) loaded1 = data.publicUrl;
    }
    if (!loaded2) {
      const code = seafarerCode ? `praktek_stip_2_${seafarerCode}.jpg` : `praktek_stip_2_${userId}.jpg`;
      const { data } = supabase.storage.from("verifications").getPublicUrl(code);
      if (data?.publicUrl) loaded2 = data.publicUrl;
    }

    setPhoto1(loaded1);
    setPhoto2(loaded2);
    setLoading(false);
  };

  // Helper to persist in Supabase Database, Storage, and localStorage for the active course
  const savePhoto = async (base64Data: string, slot: 1 | 2) => {
    setUploadingSlot(slot);
    setErrorMessage(null);
    setSuccessMessage(null);

    const tag = activeCourseTag || "DEFAULT";

    try {
      let publicUrl = base64Data; // fallback

      // 1. Upload to Supabase Storage bucket 'verifications'
      try {
        const base64String = base64Data.split(",")[1];
        if (base64String) {
          const byteCharacters = atob(base64String);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: "image/jpeg" });

          // Course-specific timestamped upload
          const fileName = `${userId}_${tag}_praktek_stip_${slot}_${Date.now()}.jpg`;
          const { error: uploadErr } = await supabase.storage
            .from("verifications")
            .upload(fileName, blob, {
              contentType: "image/jpeg",
              upsert: true
            });

          if (!uploadErr) {
            const { data: pubData } = supabase.storage.from("verifications").getPublicUrl(fileName);
            if (pubData?.publicUrl) {
              publicUrl = pubData.publicUrl;
            }
          }

          // Deterministic course-specific uploads
          await supabase.storage.from("verifications").upload(`praktek_stip_${slot}_${tag}_${userId}.jpg`, blob, {
            contentType: "image/jpeg",
            upsert: true
          });
          if (seafarerCode) {
            await supabase.storage.from("verifications").upload(`praktek_stip_${slot}_${tag}_${seafarerCode}.jpg`, blob, {
              contentType: "image/jpeg",
              upsert: true
            });
          }

          // Legacy upload for backward compatibility
          await supabase.storage.from("verifications").upload(`praktek_stip_${slot}_${userId}.jpg`, blob, {
            contentType: "image/jpeg",
            upsert: true
          });
          if (seafarerCode) {
            await supabase.storage.from("verifications").upload(`praktek_stip_${slot}_${seafarerCode}.jpg`, blob, {
              contentType: "image/jpeg",
              upsert: true
            });
          }
        }
      } catch (stErr) {
        console.warn("Error uploading to Supabase storage:", stErr);
      }

      // 2. Persist to Supabase Database (latihan_verifications table) with Course Tag
      try {
        const primaryCode = seafarerCode || userId;
        const validId = isValidUUID(userId) ? userId : null;

        // A. Course-specific slot record
        await supabase.from("latihan_verifications").insert({
          user_id: validId,
          seafarer_code: `${primaryCode}__${tag}__PRAKTEK_${slot}`,
          live_photo_url: publicUrl,
          ktp_photo_url: publicUrl
        });

        // B. Course-specific combined record
        const combinedCourseCode = `${primaryCode}__${tag}__PRAKTEK_STIP`;
        const mergedPhoto1 = slot === 1 ? publicUrl : photo1 || null;
        const mergedPhoto2 = slot === 2 ? publicUrl : photo2 || null;

        await supabase.from("latihan_verifications").insert({
          user_id: validId,
          seafarer_code: combinedCourseCode,
          live_photo_url: mergedPhoto1,
          ktp_photo_url: mergedPhoto2
        });

        // C. Also maintain legacy general record
        await supabase.from("latihan_verifications").insert({
          user_id: validId,
          seafarer_code: `${primaryCode}__PRAKTEK_${slot}`,
          live_photo_url: publicUrl,
          ktp_photo_url: publicUrl
        });
        await supabase.from("latihan_verifications").insert({
          user_id: validId,
          seafarer_code: `${primaryCode}__PRAKTEK_STIP`,
          live_photo_url: mergedPhoto1,
          ktp_photo_url: mergedPhoto2
        });
      } catch (dbSaveErr) {
        console.warn("Could not save praktek to latihan_verifications:", dbSaveErr);
      }

      // 3. Update LocalStorage map with course tag
      try {
        const localMap = JSON.parse(localStorage.getItem("local_praktek_stip_map") || "{}");
        const courseKeyUser = `${userId}_${tag}`;
        const courseKeyCode = seafarerCode ? `${seafarerCode}_${tag}` : "";

        const updatedCourseEntry = {
          photo1: slot === 1 ? publicUrl : photo1 || null,
          photo2: slot === 2 ? publicUrl : photo2 || null,
          course_tag: tag,
          seafarer_code: seafarerCode || "",
          user_name: userName || "",
          updated_at: new Date().toISOString()
        };

        localMap[courseKeyUser] = updatedCourseEntry;
        if (courseKeyCode) localMap[courseKeyCode] = updatedCourseEntry;

        // Also update standard key for fallback
        localMap[userId] = {
          ...updatedCourseEntry,
          photo1: slot === 1 ? publicUrl : photo1 || null,
          photo2: slot === 2 ? publicUrl : photo2 || null
        };
        if (seafarerCode) {
          localMap[seafarerCode] = localMap[userId];
        }

        localStorage.setItem("local_praktek_stip_map", JSON.stringify(localMap));
      } catch (locErr) {
        console.warn("Could not save to local_praktek_stip_map:", locErr);
      }

      // Update local state
      if (slot === 1) setPhoto1(publicUrl);
      if (slot === 2) setPhoto2(publicUrl);

      setSuccessMessage(
        `Foto Praktek STIP #${slot} untuk Diklat ${tag} berhasil diunggah! Foto ini otomatis muncul pada laporan diklat ${tag}.`
      );
      setTimeout(() => setSuccessMessage(null), 7000);
    } catch (err: any) {
      console.error("Save photo error:", err);
      setErrorMessage(`Gagal mengunggah foto: ${err?.message || "Terjadi kesalahan"}`);
    } finally {
      setUploadingSlot(null);
    }
  };

  // Handle file input upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, slot: 1 | 2) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedDataUrl = await compressImageFile(file, 1024, 1024, 0.75);
      await savePhoto(compressedDataUrl, slot);
    } catch (err: any) {
      console.error("File compression error:", err);
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (reader.result) {
          await savePhoto(reader.result as string, slot);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  // Handle camera capture
  const openCameraModal = (slot: 1 | 2) => {
    setActiveCameraSlot(slot);
    setCameraError(null);
    setIsCameraOpen(true);
  };

  const capturePhotoFromCamera = async () => {
    if (!webcamRef.current) return;
    try {
      const screenshot = webcamRef.current.getScreenshot({ width: 1024, height: 768 });
      if (screenshot) {
        setIsCameraOpen(false);
        await savePhoto(screenshot, activeCameraSlot);
      } else {
        setCameraError("Kamera tidak merespon. Pastikan izin kamera telah disetujui.");
      }
    } catch (e: any) {
      setCameraError(`Gagal mengambil foto: ${e?.message || "Periksa izin kamera"}`);
    }
  };

  // Handle delete
  const handleDeletePhoto = (slot: 1 | 2) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus Foto Praktek STIP #${slot} untuk Diklat ${activeCourseTag}?`)) return;

    if (slot === 1) setPhoto1(null);
    if (slot === 2) setPhoto2(null);

    const tag = activeCourseTag || "DEFAULT";

    try {
      const localMap = JSON.parse(localStorage.getItem("local_praktek_stip_map") || "{}");
      const courseKeyUser = `${userId}_${tag}`;
      if (localMap[courseKeyUser]) {
        if (slot === 1) delete localMap[courseKeyUser].photo1;
        if (slot === 2) delete localMap[courseKeyUser].photo2;
      }
      if (localMap[userId]) {
        if (slot === 1) delete localMap[userId].photo1;
        if (slot === 2) delete localMap[userId].photo2;
      }
      localStorage.setItem("local_praktek_stip_map", JSON.stringify(localMap));
    } catch (e) {
      // ignore
    }

    setSuccessMessage(`Foto Praktek STIP #${slot} untuk Diklat ${tag} berhasil dihapus.`);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const currentCourseObj = availableCourses.find((c) => c.tag === activeCourseTag);

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 rounded-2xl p-6 text-white shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-block bg-white/20 text-white text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full backdrop-blur-xs">
              Dokumentasi Praktek STIP Per Diklat
            </span>
            <h2 className="text-2xl font-black tracking-tight">Upload Foto Praktek STIP Per Masing-Masing Diklat</h2>
            <p className="text-white/90 text-sm max-w-2xl leading-relaxed">
              Silakan unggah dokumentasi selfie atau foto kegiatan praktek langsung di STIP.
              Setiap program diklat (seperti <strong>SCRB</strong> dan <strong>SDSD</strong>) memiliki slot upload dokumentasi praktek tersendiri yang otomatis tampil pada kolom laporan sinkronus zoom.
            </p>
          </div>
          {onNavigateToReport && (
            <button
              onClick={onNavigateToReport}
              className="bg-white text-amber-900 hover:bg-amber-50 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition shrink-0 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-amber-600" />
              <span>Lihat Hasil Laporan Saya</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* DIKLAT SELECTOR TABS: Choose which diklat to upload practice photos for */}
      <div className="bg-white rounded-2xl border border-amber-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-600" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Pilih Diklat Pelatihan Yang Ingin Diunggah:
            </h3>
          </div>
          <span className="text-[11px] text-amber-900 font-bold bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
            Sedang Memilih: Diklat {activeCourseTag}
          </span>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {availableCourses.map((c) => {
            const isSelected = activeCourseTag === c.tag;
            return (
              <button
                key={c.tag}
                type="button"
                onClick={() => {
                  setActiveCourseTag(c.tag);
                  if (onSelectCourse) {
                    onSelectCourse({ id: c.id, name: c.name });
                  }
                }}
                className={`px-4 py-3 rounded-xl text-xs font-bold transition flex items-center gap-3 border cursor-pointer ${
                  isSelected
                    ? "bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-300"
                    : "bg-slate-50 hover:bg-amber-50 text-slate-700 border-slate-200 hover:border-amber-300"
                }`}
              >
                <BookOpen className={`w-4 h-4 ${isSelected ? "text-amber-100" : "text-amber-600"}`} />
                <div className="text-left">
                  <div className="font-extrabold uppercase text-sm tracking-tight">{c.tag}</div>
                  <div className={`text-[10px] font-normal line-clamp-1 max-w-[220px] ${isSelected ? "text-amber-100" : "text-slate-500"}`}>
                    {c.name}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {currentCourseObj && (
          <div className="mt-3 pt-3 border-t border-amber-100 flex items-center gap-2 text-xs text-amber-950 font-medium">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Anda sedang mengelola Foto Praktek STIP untuk: <strong>{currentCourseObj.name}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Notification banners */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-4 flex items-center gap-3 text-sm animate-fade-in shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="flex-1 font-medium">{successMessage}</div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-4 flex items-center gap-3 text-sm animate-fade-in shadow-xs">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <div className="flex-1 font-medium">{errorMessage}</div>
          <button onClick={() => setErrorMessage(null)} className="text-red-700 hover:text-red-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <RefreshCw className="w-8 h-8 text-amber-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-700">
            Memeriksa status foto praktek STIP untuk Diklat {activeCourseTag}...
          </p>
        </div>
      ) : (
        /* Photo Upload Cards Grid (Slot 1 & Slot 2) for the Active Course */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* SLOT 1 */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs hover:border-amber-300 transition flex flex-col">
            <div className="p-5 border-b border-gray-100 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-900 font-black text-xs flex items-center justify-center border border-amber-300">
                  1
                </span>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Foto Praktek di STIP #1 ({activeCourseTag})
                  </h3>
                  <p className="text-xs text-gray-500">Dokumentasi praktek diklat pertama</p>
                </div>
              </div>
              {photo1 ? (
                <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" /> Tersimpan
                </span>
              ) : (
                <span className="bg-slate-100 text-slate-600 text-[11px] font-medium px-2.5 py-0.5 rounded-full border border-slate-200">
                  Belum Ada
                </span>
              )}
            </div>

            <div className="p-6 flex-1 flex flex-col items-center justify-center">
              {photo1 ? (
                <div className="w-full space-y-4">
                  <div className="relative group rounded-xl overflow-hidden border border-gray-200 bg-slate-900 aspect-video flex items-center justify-center shadow-inner">
                    <img
                      src={photo1}
                      alt={`Foto Praktek STIP #1 (${activeCourseTag})`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewPhotoModal({
                            title: `Foto Praktek di STIP #1 (${activeCourseTag})`,
                            url: photo1
                          })
                        }
                        className="bg-white text-gray-900 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md hover:bg-gray-100 transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> Perbesar
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewPhotoModal({
                          title: `Foto Praktek di STIP #1 (${activeCourseTag})`,
                          url: photo1
                        })
                      }
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" /> Lihat Ukuran Penuh
                    </button>
                    <label className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingSlot === 1 ? "Menyimpan..." : "Ganti Foto"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 1)}
                        disabled={uploadingSlot === 1}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(1)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
                      title="Hapus foto ini"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full text-center space-y-4 py-4">
                  <div className="w-16 h-16 rounded-2xl bg-amber-50 border-2 border-dashed border-amber-300 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">Unggah Foto Praktek #1 ({activeCourseTag})</p>
                    <p className="text-xs text-gray-500 max-w-xs mx-auto mt-1">
                      Pilih foto dari galeri HP / file komputer Anda atau gunakan kamera langsung.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2.5 max-w-sm mx-auto">
                    <button
                      type="button"
                      onClick={() => openCameraModal(1)}
                      disabled={uploadingSlot === 1}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                    >
                      <Camera className="w-4 h-4" /> Ambil Kamera
                    </button>
                    <label className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 border border-slate-300 transition cursor-pointer">
                      <Upload className="w-4 h-4 text-slate-600" />
                      <span>{uploadingSlot === 1 ? "Menyimpan..." : "Pilih File"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 1)}
                        disabled={uploadingSlot === 1}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SLOT 2 */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs hover:border-amber-300 transition flex flex-col">
            <div className="p-5 border-b border-gray-100 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-900 font-black text-xs flex items-center justify-center border border-amber-300">
                  2
                </span>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Foto Praktek di STIP #2 ({activeCourseTag})
                  </h3>
                  <p className="text-xs text-gray-500">Dokumentasi praktek diklat kedua</p>
                </div>
              </div>
              {photo2 ? (
                <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" /> Tersimpan
                </span>
              ) : (
                <span className="bg-slate-100 text-slate-600 text-[11px] font-medium px-2.5 py-0.5 rounded-full border border-slate-200">
                  Belum Ada
                </span>
              )}
            </div>

            <div className="p-6 flex-1 flex flex-col items-center justify-center">
              {photo2 ? (
                <div className="w-full space-y-4">
                  <div className="relative group rounded-xl overflow-hidden border border-gray-200 bg-slate-900 aspect-video flex items-center justify-center shadow-inner">
                    <img
                      src={photo2}
                      alt={`Foto Praktek STIP #2 (${activeCourseTag})`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewPhotoModal({
                            title: `Foto Praktek di STIP #2 (${activeCourseTag})`,
                            url: photo2
                          })
                        }
                        className="bg-white text-gray-900 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md hover:bg-gray-100 transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> Perbesar
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewPhotoModal({
                          title: `Foto Praktek di STIP #2 (${activeCourseTag})`,
                          url: photo2
                        })
                      }
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" /> Lihat Ukuran Penuh
                    </button>
                    <label className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingSlot === 2 ? "Menyimpan..." : "Ganti Foto"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 2)}
                        disabled={uploadingSlot === 2}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(2)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
                      title="Hapus foto ini"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full text-center space-y-4 py-4">
                  <div className="w-16 h-16 rounded-2xl bg-amber-50 border-2 border-dashed border-amber-300 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">Unggah Foto Praktek #2 ({activeCourseTag})</p>
                    <p className="text-xs text-gray-500 max-w-xs mx-auto mt-1">
                      Pilih foto dari galeri HP / file komputer Anda atau gunakan kamera langsung.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2.5 max-w-sm mx-auto">
                    <button
                      type="button"
                      onClick={() => openCameraModal(2)}
                      disabled={uploadingSlot === 2}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                    >
                      <Camera className="w-4 h-4" /> Ambil Kamera
                    </button>
                    <label className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 border border-slate-300 transition cursor-pointer">
                      <Upload className="w-4 h-4 text-slate-600" />
                      <span>{uploadingSlot === 2 ? "Menyimpan..." : "Pilih File"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 2)}
                        disabled={uploadingSlot === 2}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WEBCAM CAMERA MODAL */}
      {isCameraOpen && (
        <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-100 flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-black text-slate-900">
                  Ambil Foto Praktek #{activeCameraSlot} ({activeCourseTag})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCameraOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex flex-col items-center bg-slate-950">
              <div className="w-full aspect-video rounded-xl overflow-hidden bg-black relative flex items-center justify-center">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  screenshotQuality={0.85}
                  videoConstraints={{
                    facingMode: cameraFacingMode,
                    width: { ideal: 1024 },
                    height: { ideal: 768 }
                  }}
                  onUserMediaError={() =>
                    setCameraError("Gagal mengakses kamera. Pastikan izin kamera aktif pada browser.")
                  }
                  className="w-full h-full object-cover"
                />
              </div>

              {cameraError && (
                <div className="mt-3 bg-red-950/80 text-red-200 text-xs p-2.5 rounded-lg border border-red-700 w-full text-center">
                  {cameraError}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setCameraFacingMode((prev) => (prev === "user" ? "environment" : "user"))}
                className="text-xs text-slate-700 font-bold bg-white border border-slate-200 px-3 py-2 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                Ganti Kamera ({cameraFacingMode === "user" ? "Depan" : "Belakang"})
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(false)}
                  className="text-xs text-slate-600 font-bold px-3 py-2 rounded-xl hover:bg-slate-200 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={capturePhotoFromCamera}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-black px-4 py-2 rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-4 h-4" /> Ambil &amp; Simpan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN PREVIEW MODAL */}
      {previewPhotoModal && (
        <div className="fixed inset-0 bg-black/85 z-70 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-gray-100 flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black text-slate-900">{previewPhotoModal.title}</h3>
              <button
                type="button"
                onClick={() => setPreviewPhotoModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 bg-slate-900/5 flex items-center justify-center min-h-[350px]">
              <img
                src={previewPhotoModal.url}
                alt="Detail Foto"
                className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-md"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
