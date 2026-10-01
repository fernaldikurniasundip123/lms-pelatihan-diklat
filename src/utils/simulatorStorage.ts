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

    // Also try updating course record in Supabase if custom column exists
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

    return true;
  } catch (err) {
    console.error("Failed to save simulator config", err);
    return false;
  }
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

// Built-in interactive HTML5 Maritime Simulator generator
export const generateBuiltInSimulatorHtml = (
  courseName: string,
  participantName: string,
  seafarerCode: string
): string => {
  const upper = (courseName || "").toUpperCase();
  let moduleTitle = "Latihan Praktek Prosedur Darurat Pelaut (Standard IMO STCW)";
  let isBST = upper.includes("BST") || upper.includes("BASIC SAFETY");
  let isSCRB = upper.includes("SCRB") || upper.includes("SURVIVAL CRAFT");
  let isSDSD = upper.includes("SDSD") || upper.includes("SECURITY");

  if (isBST) {
    moduleTitle = "Simulator Praktek Mandiri BST (Basic Fire Fighting & Sea Survival)";
  } else if (isSCRB) {
    moduleTitle = "Simulator Praktek Mandiri SCRB (Prosedur Peluncuran & Pengendalian Sekoci Penolong)";
  } else if (isSDSD) {
    moduleTitle = "Simulator Praktek Mandiri SDSD (Ship Security & Designated Duties)";
  }

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${moduleTitle}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; min-height: 100vh; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .sim-card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; width: 100%; max-width: 820px; padding: 24px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.4); }
    .badge { display: inline-block; background: #0284c7; color: white; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; }
    .header h1 { font-size: 20px; font-weight: 800; color: #38bdf8; margin-bottom: 6px; }
    .header p { font-size: 13px; color: #94a3b8; }
    .user-pill { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 8px 12px; margin: 16px 0; font-size: 12px; display: flex; justify-content: space-between; align-items: center; }
    .user-pill span strong { color: #f1f5f9; }
    .scenario-box { background: #0f172a; border: 1px solid #475569; border-radius: 12px; padding: 18px; margin: 16px 0; }
    .scenario-title { font-weight: 700; font-size: 14px; color: #f59e0b; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .scenario-desc { font-size: 13px; line-height: 1.6; color: #cbd5e1; }
    .actions-grid { display: grid; grid-template-columns: 1fr; gap: 10px; margin: 16px 0; }
    .action-btn { background: #334155; border: 1px solid #475569; color: #f8fafc; padding: 14px 16px; border-radius: 10px; text-align: left; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 10px; }
    .action-btn:hover:not(:disabled) { background: #0284c7; border-color: #38bdf8; transform: translateY(-1px); }
    .action-btn.correct { background: #059669 !important; border-color: #10b981 !important; color: white !important; }
    .action-btn.wrong { background: #dc2626 !important; border-color: #ef4444 !important; color: white !important; opacity: 0.8; }
    .progress-bar-container { background: #334155; height: 8px; border-radius: 999px; overflow: hidden; margin: 16px 0 8px 0; }
    .progress-bar { background: #10b981; height: 100%; width: 0%; transition: width 0.3s ease; }
    .score-banner { display: none; background: #064e3b; border: 2px solid #10b981; border-radius: 12px; padding: 24px; text-align: center; margin: 16px 0; animation: fadeIn 0.4s; }
    .score-banner h2 { font-size: 26px; font-weight: 900; color: #34d399; margin-bottom: 4px; }
    .score-banner p { font-size: 14px; color: #a7f3d0; margin-bottom: 16px; }
    .btn-submit-score { background: #10b981; color: #042f2e; font-weight: 800; font-size: 14px; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; transition: background 0.2s; }
    .btn-submit-score:hover { background: #34d399; }
    .btn-retry { background: #475569; color: white; font-weight: 700; font-size: 13px; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; margin-left: 8px; }
    .feedback-text { margin-top: 10px; font-size: 12px; font-weight: 700; padding: 8px 12px; border-radius: 6px; display: none; }
    .feedback-success { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #059669; }
    .feedback-error { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #dc2626; }
    @keyframes fadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
  </style>
</head>
<body>
  <div class="sim-card">
    <span class="badge">Simulasi Interaktif Mandiri</span>
    <div class="header">
      <h1>${moduleTitle}</h1>
      <p>Praktek pemecahan skenario darurat maritim &amp; verifikasi keselamatan pelaut mandiri.</p>
    </div>

    <div class="user-pill">
      <span>Peserta: <strong>${participantName || "Peserta LMS"}</strong></span>
      <span>Kode Pelaut: <strong>${seafarerCode || "-"}</strong></span>
      <span>Status: <strong style="color: #38bdf8;">Aktif (Live Sandbox)</strong></span>
    </div>

    <div class="progress-bar-container">
      <div id="progBar" class="progress-bar"></div>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8;">
      <span id="stepCounter">Langkah 1 dari 4</span>
      <span id="currentScoreLabel">Poin Sementara: 0</span>
    </div>

    <div id="gameContainer">
      <div class="scenario-box">
        <div id="scenarioTitle" class="scenario-title">&#9888; Skenario #1</div>
        <div id="scenarioDesc" class="scenario-desc">Memuat skenario...</div>
      </div>

      <div id="actionsGrid" class="actions-grid"></div>

      <div id="feedbackBox" class="feedback-text"></div>
    </div>

    <div id="scoreBanner" class="score-banner">
      <h2>SIMULASI SELESAI</h2>
      <p id="finalScoreText">Skor Anda: 0 / 100</p>
      <div style="font-size: 13px; color: #94a3b8; margin-bottom: 16px;">
        Data nilai ini otomatis diteruskan dan direkam ke akun LMS Anda.
      </div>
      <button class="btn-submit-score" onclick="broadcastFinalScore()">Kirim &amp; Catat Nilai ke LMS</button>
      <button class="btn-retry" onclick="restartSimulation()">Ulangi Simulasi</button>
    </div>
  </div>

  <script>
    const isBST = ${isBST};
    const isSCRB = ${isSCRB};
    const isSDSD = ${isSDSD};

    let questions = [];

    if (isSCRB) {
      questions = [
        {
          title: "Skenario 1: Pemeriksaan Kesiapan Sekoci (Pre-Launch Inspection)",
          desc: "Alarm 'Abandon Ship' berbunyi. Anda tiba di stasiun sekoci penolong. Tindakan prioritas utama apa yang harus dilakukan sebelum membuka gripes sekoci?",
          options: [
            { text: "A. Langsung menyalakan mesin sekoci saat masih menggantung di dewi-dewi", correct: false },
            { text: "B. Memeriksa baut sumbat lambung (drain plug) terpasang rapat dan tali penahan (painter line) terikat kencang ke depan kapal", correct: true },
            { text: "C. Melepaskan seluruh tali pengaman dan membiarkan sekoci terjun bebas", correct: false }
          ],
          explanation: "Tepat! Sumbat drain plug harus dipastikan terpasang agar sekoci tidak kemasukan air laut, dan painter line harus terpasang di haluan."
        },
        {
          title: "Skenario 2: Penurunan Sekoci (Lowering to Water Level)",
          desc: "Semua kru telah masuk ke dalam sekoci dan mengenakan sabuk pengaman. Kapan pengait sekoci (release gear) dioperasikan?",
          options: [
            { text: "A. Saat sekoci telah mengapung penuh di atas permukaan air laut (waterborne release)", correct: true },
            { text: "B. Saat sekoci masih menggantung 5 meter di atas ombak", correct: false },
            { text: "C. Segera setelah rem dewi-dewi dilepas dari dek utama", correct: false }
          ],
          explanation: "Benar! Pelepasan normal harus dilakukan saat sekoci sudah mengapung di air untuk mencegah bantingan fatal."
        },
        {
          title: "Skenario 3: Menjauhi Sisi Lambung Kapal Induk",
          desc: "Sekoci sudah mengapung dan pengait telah lepas. Mesin telah dinyalakan. Bagaimana tindakan kemudi untuk menjauhi bahaya kapal induk?",
          options: [
            { text: "A. Melepas tali penahan (painter line), arahkan haluan sekoci menjauhi sisi angin (leeward) dengan kecepatan aman", correct: true },
            { text: "B. Mematikan mesin dan menunggu kapal induk tenggelam terlebih dahulu", correct: false },
            { text: "C. Mengikatkan sekoci ke propeler kapal induk", correct: false }
          ],
          explanation: "Sangat baik! Lepas painter line lalu kemudikan sekoci menjauhi kapal induk menuju jarak aman."
        },
        {
          title: "Skenario 4: Pengoperasian Alat Komunikasi Darurat (EPIRB & SART)",
          desc: "Sekoci telah berada di jarak aman dari kapal induk. Tindakan komunikasi darurat apa yang harus diaktifkan?",
          options: [
            { text: "A. Menyimpan SART di dasar lambung sekoci dan tidak menyalakannya", correct: false },
            { text: "B. Mengaktifkan SART di tiang tertinggi dan mengaktifkan EPIRB agar terdeteksi satelit SAR COSPAS-SARSAT", correct: true },
            { text: "C. Membuang baterai radio darurat VHF ke laut", correct: false }
          ],
          explanation: "Sempurna! SART harus dipasang di posisi tertinggi agar tertangkap radar kapal penyelamat, dan EPIRB dinyalakan."
        }
      ];
    } else if (isSDSD) {
      questions = [
        {
          title: "Skenario 1: Pemeriksaan Tingkat Keamanan (Security Level 1)",
          desc: "Kapal beroperasi pada ISPS Security Level 1 (Normal). Tanggung jawab dasar petugas jaga yang ditugaskan khusus keamanan adalah:",
          options: [
            { text: "A. Mengunci semua pintu darurat kebakaran kapal", correct: false },
            { text: "B. Memeriksa identitas semua orang yang naik kapal, memeriksa barang bawaan, dan mengawasi area terbatas (restricted areas)", correct: true },
            { text: "C. Membiarkan pengunjung masuk tanpa pemeriksaan identitas", correct: false }
          ],
          explanation: "Benar! Pada Security Level 1, verifikasi identitas di tangga pandu (gangway) dan pengawasan area terbatas wajib dilakukan."
        },
        {
          title: "Skenario 2: Peningkatan Status ke Security Level 2",
          desc: "Perwira Keamanan Kapal (SSO) mengumumkan peningkatan ke Security Level 2 akibat adanya ancaman di pelabuhan singgah. Tindakan pencegahan apa yang diterapkan?",
          options: [
            { text: "A. Menambah frekuensi patroli keamanan dan membatasi titik akses masuk kapal hanya pada satu pintu terjaga", correct: true },
            { text: "B. Meninggalkan kapal tanpa awak", correct: false },
            { text: "C. Menghentikan seluruh genset kapal", correct: false }
          ],
          explanation: "Tepat! Pada Level 2, akses kapal diperketat, penjagaan gangway ditingkatkan, dan patroli diperbanyak."
        },
        {
          title: "Skenario 3: Deteksi Benda Mencurigakan (Suspected Package)",
          desc: "Saat berpatroli di lorong akomodasi, Anda menemukan kardus tanpa label dengan kabel kecil menjulur. Tindakan darurat apa yang WAJIB diambil?",
          options: [
            { text: "A. Membuka kardus tersebut dengan pisau saku untuk memastikan isinya", correct: false },
            { text: "B. JANGAN SENTUH, sterilkan area sekitar minimal 15 meter, dan segera laporkan kepada SSO / Nahkoda via radio VHF/interkom", correct: true },
            { text: "C. Melempar kardus tersebut langsung ke cerobong kapal", correct: false }
          ],
          explanation: "Tepat sekali! Protokol keamanan melarang menyentuh benda mencurigakan. Segera amankan area dan lapor SSO."
        },
        {
          title: "Skenario 4: Ancaman Pembajakan di Laut Lepas (Piracy Threat)",
          desc: "Terlihat perahu kecil (skiff) berkecepatan tinggi tanpa lampu mendekat secara agresif di area rawan perompakan. Perintah 'Citadel Procedure' dibunyikan. Apa artinya?",
          options: [
            { text: "A. Seluruh kru berkumpul dan mengunci diri di ruang perlindungan aman (Citadel) dengan kendali darurat dan komunikasi SAR", correct: true },
            { text: "B. Kru melompat ke laut satu per satu", correct: false },
            { text: "C. Menyerahkan seluruh muatan kapal secara sukarela", correct: false }
          ],
          explanation: "Benar! Prosedur Citadel menginstruksikan seluruh awak mengamankan diri di ruang bunker aman kapal."
        }
      ];
    } else {
      // Default: BST (Fire Fighting & Sea Survival)
      questions = [
        {
          title: "Skenario 1: Deteksi Kebakaran di Kamar Mesin (Fire Emergency)",
          desc: "Alarm kebakaran kamar mesin berbunyi. Ditemukan tumpahan minyak pelumas terbakar di dekat separator (Kebakaran Kelas B). Alat pemadam apa yang paling tepat digunakan?",
          options: [
            { text: "A. Semprotan air langsung bertekanan tinggi (Jet Stream)", correct: false },
            { text: "B. APAR Busa (Foam) atau Dry Chemical Powder (DCP) dengan teknik sweeping", correct: true },
            { text: "C. Melemparkan selimut basah tipis", correct: false }
          ],
          explanation: "Tepat! Minyak adalah api Kelas B. Air langsung dilarang karena dapat menyebarkan minyak yang terbakar. Gunakan Foam atau DCP."
        },
        {
          title: "Skenario 2: Penggunaan APAR (PASS Protocol)",
          desc: "Sebelum mengarahkan nosel pemadam ke pangkal api, urutan pengoperasian APAR yang benar menurut standar adalah:",
          options: [
            { text: "A. PULL pin, AIM ke dasar api, SQUEEZE tuas, SWEEP menyapu kiri-kanan", correct: true },
            { text: "B. PUSH tuas, RUN menjauh, SCREAM berteriak, STOP", correct: false },
            { text: "C. Langsung membalik tabung APAR ke arah wajah", correct: false }
          ],
          explanation: "Benar! Protokol PASS: Pull (cabut pen), Aim (arahkan ke dasar api), Squeeze (tekan tuas), Sweep (sapukan mendatar)."
        },
        {
          title: "Skenario 3: Sea Survival - Terjun ke Air dari Ketinggian (Abandon Ship)",
          desc: "Anda telah mengenakan pelampung penolong (lifejacket) dan diperintahkan meninggalkan kapal dengan melompat ke laut. Bagaimana posisi tubuh yang aman?",
          options: [
            { text: "A. Kepala lebih dulu (menyelam tajam) dengan tangan terbuka", correct: false },
            { text: "B. Berdiri tegak lurus, satu tangan menahan hidung dan mulut, tangan lain mengunci lifejacket di dada, kaki rapat menyilang", correct: true },
            { text: "C. Melompat sambil berjungkir balik", correct: false }
          ],
          explanation: "Tepat sekali! Tutup hidung dan mulut untuk mencegah air masuk paru-paru, tahan lifejacket agar tidak menghantam dagu, kaki rapat menyilang."
        },
        {
          title: "Skenario 4: Pencegahan Hipotermia di Air Laut Dingin (H.E.L.P Position)",
          desc: "Anda terapung sendirian di laut lepas menunggu tim SAR tiba. Posisi bertahan hidup apa yang paling efektif memperlambat hilangnya panas tubuh?",
          options: [
            { text: "A. Berenang terus-menerus sekuat tenaga tanpa henti", correct: false },
            { text: "B. Posisi H.E.L.P (Heat Escape Lessening Posture): Rapatkan paha, silangkan lutut ke dada, dekap siku ke tubuh", correct: true },
            { text: "C. Membuka baju pelampung agar badan terasa lebih dingin", correct: false }
          ],
          explanation: "Sempurna! H.E.L.P melindungi area ketiak dan selangkangan di mana pembuluh darah besar melepaskan panas tubuh paling cepat."
        }
      ];
    }

    let currentIndex = 0;
    let earnedPoints = 0;
    const pointsPerQuestion = Math.round(100 / questions.length);

    function renderCurrentStep() {
      const q = questions[currentIndex];
      document.getElementById('stepCounter').innerText = "Langkah " + (currentIndex + 1) + " dari " + questions.length;
      document.getElementById('progBar').style.width = ((currentIndex / questions.length) * 100) + "%";
      document.getElementById('currentScoreLabel').innerText = "Poin Sementara: " + earnedPoints;

      document.getElementById('scenarioTitle').innerHTML = "&#9888; " + q.title;
      document.getElementById('scenarioDesc').innerText = q.desc;

      const actionsGrid = document.getElementById('actionsGrid');
      actionsGrid.innerHTML = '';
      const feedbackBox = document.getElementById('feedbackBox');
      feedbackBox.style.display = 'none';

      q.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.innerHTML = opt.text;
        btn.onclick = () => selectOption(btn, opt, q);
        actionsGrid.appendChild(btn);
      });
    }

    function selectOption(clickedBtn, selectedOpt, currentQ) {
      const allBtns = document.querySelectorAll('.action-btn');
      allBtns.forEach(b => b.disabled = true);

      const feedbackBox = document.getElementById('feedbackBox');
      feedbackBox.style.display = 'block';

      if (selectedOpt.correct) {
        clickedBtn.classList.add('correct');
        earnedPoints = Math.min(100, earnedPoints + pointsPerQuestion);
        feedbackBox.className = 'feedback-text feedback-success';
        feedbackBox.innerHTML = '&#10004; TEPAT! ' + currentQ.explanation;
      } else {
        clickedBtn.classList.add('wrong');
        allBtns.forEach((b, i) => {
          if (currentQ.options[i].correct) b.classList.add('correct');
        });
        feedbackBox.className = 'feedback-text feedback-error';
        feedbackBox.innerHTML = '&#10008; KURANG TEPAT. ' + currentQ.explanation;
      }

      document.getElementById('currentScoreLabel').innerText = "Poin Sementara: " + earnedPoints;

      setTimeout(() => {
        if (currentIndex < questions.length - 1) {
          currentIndex++;
          renderCurrentStep();
        } else {
          showFinishBanner();
        }
      }, 1800);
    }

    function showFinishBanner() {
      document.getElementById('gameContainer').style.display = 'none';
      document.getElementById('scoreBanner').style.display = 'block';
      document.getElementById('progBar').style.width = "100%";
      document.getElementById('stepCounter').innerText = "Simulasi Selesai";

      const finalScore = Math.min(100, earnedPoints);
      document.getElementById('finalScoreText').innerText = "Skor Akhir Anda: " + finalScore + " / 100";

      // Automatically send postMessage to parent LMS window
      broadcastFinalScore(finalScore);
    }

    function broadcastFinalScore(forcedScore) {
      const scoreToSend = typeof forcedScore === 'number' ? forcedScore : Math.min(100, earnedPoints);
      
      const payload = {
        type: 'SIMULATOR_SCORE',
        score: scoreToSend,
        courseName: '${courseName}',
        participantName: '${participantName}',
        seafarerCode: '${seafarerCode}',
        timestamp: new Date().toISOString()
      };

      try {
        window.parent.postMessage(payload, '*');
      } catch (e) {
        console.warn("postMessage warning:", e);
      }
    }

    function restartSimulation() {
      currentIndex = 0;
      earnedPoints = 0;
      document.getElementById('gameContainer').style.display = 'block';
      document.getElementById('scoreBanner').style.display = 'none';
      renderCurrentStep();
    }

    // Start on load
    renderCurrentStep();
  </script>
</body>
</html>`;
};
