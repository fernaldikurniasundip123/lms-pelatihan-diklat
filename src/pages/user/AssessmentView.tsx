import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";

export default function AssessmentView() {
  const { courseId } = useParams();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  
  const [assessment, setAssessment] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

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
        .eq('course_id', courseId)
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

      setAssessment(assessmentData);
      setQuestions(questionsData || []);
      setTimeLeft(60 * 60); // Default 60 minutes
    } catch (err) {
      console.error("Failed to fetch assessment:", err);
    }
  };

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = async () => {
    if (!assessment || !user || !courseId) return;
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
        .eq('assessment_id', assessment.id);

      const { error: insertError } = await supabase
        .from('assessment_results')
        .insert({
          user_id: user.id,
          assessment_id: assessment.id,
          course_id: courseId,
          score: score,
          passed: passed
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
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!assessment) return <div className="p-8 text-center">Loading assessment...</div>;

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
    <div className="min-h-screen bg-gray-50 flex flex-col">
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
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
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
          
          <div className="p-8 space-y-12">
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
