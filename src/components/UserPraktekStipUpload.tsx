import React, { useState, useEffect, useRef } from "react";
import { Camera, Upload, CheckCircle2, AlertCircle, Trash2, Eye, X, RefreshCw, FileText, ArrowRight } from "lucide-react";
import Webcam from "react-webcam";
import { supabase } from "../lib/supabase";
import { compressImageFile } from "../utils/imageCompression";

interface UserPraktekStipUploadProps {
  userId: string;
  userName: string;
  seafarerCode: string;
  onNavigateToReport?: () => void;
}

export default function UserPraktekStipUpload({
  userId,
  userName,
  seafarerCode,
  onNavigateToReport
}: UserPraktekStipUploadProps) {
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

  // Load existing STIP practice photos
  useEffect(() => {
    loadExistingPhotos();
  }, [userId]);

  const isValidUUID = (str?: string) => {
    if (!str) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  };

  const loadExistingPhotos = async () => {
    setLoading(true);
    let loaded1: string | null = null;
    let loaded2: string | null = null;

    // 1. Check localStorage first for instant display
    try {
      const localMap = JSON.parse(localStorage.getItem("local_praktek_stip_map") || "{}");
      const userEntry = localMap[userId] || (seafarerCode ? localMap[seafarerCode] : null);
      if (userEntry) {
        if (userEntry.photo1) loaded1 = userEntry.photo1;
        if (userEntry.photo2) loaded2 = userEntry.photo2;
      }
    } catch (e) {
      console.warn("Could not read local_praktek_stip_map:", e);
    }

    // 2. Check Supabase latihan_verifications table (Primary database persistence)
    try {
      const targetCodes: string[] = [];
      if (seafarerCode) {
        targetCodes.push(`${seafarerCode}__PRAKTEK_STIP`, `${seafarerCode}__PRAKTEK_1`, `${seafarerCode}__PRAKTEK_2`);
      }
      if (userId) {
        targetCodes.push(`${userId}__PRAKTEK_STIP`, `${userId}__PRAKTEK_1`, `${userId}__PRAKTEK_2`);
      }

      const { data: dbRecords } = await supabase
        .from("latihan_verifications")
        .select("seafarer_code, live_photo_url, ktp_photo_url, created_at")
        .in("seafarer_code", targetCodes)
        .order("created_at", { ascending: false });

      if (dbRecords && dbRecords.length > 0) {
        for (const rec of dbRecords) {
          const code = rec.seafarer_code || "";
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
    } catch (dbErr) {
      console.warn("Could not query latihan_verifications for STIP photos:", dbErr);
    }

    // 3. Check deterministic Supabase Storage URLs as secondary fallback
    if (!loaded1) {
      if (seafarerCode) {
        const { data } = supabase.storage.from("verifications").getPublicUrl(`praktek_stip_1_${seafarerCode}.jpg`);
        if (data?.publicUrl) loaded1 = data.publicUrl;
      } else if (userId) {
        const { data } = supabase.storage.from("verifications").getPublicUrl(`praktek_stip_1_${userId}.jpg`);
        if (data?.publicUrl) loaded1 = data.publicUrl;
      }
    }
    if (!loaded2) {
      if (seafarerCode) {
        const { data } = supabase.storage.from("verifications").getPublicUrl(`praktek_stip_2_${seafarerCode}.jpg`);
        if (data?.publicUrl) loaded2 = data.publicUrl;
      } else if (userId) {
        const { data } = supabase.storage.from("verifications").getPublicUrl(`praktek_stip_2_${userId}.jpg`);
        if (data?.publicUrl) loaded2 = data.publicUrl;
      }
    }

    // 4. Also check Supabase Storage 'verifications' bucket listing if available
    try {
      const { data: files } = await supabase.storage
        .from("verifications")
        .list("", { limit: 1000, sortBy: { column: "created_at", order: "desc" } });

      if (files && files.length > 0) {
        files.forEach((file) => {
          const name = file.name || "";
          if ((name.startsWith(`${userId}_praktek_stip_1_`) || (seafarerCode && name.startsWith(`${seafarerCode}_praktek_stip_1_`))) && !loaded1) {
            const { data } = supabase.storage.from("verifications").getPublicUrl(name);
            if (data?.publicUrl) loaded1 = data.publicUrl;
          }
          if ((name.startsWith(`${userId}_praktek_stip_2_`) || (seafarerCode && name.startsWith(`${seafarerCode}_praktek_stip_2_`))) && !loaded2) {
            const { data } = supabase.storage.from("verifications").getPublicUrl(name);
            if (data?.publicUrl) loaded2 = data.publicUrl;
          }
        });
      }
    } catch (err) {
      // ignore bucket listing error
    }

    setPhoto1(loaded1);
    setPhoto2(loaded2);
    setLoading(false);
  };

  // Helper to persist in Supabase Database, Storage, and localStorage
  const savePhoto = async (base64Data: string, slot: 1 | 2) => {
    setUploadingSlot(slot);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let publicUrl = base64Data; // fallback to base64 if network is offline

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

          // Timestamped upload
          const fileName = `${userId}_praktek_stip_${slot}_${Date.now()}.jpg`;
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

          // Deterministic uploads (enables instant URL resolution on any admin/participant device without .list())
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

      // 2. Persist to Supabase Database (latihan_verifications table)
      // This guarantees the admin desktop report immediately reads the photos via SQL query
      try {
        const primaryCode = seafarerCode || userId;
        const validId = isValidUUID(userId) ? userId : null;

        // Save slot-specific record
        await supabase
          .from("latihan_verifications")
          .insert({
            user_id: validId,
            seafarer_code: `${primaryCode}__PRAKTEK_${slot}`,
            live_photo_url: publicUrl,
            ktp_photo_url: publicUrl
          });

        // Also save combined record for convenient simultaneous slot retrieval
        const combinedCode = `${primaryCode}__PRAKTEK_STIP`;
        const { data: existingComb } = await supabase
          .from("latihan_verifications")
          .select("live_photo_url, ktp_photo_url")
          .eq("seafarer_code", combinedCode)
          .order("created_at", { ascending: false })
          .limit(1);

        const mergedPhoto1 = slot === 1 ? publicUrl : (existingComb?.[0]?.live_photo_url || photo1 || null);
        const mergedPhoto2 = slot === 2 ? publicUrl : (existingComb?.[0]?.ktp_photo_url || photo2 || null);

        await supabase
          .from("latihan_verifications")
          .insert({
            user_id: validId,
            seafarer_code: combinedCode,
            live_photo_url: mergedPhoto1,
            ktp_photo_url: mergedPhoto2
          });
      } catch (dbSaveErr) {
        console.warn("Could not save praktek to latihan_verifications:", dbSaveErr);
      }

      // 3. Update LocalStorage map for synchronized visibility in SinkronusReports
      try {
        const localMap = JSON.parse(localStorage.getItem("local_praktek_stip_map") || "{}");
        const existing = localMap[userId] || (seafarerCode ? localMap[seafarerCode] : {}) || {};
        const updated = {
          ...existing,
          photo1: slot === 1 ? publicUrl : existing.photo1 || null,
          photo2: slot === 2 ? publicUrl : existing.photo2 || null,
          seafarer_code: seafarerCode || existing.seafarer_code || "",
          user_name: userName || existing.user_name || "",
          updated_at: new Date().toISOString()
        };
        localMap[userId] = updated;
        if (seafarerCode) {
          localMap[seafarerCode] = updated;
        }
        localStorage.setItem("local_praktek_stip_map", JSON.stringify(localMap));
      } catch (locErr) {
        console.warn("Could not save to local_praktek_stip_map:", locErr);
      }

      // Update state
      if (slot === 1) setPhoto1(publicUrl);
      if (slot === 2) setPhoto2(publicUrl);

      setSuccessMessage(`Foto Praktek STIP #${slot} berhasil diunggah! Foto ini otomatis terhubung pada Laporan Sinkronus Zoom.`);
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
      // Compress to prevent huge files & mobile browser memory crashes
      const compressedDataUrl = await compressImageFile(file, 1024, 1024, 0.75);
      await savePhoto(compressedDataUrl, slot);
    } catch (err: any) {
      console.error("File compression error:", err);
      // Fallback to standard FileReader
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (reader.result) {
          await savePhoto(reader.result as string, slot);
        }
      };
      reader.readAsDataURL(file);
    }
    // Clear input value so selecting the same file triggers change again
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
    if (!confirm(`Apakah Anda yakin ingin menghapus Foto Praktek STIP #${slot}?`)) return;

    if (slot === 1) setPhoto1(null);
    if (slot === 2) setPhoto2(null);

    try {
      const localMap = JSON.parse(localStorage.getItem("local_praktek_stip_map") || "{}");
      if (localMap[userId]) {
        if (slot === 1) delete localMap[userId].photo1;
        if (slot === 2) delete localMap[userId].photo2;
        localStorage.setItem("local_praktek_stip_map", JSON.stringify(localMap));
      }
    } catch (e) {
      // ignore
    }

    setSuccessMessage(`Foto Praktek STIP #${slot} berhasil dihapus.`);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 rounded-2xl p-6 text-white shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-block bg-white/20 text-white text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full backdrop-blur-xs">
              Dokumentasi Praktek STIP
            </span>
            <h2 className="text-2xl font-black tracking-tight">Upload Foto Selfie Praktek Diklat di STIP</h2>
            <p className="text-white/90 text-sm max-w-2xl leading-relaxed">
              Silakan unggah dokumentasi selfie atau foto kegiatan Anda saat menjalani praktek diklat langsung di STIP.
              Anda dapat mengunggah <strong>hingga 2 foto</strong>. Foto yang diunggah otomatis tersinkronisasi dan tampil di laporan sinkronus zoom Anda.
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
          <p className="text-sm font-bold text-gray-700">Memeriksa status foto praktek STIP Anda...</p>
        </div>
      ) : (
        /* Photo Upload Cards Grid (Slot 1 & Slot 2) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* SLOT 1 */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs hover:border-amber-300 transition flex flex-col">
            <div className="p-5 border-b border-gray-100 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-900 font-black text-xs flex items-center justify-center border border-amber-300">
                  1
                </span>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Foto Praktek di STIP (Foto #1)</h3>
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
                      alt="Foto Praktek STIP #1"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewPhotoModal({ title: "Foto Praktek di STIP (Foto #1)", url: photo1 })}
                        className="bg-white text-gray-900 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md hover:bg-gray-100 transition"
                      >
                        <Eye className="w-3.5 h-3.5" /> Perbesar
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewPhotoModal({ title: "Foto Praktek di STIP (Foto #1)", url: photo1 })}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 transition"
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
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
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
                    <p className="text-sm font-bold text-gray-800">Unggah Foto Praktek #1</p>
                    <p className="text-xs text-gray-500 max-w-xs mx-auto mt-1">
                      Pilih foto dari galeri/file HP Anda atau ambil foto langsung melalui kamera.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 justify-center max-w-sm mx-auto">
                    <button
                      type="button"
                      onClick={() => openCameraModal(1)}
                      disabled={uploadingSlot === 1}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Buka Kamera</span>
                    </button>

                    <label className="flex-1 bg-white hover:bg-slate-50 text-gray-800 border border-gray-300 text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-xs transition cursor-pointer">
                      <Upload className="w-4 h-4 text-gray-600" />
                      <span>{uploadingSlot === 1 ? "Menyimpan..." : "Pilih File Foto"}</span>
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
                  <h3 className="text-sm font-bold text-gray-900">Foto Praktek di STIP (Foto #2)</h3>
                  <p className="text-xs text-gray-500">Dokumentasi praktek diklat kedua / penutup</p>
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
                      alt="Foto Praktek STIP #2"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewPhotoModal({ title: "Foto Praktek di STIP (Foto #2)", url: photo2 })}
                        className="bg-white text-gray-900 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md hover:bg-gray-100 transition"
                      >
                        <Eye className="w-3.5 h-3.5" /> Perbesar
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewPhotoModal({ title: "Foto Praktek di STIP (Foto #2)", url: photo2 })}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 transition"
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
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
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
                    <p className="text-sm font-bold text-gray-800">Unggah Foto Praktek #2</p>
                    <p className="text-xs text-gray-500 max-w-xs mx-auto mt-1">
                      Pilih foto dari galeri/file HP Anda atau ambil foto langsung melalui kamera.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 justify-center max-w-sm mx-auto">
                    <button
                      type="button"
                      onClick={() => openCameraModal(2)}
                      disabled={uploadingSlot === 2}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Buka Kamera</span>
                    </button>

                    <label className="flex-1 bg-white hover:bg-slate-50 text-gray-800 border border-gray-300 text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-xs transition cursor-pointer">
                      <Upload className="w-4 h-4 text-gray-600" />
                      <span>{uploadingSlot === 2 ? "Menyimpan..." : "Pilih File Foto"}</span>
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

      {/* Guidelines Box */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs text-slate-700 space-y-2">
        <h4 className="font-bold text-slate-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Ketentuan Unggah Foto Praktek di STIP:
        </h4>
        <ul className="list-disc pl-5 space-y-1 leading-relaxed text-slate-600">
          <li>Foto dokumentasi diambil saat Anda melaksanakan kegiatan praktek di kampus STIP (Sekolah Tinggi Ilmu Pelayaran).</li>
          <li>Pastikan wajah Anda dan seragam/perlengkapan praktek terlihat jelas dan proporsional.</li>
          <li>Format file yang didukung: JPG, JPEG, PNG (otomatis dioptimalkan dan dikompres agar hemat kuota).</li>
          <li>Foto yang telah tersimpan otomatis disematkan pada Rekapitulasi Presensi &amp; Ekspor Excel Laporan Sinkronus Zoom Anda.</li>
        </ul>
      </div>

      {/* Live Camera Viewfinder Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-100">
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">Ambil Foto Praktek STIP #{activeCameraSlot}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCameraOpen(false)}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{
                    facingMode: cameraFacingMode,
                    width: { ideal: 1024 },
                    height: { ideal: 768 }
                  }}
                  onUserMediaError={(err) => setCameraError("Izin kamera ditolak atau kamera sedang digunakan aplikasi lain.")}
                  className="w-full h-full object-cover"
                />
              </div>

              {cameraError && (
                <div className="bg-red-50 text-red-700 text-xs p-3 rounded-lg border border-red-200">
                  {cameraError}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setCameraFacingMode(prev => prev === "user" ? "environment" : "user")}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2.5 px-3 rounded-xl flex items-center gap-1.5 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Balik Kamera ({cameraFacingMode === "user" ? "Depan" : "Belakang"})</span>
                </button>

                <button
                  type="button"
                  onClick={capturePhotoFromCamera}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <Camera className="w-4 h-4" />
                  <span>Ambil &amp; Simpan Foto</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Photo Modal */}
      {previewPhotoModal && (
        <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-gray-100">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black text-slate-900">{previewPhotoModal.title}</h3>
              <button
                type="button"
                onClick={() => setPreviewPhotoModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 bg-slate-900/5 flex items-center justify-center min-h-[300px]">
              <img
                src={previewPhotoModal.url}
                alt="Preview Praktek"
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
