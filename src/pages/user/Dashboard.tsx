import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../../store/authStore";
import { Book, Video, FileText, PlayCircle, LogOut, Camera, Upload, CheckCircle, ExternalLink, Info, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import { supabase } from "../../lib/supabase";
import ZoomClassroom from "../../components/ZoomClassroom";

import { compressImage, compressImageFile } from "../../utils/imageCompression";

import { ErrorBoundary } from "../../components/ErrorBoundary";

export default function UserDashboard() {
  const { user, logout, checkAuth } = useAuthStore();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<any[]>([]);

  // Verification State
  const [isVerified, setIsVerified] = useState(user?.is_verified);
  const [hasSessionSelfie, setHasSessionSelfie] = useState(sessionStorage.getItem('session_selfie') === 'true');
  const [verificationStep, setVerificationStep] = useState(1);
  const [livePhoto, setLivePhoto] = useState<string | null>(null);
  const [ktpPhoto, setKtpPhoto] = useState<string | null>(null);
  const webcamRef = useRef<Webcam>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUadUser, setIsUadUser] = useState<boolean | null>(null);

  useEffect(() => {
    setIsVerified(user?.is_verified);
  }, [user]);

  useEffect(() => {
    async function checkUadUser() {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('enrollments')
          .select('course_id, category')
          .eq('user_id', user.id);
        
        if (!error && data && data.length > 0) {
          const activeCategory = localStorage.getItem("selected_login_category");
          const hasUad = data.some((e: any) => e.category === 'UJIAN UAD') && activeCategory === 'UJIAN UAD';
          setIsUadUser(hasUad);
          
          if (hasUad) {
            // Find the UJIAN UAD course and its final assessment ID
            const uadEnrollment = data.find((e: any) => e.category === 'UJIAN UAD');
            if (uadEnrollment) {
              const courseId = uadEnrollment.course_id;
              const { data: assessments } = await supabase
                .from('assessments')
                .select('id')
                .eq('course_id', courseId)
                .is('video_id', null)
                .limit(1);
              
              if (assessments && assessments.length > 0) {
                const assessmentId = assessments[0].id;
                // Redirect immediately to precheck face recognition!
                navigate(`/course/${courseId}/assessment/${assessmentId}/precheck`);
              }
            }
          }
        } else {
          setIsUadUser(false);
        }
      } catch (err) {
        setIsUadUser(false);
      }
    }
    checkUadUser();
  }, [user, navigate]);

  useEffect(() => {
    if (isVerified && hasSessionSelfie && user) {
      fetchCourses();
    }
  }, [isVerified, hasSessionSelfie, user]);

  const fetchCourses = async () => {
    if (!user) return;
    
    try {
      // Fetch user's enrolled courses
      const { data: enrollments, error } = await supabase
        .from('enrollments')
        .select(`
          course_id,
          category,
          period_start,
          period_end,
          courses (*)
        `)
        .eq('user_id', user.id);

      if (error) throw error;

      const coursesData = await Promise.all((enrollments || []).map(async (enrollment: any) => {
        const course = enrollment.courses;
        const isRefreshing = enrollment.category === 'REFRESING';
        
        // Fetch videos count
        let videoQuery = supabase
          .from('videos')
          .select('*', { count: 'exact', head: true })
          .eq('course_id', course.id);
          
        if (isRefreshing) {
          videoQuery = videoQuery.eq('is_refreshing', true);
        }
        
        const { count: videoCount } = await videoQuery;

        // Fetch video progress
        const { data: progressData } = await supabase
          .from('video_progress')
          .select('completed, progress_percentage')
          .eq('course_id', course.id)
          .eq('user_id', user.id);
          
        const completedCount = progressData?.filter(p => p.completed || (p.progress_percentage || 0) >= 90).length || 0;

        // Fetch assessment result (order by created_at desc to get latest)
        const { data: assessmentResult } = await supabase
          .from('assessment_results')
          .select('passed, score')
          .eq('course_id', course.id)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const totalItems = (videoCount || 0) + 1; // +1 for assessment
        let completedItems = completedCount || 0;
        if (assessmentResult?.passed) completedItems += 1;

        const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

        return {
          ...course,
          enrollment_category: enrollment.category,
          period_start: enrollment.period_start,
          period_end: enrollment.period_end,
          score: assessmentResult?.score,
          videos: new Array(videoCount || 0).fill({}),
          progress,
          isCompleted: progress === 100
        };
      }));

      setCourses(coursesData);
    } catch (err) {
      console.error("Failed to fetch courses:", err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const captureLivePhoto = async () => {
    try {
      // Get smaller screenshot natively from react-webcam to avoid memory crash
      const imageSrc = webcamRef.current?.getScreenshot({ width: 640, height: 480 });
      if (imageSrc) {
        setLivePhoto(imageSrc);
      }
    } catch (e) {
      console.error("Capture live photo error:", e);
    }
  };

  const handleKtpUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedSrc = await compressImageFile(file, 800, 800, 0.7);
        setKtpPhoto(compressedSrc);
      } catch(e) {
        console.error("KTP compression error:", e);
        // Fallback
        const reader = new FileReader();
        reader.onloadend = () => setKtpPhoto(reader.result as string);
        reader.readAsDataURL(file);
      }
    }
  };

  async function uploadToSupabase(base64Data: string, userId: string, type: 'live' | 'ktp' | 'login_attendance'): Promise<string | null> {
    try {
      const base64String = base64Data.split(',')[1];
      if (!base64String) return null;

      const byteCharacters = atob(base64String);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      const fileName = `${userId}_${type}_${Date.now()}.jpg`;
      const bucketName = 'verifications';

      const { error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (error) {
        console.error(`Supabase upload error for ${type}:`, error);
        return null;
      }

      const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName);

      return publicUrlData.publicUrl;
    } catch (err) {
      console.error(`Failed to process image for ${type}:`, err);
      return null;
    }
  }

  const submitVerification = async () => {
    if (!user || !livePhoto || !ktpPhoto) return;
    
    setIsSubmitting(true);
    try {
      const livePhotoUrl = await uploadToSupabase(livePhoto, user.id, 'live');
      const ktpPhotoUrl = await uploadToSupabase(ktpPhoto, user.id, 'ktp');

      if (!livePhotoUrl || !ktpPhotoUrl) {
        throw new Error("Failed to upload photos");
      }

      const { error } = await supabase
        .from('global_verifications')
        .insert({
          user_id: user.id,
          live_photo_url: livePhotoUrl,
          ktp_photo_url: ktpPhotoUrl
        });

      if (error) throw error;

      await checkAuth(); // refresh user data to get is_verified = true
      setIsVerified(true);
      setHasSessionSelfie(true);
      sessionStorage.setItem('session_selfie', 'true');
    } catch (err: any) {
      console.error("Verification error:", err);
      alert(`Error submitting verification: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitSessionSelfie = async () => {
    if (!user || !livePhoto) return;
    
    setIsSubmitting(true);
    try {
      const livePhotoUrl = await uploadToSupabase(livePhoto, user.id, 'login_attendance');

      if (!livePhotoUrl) {
        throw new Error("Failed to upload photo");
      }

      setHasSessionSelfie(true);
      sessionStorage.setItem('session_selfie', 'true');
    } catch (err: any) {
      console.error("Selfie error:", err);
      alert(`Error submitting selfie: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const [activeZoomClass, setActiveZoomClass] = useState<{ id: string; name: string } | null>(null);

  const [selectedZoomCourse, setSelectedZoomCourse] = useState<{ id: string; name: string } | null>(null);
  const [retrievedZoomConfig, setRetrievedZoomConfig] = useState<{ meeting_name: string; zoom_link: string; course_periods?: string[] } | null>(null);
  const [loadingZoomConfig, setLoadingZoomConfig] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");

  const fetchZoomConfigForCourse = async (courseId: string) => {
    setLoadingZoomConfig(true);
    setRetrievedZoomConfig(null);
    setSelectedPeriod("");
    let foundConfig: any = null;

    try {
      const { data, error } = await supabase.from("zoom_settings").select("*");
      if (!error && data) {
        foundConfig = data.find((item: any) => {
          if (!Array.isArray(item.course_ids)) return false;
          return item.course_ids.some((c: any) => {
            if (typeof c === 'string') return c === courseId;
            return c && typeof c === 'object' && c.course_id === courseId;
          });
        });
      }
    } catch (e) {
      console.warn("Could not fetch zoom configs from Supabase server, checking LocalStorage...");
    }

    if (!foundConfig) {
      const stored = localStorage.getItem("local_zoom_settings");
      if (stored) {
        const configs = JSON.parse(stored);
        foundConfig = configs.find((item: any) => {
          if (!Array.isArray(item.course_ids)) return false;
          return item.course_ids.some((c: any) => {
            if (typeof c === 'string') return c === courseId;
            return c && typeof c === 'object' && c.course_id === courseId;
          });
        });
      }
    }

    if (foundConfig) {
      // Find specific mapping periods
      let periods: string[] = [];
      if (Array.isArray(foundConfig.course_ids)) {
        const mapping = foundConfig.course_ids.find((c: any) => {
          if (typeof c === 'string') return c === courseId;
          return c && typeof c === 'object' && c.course_id === courseId;
        });
        if (mapping && typeof mapping === 'object' && Array.isArray(mapping.periods)) {
          periods = mapping.periods;
        }
      }

      setRetrievedZoomConfig({
        meeting_name: foundConfig.meeting_name,
        zoom_link: foundConfig.zoom_link,
        course_periods: periods
      });
      
      // Auto-select first period if available
      if (periods.length > 0) {
        setSelectedPeriod(periods[0]);
      }
    } else {
      setRetrievedZoomConfig({
        meeting_name: "Embed Link Zoom Default",
        zoom_link: "https://zoom.us/j/98765432101",
        course_periods: []
      });
    }
    setLoadingZoomConfig(false);
  };

  const handleJoinDirectZoom = async (courseId: string, courseName: string, zoomLink: string) => {
    if (!user) return;
    const userClass = localStorage.getItem("selected_class") || (user as any)?.class_name || "KELAS UTAMA";
    const finalClassName = selectedPeriod ? `${userClass} (${selectedPeriod})` : userClass;
    
    const payload = {
      id: crypto.randomUUID(),
      user_id: user.id,
      user_name: user.name,
      seafarer_code: user.identity || "",
      class_name: finalClassName,
      course_id: courseId,
      course_name: courseName,
      joined_at: new Date().toISOString(),
      duration_seconds: 7200,    
      camera_on_seconds: 7200,   
      camera_off_seconds: 0,
      mic_on_seconds: 1800,
      last_active: new Date().toISOString()
    };

    try {
      await supabase.from("zoom_logs").insert([payload]);
    } catch (e) {
      const stored = localStorage.getItem("local_zoom_logs") || "[]";
      const logsArray = JSON.parse(stored);
      logsArray.push(payload);
      localStorage.setItem("local_zoom_logs", JSON.stringify(logsArray));
    }

    window.open(zoomLink, "_blank");
    setSelectedZoomCourse(null);
  };

  if (activeZoomClass && user) {
    const userClass = (user as any)?.class_name || "Kelas Utama";
    const finalClassName = selectedPeriod ? `${userClass} (${selectedPeriod})` : userClass;
    return (
      <ZoomClassroom
        courseId={activeZoomClass.id}
        courseName={activeZoomClass.name}
        user={{
          id: user.id,
          name: user.name,
          identity: user.identity,
          class_name: finalClassName
        }}
        onLeave={() => setActiveZoomClass(null)}
      />
    );
  }

  if (!isVerified && user?.role === 'user' && isUadUser === false) {
    return (
      <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Verifikasi Identitas</h2>
            <p className="text-gray-500 mt-2 text-sm">
              Untuk mengakses pelatihan, Anda wajib melakukan verifikasi wajah dan KTP.
            </p>
          </div>

          {verificationStep === 1 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-indigo-600 font-medium mb-4">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-sm">1</div>
                Ambil Foto Wajah (Live)
              </div>
              
              <div className="rounded-xl overflow-hidden bg-black aspect-video relative">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  screenshotQuality={0.8}
                  className={`w-full h-full object-cover ${livePhoto ? 'hidden' : 'block'}`}
                  videoConstraints={{ facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }}
                />
                {livePhoto && (
                  <img src={livePhoto} alt="Live Capture" className="w-full h-full object-cover absolute inset-0 z-10" />
                )}
              </div>

              <div className="flex gap-3">
                {!livePhoto ? (
                  <button onClick={captureLivePhoto} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 flex items-center justify-center gap-2">
                    <Camera className="w-5 h-5" /> <span>Ambil Foto</span>
                  </button>
                ) : (
                  <>
                    <button onClick={() => setLivePhoto(null)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-200">
                      <span>Ulangi</span>
                    </button>
                    <button onClick={() => setVerificationStep(2)} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700">
                      <span>Lanjut</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {verificationStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-indigo-600 font-medium mb-4">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-sm">2</div>
                Upload / Foto KTP
              </div>

              {!ktpPhoto ? (
                <label className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 hover:border-indigo-500 transition-colors">
                  <Upload className="w-8 h-8 text-gray-400 mb-3" />
                  <span className="text-sm font-medium text-gray-700">Pilih File atau Ambil Foto</span>
                  <span className="text-xs text-gray-500 mt-1">Format: JPG, PNG</span>
                  <input type="file" accept="image/*" capture="environment" onChange={handleKtpUpload} className="hidden" />
                </label>
              ) : (
                <div className="rounded-xl overflow-hidden bg-gray-100 aspect-video relative border border-gray-200">
                  <img src={ktpPhoto} alt="KTP" className="w-full h-full object-contain" />
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setVerificationStep(1)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-200">
                  <span>Kembali</span>
                </button>
                {ktpPhoto && (
                  <button 
                    onClick={submitVerification} 
                    disabled={isSubmitting}
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isSubmitting ? <span>Menyimpan...</span> : <><CheckCircle className="w-5 h-5" /> <span>Selesai</span></>}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      </ErrorBoundary>
    );
  }

  if (isVerified && !hasSessionSelfie && user?.role === 'user' && isUadUser === false) {
    return (
      <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Verifikasi Kehadiran</h2>
            <p className="text-gray-500 mt-2 text-sm">
              Silakan ambil foto selfie untuk masuk ke dashboard hari ini.
            </p>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl overflow-hidden bg-black aspect-video relative">
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                screenshotQuality={0.8}
                className={`w-full h-full object-cover ${livePhoto ? 'hidden' : 'block'}`}
                videoConstraints={{ facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }}
              />
              {livePhoto && (
                <img src={livePhoto} alt="Live Capture" className="w-full h-full object-cover absolute inset-0 z-10" />
              )}
            </div>

            <div className="flex gap-3">
              {!livePhoto ? (
                <button onClick={captureLivePhoto} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 flex items-center justify-center gap-2">
                  <Camera className="w-5 h-5" /> <span>Ambil Foto</span>
                </button>
              ) : (
                <>
                  <button onClick={() => setLivePhoto(null)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-200">
                    <span>Ulangi</span>
                  </button>
                  <button onClick={submitSessionSelfie} disabled={isSubmitting} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 flex items-center justify-center gap-2 disabled:opacity-70">
                    {isSubmitting ? <span>Menyimpan...</span> : <><CheckCircle className="w-5 h-5" /> <span>Masuk</span></>}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      </ErrorBoundary>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Book className="w-8 h-8 text-indigo-600" />
            <span className="text-xl font-bold text-gray-900">LMS Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500">{user?.identity}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">My Courses</h1>
          <p className="text-gray-500 mt-1">Continue your learning journey</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map(course => (
            <div key={course.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
              <div className="p-6 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-bold text-gray-900 leading-tight">{course.name}</h3>
                  <div className="flex flex-col items-end gap-1">
                    {course.isCompleted && (
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-medium">
                        Completed
                      </span>
                    )}
                    {course.enrollment_category === 'REFRESING' && (
                      <span className="bg-teal-100 text-teal-800 text-xs px-2 py-1 rounded-full font-medium border border-teal-200">
                        REFRESING
                      </span>
                    )}
                    {course.enrollment_category === 'PEMBELAJARAN SINKRONUS ZOOM MEETING' && (
                      <span className="bg-rose-100 text-rose-800 text-xs px-2 py-1 rounded-full font-medium border border-rose-300 animate-pulse">
                        ZOOM SINKRONUS
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-gray-600 text-sm mb-4 line-clamp-2">{course.description}</p>
                
                {course.enrollment_category === 'REFRESING' && course.period_start && (
                  <div className="bg-teal-50 border border-teal-100 rounded-lg p-3 mb-4">
                    <p className="text-xs text-teal-800 font-medium mb-1">Periode Refresing:</p>
                    <p className="text-sm text-teal-900 mb-2">
                       {new Date(course.period_start).toLocaleDateString('id-ID')} - {new Date(course.period_end).toLocaleDateString('id-ID')}
                    </p>
                    <p className="text-xs text-teal-800 font-medium mb-1">Hasil Nilai Akhir:</p>
                    <p className="text-sm text-teal-900 font-bold">
                       {course.score !== undefined && course.score !== null ? `${Math.round(course.score)}/100` : "Belum Mengerjakan"}
                    </p>
                  </div>
                )}

                {(course.enrollment_category === 'UJIAN UAD' || course.enrollment_category === 'LATIHAN UJIAN') && (
                  <div className={`border rounded-lg p-3 mb-4 ${course.enrollment_category === 'UJIAN UAD' ? 'bg-indigo-50 border-indigo-100' : 'bg-amber-50 border-amber-100'}`}>
                    <p className={`text-xs font-semibold mb-1 ${course.enrollment_category === 'UJIAN UAD' ? 'text-indigo-800' : 'text-amber-800'}`}>Periode Pelaksanaan:</p>
                    <p className="text-sm text-gray-950 mb-2 font-semibold">
                       {course.period_start ? `${new Date(course.period_start).toLocaleDateString('id-ID')} - ${new Date(course.period_end).toLocaleDateString('id-ID')}` : "Tidak Terbatas"}
                    </p>
                    <p className={`text-xs font-semibold mb-1 ${course.enrollment_category === 'UJIAN UAD' ? 'text-indigo-800' : 'text-amber-800'}`}>Hasil Nilai:</p>
                    {course.score !== undefined && course.score !== null ? (
                      <p className={`text-lg font-bold ${course.score >= 70 ? 'text-green-600' : 'text-red-600'}`}>
                         {Math.round(course.score)}/100 <span className="text-xs font-semibold">({course.score >= 70 ? 'LULUS' : 'GAGAL'})</span>
                      </p>
                    ) : (
                      <p className="text-sm text-gray-600 font-medium">Belum Mengerjakan</p>
                    )}
                  </div>
                )}

                {course.enrollment_category === 'PEMBELAJARAN SINKRONUS ZOOM MEETING' && (
                  <div className="bg-rose-50 border border-rose-100 rounded-xl p-3.5 mb-4">
                    <p className="text-xs text-rose-800 font-bold mb-1 uppercase tracking-wider">Status Webinar virtual:</p>
                    <p className="text-sm text-rose-950 font-black mb-2 animate-pulse flex items-center gap-1.5">
                       <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span>
                       RUANG KELAS ZOOM LIVE
                    </p>
                    <p className="text-xs text-rose-800 font-bold mb-0.5">Petunjuk Sinkronus:</p>
                    <p className="text-xs text-gray-600 leading-relaxed">
                       Sistem akan mendeteksi presensi otomatis secara visual saat Anda menyalakan Kamera (Webcam) dan Microphone selama pembelajaran sinkronus berlangsung.
                    </p>
                  </div>
                )}
                
                {course.enrollment_category !== 'UJIAN UAD' && course.enrollment_category !== 'LATIHAN UJIAN' && course.enrollment_category !== 'PEMBELAJARAN SINKRONUS ZOOM MEETING' ? (
                  <div className="space-y-3">
                    <div className="flex items-center text-sm text-gray-500 gap-2">
                      <Video className="w-4 h-4 text-indigo-500" />
                      <span>{course.videos?.length || 0} Videos</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-500 gap-2">
                      <FileText className="w-4 h-4 text-indigo-500" />
                      <span>1 Final Assessment</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center text-sm text-gray-500 gap-2">
                      <FileText className={`w-4 h-4 ${course.enrollment_category === 'UJIAN UAD' ? 'text-indigo-500' : 'text-amber-500'}`} />
                      <span>1 {course.enrollment_category}</span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="px-6 pb-6 mt-auto">
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Overall Progress</span>
                    <span>{Math.round(course.progress || 0)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-500 ${course.enrollment_category === 'LATIHAN UJIAN' ? 'bg-amber-600' : 'bg-indigo-600'}`}
                      style={{ width: `${course.progress || 0}%` }}
                    ></div>
                  </div>
                </div>
                
                 <button
                  onClick={() => {
                    if (course.enrollment_category === 'PEMBELAJARAN SINKRONUS ZOOM MEETING') {
                      setSelectedZoomCourse({ id: course.id, name: course.name });
                      fetchZoomConfigForCourse(course.id);
                    } else {
                      navigate(`/course/${course.id}`);
                    }
                  }}
                  className={`w-full flex items-center justify-center gap-2 text-white py-2.5 rounded-xl font-medium transition-colors ${
                    course.enrollment_category === 'PEMBELAJARAN SINKRONUS ZOOM MEETING'
                      ? 'bg-rose-600 hover:bg-rose-700 animate-pulse font-bold tracking-wider'
                      : course.enrollment_category === 'UJIAN UAD'
                      ? 'bg-indigo-600 hover:bg-indigo-700'
                      : course.enrollment_category === 'LATIHAN UJIAN'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  <PlayCircle className="w-5 h-5" />
                  <span>
                    {course.enrollment_category === 'PEMBELAJARAN SINKRONUS ZOOM MEETING'
                      ? "Masuk Kelas Zoom Meeting"
                      : course.enrollment_category === 'UJIAN UAD'
                      ? "Mulai Ujian"
                      : course.enrollment_category === 'LATIHAN UJIAN'
                      ? "Mulai Latihan"
                      : course.progress > 0 
                      ? "Continue Learning" 
                      : "Start Course"}
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Zoom Connection Option Modal */}
      {selectedZoomCourse && (
        <div id="zoomConnectionChoiceModal" className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-55">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-100 flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-rose-600 to-red-500 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-rose-100" />
                <h3 className="font-bold text-lg">Pilihan Pembelajaran Sinkronus</h3>
              </div>
              <button 
                onClick={() => setSelectedZoomCourse(null)}
                className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-rose-600 bg-rose-50 px-2 py-0.5 rounded font-bold">Zoom Meeting Class</span>
                <h4 className="text-xl font-bold text-gray-900 mt-1.5 truncate">{selectedZoomCourse.name}</h4>
                <p className="text-xs text-gray-500 mt-1">Silakan pilih metode untuk tergabung ke dalam sesi Zoom Meeting hari ini.</p>
              </div>

              {!loadingZoomConfig && retrievedZoomConfig && retrievedZoomConfig.course_periods && retrievedZoomConfig.course_periods.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                  <label htmlFor="periodSelectField" className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                    PILIH PERIODE DIKLAT ANDA:
                  </label>
                  <select
                    id="periodSelectField"
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white text-gray-950 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="" disabled>-- Pilih Periode Kelas --</option>
                    {retrievedZoomConfig.course_periods.map((period) => (
                      <option key={period} value={period}>
                        {period}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-500 font-medium">
                    Periode diklat yang dipilih akan dicatat pada laporan telemetri & rekap presensi kelas sinkronus Anda.
                  </p>
                </div>
              )}

              {loadingZoomConfig ? (
                <div className="py-6 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
                  <span className="text-xs text-gray-500 font-medium">Memuat konfigurasi kelas sinkronus...</span>
                </div>
              ) : retrievedZoomConfig ? (
                <div className="space-y-4">
                  {/* Option 1: Direct Zoom Link */}
                  <div className="border border-gray-200 rounded-xl p-4 hover:border-indigo-200 hover:bg-indigo-50/20 transition group">
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <h5 className="font-bold text-gray-800 text-sm group-hover:text-indigo-900 transition">Metode A: Gunakan Aplikasi Zoom Client (Rekomendasi)</h5>
                        <p className="text-xs text-gray-500 leading-normal">Buka langsung menggunakan aplikasi Zoom di Android, laptop atau komputer Anda. Bebas lag dan kualitas audio video terbaik.</p>
                        {retrievedZoomConfig.meeting_name && (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-indigo-600 font-bold bg-indigo-50 mt-2 px-2 py-0.5 rounded w-max">
                            <Info className="w-3 h-3" /> Meeting: {retrievedZoomConfig.meeting_name}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleJoinDirectZoom(selectedZoomCourse.id, selectedZoomCourse.name, retrievedZoomConfig.zoom_link)}
                      className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-1.5 transition duration-150"
                    >
                      <ExternalLink className="w-4 h-4" /> Buka Aplikasi Zoom (Link Siap Pakai)
                    </button>
                  </div>

                  {/* Option 2: Embed Web SDK Web Viewport */}
                  <div className="border border-gray-200 rounded-xl p-4 hover:border-rose-200 hover:bg-rose-50/20 transition group">
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <h5 className="font-bold text-gray-800 text-sm group-hover:text-rose-900 transition">Metode B: Web SDK Client (Simulasi Terintegrasi)</h5>
                        <p className="text-xs text-gray-500 leading-normal">Tetap berada di dalam sistem LMS. Sistem akan menyalakan feed kamera, deteksi mic, dan log telemetry di tab browser ini secara real-time.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setActiveZoomClass({ id: selectedZoomCourse.id, name: selectedZoomCourse.name });
                        setSelectedZoomCourse(null);
                      }}
                      className="mt-4 w-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-1.5 transition duration-150"
                    >
                      <Video className="w-4 h-4" /> Masuk via Web SDK LMS (Tatap Muka Virtual)
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200/50 flex gap-2.5 items-start">
                <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-800 leading-normal">
                  <strong>Penting:</strong> Apapun metode yang Anda pilih, kehadiran Anda akan dicatat secara otomatis oleh sistem LMS untuk laporan kelulusan diklat sinkronus ke Dinas Perhubungan / Instruktur.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
