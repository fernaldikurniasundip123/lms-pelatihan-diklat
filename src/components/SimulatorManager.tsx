import React, { useState, useEffect } from "react";
import JSZip from "jszip";
import { 
  Gamepad2, 
  Upload, 
  Link as LinkIcon, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  FileCode, 
  Play, 
  Users, 
  RefreshCw,
  Search,
  Award
} from "lucide-react";
import { 
  getSimulatorConfig, 
  saveSimulatorConfig, 
  SimulatorConfig, 
  SimulatorScoreRecord 
} from "../utils/simulatorStorage";

interface Course {
  id: string;
  name: string;
  category?: string;
}

interface Props {
  courses: Course[];
}

export default function SimulatorManager({ courses }: Props) {
  const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || "");
  const [simulatorType, setSimulatorType] = useState<"builtin" | "url" | "html" | "zip">("builtin");
  const [urlInput, setUrlInput] = useState<string>("");
  const [htmlInput, setHtmlInput] = useState<string>("");
  const [uploadedZipName, setUploadedZipName] = useState<string>("");
  const [isProcessingZip, setIsProcessingZip] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Score list state
  const [allScores, setAllScores] = useState<SimulatorScoreRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];

  // Load config for selected course
  useEffect(() => {
    if (selectedCourseId) {
      const cfg = getSimulatorConfig(selectedCourseId, selectedCourse?.name);
      setSimulatorType(cfg.type || "builtin");
      setUrlInput(cfg.url || "");
      setHtmlInput(cfg.htmlContent || "");
      setUploadedZipName(cfg.title && cfg.type === "zip" ? cfg.title : "");
      loadScoresForCourse(selectedCourseId);
    }
  }, [selectedCourseId, selectedCourse?.name]);

  const loadScoresForCourse = (cId: string) => {
    try {
      const raw = localStorage.getItem("simulator_all_scores_v1");
      if (raw) {
        const map: Record<string, SimulatorScoreRecord> = JSON.parse(raw);
        const filtered = Object.values(map).filter((r) => r.courseId === cId);
        setAllScores(filtered);
      } else {
        setAllScores([]);
      }
    } catch (e) {
      console.warn("Failed to load scores", e);
    }
  };

  // Handle ZIP file upload and client-side extraction
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".zip") && !file.name.endsWith(".html")) {
      alert("Harap pilih file dengan ekstensi .zip atau .html");
      return;
    }

    setIsProcessingZip(true);
    setFeedback(null);

    try {
      if (file.name.endsWith(".html")) {
        const text = await file.text();
        setHtmlInput(text);
        setSimulatorType("html");
        setUploadedZipName(file.name);
        setFeedback({
          type: "success",
          message: `File HTML '${file.name}' berhasil dimuat!`
        });
      } else {
        // Process ZIP using JSZip
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);

        // Look for index.html or first html file
        let indexFileKey = Object.keys(loadedZip.files).find((k) => 
          k.toLowerCase().endsWith("index.html") || k.toLowerCase().endsWith(".html")
        );

        if (!indexFileKey) {
          throw new Error("File ZIP tidak memuat berkas 'index.html'. Pastikan file HTML utama bernama index.html");
        }

        const indexFile = loadedZip.files[indexFileKey];
        let indexHtml = await indexFile.async("string");

        // Try extracting and inlining simple relative CSS/JS or create local object URL
        setHtmlInput(indexHtml);
        setSimulatorType("html");
        setUploadedZipName(file.name);
        setFeedback({
          type: "success",
          message: `Arsip ZIP '${file.name}' berhasil diekstrak! Berkas utama '${indexFileKey}' siap dijalankan.`
        });
      }
    } catch (err: any) {
      console.error("ZIP extraction error:", err);
      setFeedback({
        type: "error",
        message: `Gagal mengekstrak berkas: ${err.message || "Pastikan file ZIP valid"}`
      });
    } finally {
      setIsProcessingZip(false);
      if (e.target) e.target.value = "";
    }
  };

  // Save simulator configuration
  const handleSave = async () => {
    if (!selectedCourse) return;
    setIsSaving(true);
    setFeedback(null);

    try {
      const config: SimulatorConfig = {
        courseId: selectedCourse.id,
        courseName: selectedCourse.name,
        type: simulatorType,
        url: simulatorType === "url" ? urlInput.trim() : undefined,
        htmlContent: simulatorType === "html" ? htmlInput : undefined,
        title: uploadedZipName || `${selectedCourse.name} Simulator`
      };

      const ok = await saveSimulatorConfig(config);
      if (ok) {
        setFeedback({
          type: "success",
          message: `Konfigurasi simulator untuk '${selectedCourse.name}' berhasil disimpan!`
        });
      } else {
        throw new Error("Gagal menyimpan ke penyimpanan lokal.");
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: `Terjadi kendala: ${err.message || err}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Export simulator practice scores to Excel
  const handleExportExcel = async () => {
    if (allScores.length === 0) {
      alert("Belum ada data nilai simulator untuk kursus ini.");
      return;
    }

    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Nilai Simulator Praktek");

      worksheet.columns = [
        { header: "No", key: "no", width: 6 },
        { header: "Nama Peserta", key: "name", width: 28 },
        { header: "Kode Pelaut (Identity)", key: "code", width: 22 },
        { header: "Nama Diklat", key: "course", width: 26 },
        { header: "Nilai Terbaik (Best Score)", key: "best", width: 24 },
        { header: "Nilai Terakhir", key: "last", width: 16 },
        { header: "Jumlah Percobaan", key: "attempts", width: 18 },
        { header: "Tanggal Terakhir Selesai", key: "date", width: 24 }
      ];

      // Style header
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F766E" } // Teal 700
      };

      allScores.forEach((row, idx) => {
        worksheet.addRow({
          no: idx + 1,
          name: row.userName,
          code: row.seafarerCode || "-",
          course: row.courseName,
          best: row.bestScore,
          last: row.lastScore,
          attempts: `${row.attemptsCount}x`,
          date: row.lastAttemptAt ? new Date(row.lastAttemptAt).toLocaleString("id-ID") : "-"
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const filename = `Laporan_Praktek_Simulator_${selectedCourse?.name || "Diklat"}_${new Date().toISOString().split("T")[0]}.xlsx`;

      // Safe download
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }, 500);
    } catch (err: any) {
      alert("Gagal mengunduh Excel: " + err.message);
    }
  };

  const filteredScores = allScores.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.userName?.toLowerCase().includes(q) ||
      s.seafarerCode?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-teal-800 to-emerald-900 rounded-2xl p-6 text-white shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-teal-500/30 text-teal-200 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border border-teal-400/30">
              Modul Praktek Keterampilan
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black mt-2 flex items-center gap-2">
            <Gamepad2 className="w-7 h-7 text-teal-300" />
            Manajemen Simulator Praktek Mandiri
          </h2>
          <p className="text-xs sm:text-sm text-teal-100/90 mt-1 max-w-2xl leading-relaxed">
            Kelola aplikasi HTML simulator praktek (ekstrak ZIP / link embed) untuk masing-masing diklat keterampilan. Peserta dapat mengakses simulator secara langsung dan hasil penilaian mandiri terbaik otomatis terekam ke LMS.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setPreviewOpen(!previewOpen)}
            className="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition border border-white/20 shadow-xs cursor-pointer"
          >
            <Play className="w-4 h-4 text-teal-300" />
            {previewOpen ? "Tutup Preview" : "Uji Coba Simulator"}
          </button>
        </div>
      </div>

      {/* Select Course Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-xs font-black uppercase text-slate-600 tracking-wider">
            Pilih Diklat:
          </label>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-extrabold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.category ? `(${c.category})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Total Nilai Tercatat: <strong className="text-slate-800 font-extrabold">{allScores.length} peserta</strong>
        </div>
      </div>

      {/* Configuration Form Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
        <div className="border-b pb-4">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <FileCode className="w-5 h-5 text-teal-600" />
            Konfigurasi Sumber Aplikasi Simulator ({selectedCourse?.name})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Tentukan apakah ingin menggunakan simulator bawaan cerdas standar IMO STCW, tautan URL mandiri, atau unggah arsip HTML/ZIP.
          </p>
        </div>

        {/* Radio Option Picker */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
            simulatorType === "builtin" 
              ? "border-teal-600 bg-teal-50/50" 
              : "border-slate-200 hover:border-slate-300 bg-white"
          }`}>
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="simType"
                checked={simulatorType === "builtin"}
                onChange={() => setSimulatorType("builtin")}
                className="text-teal-600 focus:ring-teal-500"
              />
              <span className="font-extrabold text-xs text-slate-900">1. Simulator Bawaan Cerdas</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              Sistem otomatis menyediakan simulasi interaktif BST (Fire &amp; Sea Survival), SCRB (Peluncuran Sekoci), atau SDSD dengan penilaian otomatis standar STCW.
            </p>
          </label>

          <label className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
            simulatorType === "url" 
              ? "border-teal-600 bg-teal-50/50" 
              : "border-slate-200 hover:border-slate-300 bg-white"
          }`}>
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="simType"
                checked={simulatorType === "url"}
                onChange={() => setSimulatorType("url")}
                className="text-teal-600 focus:ring-teal-500"
              />
              <span className="font-extrabold text-xs text-slate-900">2. URL / Web Embed Link</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              Tautkan aplikasi simulator berbasis web atau server eksternal yang di-host mandiri.
            </p>
          </label>

          <label className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
            simulatorType === "html" || simulatorType === "zip"
              ? "border-teal-600 bg-teal-50/50" 
              : "border-slate-200 hover:border-slate-300 bg-white"
          }`}>
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="simType"
                checked={simulatorType === "html" || simulatorType === "zip"}
                onChange={() => setSimulatorType("html")}
                className="text-teal-600 focus:ring-teal-500"
              />
              <span className="font-extrabold text-xs text-slate-900">3. Ekstrak Arsip ZIP / HTML</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              Unggah file arsip ZIP atau file HTML mandiri. Sistem mengekstrak dan menjalankan aplikasi di LMS.
            </p>
          </label>
        </div>

        {/* Dynamic Input based on Type */}
        {simulatorType === "url" && (
          <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200 animate-fadeIn">
            <label className="block text-xs font-bold text-slate-700 uppercase">
              URL / Link Aplikasi Simulator
            </label>
            <div className="relative">
              <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="url"
                placeholder="https://simulator-maritim.contoh.com atau link embed"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              *Tips: Simulator dapat mengirim skor ke LMS menggunakan perintah: <code>window.parent.postMessage(&#123; type: 'SIMULATOR_SCORE', score: 85 &#125;, '*')</code>.
            </p>
          </div>
        )}

        {(simulatorType === "html" || simulatorType === "zip") && (
          <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 animate-fadeIn">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                Unggah Berkas Simulator (.ZIP atau .HTML)
              </label>
              <div className="flex items-center gap-3">
                <label className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition shadow-xs">
                  <Upload className="w-4 h-4" />
                  {isProcessingZip ? "Mengekstrak..." : "Pilih File ZIP / HTML"}
                  <input
                    type="file"
                    accept=".zip,.html,.htm"
                    onChange={handleZipUpload}
                    disabled={isProcessingZip}
                    className="hidden"
                  />
                </label>
                {uploadedZipName && (
                  <span className="text-xs text-slate-700 font-bold bg-white border border-slate-300 px-3 py-1.5 rounded-lg flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-teal-600" />
                    {uploadedZipName}
                  </span>
                )}
              </div>
            </div>

            {htmlInput && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Pratinjau Kode HTML / Script
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (!htmlInput) return;
                      // Insert postMessage script automatically before </script> or </body>
                      if (htmlInput.includes("</script>")) {
                        const idx = htmlInput.lastIndexOf("</script>");
                        const injected = htmlInput.slice(0, idx) + 
                          "\n  // Kode otomatis kirim nilai ke LMS saat simulasi selesai:\n  // window.parent.postMessage({ type: 'SIMULATOR_SCORE', score: 90 }, '*');\n" + 
                          htmlInput.slice(idx);
                        setHtmlInput(injected);
                      } else if (htmlInput.includes("</body>")) {
                        const idx = htmlInput.lastIndexOf("</body>");
                        const injected = htmlInput.slice(0, idx) + 
                          "\n<script>\n  // Panggil fungsi ini saat simulasi selesai:\n  function kirimNilaiLMS(nilai) {\n    window.parent.postMessage({ type: 'SIMULATOR_SCORE', score: nilai }, '*');\n  }\n</script>\n" + 
                          htmlInput.slice(idx);
                        setHtmlInput(injected);
                      }
                    }}
                    className="text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-300 px-2.5 py-1 rounded-md transition cursor-pointer"
                  >
                    + Sisipkan Contoh Kode Nilai LMS
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={htmlInput}
                  onChange={(e) => setHtmlInput(e.target.value)}
                  className="w-full font-mono text-[11px] p-3 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-teal-500"
                />
                <p className="text-[11px] text-slate-600 mt-1.5 bg-amber-50 border border-amber-200 p-2 rounded-md">
                  💡 <strong>Posisi Penulisan Kode:</strong> Letakkan perintah <code>window.parent.postMessage(&#123; type: 'SIMULATOR_SCORE', score: 90 &#125;, '*');</code> di <strong>DALAM tag <code>&lt;script&gt;</code> (sebelum <code>&lt;/script&gt;</code>)</strong> atau di dalam fungsi saat tombol selesai ditekan. <em>Jangan meletakkannya di bawah <code>&lt;/html&gt;</code> karena di luar dokumen tidak akan dieksekusi.</em>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Feedback message */}
        {feedback && (
          <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
            feedback.type === "success" 
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200" 
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}>
            {feedback.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-teal-600 hover:bg-teal-700 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            {isSaving ? "Menyimpan..." : "Simpan Konfigurasi Simulator"}
          </button>
        </div>
      </div>

      {/* Simulator Test Sandbox (When Preview is Open) */}
      {previewOpen && (
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 shadow-xl space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between text-white text-xs font-bold px-2">
            <span className="flex items-center gap-2">
              <Play className="w-4 h-4 text-teal-400" />
              Pratinjau Simulator Langsung ({selectedCourse?.name})
            </span>
            <button
              onClick={() => setPreviewOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              Tutup Preview
            </button>
          </div>
          <div className="h-[480px] w-full rounded-xl overflow-hidden border border-slate-700 bg-black">
            {simulatorType === "url" && urlInput ? (
              <iframe
                src={urlInput}
                title="Preview Simulator"
                className="w-full h-full border-none"
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
              />
            ) : (
              <iframe
                srcDoc={htmlInput || undefined}
                title="Preview Simulator"
                className="w-full h-full border-none"
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
              />
            )}
          </div>
        </div>
      )}

      {/* Table: Participant Simulator Scores for this Course */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4 text-teal-600" />
              Rekapitulasi Nilai Praktek Simulator ({selectedCourse?.name})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Daftar nilai terbaik yang dicapai peserta melalui sesi simulasi praktek mandiri.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari nama / kode pelaut..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-teal-500 w-48 sm:w-56"
              />
            </div>

            <button
              onClick={handleExportExcel}
              disabled={allScores.length === 0}
              className="bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh Rekap Praktek (Excel)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-100 font-bold text-slate-700 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-center w-12">No</th>
                <th className="px-4 py-3">Nama Peserta</th>
                <th className="px-4 py-3 text-center">Kode Pelaut (Identity)</th>
                <th className="px-4 py-3 text-center">Nilai Terbaik</th>
                <th className="px-4 py-3 text-center">Nilai Terakhir</th>
                <th className="px-4 py-3 text-center">Jumlah Percobaan</th>
                <th className="px-4 py-3 text-center">Waktu Selesai Terakhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredScores.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    Belum ada nilai simulasi praktek yang tercatat untuk diklat ini.
                  </td>
                </tr>
              ) : (
                filteredScores.map((s, idx) => (
                  <tr key={`${s.userId}_${idx}`} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-center font-bold text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-3 font-extrabold text-slate-900">{s.userName}</td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-slate-700">{s.seafarerCode || "-"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block bg-emerald-100 text-emerald-800 font-black px-2.5 py-0.5 rounded-full text-xs border border-emerald-300">
                        {s.bestScore} / 100
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-600">{s.lastScore}</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-600">{s.attemptsCount}x</td>
                    <td className="px-4 py-3 text-center font-mono text-[11px] text-slate-500">
                      {s.lastAttemptAt ? new Date(s.lastAttemptAt).toLocaleString("id-ID") : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
