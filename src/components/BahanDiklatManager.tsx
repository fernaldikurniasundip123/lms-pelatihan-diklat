import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { BahanDiklatItem } from "../types/bahanDiklat";
import { FileText, Upload, Trash2, Link as LinkIcon, ExternalLink, Check, AlertCircle, Search } from "lucide-react";

interface Course {
  id: string;
  name: string;
  category: string;
}

interface Props {
  courses: Course[];
}

export default function BahanDiklatManager({ courses }: Props) {
  const [bahanList, setBahanList] = useState<BahanDiklatItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form states
  const [selectedCategory, setSelectedCategory] = useState("DIKLAT KETRAMPILAN (SHORT COURSE)");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [pertemuan, setPertemuan] = useState("Part 1");
  const [customPertemuan, setCustomPertemuan] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filter diklat keterampilan courses
  const diklatKetrampilanCourses = courses.filter((c) => {
    const cat = (c.category || "").toUpperCase();
    return cat.includes("KETRAMPILAN") || cat.includes("KETERAMPILAN") || cat.includes("SHORT COURSE");
  });

  // Fallback to all courses if none match specifically
  const availableCourses = diklatKetrampilanCourses.length > 0 ? diklatKetrampilanCourses : courses;

  useEffect(() => {
    if (availableCourses.length > 0 && !selectedCourseId) {
      setSelectedCourseId(availableCourses[0].id);
    }
  }, [availableCourses, selectedCourseId]);

  // Load data
  const loadBahanList = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("bahan_diklat")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      if (data) {
        setBahanList(data as BahanDiklatItem[]);
      }
    } catch {
      // Fallback to LocalStorage
      const localData = localStorage.getItem("lms_bahan_diklat_list");
      if (localData) {
        try {
          setBahanList(JSON.parse(localData));
        } catch {
          setBahanList([]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBahanList();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== "application/pdf") {
        setMessage({ type: "error", text: "File harus berformat PDF!" });
        setPdfFile(null);
        return;
      }
      setPdfFile(file);
      setMessage(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId) {
      setMessage({ type: "error", text: "Silakan pilih Nama Diklat!" });
      return;
    }
    if (!pdfFile) {
      setMessage({ type: "error", text: "Silakan pilih file PDF paparan!" });
      return;
    }

    const courseObj = availableCourses.find((c) => c.id === selectedCourseId);
    const courseName = courseObj ? courseObj.name : "Diklat Ketrampilan";
    const finalPertemuan = pertemuan === "Custom" ? customPertemuan : pertemuan;

    if (!finalPertemuan.trim()) {
      setMessage({ type: "error", text: "Silakan tentukan bahan pertemuan ke-berapa!" });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const id = "bd_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      let fileUrl = "";
      let fileDataStr = "";

      // Try uploading file to Supabase Storage
      try {
        const fileExt = "pdf";
        const filePath = `bahan-diklat/${id}_${pdfFile.name.replace(/[^a-zA-Z0-9]/g, "_")}.${fileExt}`;

        const { error: storageErr } = await supabase.storage
          .from("materials")
          .upload(filePath, pdfFile, { upsert: true });

        if (!storageErr) {
          const { data: publicUrlData } = supabase.storage.from("materials").getPublicUrl(filePath);
          fileUrl = publicUrlData.publicUrl;
        } else {
          // If materials bucket fails, try base64 conversion
          fileDataStr = await fileToBase64(pdfFile);
        }
      } catch {
        fileDataStr = await fileToBase64(pdfFile);
      }

      const newItem: BahanDiklatItem = {
        id,
        course_id: selectedCourseId,
        course_name: courseName,
        category: selectedCategory,
        pertemuan: finalPertemuan,
        file_name: pdfFile.name,
        file_url: fileUrl,
        file_data: fileDataStr,
        created_at: new Date().toISOString(),
      };

      // Try inserting into Supabase
      let savedToDb = false;
      try {
        const { error: dbErr } = await supabase.from("bahan_diklat").insert([newItem]);
        if (!dbErr) {
          savedToDb = true;
        }
      } catch {
        savedToDb = false;
      }

      // Always update LocalStorage as fallback/sync
      const existingLocal = localStorage.getItem("lms_bahan_diklat_list");
      let list: BahanDiklatItem[] = [];
      if (existingLocal) {
        try {
          list = JSON.parse(existingLocal);
        } catch {
          list = [];
        }
      }
      const updatedList = [newItem, ...list];
      localStorage.setItem("lms_bahan_diklat_list", JSON.stringify(updatedList));

      if (!savedToDb) {
        setBahanList(updatedList);
      } else {
        await loadBahanList();
      }

      setMessage({ type: "success", text: "Bahan Diklat Ketrampilan berhasil diunggah!" });
      setPdfFile(null);
      // Reset file input element
      const fileInput = document.getElementById("pdfFileInput") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (err: any) {
      setMessage({ type: "error", text: "Gagal mengunggah file: " + (err.message || "Terjadi kesalahan") });
    } finally {
      setUploading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
    });
  };

  const handleDelete = async (item: BahanDiklatItem) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus bahan "${item.pertemuan} - ${item.course_name}"?`)) {
      return;
    }

    try {
      await supabase.from("bahan_diklat").delete().eq("id", item.id);
    } catch {
      // ignore db error
    }

    const updated = bahanList.filter((b) => b.id !== item.id);
    setBahanList(updated);
    localStorage.setItem("lms_bahan_diklat_list", JSON.stringify(updated));
    setMessage({ type: "success", text: "Bahan diklat berhasil dihapus!" });
  };

  const copyShareLink = (item: BahanDiklatItem) => {
    const shareUrl = `${window.location.origin}/bahan-diklat?courseId=${item.course_id}&pertemuan=${encodeURIComponent(item.pertemuan)}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const copyGeneralLink = () => {
    const shareUrl = `${window.location.origin}/bahan-diklat`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedId("general");
    setTimeout(() => setCopiedId(null), 2500);
  };

  const filteredBahan = bahanList.filter(
    (item) =>
      item.course_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.pertemuan.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4 sm:p-6">
      {/* Header section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-7 h-7 text-indigo-600" />
            Bahan Diklat Ketrampilan
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Kelola dan unggah bahan paparan (PDF) Diklat Ketrampilan untuk diakses oleh peserta, dosen, atau institusi.
          </p>
        </div>
        <button
          onClick={copyGeneralLink}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium transition"
        >
          {copiedId === "general" ? (
            <>
              <Check className="w-4 h-4 text-green-600" />
              <span>Link Umum Tersalin!</span>
            </>
          ) : (
            <>
              <LinkIcon className="w-4 h-4" />
              <span>Salin Link Akses Bahan</span>
            </>
          )}
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg flex items-center gap-3 text-sm font-medium ${
            message.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {message.type === "success" ? (
            <Check className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Upload Form Card */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5 text-indigo-600" />
          Tambah Bahan Paparan PDF Baru
        </h2>

        <form onSubmit={handleUpload} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Jenis Diklat */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Jenis Diklat
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-gray-50"
              >
                <option value="DIKLAT KETRAMPILAN (SHORT COURSE)">
                  DIKLAT KETRAMPILAN (SHORT COURSE)
                </option>
              </select>
            </div>

            {/* Nama Diklat */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nama Diklat <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                required
              >
                {availableCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Diambil dari data Course Diklat Ketrampilan.
              </p>
            </div>

            {/* Pertemuan Ke-berapa */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bahan Pertemuan Ke-Berapa <span className="text-red-500">*</span>
              </label>
              <select
                value={pertemuan}
                onChange={(e) => setPertemuan(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              >
                <option value="Part 1">Part 1 (Pertemuan 1)</option>
                <option value="Part 2">Part 2 (Pertemuan 2)</option>
                <option value="Part 3">Part 3 (Pertemuan 3)</option>
                <option value="Part 4">Part 4 (Pertemuan 4)</option>
                <option value="Part 5">Part 5 (Pertemuan 5)</option>
                <option value="Part 6">Part 6 (Pertemuan 6)</option>
                <option value="Part 7">Part 7 (Pertemuan 7)</option>
                <option value="Part 8">Part 8 (Pertemuan 8)</option>
                <option value="Part 9">Part 9 (Pertemuan 9)</option>
                <option value="Part 10">Part 10 (Pertemuan 10)</option>
                <option value="Custom">Kustom / Judul Lain...</option>
              </select>

              {pertemuan === "Custom" && (
                <input
                  type="text"
                  placeholder="Contoh: Part 1 - Pengenalan Navigasi"
                  value={customPertemuan}
                  onChange={(e) => setCustomPertemuan(e.target.value)}
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  required
                />
              )}
            </div>
          </div>

          {/* Upload File */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              File Paparan Format PDF <span className="text-red-500">*</span>
            </label>
            <input
              id="pdfFileInput"
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 border border-gray-300 rounded-lg cursor-pointer"
              required
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Mengunggah PDF...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Simpan & Unggah Bahan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Uploaded Materials List Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Daftar Bahan Diklat Ketrampilan</h2>
            <p className="text-xs text-gray-500 mt-0.5">Total {filteredBahan.length} bahan paparan tersimpan</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Cari diklat / pertemuan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">Memuat daftar bahan...</div>
        ) : filteredBahan.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            Belum ada bahan diklat ketrampilan yang diunggah.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-600 font-medium">
                  <th className="py-3.5 px-4">Nama Diklat</th>
                  <th className="py-3.5 px-4">Bahan Pertemuan</th>
                  <th className="py-3.5 px-4">Nama File</th>
                  <th className="py-3.5 px-4">Tanggal Upload</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredBahan.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition">
                    <td className="py-3.5 px-4 font-semibold text-gray-900">
                      {item.course_name}
                      <div className="text-xs font-normal text-gray-400">{item.category}</div>
                    </td>
                    <td className="py-3.5 px-4 text-indigo-700 font-medium">{item.pertemuan}</td>
                    <td className="py-3.5 px-4 text-gray-600 max-w-xs truncate">{item.file_name}</td>
                    <td className="py-3.5 px-4 text-gray-500 text-xs">
                      {new Date(item.created_at).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      {/* Copy specific link */}
                      <button
                        onClick={() => copyShareLink(item)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md text-xs font-medium transition"
                        title="Salin Link Akses Bahan Ini"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-green-600" />
                            <span>Tersalin!</span>
                          </>
                        ) : (
                          <>
                            <LinkIcon className="w-3.5 h-3.5" />
                            <span>Salin Link</span>
                          </>
                        )}
                      </button>

                      {/* View Button */}
                      <a
                        href={`/bahan-diklat?courseId=${item.course_id}&pertemuan=${encodeURIComponent(item.pertemuan)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md text-xs font-medium transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Lihat</span>
                      </a>

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDelete(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-md text-xs font-medium transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
