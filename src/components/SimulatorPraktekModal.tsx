import React, { useState, useEffect, useRef } from "react";
import { 
  X, 
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  Award, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Printer, 
  Download,
  AlertCircle,
  FileCode,
  ShieldCheck,
  Gamepad2
} from "lucide-react";
import { 
  getSimulatorConfig, 
  getSimulatorScore, 
  recordSimulatorScore, 
  generateBuiltInSimulatorHtml,
  SimulatorConfig,
  SimulatorScoreRecord 
} from "../utils/simulatorStorage";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  courseName: string;
  user: {
    id: string;
    name: string;
    identity: string;
  };
  onScoreSaved?: (record: SimulatorScoreRecord) => void;
}

export default function SimulatorPraktekModal({
  isOpen,
  onClose,
  courseId,
  courseName,
  user,
  onScoreSaved
}: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [config, setConfig] = useState<SimulatorConfig | null>(null);
  const [scoreRecord, setScoreRecord] = useState<SimulatorScoreRecord | null>(null);
  const [newScoreNotification, setNewScoreNotification] = useState<{
    score: number;
    isNewBest: boolean;
  } | null>(null);
  const [manualScoreInput, setManualScoreInput] = useState<string>("");
  const [isManualInputOpen, setIsManualInputOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load config & existing score when modal opens
  useEffect(() => {
    if (isOpen && courseId) {
      const cfg = getSimulatorConfig(courseId, courseName);
      setConfig(cfg);

      const existingScore = getSimulatorScore(courseId, user.id);
      setScoreRecord(existingScore);
      setNewScoreNotification(null);
      setIsManualInputOpen(false);
    }
  }, [isOpen, courseId, courseName, user.id]);

  // Listen to postMessage from the simulator iframe
  useEffect(() => {
    if (!isOpen) return;

    const handleMessage = async (event: MessageEvent) => {
      // Validate incoming data
      const data = event.data;
      if (!data) return;

      let detectedScore: number | null = null;
      let details = "";

      if (typeof data === "object") {
        if (data.type === "SIMULATOR_SCORE" && typeof data.score === "number") {
          detectedScore = data.score;
          details = data.details || "";
        } else if (typeof data.score === "number") {
          detectedScore = data.score;
        } else if (data.type === "PRACTICE_RESULT" && typeof data.result === "number") {
          detectedScore = data.result;
        }
      }

      if (detectedScore !== null && !isNaN(detectedScore)) {
        const cleanScore = Math.min(100, Math.max(0, Math.round(detectedScore)));
        const prevBest = scoreRecord?.bestScore || 0;
        const isNewBest = cleanScore > prevBest;

        const updated = await recordSimulatorScore({
          courseId,
          courseName,
          userId: user.id,
          userName: user.name,
          seafarerCode: user.identity,
          score: cleanScore,
          details
        });

        setScoreRecord(updated);
        setNewScoreNotification({
          score: cleanScore,
          isNewBest
        });

        if (onScoreSaved) {
          onScoreSaved(updated);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isOpen, courseId, courseName, user, scoreRecord, onScoreSaved]);

  if (!isOpen) return null;

  // Handle manual score save (if simulation tool does not support automatic postMessage)
  const handleSaveManualScore = async () => {
    const parsed = parseInt(manualScoreInput, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      alert("Harap masukkan nilai valid antara 0 sampai 100.");
      return;
    }

    const prevBest = scoreRecord?.bestScore || 0;
    const isNewBest = parsed > prevBest;

    const updated = await recordSimulatorScore({
      courseId,
      courseName,
      userId: user.id,
      userName: user.name,
      seafarerCode: user.identity,
      score: parsed,
      details: "Dicatat melalui verifikasi hasil simulator"
    });

    setScoreRecord(updated);
    setNewScoreNotification({
      score: parsed,
      isNewBest
    });
    setIsManualInputOpen(false);
    setManualScoreInput("");

    if (onScoreSaved) {
      onScoreSaved(updated);
    }
  };

  // Reload the simulator iframe
  const handleReload = () => {
    if (iframeRef.current) {
      if (config?.type === "url" && config.url) {
        iframeRef.current.src = config.url;
      } else {
        iframeRef.current.srcdoc = config?.htmlContent || generateBuiltInSimulatorHtml(courseName, user.name, user.identity);
      }
    }
  };

  // Print simulator certificate / proof card
  const handlePrintCertificate = () => {
    window.print();
  };

  const iframeContent = config?.type === "url" && config.url 
    ? undefined 
    : (config?.htmlContent || generateBuiltInSimulatorHtml(courseName, user.name, user.identity));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn">
      
      {/* Print-only Proof Card */}
      <div className="hidden print:block p-8 bg-white text-slate-900 border-2 border-slate-900 rounded-xl m-4">
        <div className="text-center pb-4 border-b-2 border-slate-900 mb-6">
          <h1 className="text-xl font-black uppercase tracking-tight">KARTU HASIL PRAKTEK SIMULATOR MANDIRI</h1>
          <h2 className="text-sm font-bold text-slate-700">LMS DIKLAT &amp; KETRAMPILAN PELAUT</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs mb-6">
          <div>
            <div className="text-slate-500 font-bold uppercase">Nama Peserta</div>
            <div className="text-base font-extrabold text-slate-950">{user.name}</div>
          </div>
          <div>
            <div className="text-slate-500 font-bold uppercase">Kode Pelaut (Identity)</div>
            <div className="text-base font-mono font-extrabold text-slate-950">{user.identity || "-"}</div>
          </div>
          <div>
            <div className="text-slate-500 font-bold uppercase">Diklat / Course</div>
            <div className="text-sm font-extrabold text-indigo-950">{courseName}</div>
          </div>
          <div>
            <div className="text-slate-500 font-bold uppercase">Nilai Praktek Terbaik (Best Score)</div>
            <div className="text-xl font-black text-emerald-700">
              {scoreRecord ? `${scoreRecord.bestScore} / 100` : "Belum Ada Nilai"}
            </div>
          </div>
        </div>
        <div className="text-xs text-slate-500 pt-4 border-t border-slate-300 flex justify-between">
          <span>Total Percobaan: {scoreRecord?.attemptsCount || 0} kali</span>
          <span>Dicatat: {scoreRecord?.lastAttemptAt ? new Date(scoreRecord.lastAttemptAt).toLocaleString("id-ID") : "-"}</span>
        </div>
      </div>

      {/* Main Modal Card */}
      <div className={`bg-slate-900 border border-slate-700 shadow-2xl flex flex-col transition-all duration-300 rounded-2xl overflow-hidden print:hidden ${
        isFullscreen ? "fixed inset-0 rounded-none z-50 w-full h-full" : "w-full max-w-5xl h-[92vh]"
      }`}>
        
        {/* Top Header Bar */}
        <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-3 sm:px-6 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-teal-500 to-emerald-500 text-white rounded-xl shadow-xs">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-white leading-tight">
                  Simulator Praktek Mandiri
                </h3>
                <span className="bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full">
                  Bebas Akses
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-xs sm:max-w-md">
                {courseName} &bull; <span className="text-slate-300 font-medium">{user.name}</span> ({user.identity || "-"})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Best Score Badge */}
            {scoreRecord && (
              <div className="hidden sm:flex items-center gap-2 bg-emerald-950/80 border border-emerald-600/50 rounded-xl px-3 py-1.5 text-xs text-emerald-300">
                <Award className="w-4 h-4 text-emerald-400" />
                <span>
                  Nilai Terbaik: <strong className="text-white text-sm font-black">{scoreRecord.bestScore}</strong> / 100
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">({scoreRecord.attemptsCount}x)</span>
              </div>
            )}

            <button
              onClick={handleReload}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="Muat ulang simulator"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={handlePrintCertificate}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="Cetak Bukti Praktek"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title={isFullscreen ? "Keluar layar penuh" : "Layar penuh"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition"
              title="Tutup simulator"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Score Notification Toast Banner */}
        {newScoreNotification && (
          <div className="bg-emerald-600 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between shrink-0 shadow-md animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              <span>
                Hasil simulasi tercatat: <strong>{newScoreNotification.score} / 100</strong>!
                {newScoreNotification.isNewBest && (
                  <span className="ml-2 bg-white text-emerald-800 px-2 py-0.5 rounded-full text-[10px] uppercase font-black tracking-wider">
                    Rekor Nilai Terbaik Baru!
                  </span>
                )}
              </span>
            </div>
            <button
              onClick={() => setNewScoreNotification(null)}
              className="text-white/80 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Simulator Iframe Area */}
        <div className="flex-1 bg-slate-950 relative w-full h-full overflow-hidden">
          {config?.type === "url" && config.url ? (
            <iframe
              ref={iframeRef}
              src={config.url}
              title={config.title || "Simulator Praktek"}
              className="w-full h-full border-none"
              allow="camera; microphone; fullscreen; accelerometer; gyroscope"
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
            />
          ) : (
            <iframe
              ref={iframeRef}
              srcDoc={iframeContent}
              title={config?.title || "Simulator Praktek Mandiri"}
              className="w-full h-full border-none"
              allow="camera; microphone; fullscreen; accelerometer; gyroscope"
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
            />
          )}
        </div>

        {/* Bottom Status / Manual Score Bar */}
        <div className="bg-slate-900 border-t border-slate-800 px-4 py-2.5 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex items-center gap-3 text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              Tersambung ke Akun: <strong className="text-slate-200 font-bold">{user.name}</strong>
            </span>
            <span className="hidden sm:inline text-slate-600">&bull;</span>
            <span className="hidden sm:inline">
              Nilai otomatis disimpan saat simulasi selesai.
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!isManualInputOpen ? (
              <button
                type="button"
                onClick={() => setIsManualInputOpen(true)}
                className="text-slate-400 hover:text-teal-300 text-xs font-semibold underline underline-offset-4 cursor-pointer"
              >
                Catat Nilai Manual
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-lg border border-slate-700 animate-fadeIn">
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="Nilai (0-100)"
                  value={manualScoreInput}
                  onChange={(e) => setManualScoreInput(e.target.value)}
                  className="w-24 px-2 py-1 bg-slate-900 text-white rounded text-xs border border-slate-600 focus:outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={handleSaveManualScore}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-2.5 py-1 rounded text-xs cursor-pointer"
                >
                  Simpan
                </button>
                <button
                  type="button"
                  onClick={() => setIsManualInputOpen(false)}
                  className="text-slate-400 hover:text-white px-1.5 py-1 text-xs"
                >
                  Batal
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
