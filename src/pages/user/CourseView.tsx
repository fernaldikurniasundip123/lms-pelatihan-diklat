import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { ArrowLeft, PlayCircle, CheckCircle, Lock, FileText, Link as LinkIcon } from "lucide-react";
import { supabase } from "../../lib/supabase";
import AIChat from "../../components/AIChat";

// Simple YouTube Iframe wrapper
function YouTubePlayer({ videoId, initialProgressPct, onProgress, onComplete }: { videoId: string, initialProgressPct: number, onProgress: (p: number, t: number) => void, onComplete: () => void }) {
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const maxTimeWatched = useRef<number>(0);
  const isSeeking = useRef<boolean>(false);
  const durationRef = useRef<number>(0);
  const lastIntervalTime = useRef<number>(0);

  useEffect(() => {
    // Reset maxTimeWatched when video changes
    maxTimeWatched.current = 0;
    durationRef.current = 0;
    
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
              if (intervalRef.current) clearInterval(intervalRef.current);
              
              lastIntervalTime.current = Date.now();
              
              intervalRef.current = setInterval(() => {
                if (!playerRef.current || !playerRef.current.getCurrentTime) return;
                
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
                  onComplete();
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

  return <div id={`youtube-player-${videoId}`} className="w-full h-full rounded-xl overflow-hidden shadow-lg"></div>;
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
  const savePromiseRef = useRef<Promise<void>>(Promise.resolve());

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

      // Fetch videos
      const { data: videosData } = await supabase
        .from('videos')
        .select('*')
        .eq('course_id', courseId)
        .order('order_num', { ascending: true });

      // Fetch progress
      const { data: progressData } = await supabase
        .from('video_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('course_id', courseId);

      // Fetch enrollment to get assignment link
      const { data: enrollmentData } = await supabase
        .from('enrollments')
        .select('assignment_link')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .maybeSingle();

      if (enrollmentData?.assignment_link) {
        setAssignmentLink(enrollmentData.assignment_link);
        setAssignmentSaved(true);
      }

      // Fetch assessments
      const { data: assessmentsData } = await supabase
        .from('assessments')
        .select('*')
        .eq('course_id', courseId);
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
              completed: isCompleted,
              ...(isCompleted && !existing.completed ? { completed_at: new Date().toISOString() } : {})
            }).eq('user_id', user.id).eq('video_id', activeVideo.id);
          } else {
            await supabase.from('video_progress').insert({
              user_id: user.id,
              video_id: activeVideo.id,
              course_id: courseId,
              progress_percentage: maxPercentage,
              completed: isCompleted,
              ...(isCompleted ? { completed_at: new Date().toISOString() } : {})
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
          <button onClick={() => navigate("/user")} className="p-2 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 truncate">{course.name}</h1>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex flex-col lg:flex-row gap-8">
        {/* Left Column - Video Player */}
        <div className="flex-1 flex flex-col gap-6">
          {activeVideo ? (
            <div className="bg-black rounded-2xl aspect-video shadow-xl overflow-hidden relative">
              <YouTubePlayer 
                videoId={activeVideo.youtube_id} 
                initialProgressPct={activeVideo.progress_percentage || 0}
                onProgress={handleProgress}
                onComplete={handleComplete}
              />
            </div>
          ) : (
            <div className="bg-gray-200 rounded-2xl aspect-video flex items-center justify-center text-gray-500">
              No video selected
            </div>
          )}

          {activeVideo && (
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
            <div className="p-6 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Course Content</h3>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${course.progress || 0}%` }}></div>
                </div>
                <span className="font-medium">{Math.round(course.progress || 0)}%</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {course.videos?.map((video: any, idx: number) => {
                const isActive = activeVideo?.id === video.id;
                const isCompleted = video.completed || (video.progress_percentage || 0) >= 90;
                const videoAssessment = assessments.find(a => a.video_id === video.id);
                const assessmentResult = videoAssessment ? assessmentResults.find(r => r.assessment_id === videoAssessment.id) : null;
                const isAssessmentPassed = assessmentResult?.passed;
                
                // Check if previous video's mandatory assessment is passed
                let isLocked = false;
                if (idx > 0) {
                  const prevVideo = course.videos[idx - 1];
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
                          {idx + 1}. {video.title} {isLocked && "(Terkunci)"}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Video {video.progress_percentage > 0 && `- ${Math.round(video.progress_percentage)}%`}
                        </p>
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

              <div className="pt-4 mt-4 border-t border-gray-200">
                <div className="mb-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                  <h4 className="text-sm font-bold text-indigo-900 mb-2 flex items-center gap-2">
                    <LinkIcon className="w-4 h-4" />
                    Lampirkan Tugas
                  </h4>
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

                {assessments.find(a => !a.video_id) && (
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
              </div>
            </div>
          </div>

          {/* AI Chat Section in Right Column */}
          {activeVideo && (
            <div className="flex flex-col flex-1 min-h-[300px]">
              <AIChat courseName={course.name} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
