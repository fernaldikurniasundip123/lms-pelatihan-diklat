import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "../lib/supabase";
import { BahanDiklatItem } from "../types/bahanDiklat";
import {
  FileText,
  User,
  Building2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Pencil,
  Eraser,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";

// Configure pdf.js worker URL
if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;
}

export default function BahanDiklat() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // All available bahan diklat
  const [bahanList, setBahanList] = useState<BahanDiklatItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Access Form state
  const [nama, setNama] = useState("");
  const [dataAkses, setDataAkses] = useState<"Peserta Diklat STIP" | "Dosen" | "Institusi">("Peserta Diklat STIP");
  const [namaInstitusi, setNamaInstitusi] = useState("");
  const [selectedCourseName, setSelectedCourseName] = useState("");
  const [selectedPertemuan, setSelectedPertemuan] = useState("");
  const [formError, setFormError] = useState("");

  // Mode: 'form' | 'viewer'
  const [mode, setMode] = useState<"form" | "viewer">("form");

  // Selected item to view
  const [activeItem, setActiveItem] = useState<BahanDiklatItem | null>(null);

  // PDF Viewer state
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.2);
  const [loadingPdf, setLoadingPdf] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string>("");

  // Drawing canvas state
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);
  const [penColor, setPenColor] = useState<string>("#ef4444"); // Default red
  const [penWidth, setPenWidth] = useState<number>(4);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);

  // Load available materials from Supabase / LocalStorage
  useEffect(() => {
    const fetchBahan = async () => {
      setLoadingData(true);
      let items: BahanDiklatItem[] = [];

      try {
        const { data, error } = await supabase.from("bahan_diklat").select("*");
        if (!error && data && data.length > 0) {
          items = data as BahanDiklatItem[];
        }
      } catch {
        // ignore
      }

      if (items.length === 0) {
        const local = localStorage.getItem("lms_bahan_diklat_list");
        if (local) {
          try {
            items = JSON.parse(local);
          } catch {
            items = [];
          }
        }
      }

      setBahanList(items);

      // Pre-select courseName or item if URL params exist
      const urlCourseId = searchParams.get("courseId");
      const urlPertemuan = searchParams.get("pertemuan");
      const urlId = searchParams.get("id");

      if (urlId) {
        const found = items.find((b) => b.id === urlId);
        if (found) {
          setSelectedCourseName(found.course_name);
          setSelectedPertemuan(found.pertemuan);
        }
      } else if (urlCourseId) {
        const found = items.find((b) => b.course_id === urlCourseId);
        if (found) {
          setSelectedCourseName(found.course_name);
          if (urlPertemuan) setSelectedPertemuan(urlPertemuan);
        }
      } else if (items.length > 0) {
        setSelectedCourseName(items[0].course_name);
        setSelectedPertemuan(items[0].pertemuan);
      }

      setLoadingData(false);
    };

    fetchBahan();
  }, [searchParams]);

  // Available unique course names
  const uniqueCourseNames = Array.from(new Set(bahanList.map((b) => b.course_name)));

  // Filter available Pertemuan for selected Course
  const availablePertemuan = bahanList
    .filter((b) => b.course_name === selectedCourseName)
    .map((b) => b.pertemuan);

  // Update selectedPertemuan when selectedCourseName changes
  useEffect(() => {
    if (availablePertemuan.length > 0) {
      if (!availablePertemuan.includes(selectedPertemuan)) {
        setSelectedPertemuan(availablePertemuan[0]);
      }
    } else {
      setSelectedPertemuan("");
    }
  }, [selectedCourseName, availablePertemuan, selectedPertemuan]);

  // Handle Form Submission
  const handleOpenBahan = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!nama.trim()) {
      setFormError("Silakan isi Nama Lengkap terlebih dahulu.");
      return;
    }

    if (dataAkses === "Institusi" && !namaInstitusi.trim()) {
      setFormError("Silakan isi Nama Institusi Anda.");
      return;
    }

    if (!selectedCourseName || !selectedPertemuan) {
      setFormError("Silakan pilih Jenis Bahan yang ingin diakses.");
      return;
    }

    const matched = bahanList.find(
      (b) => b.course_name === selectedCourseName && b.pertemuan === selectedPertemuan
    );

    if (!matched) {
      setFormError("Bahan paparan yang Anda pilih tidak ditemukan.");
      return;
    }

    setActiveItem(matched);
    setMode("viewer");
    setPageNum(1);
    loadPdfDoc(matched);
  };

  // Load PDF document using pdfjsLib
  const loadPdfDoc = async (item: BahanDiklatItem) => {
    setLoadingPdf(true);
    setPdfError("");
    setPdfDoc(null);

    try {
      const source = item.file_url || item.file_data;
      if (!source) {
        throw new Error("File PDF tidak tersedia atau link rusak.");
      }

      let loadingTask;

      if (
        typeof source === "string" &&
        (source.startsWith("data:") ||
          (!source.startsWith("http://") && !source.startsWith("https://") && !source.startsWith("/")))
      ) {
        // Base64 Data URL or string -> Convert to Uint8Array for pdf.js
        const base64Data = source.includes(",") ? source.split(",")[1] : source;
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        loadingTask = pdfjsLib.getDocument({
          data: bytes,
          cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/",
          cMapPacked: true,
        });
      } else {
        // HTTP / HTTPS URL
        loadingTask = pdfjsLib.getDocument({
          url: source,
          cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/",
          cMapPacked: true,
        });
      }

      const pdf = await loadingTask.promise;

      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setPageNum(1);
    } catch (err: any) {
      setPdfError("Gagal membuka file PDF: " + (err.message || "File corrupt atau tidak valid"));
    } finally {
      setLoadingPdf(false);
    }
  };

  // Render Page onto Canvas
  useEffect(() => {
    if (!pdfDoc || mode !== "viewer") return;

    let isCancelled = false;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = pdfCanvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        };

        await (page.render(renderContext as any) as any).promise;

        // Resize overlay drawing canvas to match PDF canvas
        const drawCanvas = drawCanvasRef.current;
        if (drawCanvas) {
          drawCanvas.width = viewport.width;
          drawCanvas.height = viewport.height;
          // Clear drawing canvas when page or scale changes
          clearDrawCanvas();
        }
      } catch (err) {
        console.error("Error rendering PDF page:", err);
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, pageNum, scale, mode]);

  // Drawing Canvas logic
  const clearDrawCanvas = () => {
    const canvas = drawCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode) return;
    setIsDrawing(true);
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isDrawingMode) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()} // Block right-click / direct save
      className="min-h-screen bg-slate-900 text-slate-100 flex flex-col select-none"
    >
      {/* Navigation Bar Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-sm">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-wide">
              Penampil Bahan Paparan Diklat Ketrampilan
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">
              STIP Jakarta LMS - Mode Presentasi / Pembelajaran
            </p>
          </div>
        </div>

        {mode === "viewer" && (
          <button
            onClick={() => setMode("form")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs sm:text-sm font-medium transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Ganti Bahan</span>
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center items-center p-3 sm:p-6 overflow-auto">
        {mode === "form" ? (
          /* ================= PHASE 1: FORM AKSES ================= */
          <div className="w-full max-w-xl bg-slate-800 border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 rounded-full bg-indigo-500/10 text-indigo-400 mb-1">
                <FileText className="w-8 h-8" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">Form Akses Bahan Paparan</h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Lengkapi identitas dan jenis bahan yang ingin Anda tampilkan.
              </p>
            </div>

            {formError && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {loadingData ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                Memuat data bahan diklat ketrampilan...
              </div>
            ) : (
              <form onSubmit={handleOpenBahan} className="space-y-4">
                {/* 1. Nama Lengkap */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Nama Lengkap Sesuai Identitas <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Masukkan nama lengkap Anda"
                      value={nama}
                      onChange={(e) => setNama(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      required
                    />
                  </div>
                </div>

                {/* 2. Data Akses */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Data Akses <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={dataAkses}
                    onChange={(e) =>
                      setDataAkses(e.target.value as "Peserta Diklat STIP" | "Dosen" | "Institusi")
                    }
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="Peserta Diklat STIP">Peserta Diklat STIP</option>
                    <option value="Dosen">Dosen / Pengajar</option>
                    <option value="Institusi">Institusi</option>
                  </select>
                </div>

                {/* 3. Input Nama Institusi jika Data Akses === 'Institusi' */}
                {dataAkses === "Institusi" && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                      Nama Institusi <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <Building2 className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Ketik nama institusi / instansi Anda"
                        value={namaInstitusi}
                        onChange={(e) => setNamaInstitusi(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* 4. Select Nama Diklat */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Nama Diklat Ketrampilan <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={selectedCourseName}
                    onChange={(e) => setSelectedCourseName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    required
                  >
                    {uniqueCourseNames.length === 0 ? (
                      <option value="">Belum ada bahan diunggah admin</option>
                    ) : (
                      uniqueCourseNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* 5. Select Pertemuan */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Bahan Pertemuan / Part <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={selectedPertemuan}
                    onChange={(e) => setSelectedPertemuan(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    required
                  >
                    {availablePertemuan.length === 0 ? (
                      <option value="">Tidak ada pertemuan</option>
                    ) : (
                      availablePertemuan.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={uniqueCourseNames.length === 0}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Buka Bahan Paparan</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* ================= PHASE 2: PENAMPIL BAHAN PAPARAN (PDF CANVAS) ================= */
          <div className="w-full h-full flex flex-col items-center">
            {/* Top Toolbar Controls */}
            <div className="w-full max-w-5xl bg-slate-800/90 backdrop-blur-md border border-slate-700 rounded-xl p-3 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-lg z-20 sticky top-2">
              {/* Material Title */}
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 text-xs font-semibold rounded-md border border-indigo-500/30">
                  {activeItem?.pertemuan}
                </span>
                <span className="text-sm font-semibold text-white truncate max-w-xs">
                  {activeItem?.course_name}
                </span>
              </div>

              {/* Page & Zoom Navigation Controls */}
              <div className="flex items-center gap-2">
                <button
                  disabled={pageNum <= 1}
                  onClick={() => setPageNum((prev) => Math.max(prev - 1, 1))}
                  className="p-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg transition"
                  title="Halaman Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-300 font-medium px-1">
                  {pageNum} / {numPages || 1}
                </span>
                <button
                  disabled={pageNum >= numPages}
                  onClick={() => setPageNum((prev) => Math.min(prev + 1, numPages))}
                  className="p-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg transition"
                  title="Halaman Selanjutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <div className="h-4 w-px bg-slate-700 mx-1"></div>

                <button
                  onClick={() => setScale((prev) => Math.max(prev - 0.2, 0.6))}
                  className="p-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                  title="Perkecil Zoom"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-300 font-medium px-1">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  onClick={() => setScale((prev) => Math.min(prev + 0.3, 3.0))}
                  className="p-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                  title="Perbesar Zoom"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              {/* Pencil & Eraser Teaching Annotation Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsDrawingMode(!isDrawingMode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    isDrawingMode
                      ? "bg-red-600 text-white shadow-md shadow-red-600/40 ring-2 ring-red-400"
                      : "bg-slate-700 hover:bg-slate-600 text-slate-200"
                  }`}
                  title="Mode Coret-coret / Pensil Mengajar"
                >
                  <Pencil className="w-4 h-4" />
                  <span>{isDrawingMode ? "Pensil Aktif" : "Pensil"}</span>
                </button>

                {isDrawingMode && (
                  <>
                    {/* Pen Color Palette */}
                    <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700">
                      {["#ef4444", "#3b82f6", "#eab308", "#22c55e", "#ffffff", "#000000"].map((color) => (
                        <button
                          key={color}
                          onClick={() => setPenColor(color)}
                          className={`w-4 h-4 rounded-full transition ${
                            penColor === color ? "ring-2 ring-offset-1 ring-offset-slate-800 ring-white scale-110" : "opacity-80"
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>

                    {/* Pen Thickness */}
                    <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-700 text-xs">
                      {[2, 4, 8].map((width) => (
                        <button
                          key={width}
                          onClick={() => setPenWidth(width)}
                          className={`px-1.5 py-0.5 rounded ${
                            penWidth === width ? "bg-indigo-600 text-white font-bold" : "text-slate-400"
                          }`}
                        >
                          {width === 2 ? "Tipis" : width === 4 ? "Sedang" : "Tebal"}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Clear Canvas / Eraser Button */}
                <button
                  onClick={clearDrawCanvas}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium transition"
                  title="Hapus Coretan di Layar"
                >
                  <Eraser className="w-4 h-4 text-amber-400" />
                  <span>Hapus Coretan</span>
                </button>

                <div className="h-4 w-px bg-slate-700 mx-1"></div>

                {/* Fullscreen Button */}
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                  title="Layar Penuh / Fullscreen"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Interactive Canvas Rendering Area */}
            <div className="relative flex-1 flex items-center justify-center w-full overflow-auto p-4 bg-slate-950 rounded-xl border border-slate-800 shadow-inner min-h-[500px]">
              {loadingPdf && (
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-medium">Memuat halaman PDF...</span>
                </div>
              )}

              {pdfError && (
                <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-center max-w-md">
                  <AlertCircle className="w-10 h-10 mx-auto mb-2 text-red-400" />
                  <p className="font-semibold">{pdfError}</p>
                </div>
              )}

              <div
                className={`relative inline-block shadow-2xl rounded-sm overflow-hidden border border-slate-800 ${
                  isDrawingMode ? "cursor-crosshair" : "cursor-default"
                }`}
              >
                {/* PDF Page Canvas */}
                <canvas ref={pdfCanvasRef} className="block bg-white shadow-xl" />

                {/* Drawing Annotation Canvas Overlay */}
                <canvas
                  ref={drawCanvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className={`absolute top-0 left-0 w-full h-full ${
                    isDrawingMode ? "pointer-events-auto" : "pointer-events-none"
                  }`}
                />
              </div>
            </div>

            {/* Instruction Notice Footer */}
            <div className="w-full text-center mt-3 text-xs text-slate-400 flex items-center justify-center gap-2">
              <span>* Mode Paparan Presensial: Dokumen dilindungi. Coretan pensil bersifat sementara untuk mengajar.</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
