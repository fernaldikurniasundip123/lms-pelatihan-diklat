import { supabase } from "../lib/supabase";

export interface SimulatorConfig {
  courseId: string;
  courseName: string;
  type: "builtin" | "url" | "html" | "zip";
  url?: string;
  htmlContent?: string;
  zipBlobUrl?: string;
  title?: string;
  updatedAt?: string;
}

export interface SimulatorScoreRecord {
  courseId: string;
  courseName: string;
  userId: string;
  userName: string;
  seafarerCode: string;
  bestScore: number;
  lastScore: number;
  attemptsCount: number;
  lastAttemptAt: string;
  history: Array<{ score: number; timestamp: string; details?: string }>;
}

const STORAGE_CONFIG_PREFIX = "simulator_config_";
const STORAGE_SCORE_PREFIX = "simulator_score_";
const STORAGE_ALL_SCORES_KEY = "simulator_all_scores_v1";

// Retrieve simulator configuration for a course
export const getSimulatorConfig = (courseId: string, courseName = ""): SimulatorConfig => {
  try {
    const raw = localStorage.getItem(`${STORAGE_CONFIG_PREFIX}${courseId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Failed to parse simulator config from storage", e);
  }

  // Default fallback: use high-fidelity built-in simulator matching course
  return {
    courseId,
    courseName,
    type: "builtin",
    title: `Simulator Praktek Mandiri - ${courseName || "Diklat Keterampilan"}`
  };
};

// Save simulator configuration
export const saveSimulatorConfig = async (config: SimulatorConfig): Promise<boolean> => {
  try {
    const serialized = JSON.stringify({
      ...config,
      updatedAt: new Date().toISOString()
    });
    localStorage.setItem(`${STORAGE_CONFIG_PREFIX}${config.courseId}`, serialized);

    // 1. Try updating course record in Supabase if custom column exists
    try {
      await supabase
        .from("courses")
        .update({
          simulator_config: config
        } as any)
        .eq("id", config.courseId);
    } catch {
      // Ignored if column does not exist
    }

    // 2. Also sync to bahan_diklat table with category='SIMULATOR' so all participants on any device get it!
    try {
      await supabase
        .from("bahan_diklat")
        .upsert({
          id: `sim_${config.courseId}`,
          course_id: config.courseId,
          course_name: config.courseName,
          category: "SIMULATOR",
          pertemuan: 1,
          file_name: config.title || `${config.courseName}.html`,
          file_data: config.htmlContent || config.url || "",
          created_at: new Date().toISOString()
        } as any);
    } catch {
      // Fallback if schema does not accept
    }

    return true;
  } catch (err) {
    console.error("Failed to save simulator config", err);
    return false;
  }
};

// Fetch cloud-stored simulator configuration for cross-device participant distribution
export const fetchCloudSimulatorConfig = async (courseId: string): Promise<SimulatorConfig | null> => {
  try {
    // 1. Try querying bahan_diklat for category SIMULATOR
    const { data: bData } = await supabase
      .from("bahan_diklat")
      .select("*")
      .eq("course_id", courseId)
      .eq("category", "SIMULATOR")
      .limit(1);

    if (bData && bData.length > 0 && bData[0].file_data) {
      const item = bData[0];
      const isUrl = typeof item.file_data === "string" && (item.file_data.startsWith("http://") || item.file_data.startsWith("https://"));
      return {
        courseId,
        courseName: item.course_name || "",
        type: isUrl ? "url" : "html",
        url: isUrl ? item.file_data : undefined,
        htmlContent: !isUrl ? item.file_data : undefined,
        title: item.file_name || "Cloud Simulator"
      };
    }

    // 2. Try querying courses table for simulator_config
    const { data: cData } = await supabase
      .from("courses")
      .select("simulator_config")
      .eq("id", courseId)
      .limit(1);

    if (cData && cData.length > 0 && (cData[0] as any).simulator_config) {
      return (cData[0] as any).simulator_config;
    }
  } catch (e) {
    console.warn("Could not fetch cloud simulator config:", e);
  }
  return null;
};

// Retrieve best score record for a user in a course
export const getSimulatorScore = (courseId: string, userId: string): SimulatorScoreRecord | null => {
  try {
    const key = `${STORAGE_SCORE_PREFIX}${courseId}_${userId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Failed to get simulator score", e);
  }
  return null;
};

// Save a new score attempt and record best score
export const recordSimulatorScore = async (params: {
  courseId: string;
  courseName: string;
  userId: string;
  userName: string;
  seafarerCode: string;
  score: number;
  details?: string;
}): Promise<SimulatorScoreRecord> => {
  const { courseId, courseName, userId, userName, seafarerCode, score, details } = params;
  const existing = getSimulatorScore(courseId, userId);

  const cleanScore = Math.min(100, Math.max(0, Math.round(score)));
  const attemptsCount = (existing?.attemptsCount || 0) + 1;
  const bestScore = existing ? Math.max(existing.bestScore, cleanScore) : cleanScore;
  const now = new Date().toISOString();

  const newRecord: SimulatorScoreRecord = {
    courseId,
    courseName,
    userId,
    userName,
    seafarerCode,
    bestScore,
    lastScore: cleanScore,
    attemptsCount,
    lastAttemptAt: now,
    history: [
      ...(existing?.history || []),
      { score: cleanScore, timestamp: now, details }
    ]
  };

  try {
    // 1. Save locally per user-course
    localStorage.setItem(
      `${STORAGE_SCORE_PREFIX}${courseId}_${userId}`,
      JSON.stringify(newRecord)
    );

    // 2. Add / Update in all scores index for admin reports
    const allRaw = localStorage.getItem(STORAGE_ALL_SCORES_KEY);
    const allScores: Record<string, SimulatorScoreRecord> = allRaw ? JSON.parse(allRaw) : {};
    allScores[`${courseId}_${userId}`] = newRecord;
    localStorage.setItem(STORAGE_ALL_SCORES_KEY, JSON.stringify(allScores));

    // 3. Try upserting to Supabase table if available
    try {
      await supabase
        .from("simulator_scores" as any)
        .upsert(
          {
            user_id: userId,
            course_id: courseId,
            user_name: userName,
            seafarer_code: seafarerCode,
            course_name: courseName,
            best_score: bestScore,
            last_score: cleanScore,
            attempts_count: attemptsCount,
            last_attempt_at: now
          },
          { onConflict: "user_id,course_id" }
        );
    } catch {
      // Ignored if table does not exist
    }
  } catch (err) {
    console.error("Error saving simulator score", err);
  }

  return newRecord;
};

// Retrieve all simulator scores (for Admin Final Report & Export)
export const getAllSimulatorScoresMap = async (): Promise<Record<string, number>> => {
  const map: Record<string, number> = {};

  // First read local cache
  try {
    const allRaw = localStorage.getItem(STORAGE_ALL_SCORES_KEY);
    if (allRaw) {
      const all: Record<string, SimulatorScoreRecord> = JSON.parse(allRaw);
      Object.values(all).forEach((rec) => {
        // Index by user_id_course_id, identity_course_id, and user_id alone
        if (rec.userId && rec.courseId) {
          map[`${rec.userId}_${rec.courseId}`] = rec.bestScore;
        }
        if (rec.seafarerCode && rec.courseId) {
          map[`${rec.seafarerCode}_${rec.courseId}`] = rec.bestScore;
        }
        if (rec.userId) {
          map[rec.userId] = Math.max(map[rec.userId] || 0, rec.bestScore);
        }
      });
    }
  } catch (e) {
    console.warn("Failed to load local simulator scores", e);
  }

  // Also query Supabase if table exists
  try {
    const { data } = await supabase.from("simulator_scores" as any).select("*");
    if (data && Array.isArray(data)) {
      data.forEach((row: any) => {
        const best = Number(row.best_score || 0);
        if (row.user_id && row.course_id) {
          map[`${row.user_id}_${row.course_id}`] = best;
        }
        if (row.seafarer_code && row.course_id) {
          map[`${row.seafarer_code}_${row.course_id}`] = best;
        }
        if (row.user_id) {
          map[row.user_id] = Math.max(map[row.user_id] || 0, best);
        }
      });
    }
  } catch {
    // Supabase table does not exist yet
  }

  return map;
};

// Helper: Detect specific maritime training module based on course name
export type MaritimeSimulatorModule =
  | "ecdis"
  | "radar"
  | "scrb"
  | "sdsd"
  | "bst"
  | "brm"
  | "erm"
  | "gmdss"
  | "aff"
  | "mfa"
  | "pasis";

export const detectMaritimeModule = (courseName: string): MaritimeSimulatorModule => {
  const upper = (courseName || "").toUpperCase();
  if (upper.includes("ECDIS") || upper.includes("ELECTRONIC CHART") || upper.includes("PETA ELEKTRONIK") || upper.includes("ENC")) {
    return "ecdis";
  }
  if (upper.includes("RADAR") || upper.includes("ARPA")) {
    return "radar";
  }
  if (upper.includes("SCRB") || upper.includes("SURVIVAL CRAFT") || upper.includes("SEKOCI") || upper.includes("RESCUE BOAT")) {
    return "scrb";
  }
  if (upper.includes("SDSD") || upper.includes("SECURITY AWARENESS") || upper.includes("DESIGNATED SECURITY") || upper.includes("SAT")) {
    return "sdsd";
  }
  if (upper.includes("GMDSS") || upper.includes("RADIO")) {
    return "gmdss";
  }
  if (upper.includes("BRM") || upper.includes("BRIDGE RESOURCE")) {
    return "brm";
  }
  if (upper.includes("ERM") || upper.includes("ENGINE RESOURCE") || upper.includes("KAMAR MESIN")) {
    return "erm";
  }
  if (upper.includes("AFF") || upper.includes("ADVANCED FIRE")) {
    return "aff";
  }
  if (upper.includes("MFA") || upper.includes("MEDICAL FIRST") || upper.includes("MEDICAL CARE") || upper.includes("MC")) {
    return "mfa";
  }
  if (upper.includes("PASIS") || upper.includes("PENINGKATAN") || upper.includes("ANT") || upper.includes("ATT")) {
    return "pasis";
  }
  if (upper.includes("BST") || upper.includes("BASIC SAFETY")) {
    return "bst";
  }
  // Default to ecdis if matching keywords or general navigation
  return "ecdis";
};

// Built-in interactive HTML5 Maritime Simulator generator
export const generateBuiltInSimulatorHtml = (
  courseName: string,
  participantName: string,
  seafarerCode: string,
  moduleOverride?: MaritimeSimulatorModule
): string => {
  const activeModule = moduleOverride || detectMaritimeModule(courseName);

  if (activeModule === "ecdis") {
    return generateECDISSimulatorHtml(courseName, participantName, seafarerCode);
  }
  if (activeModule === "radar") {
    return generateRadarSimulatorHtml(courseName, participantName, seafarerCode);
  }
  if (activeModule === "scrb") {
    return generateSCRBSimulatorHtml(courseName, participantName, seafarerCode);
  }
  if (activeModule === "sdsd") {
    return generateSDSDSimulatorHtml(courseName, participantName, seafarerCode);
  }
  if (activeModule === "bst") {
    return generateBSTSimulatorHtml(courseName, participantName, seafarerCode);
  }
  return generateGenericMaritimeSimulatorHtml(courseName, participantName, seafarerCode, activeModule);
};

// ==========================================
// 1. FULL HIGH-TECH ECDIS CONSOLE SIMULATOR
// ==========================================
function generateECDISSimulatorHtml(
  courseName: string,
  participantName: string,
  seafarerCode: string
): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ECDIS Navigation Simulator - IMO Model Course 1.27</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace; }
    body { background: #060b13; color: #f1f5f9; min-height: 100vh; padding: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    
    .ecdis-container {
      width: 100%;
      max-width: 1050px;
      background: #0f172a;
      border: 2px solid #1e293b;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
      display: flex;
      flex-direction: column;
    }

    /* Top Console Telemetry Bar */
    .ecdis-header {
      background: #090e1a;
      border-bottom: 2px solid #1e293b;
      padding: 10px 16px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .brand-title {
      font-size: 13px;
      font-weight: 900;
      color: #38bdf8;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .brand-badge {
      background: #0369a1;
      color: #fff;
      font-size: 9px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .sensor-telemetry {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 11px;
      color: #94a3b8;
    }
    .telem-pill {
      background: #1e293b;
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid #334155;
    }
    .telem-pill strong {
      color: #38bdf8;
    }
    .telem-pill.alert {
      background: #7f1d1d;
      border-color: #ef4444;
      color: #fecaca;
    }

    /* Main Console Workspace: Canvas on left, Tasks on right */
    .ecdis-workspace {
      display: grid;
      grid-template-columns: 1fr 340px;
      min-height: 520px;
      background: #020617;
    }
    @media (max-width: 860px) {
      .ecdis-workspace { grid-template-columns: 1fr; }
    }

    /* Chart Canvas Area */
    .chart-panel {
      position: relative;
      background: #071527;
      display: flex;
      flex-direction: column;
      border-right: 2px solid #1e293b;
    }
    .chart-overlay-info {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 10;
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid #334155;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 11px;
      color: #cbd5e1;
      backdrop-filter: blur(4px);
    }
    .chart-compass-rose {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 10;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: 1px dashed rgba(56, 189, 248, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 900;
      color: #38bdf8;
      background: rgba(15, 23, 42, 0.7);
    }
    canvas {
      width: 100%;
      height: 100%;
      min-height: 440px;
      display: block;
      cursor: crosshair;
    }
    .chart-footer-tools {
      background: #090e1a;
      border-top: 1px solid #1e293b;
      padding: 6px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #94a3b8;
    }
    .tool-btn {
      background: #1e293b;
      border: 1px solid #475569;
      color: #e2e8f0;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 10px;
      cursor: pointer;
      font-weight: 700;
    }
    .tool-btn:hover { background: #0284c7; border-color: #38bdf8; }

    /* Control & Practical Tasks Panel */
    .controls-panel {
      background: #0f172a;
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow-y: auto;
    }
    .step-indicator {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 800;
      color: #38bdf8;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .task-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 12px;
    }
    .task-title {
      font-size: 13px;
      font-weight: 800;
      color: #f59e0b;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .task-desc {
      font-size: 12px;
      color: #cbd5e1;
      line-height: 1.5;
      margin-bottom: 12px;
    }
    .interactive-action-btn {
      width: 100%;
      background: #0284c7;
      border: 1px solid #38bdf8;
      color: white;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 800;
      text-align: left;
      cursor: pointer;
      margin-bottom: 8px;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .interactive-action-btn:hover:not(:disabled) {
      background: #0369a1;
      transform: translateY(-1px);
    }
    .interactive-action-btn.success {
      background: #059669 !important;
      border-color: #10b981 !important;
    }
    .interactive-action-btn.danger {
      background: #b91c1c !important;
      border-color: #ef4444 !important;
      opacity: 0.7;
    }

    .feedback-note {
      font-size: 11px;
      font-weight: 700;
      padding: 8px 10px;
      border-radius: 6px;
      margin-top: 8px;
      display: none;
      line-height: 1.4;
    }
    .feedback-success { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #059669; }
    .feedback-error { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #dc2626; }

    /* Completion Banner */
    .finish-box {
      display: none;
      background: #064e3b;
      border: 2px solid #10b981;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      animation: fadeIn 0.4s;
    }
    .finish-box h2 {
      font-size: 20px;
      font-weight: 900;
      color: #34d399;
      margin-bottom: 4px;
    }
    .finish-score {
      font-size: 24px;
      font-weight: 900;
      color: #fff;
      margin: 8px 0;
    }
    .btn-submit {
      background: #10b981;
      color: #042f2e;
      font-weight: 800;
      font-size: 13px;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      cursor: pointer;
      margin-top: 10px;
      width: 100%;
    }
    .btn-submit:hover { background: #34d399; }
    .btn-restart {
      background: #334155;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      border: none;
      padding: 8px 14px;
      border-radius: 6px;
      cursor: pointer;
      margin-top: 6px;
      width: 100%;
    }

    .progress-track {
      background: #1e293b;
      height: 6px;
      border-radius: 999px;
      overflow: hidden;
      margin: 8px 0 14px 0;
    }
    .progress-fill {
      background: #38bdf8;
      height: 100%;
      width: 25%;
      transition: width 0.3s;
    }

    @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
  </style>
</head>
<body>
  <div class="ecdis-container">
    
    <!-- Top ECDIS Telemetry & Sensor Header -->
    <div class="ecdis-header">
      <div class="brand-title">
        <span>TRANS-NAV ECDIS SYSTEM</span>
        <span class="brand-badge">IMO A.817(19)</span>
        <span class="brand-badge" style="background: #059669;">S-57 / S-63 ENC</span>
      </div>

      <div class="sensor-telemetry">
        <div class="telem-pill">POS: <strong id="telemPos">05°52.418'S 106°03.112'E</strong></div>
        <div class="telem-pill">HDG: <strong id="telemHdg">042.5°</strong></div>
        <div class="telem-pill">SOG: <strong id="telemSog">14.5 KT</strong></div>
        <div class="telem-pill">DEPTH: <strong id="telemDepth">14.2 M</strong></div>
        <div class="telem-pill" id="telemSensor">SENSOR: <strong>3D DGPS FIX (RAIM PASS)</strong></div>
      </div>
    </div>

    <!-- Main Workspace -->
    <div class="ecdis-workspace">
      
      <!-- Chart Canvas Screen -->
      <div class="chart-panel">
        <div class="chart-overlay-info">
          <div>ENC: <strong>ID400120 - SUNDA STRAIT FAIRWAY</strong></div>
          <div style="font-size: 10px; color: #94a3b8;">Skala 1:25,000 | WGS 84 | Depth in METRES</div>
          <div style="font-size: 10px; color: #38bdf8; margin-top: 2px;" id="activeContourLabel">Safety Contour: STANDBY (Default 10m)</div>
        </div>

        <div class="chart-compass-rose">N &uarr;</div>

        <canvas id="ecdisCanvas" width="700" height="520"></canvas>

        <div class="chart-footer-tools">
          <div style="display: flex; gap: 6px;">
            <button class="tool-btn" onclick="toggleSafetyContourVisual()">Highlight Safety Contour</button>
            <button class="tool-btn" onclick="toggleAisVectors()">AIS Vectors: 6 Min</button>
            <button class="tool-btn" onclick="centerShip()">Center Own Ship</button>
          </div>
          <div>Peserta: <strong style="color: #fff;">${participantName || "Peserta"}</strong> (${seafarerCode || "-"})</div>
        </div>
      </div>

      <!-- Controls & Practical Mission Column -->
      <div class="controls-panel">
        <div>
          <div class="step-indicator">
            <span id="stepLabel">Misi 1 dari 4</span>
            <span id="scoreLabel">Skor: 0 / 100</span>
          </div>
          <div class="progress-track">
            <div id="progFill" class="progress-fill"></div>
          </div>

          <div id="taskContainer">
            <!-- Dynamic Task Content Injected Here -->
          </div>

          <div id="feedbackBox" class="feedback-note"></div>
        </div>

        <!-- Completion Certificate Box -->
        <div id="finishBox" class="finish-box">
          <h2>PRAKTEK NAVIGASI ECDIS SELESAI</h2>
          <p style="font-size: 12px; color: #a7f3d0;">Verifikasi Kualifikasi IMO Model Course 1.27</p>
          <div id="finalScoreDisplay" class="finish-score">100 / 100</div>
          <p style="font-size: 11px; color: #cbd5e1; margin-bottom: 12px;">
            Hasil praktek mandiri Anda telah diverifikasi dan siap diteruskan ke akun LMS.
          </p>
          <button class="btn-submit" onclick="submitEcdisScore()">Kirim &amp; Rekam Nilai ke LMS</button>
          <button class="btn-restart" onclick="restartEcdisSim()">Ulangi Praktek ECDIS</button>
        </div>
      </div>

    </div>
  </div>

  <script>
    // Canvas & State setup
    const canvas = document.getElementById("ecdisCanvas");
    const ctx = canvas.getContext("2d");

    let currentStep = 0;
    let earnedScore = 0;
    let ownShipX = 220;
    let ownShipY = 380;
    let ownHeading = 42; // degrees
    let safetyContourActive = false;
    let routeAdjusted = false;
    let collisionAvoided = false;
    let deadReckoningActive = false;

    // Skenario Praktek Nyata ECDIS (IMO 1.27)
    const ecdisTasks = [
      {
        title: "1. Pengaturan Safety Parameters (Draft & UKC)",
        desc: "Kapal Anda bertolak dengan Draft Maksimum 8.2m. Kebijakan perusahaan mensyaratkan UKC (Under Keel Clearance) minimal 1.8m di alur sempit, koreksi pasut -0.0m.<br><strong>Hitungan: Safety Depth = 8.2 + 1.8 = 10.0 Meter.</strong>",
        options: [
          {
            text: "A. Terapkan Safety Depth: 10.0m &amp; Safety Contour: 10m (IHO S-52)",
            correct: true,
            explain: "Tepat! Safety Depth 10.0m mengisolasi perairan dangkal dan mengaktifkan kontur kedalaman aman pada peta ENC."
          },
          {
            text: "B. Set Safety Contour ke 5m agar seluruh alur terlihat biru dalam",
            correct: false,
            explain: "Salah & Bahaya! Kontur 5m lebih dangkal dari draft kapal (8.2m), kapal akan berisiko kandas tanpa peringatan alarm."
          },
          {
            text: "C. Menonaktifkan alarm safety contour untuk menghindari suara bising",
            correct: false,
            explain: "Pelanggaran serius SOLAS Ch V! Fitur anti-grounding alarm wajib aktif selama pelayaran."
          }
        ]
      },
      {
        title: "2. Route Check &amp; Deteksi Bahaya Kandas (Shoal)",
        desc: "Jalur rute dari WP01 menuju WP02 melintasi area tumpukan karang dangkal (Shoal 6.4m). Lakukan pemeriksaan rute sebelum berlayar.",
        options: [
          {
            text: "A. Run Route Safety Check &rarr; Reposisi WP02 ke Deep Fairway (&gt;15m)",
            correct: true,
            explain: "Sangat baik! Route check mendeteksi bahaya kandas, lalu rute dialihkan ke koridor air dalam (TSS Fairway)."
          },
          {
            text: "B. Tetap menggunakan rute awal dan mempercepat laju kapal",
            correct: false,
            explain: "Kritis! Menembus kontur kedalaman di bawah draft akan menyebabkan kapal kandas (grounding)."
          },
          {
            text: "C. Memperlebar Cross Track Distance (XTD) tanpa merubah posisi waypoint",
            correct: false,
            explain: "Kurang tepat. Memperlebar XTD tidak menghilangkan bahaya jika garis tengah rute memotong area dangkal."
          }
        ]
      },
      {
        title: "3. Target AIS / ARPA &amp; Pencegahan Tubrukan",
        desc: "Terdeteksi Target AIS (MT Nusantara Voyager) datang dari lambung kanan (Starboard) memotong haluan. CPA 0.4 NM &amp; TCPA 6.5 Min (Di bawah batas aman CPA 1.5 NM). Sesuai Aturan 15 COLREGs, tentukan manuver:",
        options: [
          {
            text: "A. Trial Maneuver: Ubah Haluan ke Kanan +22&deg; (Starboard) &rarr; CPA jadi 1.8 NM",
            correct: true,
            explain: "Tepat sekali! Sesuai COLREGs Aturan 15 & 16, kapal di sisi kiri adalah Give-Way Vessel dan wajib merubah haluan ke kanan dengan tegas."
          },
          {
            text: "B. Merubah haluan ke kiri (Port) memotong haluan depan target",
            correct: false,
            explain: "Dilarang oleh Aturan 14/15/17 COLREGs! Berbelok ke kiri pada situasi silang sangat membahayakan."
          },
          {
            text: "C. Mempertahankan haluan dan hanya membunyikan klakson",
            correct: false,
            explain: "Salah. Sebagai Give-Way Vessel, Anda wajib mengambil tindakan dini yang nyata untuk memperbesar CPA."
          }
        ]
      },
      {
        title: "4. Emergency Sensor Lost: DGPS Failure Protocol",
        desc: "Alarm berbunyi: <strong>'PRIMARY POSITION SOURCE LOST (DGPS FAILURE)'</strong>. Prosedur standar IMO apa yang wajib segera diaktifkan pada konsol ECDIS?",
        options: [
          {
            text: "A. Acknowledge Alarm &rarr; Switch to Dead Reckoning (DR) / Gyro+Log &rarr; LOP Radar",
            correct: true,
            explain: "Sempurna! Beralih ke mode Dead Reckoning (DR) terintegrasi Gyro Compass dan Speed Log, lalu verifikasi baringan radar ke mercusuar."
          },
          {
            text: "B. Mematikan layar konsol ECDIS dan menyalakan ulang komputer utama",
            correct: false,
            explain: "Berbahaya! Mematikan ECDIS di tengah pelayaran alur sempit menghilangkan seluruh pemantauan navigasi."
          },
          {
            text: "C. Menunggu sinyal satelit GPS pulih dengan sendirinya tanpa tindakan cadangan",
            correct: false,
            explain: "Tidak diperbolehkan. Perwira navigasi wajib segera beralih ke secondary positioning source."
          }
        ]
      }
    ];

    function renderTask() {
      const task = ecdisTasks[currentStep];
      document.getElementById("stepLabel").innerText = "Misi " + (currentStep + 1) + " dari " + ecdisTasks.length;
      document.getElementById("scoreLabel").innerText = "Skor: " + earnedScore + " / 100";
      document.getElementById("progFill").style.width = ((currentStep / ecdisTasks.length) * 100) + "%";

      const container = document.getElementById("taskContainer");
      container.innerHTML = \`
        <div class="task-card">
          <div class="task-title">&#9888; \${task.title}</div>
          <div class="task-desc">\${task.desc}</div>
          <div id="btnList"></div>
        </div>
      \`;

      const btnList = document.getElementById("btnList");
      const feedbackBox = document.getElementById("feedbackBox");
      feedbackBox.style.display = "none";

      task.options.forEach((opt, idx) => {
        const btn = document.createElement("button");
        btn.className = "interactive-action-btn";
        btn.innerHTML = opt.text;
        btn.onclick = () => handleChoice(btn, opt, task);
        btnList.appendChild(btn);
      });
    }

    function handleChoice(btn, option, currentTask) {
      const allBtns = document.querySelectorAll(".interactive-action-btn");
      allBtns.forEach(b => b.disabled = true);

      const feedbackBox = document.getElementById("feedbackBox");
      feedbackBox.style.display = "block";

      if (option.correct) {
        btn.classList.add("success");
        earnedScore += 25;
        feedbackBox.className = "feedback-note feedback-success";
        feedbackBox.innerHTML = "&#10004; TEPAT: " + option.explain;

        // Visual triggers on chart
        if (currentStep === 0) {
          safetyContourActive = true;
          document.getElementById("activeContourLabel").innerText = "Safety Contour: 10.0m AKTIF (Danger Shaded)";
          document.getElementById("activeContourLabel").style.color = "#ef4444";
        } else if (currentStep === 1) {
          routeAdjusted = true;
        } else if (currentStep === 2) {
          collisionAvoided = true;
          ownHeading = 64; // Alter course to starboard
        } else if (currentStep === 3) {
          deadReckoningActive = true;
          document.getElementById("telemSensor").innerHTML = "SENSOR: <strong style='color:#f59e0b'>DEAD RECKONING (DR FIX)</strong>";
        }
      } else {
        btn.classList.add("danger");
        allBtns.forEach((b, i) => {
          if (currentTask.options[i].correct) b.classList.add("success");
        });
        feedbackBox.className = "feedback-note feedback-error";
        feedbackBox.innerHTML = "&#10008; KURANG TEPAT: " + option.explain;
      }

      document.getElementById("scoreLabel").innerText = "Skor: " + earnedScore + " / 100";

      setTimeout(() => {
        if (currentStep < ecdisTasks.length - 1) {
          currentStep++;
          renderTask();
        } else {
          showFinish();
        }
      }, 2000);
    }

    function showFinish() {
      document.getElementById("taskContainer").style.display = "none";
      document.getElementById("feedbackBox").style.display = "none";
      document.getElementById("finishBox").style.display = "block";
      document.getElementById("progFill").style.width = "100%";
      document.getElementById("stepLabel").innerText = "Praktek Selesai";
      document.getElementById("finalScoreDisplay").innerText = earnedScore + " / 100";

      // Auto submit score
      submitEcdisScore();
    }

    function submitEcdisScore() {
      const payload = {
        type: "SIMULATOR_SCORE",
        score: earnedScore,
        courseName: "${courseName}",
        participantName: "${participantName}",
        seafarerCode: "${seafarerCode}",
        details: "ECDIS IMO Model Course 1.27 Simulation Complete"
      };

      try {
        window.parent.postMessage(payload, "*");
      } catch (e) {
        console.warn("postMessage warning:", e);
      }
    }

    function restartEcdisSim() {
      currentStep = 0;
      earnedScore = 0;
      safetyContourActive = false;
      routeAdjusted = false;
      collisionAvoided = false;
      deadReckoningActive = false;
      ownHeading = 42;
      document.getElementById("taskContainer").style.display = "block";
      document.getElementById("finishBox").style.display = "none";
      document.getElementById("telemSensor").innerHTML = "SENSOR: <strong style='color:#38bdf8'>3D DGPS FIX (RAIM PASS)</strong>";
      renderTask();
    }

    // Chart Interactive Tools
    function toggleSafetyContourVisual() {
      safetyContourActive = !safetyContourActive;
    }
    function toggleAisVectors() {
      // toggle vector length
    }
    function centerShip() {
      ownShipX = 220;
      ownShipY = 380;
    }

    // Canvas Animation Loop: Electronic Navigational Chart (ENC)
    let animationTick = 0;
    function drawENC() {
      animationTick++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Deep Water Background
      ctx.fillStyle = "#091729";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Medium Water Layer (10m - 20m)
      ctx.fillStyle = "#0f2747";
      ctx.beginPath();
      ctx.moveTo(350, 0);
      ctx.bezierCurveTo(380, 180, 280, 320, 150, 520);
      ctx.lineTo(0, 520);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();

      // 3. Shallow Water Layer (< 10m) - Shoal Area
      ctx.fillStyle = safetyContourActive ? "rgba(185, 28, 28, 0.28)" : "#183e6c";
      ctx.beginPath();
      ctx.moveTo(260, 0);
      ctx.bezierCurveTo(280, 150, 200, 260, 80, 520);
      ctx.lineTo(0, 520);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();

      // Safety Contour Line (IHO S-52)
      ctx.strokeStyle = safetyContourActive ? "#ef4444" : "#38bdf8";
      ctx.lineWidth = safetyContourActive ? 3.5 : 1.5;
      if (safetyContourActive) {
        ctx.setLineDash([8, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(260, 0);
      ctx.bezierCurveTo(280, 150, 200, 260, 80, 520);
      ctx.stroke();
      ctx.setLineDash([]);

      // 4. Landmass / Shoreline (Tanjung Merak Coast)
      ctx.fillStyle = "#4a3c22";
      ctx.strokeStyle = "#854d0e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(120, 0);
      ctx.bezierCurveTo(140, 120, 90, 220, 0, 350);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Soundings (Depth values in metres)
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.fillText("4.8", 140, 90);
      ctx.fillText("6.4", 190, 170); // The dangerous shoal
      ctx.fillText("8.2", 150, 280);
      ctx.fillText("12.5", 280, 130);
      ctx.fillText("16.8", 340, 260);
      ctx.fillText("24.0", 480, 220);
      ctx.fillText("32.5", 580, 380);

      // Shoal Danger Warning Marker on chart
      if (!routeAdjusted) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(190, 170, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillText("&#9888; SHOAL 6.4m", 205, 175);
      }

      // 5. TSS Navigation Fairway (Traffic Separation Scheme)
      ctx.strokeStyle = "rgba(217, 70, 239, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(380, 0);
      ctx.lineTo(260, 520);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(520, 0);
      ctx.lineTo(400, 520);
      ctx.stroke();
      ctx.setLineDash([]);

      // TSS Traffic arrow
      ctx.fillStyle = "rgba(217, 70, 239, 0.6)";
      ctx.fillText("&uarr; TSS INBOUND LANE (042&deg;)", 410, 420);

      // 6. Navigation Light Buoys
      // Starboard Buoy (Green Fl.G.3s)
      const pulseGreen = Math.sin(animationTick * 0.1) > 0 ? 1 : 0.3;
      ctx.fillStyle = \`rgba(16, 185, 129, \${pulseGreen})\`;
      ctx.beginPath();
      ctx.arc(380, 280, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#10b981";
      ctx.font = "9px sans-serif";
      ctx.fillText("Q.G. No.1", 390, 284);

      // Port Buoy (Red Fl.R.3s)
      const pulseRed = Math.sin(animationTick * 0.1 + 1) > 0 ? 1 : 0.3;
      ctx.fillStyle = \`rgba(239, 68, 68, \${pulseRed})\`;
      ctx.beginPath();
      ctx.arc(280, 320, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.fillText("Q.R. No.2", 240, 324);

      // 7. Planned Route Legs & Waypoints
      ctx.lineWidth = 2;
      ctx.strokeStyle = routeAdjusted ? "#10b981" : "#f59e0b";
      ctx.beginPath();
      ctx.moveTo(220, 450); // WP01
      
      const wp2X = routeAdjusted ? 360 : 190;
      const wp2Y = routeAdjusted ? 240 : 170;

      ctx.lineTo(wp2X, wp2Y); // WP02
      ctx.lineTo(460, 80);   // WP03
      ctx.stroke();

      // Waypoint Circles
      drawWP(220, 450, "WP01");
      drawWP(wp2X, wp2Y, routeAdjusted ? "WP02 (Safe)" : "WP02 (Shoal!)");
      drawWP(460, 80, "WP03");

      // 8. Target AIS 01 (MT Nusantara Voyager)
      const targetX = 420;
      const targetY = 220;
      ctx.strokeStyle = collisionAvoided ? "#10b981" : "#f59e0b";
      ctx.fillStyle = collisionAvoided ? "#10b981" : "#f59e0b";
      ctx.lineWidth = 2;

      // AIS triangle symbol
      ctx.beginPath();
      ctx.moveTo(targetX, targetY - 10);
      ctx.lineTo(targetX + 8, targetY + 8);
      ctx.lineTo(targetX - 8, targetY + 8);
      ctx.closePath();
      ctx.stroke();

      // Target vector
      ctx.beginPath();
      ctx.moveTo(targetX, targetY);
      ctx.lineTo(targetX - 60, targetY + 50);
      ctx.stroke();

      ctx.font = "10px sans-serif";
      ctx.fillText("AIS: MT NUSANTARA (12kt)", targetX + 12, targetY - 2);
      ctx.fillText(collisionAvoided ? "CPA: 1.8 NM (SAFE)" : "CPA: 0.4 NM (RISK!)", targetX + 12, targetY + 12);

      // 9. Own Ship (IMO ECDIS Symbol)
      ctx.save();
      ctx.translate(ownShipX, ownShipY);
      ctx.rotate((ownHeading * Math.PI) / 180);

      // Double-circle own ship contour
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.stroke();

      // Heading line
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(0, -50);
      ctx.stroke();

      // Speed vector ticks (6-minute projected vector)
      ctx.strokeStyle = "#0284c7";
      ctx.beginPath();
      ctx.moveTo(0, -50);
      ctx.lineTo(0, -110);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-4, -80);
      ctx.lineTo(4, -80);
      ctx.stroke();

      // Look-Ahead Anti-Grounding Sector
      ctx.fillStyle = "rgba(56, 189, 248, 0.12)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 110, -Math.PI / 2 - 0.15, -Math.PI / 2 + 0.15);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      requestAnimationFrame(drawENC);
    }

    function drawWP(x, y, label) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "10px monospace";
      ctx.fillText(label, x + 6, y - 4);
    }

    // Initialize on load
    renderTask();
    drawENC();
  </script>
</body>
</html>`;
}

// ==========================================
// 2. MARINE RADAR / ARPA SIMULATOR
// ==========================================
function generateRadarSimulatorHtml(
  courseName: string,
  participantName: string,
  seafarerCode: string
): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Marine RADAR / ARPA Simulator - IMO STCW</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: monospace; }
    body { background: #020617; color: #10b981; padding: 10px; display: flex; justify-content: center; }
    .radar-box { width: 100%; max-width: 900px; background: #090e1a; border: 2px solid #064e3b; border-radius: 12px; padding: 16px; }
    .header { display: flex; justify-content: space-between; border-bottom: 1px solid #064e3b; padding-bottom: 8px; margin-bottom: 12px; }
    .radar-grid { display: grid; grid-template-columns: 1fr 300px; gap: 14px; }
    @media (max-width: 760px) { .radar-grid { grid-template-columns: 1fr; } }
    canvas { background: #011209; border: 2px solid #059669; border-radius: 50%; width: 100%; max-width: 440px; aspect-ratio: 1; margin: 0 auto; display: block; }
    .task-card { background: #052e16; border: 1px solid #10b981; border-radius: 8px; padding: 12px; }
    .btn { background: #047857; color: #fff; border: 1px solid #34d399; padding: 8px; border-radius: 6px; width: 100%; margin: 6px 0; cursor: pointer; font-weight: bold; text-align: left; }
    .btn:hover { background: #059669; }
  </style>
</head>
<body>
  <div class="radar-box">
    <div class="header">
      <div><strong>MARINE RADAR / ARPA DISPLAY (X-BAND 3cm)</strong></div>
      <div>RANGE: <strong>6 NM</strong> | HEAD-UP | RM</div>
    </div>
    <div class="radar-grid">
      <div>
        <canvas id="radarCanvas" width="440" height="440"></canvas>
      </div>
      <div>
        <div class="task-card">
          <div style="color: #34d399; font-weight: bold; margin-bottom: 6px;">Latihan ARPA Plotting</div>
          <div style="font-size: 11px; color: #a7f3d0; margin-bottom: 10px;">
            Target echo terdeteksi di baringan 040&deg;, jarak 3.2 NM. Nilai CPA saat ini adalah 0.3 NM. Tindakan pencegahan tubrukan apa yang sesuai COLREGs Aturan 19?
          </div>
          <button class="btn" onclick="resolveRadar(true)">A. Alter course to Starboard +25&deg; (Safe CPA &gt; 1.5 NM)</button>
          <button class="btn" onclick="resolveRadar(false)">B. Kurangi kecepatan tanpa merubah haluan</button>
          <button class="btn" onclick="resolveRadar(false)">C. Belok ke kiri (Port)</button>
          <div id="radarFeedback" style="font-size: 11px; margin-top: 8px; font-weight: bold;"></div>
        </div>
      </div>
    </div>
  </div>
  <script>
    const cvs = document.getElementById("radarCanvas");
    const c = cvs.getContext("2d");
    let sweepAngle = 0;
    function drawRadar() {
      sweepAngle += 0.03;
      c.fillStyle = "rgba(1, 18, 9, 0.1)";
      c.fillRect(0, 0, cvs.width, cvs.height);
      const cx = cvs.width / 2;
      const cy = cvs.height / 2;
      // Range rings
      c.strokeStyle = "rgba(16, 185, 129, 0.3)";
      for (let r = 50; r <= 200; r += 50) {
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.stroke();
      }
      // Sweep Line
      c.strokeStyle = "#34d399";
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(sweepAngle) * 210, cy + Math.sin(sweepAngle) * 210);
      c.stroke();
      // Target echo
      c.fillStyle = "#34d399";
      c.beginPath();
      c.arc(cx + 80, cy - 90, 4, 0, Math.PI * 2);
      c.fill();
      requestAnimationFrame(drawRadar);
    }
    drawRadar();
    function resolveRadar(ok) {
      const fb = document.getElementById("radarFeedback");
      if (ok) {
        fb.innerHTML = "<span style='color:#34d399;'>&#10004; TEPAT! CPA melebar aman &gt; 1.5 NM. Nilai 100 dicatat.</span>";
        window.parent.postMessage({ type: "SIMULATOR_SCORE", score: 100, courseName: "${courseName}", participantName: "${participantName}", seafarerCode: "${seafarerCode}" }, "*");
      } else {
        fb.innerHTML = "<span style='color:#f87171;'>&#10008; Berisiko! Tindakan tidak memadai.</span>";
      }
    }
  </script>
</body>
</html>`;
}

// ==========================================
// 3. SCRB SEKOCI PENOLONG SIMULATOR
// ==========================================
function generateSCRBSimulatorHtml(
  courseName: string,
  participantName: string,
  seafarerCode: string
): string {
  return generateGenericMaritimeSimulatorHtml(courseName, participantName, seafarerCode, "scrb");
}

// ==========================================
// 4. SDSD / SAT SHIP SECURITY SIMULATOR
// ==========================================
function generateSDSDSimulatorHtml(
  courseName: string,
  participantName: string,
  seafarerCode: string
): string {
  return generateGenericMaritimeSimulatorHtml(courseName, participantName, seafarerCode, "sdsd");
}

// ==========================================
// 5. BST (BASIC SAFETY TRAINING) SIMULATOR
// ==========================================
function generateBSTSimulatorHtml(
  courseName: string,
  participantName: string,
  seafarerCode: string
): string {
  return generateGenericMaritimeSimulatorHtml(courseName, participantName, seafarerCode, "bst");
}

// ==========================================
// 6. GENERIC / EXPANDED MARITIME SIMULATORS
// ==========================================
function generateGenericMaritimeSimulatorHtml(
  courseName: string,
  participantName: string,
  seafarerCode: string,
  moduleType: MaritimeSimulatorModule
): string {
  let title = "Simulator Praktek Mandiri Pelaut (Standard IMO STCW)";
  let badge = "STCW Compliant";
  let questions: any[] = [];

  if (moduleType === "scrb") {
    title = "Simulator Praktek SCRB (Prosedur Peluncuran & Pengendalian Sekoci Penolong)";
    badge = "SCRB • SOLAS III";
    questions = [
      {
        title: "Pemeriksaan Kesiapan Sekoci (Pre-Launch Inspection)",
        desc: "Alarm 'Abandon Ship' berbunyi. Di stasiun sekoci, tindakan prioritas pertama sebelum melepas gripes penahan sekoci adalah:",
        options: [
          { text: "A. Memastikan baut sumbat lambung (drain plug) terpasang rapat dan painter line terikat kencang ke depan kapal", correct: true },
          { text: "B. Langsung menyalakan mesin sekoci saat masih menggantung di dewi-dewi", correct: false },
          { text: "C. Melepaskan seluruh tali pengaman dan membiarkan sekoci jatuh bebas", correct: false }
        ],
        explain: "Tepat! Drain plug harus rapat agar tidak tenggelam, dan painter line menahan sekoci sejajar kapal induk."
      },
      {
        title: "Pelepasan Pengait Sekoci (Release Gear Operation)",
        desc: "Sekoci diturunkan hingga menyentuh air laut. Kapan pengait sekoci (on-load / off-load release) harus dilepaskan?",
        options: [
          { text: "A. Saat sekoci telah mengapung penuh di permukaan air (waterborne release)", correct: true },
          { text: "B. Saat sekoci masih menggantung 5 meter di atas ombak", correct: false },
          { text: "C. Segera saat tuas rem dewi-dewi ditarik dari dek utama", correct: false }
        ],
        explain: "Benar! Pelepasan saat waterborne mencegah sekoci terhempas ke ombak."
      },
      {
        title: "Pengoperasian Alat Keselamatan (EPIRB & SART)",
        desc: "Sekoci telah menjauh aman dari kapal induk. Langkah radio darurat apa yang harus dilakukan?",
        options: [
          { text: "A. Menyalakan SART di tiang tertinggi sekoci dan mengaktifkan EPIRB agar terdeteksi satelit SAR", correct: true },
          { text: "B. Membuang EPIRB ke dasar laut", correct: false },
          { text: "C. Mematikan seluruh perangkat radio untuk menghemat baterai", correct: false }
        ],
        explain: "Sempurna! SART di tiang tertinggi memantulkan echo ke radar kapal penolong, EPIRB memberi koordinat GPS ke satelit COSPAS-SARSAT."
      }
    ];
  } else if (moduleType === "sdsd") {
    title = "Simulator Praktek SDSD / SAT (Ship Security & Designated Duties)";
    badge = "ISPS Code Sec. 13";
    questions = [
      {
        title: "Pemeriksaan Keamanan Gangway (ISPS Security Level 1)",
        desc: "Kapal bersandar pada Security Level 1. Tanggung jawab petugas jaga di tangga pandu (gangway) adalah:",
        options: [
          { text: "A. Memeriksa identitas semua orang yang naik kapal, memeriksa barang bawaan, dan mengawasi area terbatas", correct: true },
          { text: "B. Mengunci semua pintu darurat kebakaran kapal", correct: false },
          { text: "C. Membiarkan pengunjung masuk tanpa pemeriksaan identitas", correct: false }
        ],
        explain: "Tepat! Verifikasi identitas dan kontrol akses adalah fondasi ISPS Code Level 1."
      },
      {
        title: "Penanganan Benda Mencurigakan (Suspected Explosive/Contraband)",
        desc: "Saat patroli di lorong kapal, ditemukan tas mencurigakan tanpa pemilik dengan kabel terkelupas. Tindakan wajib:",
        options: [
          { text: "A. JANGAN SENTUH, sterilkan area minimal 20 meter, dan laporkan segera ke SSO / Nahkoda", correct: true },
          { text: "B. Membuka tas tersebut dengan pisau saku untuk memastikan isinya", correct: false },
          { text: "C. Melempar tas tersebut langsung ke cerobong kapal", correct: false }
        ],
        explain: "Benar! Protokol IED maritim melarang menyentuh benda mencurigakan. Segera evakuasi dan lapor SSO."
      }
    ];
  } else if (moduleType === "gmdss") {
    title = "Simulator Praktek Komunikasi Darurat GMDSS";
    badge = "GMDSS • ITU-R";
    questions = [
      {
        title: "Pancaran Marabahaya VHF DSC Channel 70 (Distress Alert)",
        desc: "Dalam situasi darurat maritim jiwa terancam, frekuensi / channel apa yang digunakan untuk mengirim Digital Selective Calling (DSC)?",
        options: [
          { text: "A. VHF Channel 70 (Dedicated Digital Distress Alerting)", correct: true },
          { text: "B. VHF Channel 16 langsung via DSC", correct: false },
          { text: "C. VHF Channel 06", correct: false }
        ],
        explain: "Benar! DSC distress otomatis dipancarkan pada Channel 70, lalu komunikasi suara dilanjutkan di Channel 16."
      }
    ];
  } else {
    // Default: BST (Basic Safety Training)
    title = "Simulator Praktek Mandiri BST (Basic Safety Training)";
    badge = "STCW VI/1";
    questions = [
      {
        title: "Deteksi Kebakaran Kamar Mesin (Fire Emergency Class B)",
        desc: "Ditemukan tumpahan minyak pelumas terbakar di dekat separator kamar mesin. Alat pemadam apa yang paling tepat digunakan?",
        options: [
          { text: "A. APAR Busa (Foam) atau Dry Chemical Powder (DCP) dengan teknik sweeping", correct: true },
          { text: "B. Semprotan air langsung bertekanan tinggi (Jet Stream)", correct: false },
          { text: "C. Melemparkan selimut basah tipis", correct: false }
        ],
        explain: "Tepat! Minyak adalah api Kelas B. Air langsung dilarang karena menyebarkan minyak. Gunakan Foam atau DCP."
      },
      {
        title: "Teknik Melompat Meninggalkan Kapal (Abandon Ship Jump)",
        desc: "Saat mengenakan lifejacket dan harus melompat ke laut dari ketinggian, posisi tubuh yang benar adalah:",
        options: [
          { text: "A. Berdiri tegak, satu tangan menutup hidung & mulut, tangan lain mengunci lifejacket di dada, kaki rapat menyilang", correct: true },
          { text: "B. Kepala lebih dulu meluncur ke air dengan tangan terbuka", correct: false },
          { text: "C. Melompat sambil berjungkir balik", correct: false }
        ],
        explain: "Sempurna! Tangan melindungi hidung dan menahan lifejacket agar tidak menghantam dagu, kaki menyilang melindungi selangkangan."
      }
    ];
  }

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; min-height: 100vh; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .sim-card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; width: 100%; max-width: 820px; padding: 24px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.4); }
    .badge { display: inline-block; background: #0284c7; color: white; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; }
    .header h1 { font-size: 20px; font-weight: 800; color: #38bdf8; margin-bottom: 6px; }
    .header p { font-size: 13px; color: #94a3b8; }
    .user-pill { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 8px 12px; margin: 16px 0; font-size: 12px; display: flex; justify-content: space-between; align-items: center; }
    .scenario-box { background: #0f172a; border: 1px solid #475569; border-radius: 12px; padding: 18px; margin: 16px 0; }
    .scenario-title { font-weight: 700; font-size: 14px; color: #f59e0b; margin-bottom: 8px; }
    .scenario-desc { font-size: 13px; line-height: 1.6; color: #cbd5e1; }
    .action-btn { background: #334155; border: 1px solid #475569; color: #f8fafc; padding: 14px 16px; border-radius: 10px; text-align: left; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: block; width: 100%; margin-bottom: 10px; }
    .action-btn:hover:not(:disabled) { background: #0284c7; border-color: #38bdf8; }
    .action-btn.correct { background: #059669 !important; border-color: #10b981 !important; color: white !important; }
    .action-btn.wrong { background: #dc2626 !important; border-color: #ef4444 !important; opacity: 0.8; }
    .feedback-text { margin-top: 10px; font-size: 12px; font-weight: 700; padding: 8px 12px; border-radius: 6px; display: none; }
    .feedback-success { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #059669; }
    .feedback-error { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #dc2626; }
    .score-banner { display: none; background: #064e3b; border: 2px solid #10b981; border-radius: 12px; padding: 24px; text-align: center; margin: 16px 0; }
    .btn-submit-score { background: #10b981; color: #042f2e; font-weight: 800; font-size: 14px; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="sim-card">
    <span class="badge">${badge}</span>
    <div class="header">
      <h1>${title}</h1>
      <p>Simulasi praktek mandiri terverifikasi standard IMO STCW.</p>
    </div>
    <div class="user-pill">
      <span>Peserta: <strong>${participantName || "Peserta LMS"}</strong></span>
      <span>Kode: <strong>${seafarerCode || "-"}</strong></span>
    </div>

    <div id="gameContainer">
      <div class="scenario-box">
        <div id="scenarioTitle" class="scenario-title"></div>
        <div id="scenarioDesc" class="scenario-desc"></div>
      </div>
      <div id="actionsGrid"></div>
      <div id="feedbackBox" class="feedback-text"></div>
    </div>

    <div id="scoreBanner" class="score-banner">
      <h2 style="color: #34d399; font-size: 24px; margin-bottom: 6px;">SIMULASI SELESAI</h2>
      <p id="finalScoreText" style="font-size: 20px; font-weight: bold; margin-bottom: 14px;">Skor: 100 / 100</p>
      <button class="btn-submit-score" onclick="broadcastFinalScore()">Kirim &amp; Catat Nilai ke LMS</button>
    </div>
  </div>

  <script>
    const questions = ${JSON.stringify(questions)};
    let currentIndex = 0;
    let earnedPoints = 0;
    const pointsPerQuestion = Math.round(100 / questions.length);

    function renderCurrentStep() {
      const q = questions[currentIndex];
      document.getElementById('scenarioTitle').innerHTML = "&#9888; Skenario #" + (currentIndex + 1) + ": " + q.title;
      document.getElementById('scenarioDesc').innerText = q.desc;
      const actionsGrid = document.getElementById('actionsGrid');
      actionsGrid.innerHTML = '';
      document.getElementById('feedbackBox').style.display = 'none';

      q.options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.innerHTML = opt.text;
        btn.onclick = () => {
          document.querySelectorAll('.action-btn').forEach(b => b.disabled = true);
          const fb = document.getElementById('feedbackBox');
          fb.style.display = 'block';
          if (opt.correct) {
            btn.classList.add('correct');
            earnedPoints = Math.min(100, earnedPoints + pointsPerQuestion);
            fb.className = 'feedback-text feedback-success';
            fb.innerHTML = '&#10004; TEPAT! ' + q.explain;
          } else {
            btn.classList.add('wrong');
            fb.className = 'feedback-text feedback-error';
            fb.innerHTML = '&#10008; KURANG TEPAT. ' + q.explain;
          }
          setTimeout(() => {
            if (currentIndex < questions.length - 1) {
              currentIndex++;
              renderCurrentStep();
            } else {
              document.getElementById('gameContainer').style.display = 'none';
              document.getElementById('scoreBanner').style.display = 'block';
              document.getElementById('finalScoreText').innerText = 'Skor: ' + earnedPoints + ' / 100';
              broadcastFinalScore(earnedPoints);
            }
          }, 1800);
        };
        actionsGrid.appendChild(btn);
      });
    }

    function broadcastFinalScore(forced) {
      const score = typeof forced === 'number' ? forced : earnedPoints;
      window.parent.postMessage({
        type: 'SIMULATOR_SCORE',
        score: score,
        courseName: '${courseName}',
        participantName: '${participantName}',
        seafarerCode: '${seafarerCode}'
      }, '*');
    }

    renderCurrentStep();
  </script>
</body>
</html>`;
}

