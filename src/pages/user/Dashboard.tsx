import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../../store/authStore";
import { Book, Video, FileText, PlayCircle, LogOut, Camera, Upload, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import { supabase } from "../../lib/supabase";

import { compressImage } from "../../utils/imageCompression";

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

  useEffect(() => {
    setIsVerified(user?.is_verified);
  }, [user]);

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

        // Fetch assessment result
        const { data: assessmentResult } = await supabase
          .from('assessment_results')
          .select('passed')
          .eq('course_id', course.id)
          .eq('user_id', user.id)
          .single();

        const totalItems = (videoCount || 0) + 1; // +1 for assessment
        let completedItems = completedCount || 0;
        if (assessmentResult?.passed) completedItems += 1;

        const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

        return {
          ...course,
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
      // pass width and height to force smaller screenshot natively from react-webcam
      const imageSrc = webcamRef.current?.getScreenshot({ width: 640, height: 480 });
      if (imageSrc) {
        // Double check compression to be absolutely safe
        const compressedSrc = await compressImage(imageSrc, 640, 480, 0.7);
        setLivePhoto(compressedSrc);
      }
    } catch (e) {
      console.error("Capture live photo error:", e);
    }
  };

  const handleKtpUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const result = reader.result as string;
          // compress KTP before setting state to avoid memory crash
          const compressedSrc = await compressImage(result, 800, 800, 0.7);
          setKtpPhoto(compressedSrc);
        } catch(e) {
          console.error("KTP compression error:", e);
          setKtpPhoto(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  async function uploadToSupabase(base64Data: string, userId: string, type: 'live' | 'ktp' | 'login_attendance'): Promise<string | null> {
    try {
      const compressedBase64 = await compressImage(base64Data);
      const base64String = compressedBase64.split(',')[1];
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

  if (!isVerified && user?.role === 'user') {
    return (
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
              
              {!livePhoto ? (
                <div className="rounded-xl overflow-hidden bg-black aspect-video relative">
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    className="w-full h-full object-cover"
                    videoConstraints={{ facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }}
                  />
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden bg-black aspect-video relative">
                  <img src={livePhoto} alt="Live Capture" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="flex gap-3">
                {!livePhoto ? (
                  <button onClick={captureLivePhoto} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 flex items-center justify-center gap-2">
                    <Camera className="w-5 h-5" /> Ambil Foto
                  </button>
                ) : (
                  <>
                    <button onClick={() => setLivePhoto(null)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-200">
                      Ulangi
                    </button>
                    <button onClick={() => setVerificationStep(2)} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700">
                      Lanjut
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
                  Kembali
                </button>
                {ktpPhoto && (
                  <button 
                    onClick={submitVerification} 
                    disabled={isSubmitting}
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isSubmitting ? "Menyimpan..." : <><CheckCircle className="w-5 h-5" /> Selesai</>}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isVerified && !hasSessionSelfie && user?.role === 'user') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Verifikasi Kehadiran</h2>
            <p className="text-gray-500 mt-2 text-sm">
              Silakan ambil foto selfie untuk masuk ke dashboard hari ini.
            </p>
          </div>

          <div className="space-y-6">
            {!livePhoto ? (
              <div className="rounded-xl overflow-hidden bg-black aspect-video relative">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  className="w-full h-full object-cover"
                  videoConstraints={{ facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }}
                />
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden bg-black aspect-video relative">
                <img src={livePhoto} alt="Live Capture" className="w-full h-full object-cover" />
              </div>
            )}

            <div className="flex gap-3">
              {!livePhoto ? (
                <button onClick={captureLivePhoto} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 flex items-center justify-center gap-2">
                  <Camera className="w-5 h-5" /> Ambil Foto
                </button>
              ) : (
                <>
                  <button onClick={() => setLivePhoto(null)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-200">
                    Ulangi
                  </button>
                  <button onClick={submitSessionSelfie} disabled={isSubmitting} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 flex items-center justify-center gap-2 disabled:opacity-70">
                    {isSubmitting ? "Menyimpan..." : <><CheckCircle className="w-5 h-5" /> Masuk</>}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
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
                  {course.isCompleted && (
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-medium">
                      Completed
                    </span>
                  )}
                </div>
                <p className="text-gray-600 text-sm mb-6 line-clamp-2">{course.description}</p>
                
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
              </div>
              
              <div className="px-6 pb-6 mt-auto">
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Overall Progress</span>
                    <span>{Math.round(course.progress || 0)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div 
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-500" 
                      style={{ width: `${course.progress || 0}%` }}
                    ></div>
                  </div>
                </div>
                
                <button
                  onClick={() => navigate(`/course/${course.id}`)}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-colors"
                >
                  <PlayCircle className="w-5 h-5" />
                  {course.progress > 0 ? "Continue Learning" : "Start Course"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
