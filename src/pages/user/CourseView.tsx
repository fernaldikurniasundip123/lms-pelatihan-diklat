import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { ArrowLeft, PlayCircle, CheckCircle, Lock, FileText } from "lucide-react";
import { supabase } from "../../lib/supabase";

// Simple YouTube Iframe wrapper
function YouTubePlayer({ videoId, onProgress, onComplete }: { videoId: string, onProgress: (p: number, t: number) => void, onComplete: () => void }) {
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
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
              intervalRef.current = setInterval(() => {
                const currentTime = playerRef.current.getCurrentTime();
                const duration = playerRef.current.getDuration();
                const percentage = (currentTime / duration) * 100;
                onProgress(percentage, currentTime);
                
                if (percentage >= 99) {
                  onComplete();
                }
              }, 5000); // Update every 5s
            } else {
              if (intervalRef.current) clearInterval(intervalRef.current);
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
  const [activeVideo, setActiveVideo] = useState<any>(null);

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

      // Fetch assessment result
      const { data: assessmentResult } = await supabase
        .from('assessment_results')
        .select('passed')
        .eq('course_id', courseId)
        .eq('user_id', user.id)
        .single();

      const videosWithProgress = (videosData || []).map(v => {
        const prog = progressData?.find(p => p.video_id === v.id);
        return {
          ...v,
          completed: prog?.completed || false
        };
      });

      const totalItems = videosWithProgress.length + 1;
      let completedItems = videosWithProgress.filter(v => v.completed).length;
      if (assessmentResult?.passed) completedItems += 1;

      const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

      setCourse({
        ...courseData,
        videos: videosWithProgress,
        progress,
        isCompleted: progress === 100
      });

      if (videosWithProgress.length > 0 && !activeVideo) {
        // Find first uncompleted video
        const firstUncompleted = videosWithProgress.find(v => !v.completed) || videosWithProgress[0];
        setActiveVideo(firstUncompleted);
      }
    } catch (err) {
      console.error("Failed to fetch course details:", err);
    }
  };

  const handleProgress = async (percentage: number, currentTime: number) => {
    // We can optionally save partial progress to Supabase here if needed.
    // For now, we only care about completion.
  };

  const handleComplete = async () => {
    if (!activeVideo || !user || !courseId) return;
    
    try {
      // Check if already completed to avoid unnecessary writes
      const { data: existing } = await supabase
        .from('video_progress')
        .select('completed')
        .eq('user_id', user.id)
        .eq('video_id', activeVideo.id)
        .single();

      if (!existing?.completed) {
        await supabase
          .from('video_progress')
          .upsert({
            user_id: user.id,
            video_id: activeVideo.id,
            course_id: courseId,
            completed: true,
            completed_at: new Date().toISOString()
          }, { onConflict: 'user_id, video_id' });
          
        fetchCourse(); // Refresh to update UI
      }
    } catch (err) {
      console.error("Failed to save progress:", err);
    }
  };

  if (!course) return <div className="p-8 text-center">Loading...</div>;

  const allVideosCompleted = course.videos?.every((v: any) => v.completed);

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
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{activeVideo.title}</h2>
              <p className="text-gray-600 leading-relaxed">{activeVideo.description}</p>
            </div>
          )}
        </div>

        {/* Right Column - Course Content */}
        <div className="w-full lg:w-96 flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[calc(100vh-12rem)] sticky top-24">
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
                const isCompleted = video.completed;
                
                return (
                  <button
                    key={video.id}
                    onClick={() => setActiveVideo(video)}
                    className={`w-full flex items-start gap-4 p-4 rounded-xl text-left transition-all ${isActive ? 'bg-indigo-50 border border-indigo-200 shadow-sm' : 'hover:bg-gray-50 border border-transparent'}`}
                  >
                    <div className={`mt-0.5 ${isCompleted ? 'text-green-500' : isActive ? 'text-indigo-600' : 'text-gray-400'}`}>
                      {isCompleted ? <CheckCircle className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium line-clamp-2 ${isActive ? 'text-indigo-900' : 'text-gray-900'}`}>
                        {idx + 1}. {video.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Video</p>
                    </div>
                  </button>
                );
              })}

              <div className="pt-4 mt-4 border-t border-gray-200">
                <button
                  disabled={!allVideosCompleted}
                  onClick={() => navigate(`/course/${course.id}/assessment/precheck`)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all ${allVideosCompleted ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                  <div className="mt-0.5">
                    {allVideosCompleted ? <FileText className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">Final Assessment</p>
                    <p className={`text-xs mt-1 ${allVideosCompleted ? 'text-indigo-100' : 'text-gray-500'}`}>
                      {allVideosCompleted ? 'Ready to start' : 'Complete all videos first'}
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
