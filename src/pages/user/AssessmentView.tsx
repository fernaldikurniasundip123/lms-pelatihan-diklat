import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { Clock, AlertTriangle, CheckCircle, Headphones, ExternalLink } from "lucide-react";
import { supabase } from "../../lib/supabase";

export default function AssessmentView() {
  const { courseId, assessmentId } = useParams();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  
  const [assessment, setAssessment] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [warnings, setWarnings] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAgreedToRules, setIsAgreedToRules] = useState(false);
  const isAlerting = useRef(false);

  useEffect(() => {
    if (courseId && user) {
      fetchAssessment();
    }
  }, [courseId, user]);

  useEffect(() => {
    if (timeLeft > 0 && !result) {
      const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && assessment && !result) {
      handleSubmit();
    }
  }, [timeLeft, result, assessment]);

  const fetchAssessment = async () => {
    if (!courseId || !user) return;

    try {
      // Fetch assessment
      const { data: assessmentData, error: assessmentError } = await supabase
        .from('assessments')
        .select('*')
        .eq('id', assessmentId)
        .single();

      if (assessmentError || !assessmentData) {
        console.error("Assessment not found");
        return;
      }

      // Fetch questions
      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('assessment_id', assessmentData.id)
        .order('order_num', { ascending: true });

      if (questionsError) throw questionsError;

      let fetchedQuestions = [...(questionsData || [])];
      if (assessmentData.is_randomized) {
        // Fisher-Yates shuffle for Randomized Assessment
        for (let i = fetchedQuestions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [fetchedQuestions[i], fetchedQuestions[j]] = [fetchedQuestions[j], fetchedQuestions[i]];
        }
      }

      setAssessment(assessmentData);
      setQuestions(fetchedQuestions);
      const durationSeconds = (assessmentData.duration_minutes || 60) * 60;
      setTimeLeft(durationSeconds);
    } catch (err) {
      console.error("Failed to fetch assessment:", err);
    }
  };

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = useCallback(async () => {
    if (!assessment || !user || !courseId || submitting) return;
    setSubmitting(true);
    try {
      let correctCount = 0;
      questions.forEach(q => {
        const userAnswer = answers[q.id];
        const correctOption = q.options[q.correct_option_index];
        if (userAnswer === correctOption) {
          correctCount++;
        }
      });

      const score = questions.length > 0 ? (correctCount / questions.length) * 100 : 0;
      const passed = score >= (assessment.passing_score || 70);

      // Fetch previous attempts count
      const { count: attemptsCount } = await supabase
        .from('assessment_results')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('assessment_id', assessmentId);

      const { error: insertError } = await supabase
        .from('assessment_results')
        .insert({
          user_id: user.id,
          course_id: courseId,
          assessment_id: assessmentId,
          score: score,
          passed: passed,
          warnings: warnings
        });

      if (insertError) throw insertError;

      setResult({
        status: passed ? 'LULUS' : 'TIDAK LULUS',
        score: score,
        attemptNumber: (attemptsCount || 0) + 1
      });
    } catch (err: any) {
      console.error("Failed to submit assessment:", err);
      alert(`Failed to submit assessment: ${err.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  }, [assessment, user, courseId, questions, answers, assessmentId, submitting]);

  useEffect(() => {
    if (!assessment || result || submitting) return;

    const handleVisibilityChange = () => {
      if (document.hidden) handleViolationFocus();
    };

    const handleBlur = () => {
      handleViolationFocus();
    };

    const handleViolationFocus = () => {
      // If anti-split screen is enabled, 2nd violation is auto-submit
      if (assessment.prevent_split_screen) {
        if (isAlerting.current) return;
        isAlerting.current = true;
        
        setWarnings(prev => {
          const w = prev + 1;
          if (w >= 2) {
            alert("PERINGATAN! Anda telah berpindah jendela/menggunakan kombinasi tombol (Alt+Tab/Klik Luar) 2 kali. Ujian dihentikan dan disubmit otomatis sesuai dengan aturan Anti-Split Screen!");
            handleSubmit();
          } else {
            alert(`PERINGATAN ${w}/2: Anda dilarang berpindah jendela (Alt+Tab/Klik Luar). Pada pelanggaran ke-2, ujian akan disubmit otomatis!`);
          }
          setTimeout(() => { isAlerting.current = false; }, 1000);
          return w;
        });
      // Fallback to strict mode 3 violations
      } else if (assessment.is_strict_mode) {
        if (isAlerting.current) return;
        isAlerting.current = true;

        setWarnings(prev => {
          const w = prev + 1;
          if (w >= 3) {
            alert("PERINGATAN! Anda telah berpindah tab/jendela 3 kali. Ujian dihentikan dan disubmit otomatis!");
            handleSubmit();
          } else {
            alert(`PERINGATAN ${w}/3: Anda dilarang berpindah tab/jendela. Jika mencapai 3 kali, ujian akan disubmit otomatis!`);
          }
          setTimeout(() => { isAlerting.current = false; }, 1000);
          return w;
        });
      }
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    const handleCopy = (e: ClipboardEvent) => {
      if (assessment.prevent_copypaste || assessment.is_strict_mode) {
        e.preventDefault();
        alert("Penyalinan teks dinonaktifkan selama ujian!");
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (assessment.prevent_split_screen) {
        // Blokir total keyboard saat ujian Anti-Split Screen
        // Izinkan F5 (refresh) atau F12 (inspect) jika diperlukan, tapi kita blokir fungsi utama Alt+Tab (meski ditangkap oleh blur nantinya), Windows Key, Ctrl, dll.
        e.preventDefault();
      } else if (assessment.prevent_copypaste || assessment.is_strict_mode) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'x')) {
          e.preventDefault();
          alert("Pintasan keyboard dinonaktifkan selama ujian!");
        }
        if (e.key === 'PrintScreen' || (e.shiftKey && (e.metaKey || e.ctrlKey) && e.key === 's') || (e.shiftKey && e.metaKey && e.key === '3') || (e.shiftKey && e.metaKey && e.key === '4')) {
          e.preventDefault();
          alert("Screenshot dilarang selama ujian!");
        }
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (assessment.prevent_copypaste || assessment.is_strict_mode) {
        e.preventDefault();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [assessment?.is_strict_mode, assessment?.prevent_split_screen, result, submitting, handleSubmit]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const requestFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      setIsAgreedToRules(true);
    } catch (err: any) {
      alert(`Gagal memasuki mode layar penuh: ${err.message}`);
    }
  };

  if (!assessment) return <div className="p-8 text-center">Loading assessment...</div>;

  if (assessment?.prevent_split_screen && (!isAgreedToRules || !isFullscreen)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden p-8">
          <div className="text-center mb-6">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Persiapan Ujian</h2>
            <p className="text-sm text-gray-600 font-medium">Ujian ini menggunakan sistem Anti-Split Screen.</p>
          </div>
          
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <ul className="text-sm text-amber-800 space-y-2 list-disc pl-4">
              <li>Ujian wajib dikerjakan dalam mode <strong>Layar Penuh (Full-Screen)</strong>.</li>
              <li>Dilarang membuka dua aplikasi berdampingan (Split-Screen) atau memencet tombol kombinasi (Alt+Tab).</li>
              <li><strong>Semua fungsi keyboard dimatikan total</strong>. Ujian hanya bisa dikerjakan menggunakan sentuhan/klik.</li>
              <li>Dilarang mengeklik area di luar ujian (pindah fokus) selama ujian berlangsung.</li>
              <li><strong>Pelanggaran maksimal: 1 kali.</strong> Pada pelanggaran ke-2, jawaban akan langsung dikumpulkan secara otomatis (Diskualifikasi).</li>
            </ul>
          </div>

          <label className="flex items-start gap-3 mb-6 p-4 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
            <input 
              type="checkbox" 
              checked={isAgreedToRules} 
              onChange={e => setIsAgreedToRules(e.target.checked)}
              className="mt-1 block h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">Saya memahami dan setuju dengan aturan ujian di atas, dan bersedia memasuki mode Layar Penuh.</span>
          </label>

          <button
            onClick={requestFullscreen}
            disabled={!isAgreedToRules}
            className="w-full py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Mulai Mode Layar Penuh
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden text-center">
          <div className={`p-8 ${result.status === 'LULUS' ? 'bg-green-600' : 'bg-red-600'} text-white`}>
            {result.status === 'LULUS' ? (
              <CheckCircle className="w-16 h-16 mx-auto mb-4" />
            ) : (
              <AlertTriangle className="w-16 h-16 mx-auto mb-4" />
            )}
            <h2 className="text-3xl font-bold mb-2">{result.status}</h2>
            <p className="text-lg opacity-90">Score: {Math.round(result.score)} / 100</p>
          </div>
          <div className="p-8">
            <p className="text-gray-600 mb-6">Attempt #{result.attemptNumber}</p>
            <button
              onClick={() => navigate(`/course/${courseId}`)}
              className="w-full py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Back to Course
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gray-50 flex flex-col ${assessment?.prevent_copypaste || assessment?.is_strict_mode ? 'no-print' : ''}`}>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-gray-900">Final Assessment</h1>
          </div>
          <div className="flex items-center gap-2 text-red-600 font-mono font-bold text-lg bg-red-50 px-4 py-2 rounded-lg border border-red-100">
            <Clock className="w-5 h-5" />
            {formatTime(timeLeft)}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full ${assessment?.is_strict_mode ? 'select-none' : ''}`}>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
          <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">Candidate</p>
              <p className="font-bold text-gray-900">{user?.name} ({user?.identity})</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Progress</p>
              <p className="font-bold text-gray-900">{Object.keys(answers).length} / {questions.length} Answered</p>
            </div>
          </div>

          {assessment?.audio_link && (
            <div className="p-6 bg-blue-50 border-b border-blue-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2.5 rounded-full text-blue-600 flex-shrink-0">
                  <Headphones className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-900">Audio Material</h3>
                  <p className="text-sm text-blue-700">Please listen to the audio material while answering the questions.</p>
                </div>
              </div>
              <a 
                href={assessment.audio_link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2 whitespace-nowrap"
              >
                <ExternalLink className="w-4 h-4" />
                Open Audio Link
              </a>
            </div>
          )}
          
          <div className="p-8 space-y-12">
            {assessment?.show_one_by_one ? (
              questions.length > 0 && (
                <div 
                  className={`space-y-4 ${assessment?.prevent_copypaste ? 'select-none' : ''}`}
                  onCopy={assessment?.prevent_copypaste ? (e) => e.preventDefault() : undefined}
                  onContextMenu={assessment?.prevent_copypaste ? (e) => e.preventDefault() : undefined}
                >
                  <h3 className="text-lg font-medium text-gray-900 flex gap-4">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                      {currentQuestionIndex + 1}
                    </span>
                    <span className="mt-1">{questions[currentQuestionIndex].question_text}</span>
                  </h3>
                  <div className="pl-12 space-y-3">
                    {questions[currentQuestionIndex].options.map((opt: string, oIdx: number) => (
                      <label key={oIdx} className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${answers[questions[currentQuestionIndex].id] === opt ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          name={`question-${questions[currentQuestionIndex].id}`}
                          value={opt}
                          checked={answers[questions[currentQuestionIndex].id] === opt}
                          onChange={() => handleAnswer(questions[currentQuestionIndex].id, opt)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                        />
                        <span className="ml-3 text-gray-700">{opt}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-between pt-8">
                    <button
                      onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                      disabled={currentQuestionIndex === 0}
                      className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Sebelumnya
                    </button>
                    <button
                      onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
                      disabled={currentQuestionIndex === questions.length - 1}
                      className="px-6 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 disabled:opacity-50"
                    >
                      Selanjutnya
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div 
                className={`space-y-12 ${assessment?.prevent_copypaste ? 'select-none' : ''}`}
                onCopy={assessment?.prevent_copypaste ? (e) => e.preventDefault() : undefined}
                onContextMenu={assessment?.prevent_copypaste ? (e) => e.preventDefault() : undefined}
              >
                {questions.map((q, idx) => (
                  <div key={q.id} className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-900 flex gap-4">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                        {idx + 1}
                      </span>
                      <span className="mt-1">{q.question_text}</span>
                    </h3>
                    <div className="pl-12 space-y-3">
                      {q.options.map((opt: string, oIdx: number) => (
                        <label key={oIdx} className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${answers[q.id] === opt ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <input
                            type="radio"
                            name={`question-${q.id}`}
                            value={opt}
                            checked={answers[q.id] === opt}
                            onChange={() => handleAnswer(q.id, opt)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                          />
                          <span className="ml-3 text-gray-700">{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-8 py-3 border border-transparent rounded-xl shadow-sm text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Assessment"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
