import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import Webcam from "react-webcam";
import { Camera, Upload, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";

import { compressImage, compressImageFile } from "../../utils/imageCompression";

import { ErrorBoundary } from "../../components/ErrorBoundary";

export default function AssessmentPreCheck() {
  const { courseId, assessmentId } = useParams();
  const { user, checkAuth } = useAuthStore();
  const navigate = useNavigate();
  const webcamRef = useRef<Webcam>(null);
  
  const [livePhoto, setLivePhoto] = useState<string | null>(null);
  const [ktpPhoto, setKtpPhoto] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attemptsInfo, setAttemptsInfo] = useState<{ count: number, passed: boolean } | null>(null);

  useEffect(() => {
    if (user && courseId) {
      checkPreviousAttempts();
    }
  }, [user, courseId]);

  const checkPreviousAttempts = async () => {
    if (!user || !courseId) return;
    try {
      const { data: results } = await supabase
        .from('assessment_results')
        .select('passed')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .eq('assessment_id', assessmentId);

      if (results) {
        const passed = results.some(r => r.passed);
        setAttemptsInfo({ count: results.length, passed });
      } else {
        setAttemptsInfo({ count: 0, passed: false });
      }
    } catch (err) {
      console.error("Failed to check attempts:", err);
      setAttemptsInfo({ count: 0, passed: false });
    }
  };

  // If user is already verified globally, they can just proceed (unless blocked by attempts)
  useEffect(() => {
    if (user?.is_verified && attemptsInfo !== null) {
      if (attemptsInfo.passed || attemptsInfo.count >= 3) {
        // Stay here to show the message
      } else {
        navigate(`/course/${courseId}/assessment/${assessmentId}`);
      }
    }
  }, [user, courseId, navigate, attemptsInfo]);

  const capture = useCallback(async () => {
    try {
      const imageSrc = webcamRef.current?.getScreenshot({ width: 640, height: 480 });
      if (imageSrc) {
        setLivePhoto(imageSrc);
      }
    } catch (e) {
      console.error("Capture live photo error:", e);
    }
  }, [webcamRef]);

  const handleKtpUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedSrc = await compressImageFile(file, 800, 800, 0.7);
        setKtpPhoto(compressedSrc);
      } catch(e) {
        console.error("KTP compression error:", e);
        const reader = new FileReader();
        reader.onloadend = () => setKtpPhoto(reader.result as string);
        reader.readAsDataURL(file);
      }
    }
  };

  async function uploadToSupabase(base64Data: string, userId: string, type: 'live' | 'ktp'): Promise<string | null> {
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

  const handleSubmit = async () => {
    if (!user) return;
    if (!livePhoto || !ktpPhoto) {
      setError("Please complete both photo verification steps.");
      return;
    }

    setLoading(true);
    try {
      const livePhotoUrl = await uploadToSupabase(livePhoto, user.id, 'live');
      const ktpPhotoUrl = await uploadToSupabase(ktpPhoto, user.id, 'ktp');

      if (!livePhotoUrl || !ktpPhotoUrl) {
        throw new Error("Failed to upload photos");
      }

      const { error: insertError } = await supabase
        .from('global_verifications')
        .insert({
          user_id: user.id,
          live_photo_url: livePhotoUrl,
          ktp_photo_url: ktpPhotoUrl
        });

      if (insertError) throw insertError;

      await checkAuth(); // Update user.is_verified
      navigate(`/course/${courseId}/assessment/${assessmentId}`);
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  if (user?.is_verified) {
    if (attemptsInfo !== null) {
      if (attemptsInfo.passed) {
        return (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Assessment Passed</h2>
              <p className="text-gray-600 mb-6">You have already successfully passed this assessment.</p>
              <button onClick={() => navigate(`/course/${courseId}`)} className="w-full py-3 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700">
                Back to Course
              </button>
            </div>
          </div>
        );
      }
      if (attemptsInfo.count >= 3) {
        return (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Maximum Attempts Reached</h2>
              <p className="text-gray-600 mb-6">You have reached the maximum number of attempts (3) for this assessment.</p>
              <button onClick={() => navigate(`/course/${courseId}`)} className="w-full py-3 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700">
                Back to Course
              </button>
            </div>
          </div>
        );
      }
    }
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Redirecting to assessment...</div>;
  }

  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-indigo-600 px-8 py-6 text-white">
          <h1 className="text-2xl font-bold">Identity Verification</h1>
          <p className="mt-2 text-indigo-100">Please verify your identity before starting the assessment.</p>
        </div>

        <div className="p-8 space-y-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          {/* User Info Confirmation */}
          <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500">Full Name</label>
                <div className="mt-1 text-gray-900 font-medium">{user?.name}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Identity Number</label>
                <div className="mt-1 text-gray-900 font-medium">{user?.identity}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Live Photo Capture */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Camera className="w-5 h-5 text-indigo-600" /> 1. Live Photo
              </h3>
              <div className="aspect-video bg-gray-100 rounded-xl overflow-hidden relative border-2 border-dashed border-gray-300">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  screenshotQuality={0.8}
                  className={`w-full h-full object-cover ${livePhoto ? 'hidden' : 'block'}`}
                  videoConstraints={{ facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }}
                />
                {livePhoto && (
                  <img src={livePhoto} alt="Live capture" className="w-full h-full object-cover absolute inset-0 z-10" />
                )}
              </div>
              <button
                onClick={livePhoto ? () => setLivePhoto(null) : capture}
                className="w-full py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {livePhoto ? "Retake Photo" : "Capture Photo"}
              </button>
            </div>

            {/* KTP Upload */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" /> 2. ID Card (KTP)
              </h3>
              <div className="aspect-video bg-gray-100 rounded-xl overflow-hidden relative border-2 border-dashed border-gray-300 flex items-center justify-center">
                {ktpPhoto ? (
                  <img src={ktpPhoto} alt="KTP" className="w-full h-full object-contain bg-white" />
                ) : (
                  <div className="text-center p-6">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="mt-4 flex text-sm text-gray-600 justify-center">
                      <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500 px-3 py-2 border border-gray-300 shadow-sm">
                        <span>Upload a file</span>
                        <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={handleKtpUpload} />
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">PNG, JPG up to 5MB</p>
                  </div>
                )}
              </div>
              {ktpPhoto && (
                <button
                  onClick={() => setKtpPhoto(null)}
                  className="w-full py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Remove ID
                </button>
              )}
            </div>
          </div>

          <div className="pt-6 border-t border-gray-200 flex justify-end gap-4">
            <button
              onClick={() => navigate(`/course/${courseId}`)}
              className="px-6 py-2.5 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!livePhoto || !ktpPhoto || loading}
              className="px-6 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? "Verifying..." : <><CheckCircle className="w-5 h-5" /> Start Assessment</>}
            </button>
          </div>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
