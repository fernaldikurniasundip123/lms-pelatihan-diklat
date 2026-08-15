import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { ArrowLeft, PlayCircle, CheckCircle, Lock, FileText, Link as LinkIcon, Download, MessageSquare, ChevronDown, ChevronUp, Book } from "lucide-react";
import { supabase } from "../../lib/supabase";
import AIChat from "../../components/AIChat";

// Simple YouTube Iframe wrapper
function YouTubePlayer({ 
  videoId, 
  initialProgressPct, 
  onProgress, 
  onComplete, 
  videoQuestions = [], 
  videoQuestionsMode = 'immediate' 
}: { 
  videoId: string, 
  initialProgressPct: number, 
  onProgress: (p: number, t: number) => void, 
  onComplete: () => void,
  videoQuestions?: any[],
  videoQuestionsMode?: string
}) {
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const maxTimeWatched = useRef<number>(0);
  const isSeeking = useRef<boolean>(false);
  const durationRef = useRef<number>(0);
  const lastIntervalTime = useRef<number>(0);

  const [activeQuestion, setActiveQuestion] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState<boolean>(false);
  const [answeredIds, setAnsweredIds] = useState<string[]>([]);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [showQuizEndSummary, setShowQuizEndSummary] = useState<boolean>(false);

  // Refs to avoid stale closures in the video update interval
  const answeredIdsRef = useRef<string[]>([]);
  const activeQuestionRef = useRef<any>(null);
  const videoQuestionsRef = useRef<any[]>(videoQuestions);
  const videoQuestionsModeRef = useRef<string>(videoQuestionsMode);

  useEffect(() => {
    videoQuestionsRef.current = videoQuestions;
    videoQuestionsModeRef.current = videoQuestionsMode;
  }, [videoQuestions, videoQuestionsMode]);

  // Helper to vigorously exit browser / iframe fullscreen
  const forceExitFullscreen = () => {
    try {
      const doc = document as any;
      if (doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          doc.msExitFullscreen();
        }
      }
    } catch (e) {
      console.error("Fullscreen exit error:", e);
    }
  };

  const updateAnsweredIds = (newIds: string[]) => {
    setAnsweredIds(newIds);
    answeredIdsRef.current = newIds;
  };

  const updateActiveQuestion = (q: any) => {
    setActiveQuestion(q);
    activeQuestionRef.current = q;
    if (q) {
      forceExitFullscreen();
    }
  };

  // Exit fullscreen whenever a question or summary becomes active
  useEffect(() => {
    if (activeQuestion || showQuizEndSummary) {
      forceExitFullscreen();
      const fsInterval = setInterval(() => {
        const doc = document as any;
        if (doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement) {
          forceExitFullscreen();
        }
      }, 300);
      return () => clearInterval(fsInterval);
    }
  }, [activeQuestion, showQuizEndSummary]);

  useEffect(() => {
    // Reset maxTimeWatched and state when video changes
    maxTimeWatched.current = 0;
    durationRef.current = 0;
    setActiveQuestion(null);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setAnsweredIds([]);
    setCorrectCount(0);
    setShowQuizEndSummary(false);
    answeredIdsRef.current = [];
    activeQuestionRef.current = null;
    
    // Load YouTube API
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initPlayer = () => {
      playerRef.current = new (window as any).YT.Player(`youtube-player-${videoId}`, {
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onStateChange: (event: any) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              // If an active question is currently open, prevent video playback and exit fullscreen
              if (activeQuestionRef.current) {
                forceExitFullscreen();
                playerRef.current?.pauseVideo();
                return;
              }

              if (intervalRef.current) clearInterval(intervalRef.current);
              
              lastIntervalTime.current = Date.now();
              
              intervalRef.current = setInterval(() => {
                if (!playerRef.current || !playerRef.current.getCurrentTime) return;
                
                // If question is active, freeze playback and exit fullscreen
                if (activeQuestionRef.current) {
                  forceExitFullscreen();
                  playerRef.current?.pauseVideo();
                  return;
                }

                const currentTime = playerRef.current.getCurrentTime();
                const duration = playerRef.current.getDuration();
                const now = Date.now();
                
                // Initialize maxTimeWatched based on previous progress if not set
                if (duration > 0 && durationRef.current === 0) {
                  durationRef.current = duration;
                  if (initialProgressPct > 0) {
                    maxTimeWatched.current = (initialProgressPct / 100) * duration;
                  }
                }
                
                const elapsedRealSeconds = (now - lastIntervalTime.current) / 1000;
                lastIntervalTime.current = now;

                const allowedMaxTime = maxTimeWatched.current + elapsedRealSeconds + 2;

                if (!isSeeking.current && currentTime > allowedMaxTime) {
                  // User skipped ahead, seek back to maxTimeWatched
                  isSeeking.current = true;
                  playerRef.current.seekTo(maxTimeWatched.current);
                  setTimeout(() => { isSeeking.current = false; }, 1000);
                } else {
                  // Normal playback or backward seek
                  if (currentTime > maxTimeWatched.current) {
                    maxTimeWatched.current = currentTime;
                  }
                }

                // Check for interactive video questions
                const nextQuestion = videoQuestionsRef.current.find(q => currentTime >= q.time && !answeredIdsRef.current.includes(q.id));
                if (nextQuestion && !activeQuestionRef.current) {
                  forceExitFullscreen();
                  playerRef.current.pauseVideo();
                  updateActiveQuestion(nextQuestion);
                }

                const percentage = duration > 0 ? (maxTimeWatched.current / duration) * 100 : 0;
                onProgress(percentage, maxTimeWatched.current);
              }, 1000);
            } else {
              if (intervalRef.current) clearInterval(intervalRef.current);
              if (event.data === window.YT.PlayerState.ENDED) {
                const duration = playerRef.current?.getDuration() || durationRef.current;
                const percentage = duration > 0 ? (maxTimeWatched.current / duration) * 100 : 0;
                
                // Consider video completed if it reaches 85% or is within 5 seconds of the end
                if (percentage >= 85 || (duration - maxTimeWatched.current <= 5)) {
                  onProgress(100, duration);
                  if (videoQuestionsRef.current && videoQuestionsRef.current.length > 0) {
                    forceExitFullscreen();
                    playerRef.current.pauseVideo();
                    setShowQuizEndSummary(true);
                  } else {
                    onComplete();
                  }
                } else {
                  // User skipped to the end, seek back to max watched time
                  playerRef.current?.seekTo(maxTimeWatched.current);
                }
              }
            }
          }
        }
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (playerRef.current) playerRef.current.destroy();
    };
  }, [videoId]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden shadow-lg bg-black flex flex-col justify-between">
      <div id={`youtube-player-${videoId}`} className="w-full h-full"></div>

      {activeQuestion && (
        <div className="absolute inset-0 bg-black/85 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full text-gray-900 shadow-2xl border border-gray-100 flex flex-col gap-3.5">
            <div className="flex items-center justify-between border-b pb-1.5">
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Kuis Tengah Video ({activeQuestion.time_str || `Detik ${activeQuestion.time}`})
              </span>
              <span className="text-[10px] font-medium text-gray-500">
                Mode: {videoQuestionsMode === 'immediate' ? 'Koreksi Langsung' : 'Hasil Akhir'}
              </span>
            </div>

            <h4 className="font-bold text-sm md:text-base leading-snug">
              {activeQuestion.question}
            </h4>

            <div className="flex flex-col gap-1.5">
              {activeQuestion.options.map((option: string, index: number) => {
                const isSelected = selectedOption === option;
                const isCorrect = index === activeQuestion.correct_option_index;
                let optionStyle = "border-gray-200 hover:bg-gray-50 text-gray-800";
                
                if (isAnswerSubmitted) {
                  if (videoQuestionsMode === 'immediate') {
                    if (isCorrect) {
                      optionStyle = "border-green-300 bg-green-50 text-green-900 font-semibold";
                    } else if (isSelected) {
                      optionStyle = "border-red-300 bg-red-50 text-red-900";
                    } else {
                      optionStyle = "border-gray-150 bg-gray-50 text-gray-400";
                    }
                  } else {
                    if (isSelected) {
                      optionStyle = "border-indigo-500 bg-indigo-50 text-indigo-900 font-semibold";
                    } else {
                      optionStyle = "border-gray-150 bg-gray-50 text-gray-400";
                    }
                  }
                } else if (isSelected) {
                  optionStyle = "border-indigo-600 bg-indigo-50/50 text-indigo-950 font-semibold ring-2 ring-indigo-500/20";
                }

                return (
                  <button
                    key={index}
                    disabled={isAnswerSubmitted}
                    onClick={() => setSelectedOption(option)}
                    className={`w-full text-left px-3.5 py-2.5 border rounded-xl text-xs transition-all flex items-center justify-between ${optionStyle}`}
                  >
                    <span>{option}</span>
                    {isAnswerSubmitted && videoQuestionsMode === 'immediate' && isCorrect && (
                      <span className="text-[10px] font-extrabold text-green-600 bg-green-100/80 px-2 py-0.5 rounded">BENAR</span>
                    )}
                    {isAnswerSubmitted && videoQuestionsMode === 'immediate' && isSelected && !isCorrect && (
                      <span className="text-[10px] font-extrabold text-red-600 bg-red-100/80 px-2 py-0.5 rounded">SALAH</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 border-t pt-2.5 mt-0.5">
              {!isAnswerSubmitted ? (
                <button
                  type="button"
                  disabled={!selectedOption}
                  onClick={() => {
                    if (!selectedOption) return;
                    setIsAnswerSubmitted(true);
                    const isCorrect = activeQuestion.options[activeQuestion.correct_option_index] === selectedOption;
                    if (isCorrect) {
                      setCorrectCount(c => c + 1);
                    }
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-xs hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm"
                >
                  Kirim Jawaban
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const nextAnswered = [...answeredIds, activeQuestion.id];
                    updateAnsweredIds(nextAnswered);
                    updateActiveQuestion(null);
                    setSelectedOption(null);
                    setIsAnswerSubmitted(false);
                    playerRef.current?.playVideo();
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-xs hover:bg-green-700 transition-all shadow-sm"
                >
                  Lanjutkan Video
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showQuizEndSummary && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center p-4 z-20">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-gray-900 shadow-2xl border border-gray-150 text-center flex flex-col gap-4 animate-scale-up">
            <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center text-teal-600 mx-auto">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-teal-950">Kuis Video Selesai!</h3>
              <p className="text-xs text-gray-500 mt-1">Anda telah menyelesaikan kuis interaktif dalam video ini.</p>
            </div>
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
              <span className="block text-[10px] text-teal-800 font-bold uppercase tracking-wider">Hasil Jawaban Anda</span>
              <span className="block text-2xl font-extrabold text-teal-950 mt-1">
                {correctCount} / {videoQuestions.length}
              </span>
              <span className="block text-[10px] text-teal-700 mt-1 font-semibold">
                Pertanyaan terjawab dengan benar
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowQuizEndSummary(false);
                onComplete();
              }}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition-all shadow-md text-xs"
            >
              Selesai & Lanjutkan Course
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CourseView() {
  const { courseId } = useParams();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [course, setCourse] = useState<any>(null);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [assessmentResults, setAssessmentResults] = useState<any[]>([]);
  const [activeVideo, setActiveVideo] = useState<any>(null);
  const [assignmentLink, setAssignmentLink] = useState('');
  const [isSubmittingAssignment, setIsSubmittingAssignment] = useState(false);
  const [assignmentSaved, setAssignmentSaved] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUjianOrLatihan, setIsUjianOrLatihan] = useState(false);
  const [enrolledCategory, setEnrolledCategory] = useState("");
  const [selectedSubject, setSelectedSubject] = useState(() => {
    return localStorage.getItem("selected_mata_kuliah") || "";
  });
  const savePromiseRef = useRef<Promise<void>>(Promise.resolve());

  const subjects = useMemo(() => {
    if (!course?.videos) return [];
    const set = new Set<string>();
    course.videos.forEach((v: any) => {
      if (v.mata_kuliah) {
        set.add(v.mata_kuliah.toUpperCase().trim());
      }
    });
    return Array.from(set).sort();
  }, [course?.videos]);

  const filteredVideos = useMemo(() => {
    if (!course?.videos) return [];
    if (!selectedSubject) return course.videos;
    return course.videos.filter((v: any) => v.mata_kuliah?.toUpperCase().trim() === selectedSubject.toUpperCase().trim());
  }, [course?.videos, selectedSubject]);

  useEffect(() => {
    if (filteredVideos && filteredVideos.length > 0) {
      const isStillInList = filteredVideos.some((v: any) => v.id === activeVideo?.id);
      if (!isStillInList) {
        setActiveVideo(filteredVideos[0]);
      }
    }
  }, [selectedSubject, filteredVideos]);

  useEffect(() => {
    if (user && courseId) {
      fetchCourse();
    }
  }, [courseId, user]);

  const fetchCourse = async () => {
    if (!user || !courseId) return;

    try {
      // Fetch course
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (courseError) throw courseError;

      // Fetch enrollment to get assignment link and category
      const { data: enrollmentData } = await supabase
        .from('enrollments')
        .select('assignment_link, category')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .maybeSingle();

      const refreshingStatus = enrollmentData?.category === 'REFRESING';
      setIsRefreshing(refreshingStatus);

      const categoryValue = enrollmentData?.category || courseData?.category || "";
      setEnrolledCategory(categoryValue);

      const examStatus = enrollmentData?.category === 'UJIAN UAD' || enrollmentData?.category === 'LATIHAN UJIAN' || courseData?.category === 'UJIAN UAD' || courseData?.category === 'LATIHAN UJIAN';
      setIsUjianOrLatihan(examStatus);

      if (enrollmentData?.assignment_link) {
        setAssignmentLink(enrollmentData.assignment_link);
        setAssignmentSaved(true);
      }

      // Fetch videos
      let videosQuery = supabase
        .from('videos')
        .select('*')
        .eq('course_id', courseId)
        .order('order_num', { ascending: true });
        
      if (refreshingStatus) {
        videosQuery = videosQuery.eq('is_refreshing', true);
      }
      
      const { data: videosData } = await videosQuery;

      // Fetch progress
      const { data: progressData } = await supabase
        .from('video_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('course_id', courseId);

      // Fetch assessments
      let assessmentsQuery = supabase
        .from('assessments')
        .select('*')
        .eq('course_id', courseId);
        
      if (refreshingStatus) {
        assessmentsQuery = assessmentsQuery.eq('is_refreshing', true);
      }
      
      const { data: assessmentsData } = await assessmentsQuery;
      setAssessments(assessmentsData || []);

      // Fetch all assessment results
      const { data: resultsData } = await supabase
        .from('assessment_results')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', user.id);
      setAssessmentResults(resultsData || []);

      const videosWithProgress = (videosData || []).map(v => {
        const videoProgresses = progressData?.filter(p => p.video_id === v.id) || [];
        const prog = videoProgresses.reduce((max: any, current: any) => {
          return (current.progress_percentage || 0) > (max?.progress_percentage || 0) ? current : max;
        }, videoProgresses[0]);
        
        return {
          ...v,
          completed: prog?.completed || false,
          progress_percentage: prog?.progress_percentage || 0
        };
      });

      const finalAssessment = assessmentsData?.find((a: any) => !a.video_id);
      const totalItems = videosWithProgress.length + (finalAssessment ? 1 : 0);
      let completedItems = videosWithProgress.filter((v: any) => v.completed || (v.progress_percentage || 0) >= 90).length;
      
      if (finalAssessment) {
        const finalResult = resultsData?.find((r: any) => r.assessment_id === finalAssessment.id);
        if (finalResult?.passed) completedItems += 1;
      }

      const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

      setCourse({
        ...courseData,
        videos: videosWithProgress,
        progress,
        isCompleted: progress === 100
      });

      if (videosWithProgress.length > 0 && !activeVideo) {
        // Find first uncompleted video
        const firstUncompleted = videosWithProgress.find(v => !v.completed && (v.progress_percentage || 0) < 90) || videosWithProgress[0];
        setActiveVideo(firstUncompleted);
      }
    } catch (err) {
      console.error("Failed to fetch course details:", err);
    }
  };

  const lastSavedProgress = useRef<number>(0);
  const lastSaveTime = useRef<number>(0);

  // Reset progress tracker when video changes
  useEffect(() => {
    lastSavedProgress.current = activeVideo?.progress_percentage || 0;
    lastSaveTime.current = 0;
  }, [activeVideo?.id]);

  const handleProgress = async (percentage: number, currentTime: number) => {
    if (!activeVideo || !user || !courseId) return;
    
    // Calculate progress in exact steps of 1% (0, 1, 2, 3... 100)
    const steppedPct = percentage >= 99 ? 100 : Math.floor(percentage);

    // Only save if we reached a new 1% milestone that is higher than previously saved
    if (steppedPct > lastSavedProgress.current || percentage >= 99) {
      // Prevent redundant saves if already at 100
      if (lastSavedProgress.current === 100 && percentage >= 99) {
        await savePromiseRef.current;
        return;
      }
      
      const now = Date.now();
      // Debounce DB writes to at most once every 5 seconds, unless it's the final completion (>= 99%)
      if (now - lastSaveTime.current < 5000 && percentage < 99) {
        return;
      }
      
      const pctToSave = percentage >= 99 ? 100 : steppedPct;
      lastSavedProgress.current = pctToSave;
      lastSaveTime.current = now;
      
      savePromiseRef.current = savePromiseRef.current.then(async () => {
        try {
          const { data, error: fetchError } = await supabase
            .from('video_progress')
            .select('completed, progress_percentage')
            .eq('user_id', user.id)
            .eq('video_id', activeVideo.id)
            .order('progress_percentage', { ascending: false })
            .limit(1);

          if (fetchError) throw fetchError;
          const existing = data?.[0];

          const isCompleted = pctToSave >= 90 || existing?.completed;
          const maxPercentage = Math.max(pctToSave, existing?.progress_percentage || 0);

          if (existing) {
            await supabase.from('video_progress').update({
              progress_percentage: maxPercentage,
              completed: isCompleted
            }).eq('user_id', user.id).eq('video_id', activeVideo.id);
          } else {
            await supabase.from('video_progress').insert({
              user_id: user.id,
              video_id: activeVideo.id,
              course_id: courseId,
              progress_percentage: maxPercentage,
              completed: isCompleted
            });
          }

          // Update local state so UI progress bar updates immediately
          setCourse((prev: any) => {
            if (!prev) return prev;
            const updatedVideos = prev.videos.map((v: any) => {
              if (v.id === activeVideo.id) {
                return { ...v, progress_percentage: maxPercentage, completed: isCompleted };
              }
              return v;
            });
            
            const finalAssessment = assessments?.find((a: any) => !a.video_id);
            const totalItems = updatedVideos.length + (finalAssessment ? 1 : 0);
            let completedItems = updatedVideos.filter((v: any) => v.completed || (v.progress_percentage || 0) >= 90).length;
            
            if (finalAssessment) {
              const finalResult = assessmentResults?.find((r: any) => r.assessment_id === finalAssessment.id);
              if (finalResult?.passed) completedItems += 1;
            }
            
            const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
            return { ...prev, videos: updatedVideos, progress, isCompleted: progress === 100 };
          });

        } catch (err) {
          console.error("Failed to save partial progress:", err);
        }
      });
      
      await savePromiseRef.current;
    }
  };

  const handleComplete = async () => {
    // We can just call handleProgress with 100% to ensure it saves
    await handleProgress(100, 0);
    fetchCourse(); // Refresh to update UI
  };

  const handleSaveAssignment = async () => {
    if (!assignmentLink.trim() || !user || !courseId) return;
    
    setIsSubmittingAssignment(true);
    try {
      const { error } = await supabase
        .from('enrollments')
        .update({ assignment_link: assignmentLink })
        .eq('user_id', user.id)
        .eq('course_id', courseId);
        
      if (error) throw error;
      setAssignmentSaved(true);
      alert("Link tugas berhasil disimpan!");
    } catch (err: any) {
      console.error("Error saving assignment:", err);
      alert(`Gagal menyimpan tugas: ${err.message}\n\nPastikan Anda sudah menambahkan kolom 'assignment_link' di tabel 'enrollments' melalui SQL Editor.`);
    } finally {
      setIsSubmittingAssignment(false);
    }
  };

  if (!course) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/user")} className="p-2 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-gray-900 truncate">{course.name}</h1>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-bold text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500">{user?.identity}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex flex-col lg:flex-row gap-8">
        {/* Left Column - Video Player */}
        <div className="flex-1 flex flex-col gap-6">
          {isUjianOrLatihan ? (() => {
            const finalAssessment = assessments.find(a => !a.video_id);
            const pastResult = finalAssessment ? assessmentResults.find(r => r.assessment_id === finalAssessment.id) : null;
            const categoryLabel = course?.category === 'LATIHAN UJIAN' ? 'Latihan Mandiri' : 'Ujian Online Resmi';
            return (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col gap-6 min-h-[500px] justify-center">
                <div className="flex flex-col items-center text-center max-w-xl mx-auto gap-4">
                  <div className="bg-indigo-50 p-4 rounded-full text-indigo-600">
                    <FileText className="w-12 h-12" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full">
                      Portal {course?.category}
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-3 tracking-tight">
                      {course?.name}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Kategori {categoryLabel}
                    </p>
                  </div>

                  <hr className="w-full border-gray-100 my-2" />

                  <div className="w-full text-left bg-gray-50 border border-gray-100 rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-bold text-gray-800">Petunjuk Pelaksanaan:</h3>
                    <ul className="text-xs text-gray-600 space-y-2 list-disc pl-4">
                      {course?.category === 'LATIHAN UJIAN' ? (
                        <>
                          <li>Soal disajikan <strong>satu per satu</strong> secara berurutan.</li>
                          <li><strong className="text-indigo-600">Pembahasan & Jawaban Benar</strong> akan langsung ditampilkan setelah Anda mengunci pilihan pada setiap nomor.</li>
                          <li>Setelah dikunci, jawaban <strong>tidak dapat diperbaiki atau diubah kembali</strong>.</li>
                          <li>Latihan ini sangat cocok sebagai persiapan menghadapi ujian resmi. Kerjakan dengan teliti!</li>
                        </>
                      ) : (
                        <>
                          <li>Ujian ini dirancang dengan standar kelulusan minimal <strong>{finalAssessment?.passing_score || 70}%</strong>.</li>
                          <li>Sistem ujian dilengkapi <strong>Anti-Split Screen</strong> dan <strong>Anti-Copy Paste</strong> yang ketat. Berpindah tab/aplikasi lebih dari batas toleransi akan mematikan ujian secara otomatis.</li>
                          <li>Pastikan koneksi internet Anda stabil hingga seluruh soal terselesaikan.</li>
                          <li>Jawaban Anda akan langsung diakumulasi untuk menentukan kelulusan di akhir ujian.</li>
                        </>
                      )}
                      {finalAssessment?.duration_minutes && (
                        <li>Durasi pengerjaan: <strong>{finalAssessment.duration_minutes} menit</strong>.</li>
                      )}
                    </ul>
                  </div>

                  {pastResult && (
                    <div className={`w-full p-4 rounded-xl border flex items-center justify-between text-left ${pastResult.passed ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider">Hasil Terakhir Anda:</p>
                        <p className="text-lg font-extrabold">Skor: {Math.round(pastResult.score)}%</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${pastResult.passed ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                        {pastResult.passed ? 'LULUS ✓' : 'TIDAK LULUS ✗'}
                      </span>
                    </div>
                  )}

                  {finalAssessment ? (
                    <button
                      onClick={() => navigate(`/course/${course.id}/assessment/${finalAssessment.id}/precheck`)}
                      className="w-full sm:w-auto px-10 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 shadow-md transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2 text-base self-stretch sm:self-center mt-2"
                    >
                      <CheckCircle className="w-5 h-5" />
                      <span>{pastResult ? 'Coba Lagi / Mulai Kembali' : `Mulai ${course?.category === 'LATIHAN UJIAN' ? 'Latihan' : 'Ujian'}`}</span>
                    </button>
                  ) : (
                    <div className="text-amber-600 bg-amber-50 p-4 rounded-xl border border-amber-200 text-sm font-medium w-full mt-2">
                       Sesi lembar soal belum dipersiapkan oleh instruktur di panel admin.
                    </div>
                  )}
                </div>
              </div>
            );
          })() : (!isRefreshing && activeVideo) ? (
            <div className="bg-black rounded-2xl aspect-video shadow-xl overflow-hidden relative">
              <YouTubePlayer 
                videoId={activeVideo.youtube_id} 
                initialProgressPct={activeVideo.progress_percentage || 0}
                onProgress={handleProgress}
                onComplete={handleComplete}
                videoQuestions={activeVideo.video_questions || []}
                videoQuestionsMode={activeVideo.video_questions_mode || 'immediate'}
              />
            </div>
          ) : isRefreshing ? (
            <div className="flex flex-col gap-6">
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col" style={{ minHeight: '600px' }}>
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    Materi Refresing
                  </h3>
                </div>
                <div className="flex-1 w-full bg-gray-100">
                  {assessments.find(a => !a.video_id)?.refreshing_material_link ? (
                    <iframe 
                      src={(assessments.find(a => !a.video_id)?.refreshing_material_link || '').replace('/view', '/preview').replace('usp=sharing', '')} 
                      className="w-full h-full border-0"
                      title="Materi Refresing"
                      allowFullScreen
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500 flex-col gap-2 p-8 text-center">
                      <p>Materi belum tersedia</p>
                    </div>
                  )}
                </div>
                {assessments.find(a => !a.video_id)?.refreshing_material_link && (
                  <div className="p-3 bg-gray-50 border-t border-gray-200 text-center">
                    <a 
                      href={assessments.find(a => !a.video_id)?.refreshing_material_link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 font-medium hover:underline"
                    >
                      Buka di tab baru (jika PDF tidak muncul)
                    </a>
                  </div>
                )}
              </div>

              {/* Mulai Ujian Refresing button placed exactly below the Material */}
              {assessments.find(a => !a.video_id) && (() => {
                const finalAssessment = assessments.find(a => !a.video_id);
                const pastResult = finalAssessment ? assessmentResults.find(r => r.assessment_id === finalAssessment.id) : null;
                return (
                  <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-200 flex flex-col gap-4 text-left">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-sm">MULAI UJIAN REFRESING</h4>
                          <p className="text-xs text-gray-500 mt-0.5">Silakan kerjakan ujian setelah mempelajari materi di atas.</p>
                        </div>
                      </div>
                      {pastResult && (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${pastResult.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {pastResult.passed ? 'LULUS ✓' : 'TIDAK LULUS ✗'}
                        </span>
                      )}
                    </div>

                    {pastResult && (
                      <div className={`p-4 rounded-xl border text-xs leading-relaxed ${pastResult.passed ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
                        <strong>Hasil Terakhir Anda:</strong> Skor {Math.round(pastResult.score)}% - {pastResult.passed ? 'Selamat! Anda telah lulus ujian refresing.' : 'Anda belum lulus. Silakan ulangi ujian.'}
                      </div>
                    )}

                    <button
                      onClick={() => {
                        navigate(`/course/${course.id}/assessment/${finalAssessment.id}/precheck`);
                      }}
                      className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-sm hover:shadow-indigo-200 flex items-center justify-center gap-2 text-sm"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>MULAI UJIAN REFRESING</span>
                    </button>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="bg-gray-200 rounded-2xl aspect-video flex items-center justify-center text-gray-500">
              No video selected
            </div>
          )}

          {!isRefreshing && activeVideo && (
            <div className="flex flex-col gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{activeVideo.title}</h2>
                <p className="text-gray-600 leading-relaxed">{activeVideo.description}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Course Content & AI Chat */}
        <div className="w-full lg:w-96 flex flex-col gap-6 h-[calc(100vh-6rem)] lg:sticky lg:top-24">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col flex-1 min-h-[300px]">
            {!isRefreshing && (
              <div className="p-6 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {isUjianOrLatihan ? "Informasi Peserta" : "Course Content"}
                </h3>
                {isUjianOrLatihan ? (
                  <div className="text-xs text-gray-600 space-y-1.5">
                    <p><strong>Nama:</strong> {user?.name}</p>
                    <p><strong>Identity:</strong> {user?.identity}</p>
                    <p><strong>Tipe Sesi:</strong> {course?.category}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${course.progress || 0}%` }}></div>
                    </div>
                    <span className="font-medium">{Math.round(course.progress || 0)}%</span>
                  </div>
                )}
              </div>
            )}

            {!isRefreshing && !isUjianOrLatihan && subjects.length > 0 && (
              <div className="px-6 py-4 border-b border-gray-200 bg-indigo-50/50 text-left">
                <label htmlFor="subject-select" className="block text-xs font-bold text-indigo-900 uppercase tracking-widest mb-1.5">
                  Mata Kuliah
                </label>
                <select
                  id="subject-select"
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="block w-full px-3 py-2 border border-indigo-200 bg-white rounded-lg text-sm font-semibold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all"
                >
                  <option value="">-- Semua Mata Kuliah --</option>
                  {subjects.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {isUjianOrLatihan ? (
                <div className="p-2 space-y-4">
                  <div className="text-xs bg-indigo-50 text-indigo-800 p-4 rounded-xl border border-indigo-100 flex flex-col gap-2">
                    <p className="font-bold">Informasi Kelas</p>
                    <p>Anda terdaftar dalam kelas <strong>{course?.name}</strong>.</p>
                    <p>Sesi ini tidak memerlukan materi presentasi video dan berjalan mandiri sesuai instruksi yang diberikan.</p>
                  </div>
                  {assessments.filter(a => !a.video_id).map((assess, index) => {
                    const resultObj = assessmentResults.find(r => r.assessment_id === assess.id);
                    return (
                      <div key={assess.id} className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-900">{assess.title || "Lembar Soal"}</span>
                          {resultObj ? (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${resultObj.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {resultObj.passed ? "LULUS" : "TIDAK LULUS"}
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800">Ready</span>
                          )}
                        </div>
                        {resultObj && (
                          <div className="text-xs text-gray-600">
                            <p>Skor: <strong>{Math.round(resultObj.score)}%</strong></p>
                            <p>Waktu: {new Date(resultObj.created_at).toLocaleString('id-ID')}</p>
                          </div>
                        )}
                        <button
                          onClick={() => navigate(`/course/${course.id}/assessment/${assess.id}/precheck`)}
                          className={`w-full py-2 rounded-lg text-xs font-semibold text-center transition-all ${resultObj ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                        >
                          {resultObj ? "Ulangi Lembar Soal" : "Mulai Mengerjakan"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : !isRefreshing ? (
                (() => {
                  // Group videos by mata_kuliah (maintaining original order of filteredVideos)
                  const groupedMap = new Map<string, any[]>();
                  filteredVideos.forEach((video: any) => {
                    const mkKey = (video.mata_kuliah || "UMUM").toUpperCase().trim();
                    if (!groupedMap.has(mkKey)) {
                      groupedMap.set(mkKey, []);
                    }
                    groupedMap.get(mkKey)!.push(video);
                  });

                  return Array.from(groupedMap.entries()).map(([mkName, mkVideos]) => {
                    const isUmum = mkName === "UMUM";
                    return (
                      <div key={mkName} className="space-y-2 mb-6">
                        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50/70 border border-indigo-100/50 rounded-lg text-xs font-extrabold text-indigo-900 uppercase tracking-widest leading-none mb-3">
                          <Book className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Mata Kuliah: {isUmum ? "Materi Umum" : mkName}</span>
                        </div>
                        {mkVideos.map((video: any) => {
                          const idxRef = filteredVideos.findIndex((v: any) => v.id === video.id);
                          const isActive = activeVideo?.id === video.id;
                          const isCompleted = video.completed || (video.progress_percentage || 0) >= 90;
                          const videoAssessment = assessments.find(a => a.video_id === video.id);
                          const assessmentResult = videoAssessment ? assessmentResults.find(r => r.assessment_id === videoAssessment.id) : null;
                          const isAssessmentPassed = assessmentResult?.passed;
                          
                          // Check if previous video's mandatory assessment is passed
                          let isLocked = false;
                          if (idxRef > 0) {
                            const prevVideo = filteredVideos[idxRef - 1];
                            const prevAssessment = assessments.find(a => a.video_id === prevVideo.id);
                            if (prevAssessment?.is_mandatory) {
                              const prevResult = assessmentResults.find(r => r.assessment_id === prevAssessment.id);
                              if (!prevResult?.passed) {
                                isLocked = true;
                              }
                            }
                          }

                          return (
                            <div key={video.id} className="flex flex-col gap-2">
                              <button
                                onClick={() => {
                                  if (isLocked) {
                                    alert("Anda harus menyelesaikan assessment pada video sebelumnya terlebih dahulu.");
                                    return;
                                  }
                                  setActiveVideo(video);
                                }}
                                className={`w-full flex items-start gap-4 p-4 rounded-xl text-left transition-all ${isActive ? 'bg-indigo-50 border border-indigo-200 shadow-sm' : 'hover:bg-gray-50 border border-transparent'} ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div className={`mt-0.5 ${isCompleted ? 'text-green-500' : isActive ? 'text-indigo-600' : 'text-gray-400'}`}>
                                  {isCompleted ? <CheckCircle className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium line-clamp-2 ${isActive ? 'text-indigo-900' : 'text-gray-900'}`}>
                                    {idxRef + 1}. {video.title} {isLocked && "(Terkunci)"}
                                  </p>
                                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                    <p className="text-xs text-gray-500">
                                      Video {video.progress_percentage > 0 && `- ${Math.round(video.progress_percentage)}%`}
                                    </p>
                                    {video.mata_kuliah && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200 uppercase tracking-wider leading-none">
                                        {video.mata_kuliah}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </button>
                              
                              {videoAssessment && (
                                <button
                                  onClick={() => {
                                    navigate(`/course/${course.id}/assessment/${videoAssessment.id}/precheck`);
                                  }}
                                  className={`ml-12 mr-4 p-3 rounded-lg text-sm font-medium flex items-center justify-between transition-colors ${
                                    isAssessmentPassed 
                                      ? 'bg-green-50 text-green-700 border border-green-200' 
                                      : 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4" />
                                    <span>Assessment: {video.title}</span>
                                  </div>
                                  {isAssessmentPassed ? (
                                    <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded-full">Lulus</span>
                                  ) : (
                                    <span className="text-xs bg-orange-200 text-orange-800 px-2 py-1 rounded-full">{videoAssessment.is_mandatory ? 'Wajib' : 'Opsional'}</span>
                                  )}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  });
                })()
              ) : null}

              <div className="pt-4 mt-4 border-t border-gray-200 flex flex-col gap-4">
                {/* Download Materi Section */}
                {!isRefreshing && course.material_link && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2 text-sm">
                      <Download className="w-4 h-4 text-indigo-600" />
                      Materi Pembelajaran
                    </h3>
                    <a 
                      href={course.material_link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download Materi
                    </a>
                  </div>
                )}

                {/* Final Assessment Section */}
                {!isRefreshing && !isUjianOrLatihan && assessments.find(a => !a.video_id) && (
                  <button
                    onClick={() => {
                      const finalAssessment = assessments.find(a => !a.video_id);
                      navigate(`/course/${course.id}/assessment/${finalAssessment.id}/precheck`);
                    }}
                    className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all bg-indigo-600 text-white hover:bg-indigo-700 shadow-md"
                  >
                    <div className="mt-0.5">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold">Final Assessment</p>
                      <p className="text-xs mt-1 text-indigo-100">
                        Ready to start
                      </p>
                    </div>
                  </button>
                )}

                {/* Link Tugas Section */}
                {!isRefreshing && !isUjianOrLatihan && (
                  <div className="bg-indigo-50 rounded-xl border border-indigo-100 overflow-hidden">
                  <div className="p-4 border-b border-indigo-100 flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-indigo-900" />
                    <h4 className="text-sm font-bold text-indigo-900">Lampirkan Tugas</h4>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-indigo-700 mb-3">
                      Masukkan link tugas Anda (Google Drive, Dropbox, dll). Pastikan akses link sudah dibuka (Public).
                    </p>
                    <div className="flex flex-col gap-2">
                      <input
                        type="url"
                        value={assignmentLink}
                        onChange={(e) => {
                          setAssignmentLink(e.target.value);
                          setAssignmentSaved(false);
                        }}
                        placeholder="https://drive.google.com/..."
                        className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveAssignment}
                          disabled={isSubmittingAssignment || !assignmentLink.trim() || assignmentSaved}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                            assignmentSaved 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'
                          }`}
                        >
                          {isSubmittingAssignment ? 'Menyimpan...' : assignmentSaved ? 'Tugas Tersimpan ✓' : 'Simpan Link Tugas'}
                        </button>
                        {assignmentSaved && (
                          <button
                            onClick={async () => {
                              if (confirm('Apakah Anda yakin ingin menghapus link tugas ini?')) {
                                setIsSubmittingAssignment(true);
                                try {
                                  const { error } = await supabase
                                    .from('enrollments')
                                    .update({ assignment_link: null })
                                    .eq('user_id', user.id)
                                    .eq('course_id', courseId);
                                  if (error) throw error;
                                  setAssignmentLink('');
                                  setAssignmentSaved(false);
                                } catch (err) {
                                  console.error(err);
                                  alert('Gagal menghapus link tugas');
                                } finally {
                                  setIsSubmittingAssignment(false);
                                }
                              }
                            }}
                            disabled={isSubmittingAssignment}
                            className="px-4 py-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg text-sm font-medium transition-colors"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                )}
              </div>
            </div>
          </div>

          {/* AI Chat Section in Right Column */}
          {activeVideo && (
            <div className="flex flex-col flex-1">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <button 
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className="w-full p-4 bg-indigo-600 text-white flex items-center justify-between hover:bg-indigo-700 transition-colors"
                >
                  <div className="flex items-center gap-2 font-bold">
                    <MessageSquare className="w-5 h-5" />
                    Tanya Aspri (Asisten Pak Pria)
                  </div>
                  {isChatOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
                
                {isChatOpen && (
                  <div className="h-[400px] flex flex-col">
                    <AIChat courseName={course.name} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
