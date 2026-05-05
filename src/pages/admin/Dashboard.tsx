import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../../store/authStore";
import { LogOut, Book, Video, FileText, Plus, Users, CheckCircle, XCircle, X, Trash2, Download, Upload, Copy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../../lib/supabase";

export default function AdminDashboard() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(user?.role === "admin2" ? "reports-final" : "courses");
  const [courses, setCourses] = useState<any[]>([]);
  const [videoReports, setVideoReports] = useState<any[]>([]);
  const [assessmentReports, setAssessmentReports] = useState<any[]>([]);
  const [finalReports, setFinalReports] = useState<any[]>([]);
  
  // Add Course Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseDesc, setNewCourseDesc] = useState("");
  const [newCourseMaterialLink, setNewCourseMaterialLink] = useState("");
  const [newCourseCategory, setNewCourseCategory] = useState("DIKLAT KETRAMPILAN (SHORT COURSE)");

  // Edit Course Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editCourseId, setEditCourseId] = useState("");
  const [editCourseName, setEditCourseName] = useState("");
  const [editCourseDesc, setEditCourseDesc] = useState("");
  const [editCourseMaterialLink, setEditCourseMaterialLink] = useState("");
  const [editCourseCategory, setEditCourseCategory] = useState("DIKLAT KETRAMPILAN (SHORT COURSE)");

  // Manage Content Modal State
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [materialLink, setMaterialLink] = useState("");
  const [isSavingMaterial, setIsSavingMaterial] = useState(false);
  const [refreshingPeriods, setRefreshingPeriods] = useState<any[]>([]);
  const [newPeriodStart, setNewPeriodStart] = useState("");
  const [newPeriodEnd, setNewPeriodEnd] = useState("");
  const [isSavingPeriods, setIsSavingPeriods] = useState(false);
  const [assessmentQuestions, setAssessmentQuestions] = useState<any[]>([]);
  const [isViewingQuestions, setIsViewingQuestions] = useState(false);
  const [newVideoTitle, setNewVideoTitle] = useState("");
  const [newVideoDesc, setNewVideoDesc] = useState("");
  const [newVideoYoutubeId, setNewVideoYoutubeId] = useState("");
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  // Assessment State
  const [isCreatingAssessment, setIsCreatingAssessment] = useState(false);
  const [creatingAssessmentForVideoId, setCreatingAssessmentForVideoId] = useState<string | null>(null);
  const [isMandatory, setIsMandatory] = useState(true);
  const [isStrictMode, setIsStrictMode] = useState(false);
  const [isRandomized, setIsRandomized] = useState(false);
  const [showOneByOne, setShowOneByOne] = useState(false);
  const [preventCopypaste, setPreventCopypaste] = useState(false);
  const [preventSplitScreen, setPreventSplitScreen] = useState(false);
  const [uploadingAssessmentId, setUploadingAssessmentId] = useState<string | null>(null);
  const [viewingQuestionsForAssessmentId, setViewingQuestionsForAssessmentId] = useState<string | null>(null);
  const [passingGrade, setPassingGrade] = useState(70);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [audioLink, setAudioLink] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [filterCategory, setFilterCategory] = useState("");
  const [filterCourseId, setFilterCourseId] = useState("");
  const [filterPeriodStart, setFilterPeriodStart] = useState("");
  const [filterPeriodEnd, setFilterPeriodEnd] = useState("");
  const [filterClassName, setFilterClassName] = useState("");
  const [filterActivityStart, setFilterActivityStart] = useState("");
  const [filterActivityEnd, setFilterActivityEnd] = useState("");

  // Photo Modal State
  const [photoModalData, setPhotoModalData] = useState<{live: string | null, initial: string | null, ktp: string | null, attendances: string[]} | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isLoadingReports, setIsLoadingReports] = useState(false);

  const getBase64ImageFromUrl = async (imageUrl: string) => {
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("Failed to load image", e);
      return null;
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    const { data: coursesData } = await supabase
      .from('courses')
      .select(`
        *,
        videos (*),
        assessments (*)
      `)
      .order('created_at', { ascending: false })
      .limit(10000);
    
    if (coursesData) {
      const formatted = coursesData.map(c => ({
        ...c,
        assessments: c.assessments || []
      }));
      setCourses(formatted);
    }
  };

  const fetchReports = async () => {
    setIsLoadingReports(true);
    try {
      // Build queries with filters
      let vpQuery = supabase
        .from('video_progress')
        .select(`*, users!inner(full_name, identity_number, class_name), courses!inner(name, category), videos(title)`)
        .order('created_at', { ascending: false });
      
    let arQuery = supabase
      .from('assessment_results')
      .select(`*, users!inner(full_name, identity_number, class_name, global_verifications(live_photo_url, ktp_photo_url, created_at)), courses!inner(name, category)`)
      .order('created_at', { ascending: false });
      
    let enrollQuery = supabase
      .from('enrollments')
      .select(`*, users!inner(id, full_name, identity_number, class_name, global_verifications(live_photo_url, ktp_photo_url, created_at)), courses!inner(id, name, category)`)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filterCourseId) {
      vpQuery = vpQuery.eq('course_id', filterCourseId);
      arQuery = arQuery.eq('course_id', filterCourseId);
      enrollQuery = enrollQuery.eq('course_id', filterCourseId);
    }
    
    if (filterCategory) {
      let targetCategory = filterCategory === 'REFRESING' ? 'DIKLAT KETRAMPILAN (SHORT COURSE)' : filterCategory;
      vpQuery = vpQuery.eq('courses.category', targetCategory);
      arQuery = arQuery.eq('courses.category', targetCategory);
      enrollQuery = enrollQuery.eq('courses.category', targetCategory);
      
      // For refreshing, we also narrow enrollments by their enrollment category
      if (filterCategory === 'REFRESING') {
        enrollQuery = enrollQuery.eq('category', 'REFRESING');
        // We also need to filter video/assessment progress by the fact that the user enrolled as 'REFRESING'?
        // Wait, video_progress doesn't have enrollment_id. But enrollQuery acts as the master list.
      }
    }
    
    if (filterClassName) {
      vpQuery = vpQuery.eq('users.class_name', filterClassName);
      arQuery = arQuery.eq('users.class_name', filterClassName);
      enrollQuery = enrollQuery.eq('users.class_name', filterClassName);
    }
    if (filterPeriodStart) {
      enrollQuery = enrollQuery.gte('period_start', filterPeriodStart);
    }
    if (filterPeriodEnd) {
      enrollQuery = enrollQuery.lte('period_end', filterPeriodEnd);
    }
    // We no longer filter by filterDate in the Supabase query to ensure we get all users
    // and then filter in memory based on any activity (enrollment, video, assessment, attendance) on that date.

    // Helper function to fetch all rows with pagination
    const fetchAll = async (queryBuilder: any) => {
      let allData: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await queryBuilder.range(from, from + step - 1);
        if (error) {
          console.error("Error fetching data:", error);
          break;
        }
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += step;
          if (data.length < step) hasMore = false;
        } else {
          hasMore = false;
        }
      }
      return allData;
    };

    const assessmentsQuery = supabase.from('assessments').select('*');
    const [vpData, arData, enrollData, assessmentsData] = await Promise.all([
      fetchAll(vpQuery),
      fetchAll(arQuery),
      fetchAll(enrollQuery),
      fetchAll(assessmentsQuery)
    ]);
    
    // Fetch total videos per course to calculate accurate percentage
    const { data: allVideos } = await supabase.from('videos').select('id, title, course_id, order_num').order('order_num', { ascending: true }).limit(10000);
    const videoCountByCourse: Record<string, number> = {};
    if (allVideos) {
      allVideos.forEach(v => {
        videoCountByCourse[v.course_id] = (videoCountByCourse[v.course_id] || 0) + 1;
      });
    }

    if (enrollData) {
      const safeVpData = vpData || [];
      const safeArData = arData || [];
      const finalReps = enrollData.map((en: any) => {
        const userVp = safeVpData.filter((vp: any) => vp.user_id === en.user_id && vp.course_id === en.course_id);
        const userAr = safeArData.filter((ar: any) => ar.user_id === en.user_id && ar.course_id === en.course_id);
        
        const finalAssessment = assessmentsData?.find((a: any) => a.course_id === en.course_id && !a.video_id);
        
        let bestScore = null;
        let passed = false;
        let detailedScores = '';
        let detailedStatuses = '';
        
        // Group assessment results by assessment_id
        const resultsByAssessment = new Map();
        userAr.forEach((ar: any) => {
          if (!resultsByAssessment.has(ar.assessment_id)) {
            resultsByAssessment.set(ar.assessment_id, []);
          }
          resultsByAssessment.get(ar.assessment_id).push(ar);
        });

        // Format detailed scores and statuses
        const scoreLines: string[] = [];
        const statusLines: string[] = [];

        resultsByAssessment.forEach((results, assessmentId) => {
          // Sort results by created_at to get attempts in order
          results.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          
          const assessment = assessmentsData?.find((a: any) => a.id === assessmentId);
          let label = 'Unknown Assessment';
          if (assessment) {
            if (assessment.video_id) {
              const video = allVideos?.find(v => v.id === assessment.video_id);
              label = video ? `Ass. Part ${video.order_num}` : 'Video Assessment';
            } else {
              label = 'Final Ass.';
            }
          }

          const scores = results.map((r: any) => {
            const warningsInfo = r.warnings && r.warnings > 0 ? ` [Cheating: ${r.warnings}x]` : '';
            return `${Math.round(r.score)}${warningsInfo}`;
          }).join(' / ');
          scoreLines.push(`${label}: ${scores}`);

          const statuses = results.map((r: any) => {
            const color = r.passed ? 'text-green-600' : 'text-red-600';
            const warningsInfo = r.warnings && r.warnings > 0 ? `<span class="text-orange-600 text-xs ml-1" title="Pelanggaran Strict Mode">(! ${r.warnings}x)</span>` : '';
            return `<span class="${color}">${Math.round(r.score)}</span>${warningsInfo}`;
          }).join(' | ');
          const finalPassed = results.some((r: any) => r.passed);
          statusLines.push(`${label}: ${statuses} (${finalPassed ? 'LULUS' : 'NGULANG'})`);
        });

        detailedScores = scoreLines.join('\n');
        detailedStatuses = statusLines.join('<br/>');
        
        if (finalAssessment) {
          const finalResults = userAr.filter((a: any) => a.assessment_id === finalAssessment.id);
          bestScore = finalResults.length > 0 ? Math.max(...finalResults.map((a: any) => a.score)) : null;
          passed = finalResults.some((a: any) => a.passed);
        } else {
          bestScore = userAr.length > 0 ? Math.max(...userAr.map((a: any) => a.score)) : null;
          passed = userAr.some((a: any) => a.passed);
        }
        const uniqueUserVpMap = new Map();
        userVp.forEach((vp: any) => {
          const existing = uniqueUserVpMap.get(vp.video_id);
          if (!existing || (vp.progress_percentage || 0) > (existing.progress_percentage || 0)) {
            uniqueUserVpMap.set(vp.video_id, vp);
          }
        });
        const uniqueUserVp = Array.from(uniqueUserVpMap.values());

        const courseVideos = allVideos?.filter(v => v.course_id === en.course_id) || [];
        const videoBreakdown = courseVideos.map(v => {
          const vp = uniqueUserVpMap.get(v.id);
          const pct = vp ? (vp.progress_percentage || (vp.completed ? 100 : 0)) : 0;
          const isCompleted = vp ? (vp.completed || (vp.progress_percentage || 0) >= 90) : false;
          return `Part ${v.order_num}: ${Math.round(pct)}% ${isCompleted ? '(Selesai)' : ''}`;
        }).join('\n');

        const totalVideosForCourse = courseVideos.length;
        const totalProgressSum = courseVideos.reduce((acc: number, v: any) => {
          const vp = uniqueUserVpMap.get(v.id);
          if (!vp) return acc;
          const isCompleted = vp.completed || (vp.progress_percentage || 0) >= 90;
          return acc + (isCompleted ? 100 : (vp.progress_percentage || 0));
        }, 0);
        
        const avgVideo = totalVideosForCourse > 0 ? totalProgressSum / totalVideosForCourse : 0;
        
        const gvs = en.users?.global_verifications || [];
        const sortedGvs = Array.isArray(gvs) ? [...gvs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) : [];
        const gv = sortedGvs[0] || gvs;
        const oldestGv = sortedGvs[sortedGvs.length - 1] || gv;

        const activityDates = new Set<string>();
        if (en.created_at) activityDates.add(en.created_at.split('T')[0]);
        userVp.forEach((vp: any) => {
          if (vp.created_at) activityDates.add(vp.created_at.split('T')[0]);
        });
        userAr.forEach((ar: any) => {
          if (ar.created_at) activityDates.add(ar.created_at.split('T')[0]);
        });

        return {
          full_name: en.users?.full_name,
          identity_number: en.users?.identity_number,
          class_name: en.users?.class_name || '-',
          course_name: en.courses?.name,
          course_id: en.course_id,
          user_id: en.user_id, // Important to keep for async matching
          period_start: en.period_start,
          period_end: en.period_end,
          created_at: en.created_at,
          activity_dates: Array.from(activityDates),
          avg_video_progress: avgVideo,
          video_breakdown: videoBreakdown || 'No videos',
          final_score: bestScore,
          detailed_scores: detailedScores,
          detailed_statuses: detailedStatuses,
          assessment_status: bestScore !== null ? (passed ? 'LULUS' : 'TIDAK LULUS') : null,
          assignment_link: en.assignment_link,
          live_photo_data: gv?.live_photo_url,
          initial_photo_data: oldestGv?.live_photo_url,
          ktp_photo_data: gv?.ktp_photo_url || oldestGv?.ktp_photo_url,
          attendance_photos: [] // Will fetch async
        };
      });
      setFinalReports(finalReps);
      setVideoReports(finalReps);
      setAssessmentReports(finalReps);
      
      // Fetch attendances asynchronously to prevent blocking the UI
      fetchAttendancesAsync(finalReps);
    }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingReports(false);
    }
  };

  const fetchAttendancesAsync = async (currentReps: any[]) => {
    try {
      const { data: allFiles } = await supabase.storage.from('verifications').list('', { 
        limit: 10000,
        sortBy: { column: 'created_at', order: 'desc' }
      });
      const allAttendances = allFiles?.filter(f => f.name.includes('_login_attendance_')) || [];
      if (allAttendances.length === 0) return;

      const attendanceMap: Record<string, string[]> = {};
      allAttendances.sort((a, b) => a.name.localeCompare(b.name));
      allAttendances.forEach(file => {
        const parts = file.name.split('_');
        if (parts.length >= 2) {
          const userId = parts[0];
          if (!attendanceMap[userId]) attendanceMap[userId] = [];
          
          const { data: publicUrlData } = supabase.storage.from('verifications').getPublicUrl(file.name);
          attendanceMap[userId].push(publicUrlData.publicUrl);
        }
      });

      const updatedReps = currentReps.map(rep => {
        const attendanceKey = rep.user_id;
        const userAttendances = allAttendances?.filter(f => f.name.startsWith(`${rep.user_id}_login_attendance_`)) || [];
        const activityDates = new Set<string>(rep.activity_dates);
        userAttendances.forEach(f => {
          if (f.created_at) activityDates.add(f.created_at.split('T')[0]);
        });

        return {
          ...rep,
          attendance_photos: attendanceMap[attendanceKey] || [],
          activity_dates: Array.from(activityDates)
        };
      });

      setFinalReports(updatedReps);
      setVideoReports(updatedReps);
      setAssessmentReports(updatedReps);
    } catch (err) {
      console.error("Failed to load attendance photos in background", err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase
      .from('courses')
      .insert([{ 
        name: newCourseName, 
        description: newCourseDesc, 
        material_link: newCourseMaterialLink,
        category: newCourseCategory,
        status: 'active' 
      }]);

    if (!error) {
      setIsAddModalOpen(false);
      setNewCourseName("");
      setNewCourseDesc("");
      setNewCourseMaterialLink("");
      setNewCourseCategory("DIKLAT KETRAMPILAN (SHORT COURSE)");
      fetchCourses();
    } else {
      alert("Failed to create course. Pastikan Anda sudah menambahkan kolom 'category' di database (lihat instruksi SQL).");
    }
  };

  const openEditModal = (course: any) => {
    setEditCourseId(course.id);
    setEditCourseName(course.name);
    setEditCourseDesc(course.description || "");
    setEditCourseMaterialLink(course.material_link || "");
    setEditCourseCategory(course.category || "DIKLAT KETRAMPILAN (SHORT COURSE)");
    setIsEditModalOpen(true);
  };

  const handleEditCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase
      .from('courses')
      .update({ 
        name: editCourseName, 
        description: editCourseDesc, 
        material_link: editCourseMaterialLink,
        category: editCourseCategory
      })
      .eq('id', editCourseId);

    if (!error) {
      setIsEditModalOpen(false);
      fetchCourses();
    } else {
      alert("Failed to update course.");
    }
  };

  const openManageModal = async (course: any) => {
    setSelectedCourse(course);
    setMaterialLink(course.material_link || "");
    setRefreshingPeriods(course.refreshing_periods || []);
    setIsManageModalOpen(true);
    setIsViewingQuestions(false);
    setAssessmentQuestions([]);
  };

  const handleSaveMaterialLink = async () => {
    if (!selectedCourse) return;
    setIsSavingMaterial(true);
    const { error } = await supabase
      .from('courses')
      .update({ material_link: materialLink })
      .eq('id', selectedCourse.id);

    if (!error) {
      alert("Material link saved successfully");
      fetchCourses();
      setSelectedCourse(prev => ({ ...prev, material_link: materialLink }));
    } else {
      console.error(error);
      alert("Failed to save material link. Check if 'material_link' column exists in 'courses' table.");
    }
    setIsSavingMaterial(false);
  };

  const handleAddPeriod = async () => {
    if (!newPeriodStart || !newPeriodEnd) return;
    const newPeriods = [...refreshingPeriods, { start: newPeriodStart, end: newPeriodEnd }];
    await saveRefreshingPeriods(newPeriods);
    setNewPeriodStart("");
    setNewPeriodEnd("");
  };

  const handleRemovePeriod = async (index: number) => {
    const newPeriods = refreshingPeriods.filter((_, i) => i !== index);
    await saveRefreshingPeriods(newPeriods);
  };

  const saveRefreshingPeriods = async (periods: any[]) => {
    if (!selectedCourse) return;
    setIsSavingPeriods(true);
    const { error } = await supabase
      .from('courses')
      .update({ refreshing_periods: periods })
      .eq('id', selectedCourse.id);
      
    if (!error) {
      setRefreshingPeriods(periods);
      fetchCourses();
    } else {
      console.error(error);
      alert(`Gagal menyimpan periode. Pastikan kolom refreshing_periods (tipe jsonb) sudah ditambahkan di tabel courses. Error: ${error.message}`);
    }
    setIsSavingPeriods(false);
  };

  const handleCopyRefreshingLink = async () => {
    if (!selectedCourse) return;
    const url = `${window.location.origin}/login?category=REFRESING&course=${selectedCourse.id}`;
    try {
      await navigator.clipboard.writeText(url);
      alert('Link pendaftaran khusus Refresing berhasil disalin!\n' + url);
    } catch(err) {
      console.error('Failed to copy', err);
      alert('Gagal menyalin link: ' + url);
    }
  };

  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;

    let youtubeId = newVideoYoutubeId;
    if (youtubeId.includes("v=")) {
      youtubeId = youtubeId.split("v=")[1].split("&")[0];
    } else if (youtubeId.includes("youtu.be/")) {
      youtubeId = youtubeId.split("youtu.be/")[1].split("?")[0];
    }

    const { error } = await supabase
      .from('videos')
      .insert([{
        course_id: selectedCourse.id,
        title: newVideoTitle,
        description: newVideoDesc,
        youtube_id: youtubeId,
        order_num: (selectedCourse.videos?.length || 0) + 1
      }]);

    if (!error) {
      setNewVideoTitle("");
      setNewVideoDesc("");
      setNewVideoYoutubeId("");
      fetchCourses();
      
      const { data } = await supabase
        .from('courses')
        .select('*, videos(*), assessments(*)')
        .eq('id', selectedCourse.id)
        .single();
        
      if (data) {
        setSelectedCourse({ ...data, assessments: data.assessments || [] });
      }
    } else {
      alert("Failed to add video");
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    const { error } = await supabase
      .from('videos')
      .delete()
      .eq('id', videoId);
      
    if (!error) {
      fetchCourses();
      // Update selected course locally
      setSelectedCourse((prev: any) => ({
        ...prev,
        videos: prev.videos.filter((v: any) => v.id !== videoId)
      }));
      setDeletingVideoId(null);
    } else {
      alert("Gagal menghapus video");
    }
  };

  const handleToggleVideoRefreshing = async (videoId: string, currentValue: boolean) => {
    const { error } = await supabase
      .from('videos')
      .update({ is_refreshing: !currentValue })
      .eq('id', videoId);
    
    if (!error) {
      fetchCourses();
      setSelectedCourse((prev: any) => ({
        ...prev,
        videos: prev.videos.map((v: any) => v.id === videoId ? { ...v, is_refreshing: !currentValue } : v)
      }));
    } else {
      console.error(error);
      alert(`Gagal memperbarui status refresing video. Pastikan kolom is_refreshing sudah ditambahkan di tabel videos. Error: ${error.message}`);
    }
  };

  const handleToggleAssessmentRefreshing = async (assessmentId: string, currentValue: boolean) => {
    const { error } = await supabase
      .from('assessments')
      .update({ is_refreshing: !currentValue })
      .eq('id', assessmentId);
    
    if (!error) {
      fetchCourses();
      setSelectedCourse((prev: any) => ({
        ...prev,
        assessments: prev.assessments.map((a: any) => a.id === assessmentId ? { ...a, is_refreshing: !currentValue } : a)
      }));
    } else {
      console.error(error);
      alert(`Gagal memperbarui status refresing assessment. Pastikan kolom is_refreshing sudah ditambahkan di tabel assessments. Error: ${error.message}`);
    }
  };

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;

    const payload: any = {
      course_id: selectedCourse.id,
      video_id: creatingAssessmentForVideoId,
      passing_score: passingGrade,
      duration_minutes: durationMinutes,
      is_mandatory: isMandatory,
      is_strict_mode: isStrictMode,
      is_randomized: isRandomized,
      show_one_by_one: showOneByOne,
      prevent_copypaste: preventCopypaste,
      prevent_split_screen: preventSplitScreen
    };
    
    if (audioLink) {
      payload.audio_link = audioLink;
    }

    const { error } = await supabase
      .from('assessments')
      .insert([payload]);

    if (!error) {
      setIsCreatingAssessment(false);
      setCreatingAssessmentForVideoId(null);
      setAudioLink("");
      fetchCourses();
      const { data } = await supabase
        .from('courses')
        .select('*, videos(*), assessments(*)')
        .eq('id', selectedCourse.id)
        .single();
        
      if (data) {
        setSelectedCourse({ ...data, assessments: data.assessments || [] });
      }
    } else {
      alert("Failed to create assessment");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingAssessmentId) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const questions = results.data.map((row: any, idx: number) => {
          const options = [row.option_a, row.option_b, row.option_c, row.option_d].filter(Boolean);
          const correctAns = row[`option_${row.correct_answer?.toLowerCase()}`] || row.option_a;
          const correctIdx = options.indexOf(correctAns);
          
          return {
            assessment_id: uploadingAssessmentId,
            question_text: row.question,
            options: options,
            correct_option_index: correctIdx >= 0 ? correctIdx : 0,
            order_num: idx + 1
          };
        });

        const { error } = await supabase
          .from('questions')
          .insert(questions);

        if (!error) {
          alert("Questions imported successfully!");
          if (fileInputRef.current) fileInputRef.current.value = "";
          
          // Fetch updated questions
          const { data } = await supabase
            .from('questions')
            .select('*')
            .eq('assessment_id', uploadingAssessmentId)
            .order('order_num', { ascending: true });
          setAssessmentQuestions(data || []);
        } else {
          alert("Failed to import questions.");
          console.error(error);
        }
      }
    });
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm("Are you sure you want to delete this question?")) return;
    
    const { error } = await supabase
      .from('questions')
      .delete()
      .eq('id', questionId);
      
    if (!error) {
      setAssessmentQuestions(prev => prev.filter(q => q.id !== questionId));
    } else {
      alert("Failed to delete question");
      console.error(error);
    }
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,question,option_a,option_b,option_c,option_d,correct_answer,weight\nApa ibukota Indonesia?,Jakarta,Bandung,Surabaya,Medan,a,1\nBerapa 5+5?,8,9,10,11,c,1";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "assessment_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filterReports = (reports: any[]) => {
    return reports.filter(r => {
      if (filterCourseId && r.course_id !== filterCourseId) return false;
      if (filterClassName && r.class_name !== filterClassName) return false;
      if (filterPeriodStart && r.period_start && r.period_start < filterPeriodStart) return false;
      if (filterPeriodEnd && r.period_end && r.period_end > filterPeriodEnd) return false;
      
      if (filterActivityStart || filterActivityEnd) {
        if (!r.activity_dates || r.activity_dates.length === 0) return false;
        
        const hasActivityInRange = r.activity_dates.some((d: string) => {
          let isAfterStart = true;
          let isBeforeEnd = true;
          if (filterActivityStart) isAfterStart = d >= filterActivityStart;
          if (filterActivityEnd) isBeforeEnd = d <= filterActivityEnd;
          return isAfterStart && isBeforeEnd;
        });
        
        if (!hasActivityInRange) return false;
      }
      
      return true;
    }).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  };

  const downloadPDF = async (type: 'video' | 'assessment' | 'final') => {
    setIsGeneratingPDF(true);
    try {
      const doc = new jsPDF('landscape');
      let title = 'Report';
      if (type === 'video') title = 'Video Progress Report';
      if (type === 'assessment') title = 'Assessment Report';
      if (type === 'final') title = 'Final Report';
      
      doc.setFontSize(18);
      doc.text(title, 14, 22);
      
      doc.setFontSize(11);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

      const filtered = filterReports(type === 'video' ? videoReports : type === 'assessment' ? assessmentReports : finalReports);

      if (type === 'video') {
        autoTable(doc, {
          startY: 40,
          head: [['Name', 'Kode Pelaut', 'Course', 'Periode Diklat', 'Video Progress', 'Progress', 'Status']],
          body: filtered.map(r => [
            r.full_name,
            r.identity_number,
            r.course_name,
            `${r.period_start ? new Date(r.period_start).toLocaleDateString() : '-'} s/d ${r.period_end ? new Date(r.period_end).toLocaleDateString() : '-'}`,
            r.video_breakdown,
            `${Math.round(r.avg_video_progress)}%`,
            r.avg_video_progress >= 90 ? 'Completed' : 'In Progress'
          ]),
        });
      } else if (type === 'assessment') {
        autoTable(doc, {
          startY: 40,
          head: [['Name', 'Kode Pelaut', 'Course', 'Periode Diklat', 'Score', 'Status', 'Attempt']],
          body: filtered.map(r => [
            r.full_name,
            r.identity_number,
            r.course_name,
            `${r.period_start ? new Date(r.period_start).toLocaleDateString() : '-'} s/d ${r.period_end ? new Date(r.period_end).toLocaleDateString() : '-'}`,
            r.detailed_scores || (r.final_score !== null ? Math.round(r.final_score).toString() : '-'),
            r.detailed_statuses ? r.detailed_statuses.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>?/gm, '') : (r.assessment_status || 'BELUM MENGERJAKAN'),
            r.final_score !== null ? '#1' : '#0'
          ]),
          styles: { cellPadding: 2, overflow: 'linebreak', minCellHeight: 15 },
        });
      } else {
        const imagesMap = new Map();
        const bodyData = [];
        
        for (let i = 0; i < filtered.length; i++) {
          const r = filtered[i];
          const latestAttendancePhoto = r.attendance_photos && r.attendance_photos.length > 0 ? r.attendance_photos[r.attendance_photos.length - 1] : null;
          const livePhotoToUse = latestAttendancePhoto || r.live_photo_data;
          
          const initialPhotoToUse = r.initial_photo_data || r.live_photo_data;

          const liveB64 = livePhotoToUse ? await getBase64ImageFromUrl(livePhotoToUse) : null;
          const initialB64 = initialPhotoToUse ? await getBase64ImageFromUrl(initialPhotoToUse) : null;
          const ktpB64 = r.ktp_photo_data ? await getBase64ImageFromUrl(r.ktp_photo_data) : null;
          
          imagesMap.set(i, { live: liveB64, initial: initialB64, ktp: ktpB64 });
          
          bodyData.push([
            r.full_name + '\n' + r.identity_number,
            r.class_name || '-',
            r.course_name,
            `${r.period_start ? new Date(r.period_start).toLocaleDateString() : '-'} s/d ${r.period_end ? new Date(r.period_end).toLocaleDateString() : '-'}`,
            r.video_breakdown || `${Math.round(r.avg_video_progress || 0)}%`,
            r.detailed_scores || (r.final_score != null ? Math.round(r.final_score).toString() : '-'),
            r.detailed_statuses ? r.detailed_statuses.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>?/gm, '') : (r.assessment_status || '-'), // Status (Foto Awal)
            '', // Live Photo (Foto Akhir) placeholder
            ''  // KTP placeholder
          ]);
        }

        autoTable(doc, {
          startY: 40,
          head: [['User', 'Kelas', 'Course', 'Periode', 'Video', 'Score', 'Status\n(Foto Awal)', 'Live Photo\n(Terbaru)', 'KTP']],
          body: bodyData,
          styles: { cellPadding: 2, overflow: 'linebreak', minCellHeight: 25 },
          columnStyles: {
            6: { cellWidth: 25 }, // Status (Initial Photo)
            7: { cellWidth: 25 }, // Live Photo (Latest Photo)
            8: { cellWidth: 35 }  // KTP
          },
          didDrawCell: (data) => {
            if (data.section === 'body') {
              const imgs = imagesMap.get(data.row.index);
              if (data.column.index === 6 && imgs?.initial) {
                doc.addImage(imgs.initial, 'JPEG', data.cell.x + 2, data.cell.y + 8, 20, 16);
              }
              if (data.column.index === 7 && imgs?.live) {
                doc.addImage(imgs.live, 'JPEG', data.cell.x + 2, data.cell.y + 2, 20, 16);
              }
              if (data.column.index === 8 && imgs?.ktp) {
                doc.addImage(imgs.ktp, 'JPEG', data.cell.x + 2, data.cell.y + 2, 30, 16);
              }
            }
          }
        });
      }

      // Add Signature Area
      const finalY = (doc as any).lastAutoTable.finalY || 40;
      doc.text("Mengetahui,", 140, finalY + 30);
      doc.text("Admin LMS", 140, finalY + 60);
      doc.line(140, finalY + 62, 190, finalY + 62);

      doc.save(`${title.toLowerCase().replace(/ /g, '_')}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const downloadExcel = async (type: 'video' | 'assessment' | 'final') => {
    setIsGeneratingPDF(true); // Reuse loading state
    try {
      // Dynamic import to keep bundle small if not used
      const ExcelJS = (await import('exceljs')).default;
      const fileSaver = await import('file-saver');
      const saveAs = fileSaver.default?.saveAs || fileSaver.saveAs || fileSaver.default;
      
      const workbook = new ExcelJS.Workbook();
      let sheetName = 'Final Report';
      if (type === 'video') sheetName = 'Video Reports';
      if (type === 'assessment') sheetName = 'Assessment Reports';
      
      const worksheet = workbook.addWorksheet(sheetName);
      
      const filtered = filterReports(type === 'video' ? videoReports : type === 'assessment' ? assessmentReports : finalReports);
      const maxAttendances = Math.max(...filtered.map(r => (r.attendance_photos || []).length), 0);

      // Add Headers
      let columns: any[] = [];
      
      if (type === 'video') {
        columns = [
          { header: 'No', key: 'no', width: 5 },
          { header: 'Nama Lengkap', key: 'name', width: 25 },
          { header: 'Kode Pelaut', key: 'nik', width: 20 },
          { header: 'Periode Diklat', key: 'period', width: 25 },
          { header: 'Pelatihan', key: 'course', width: 25 },
          { header: 'Video Progress', key: 'video', width: 40 },
          { header: 'Progress (%)', key: 'progress', width: 15 },
          { header: 'Status', key: 'status', width: 15 }
        ];
      } else if (type === 'assessment') {
        columns = [
          { header: 'No', key: 'no', width: 5 },
          { header: 'Nama Lengkap', key: 'name', width: 25 },
          { header: 'Kode Pelaut', key: 'nik', width: 20 },
          { header: 'Periode Diklat', key: 'period', width: 25 },
          { header: 'Pelatihan', key: 'course', width: 25 },
          { header: 'Nilai Assessment', key: 'score', width: 15 },
          { header: 'Status', key: 'status', width: 15 },
          { header: 'Attempt', key: 'attempt', width: 10 },
          { header: 'Foto Live', key: 'live', width: 20 },
          { header: 'Foto KTP', key: 'ktp', width: 30 }
        ];
        for (let j = 0; j < maxAttendances; j++) {
          columns.push({ header: `Kehadiran ${j+1}`, key: `att_${j}`, width: 20 });
        }
      } else {
        columns = [
          { header: 'No', key: 'no', width: 5 },
          { header: 'Nama Lengkap', key: 'name', width: 25 },
          { header: 'Kode Pelaut', key: 'nik', width: 20 },
          { header: 'Kelas', key: 'kelas', width: 15 },
          { header: 'Periode Diklat', key: 'period', width: 25 },
          { header: 'Pelatihan', key: 'course', width: 25 },
          { header: 'Video Progress', key: 'video', width: 40 },
          { header: 'Link Tugas', key: 'assignment_link', width: 30 },
          { header: 'Nilai Assessment', key: 'score', width: 15 },
          { header: 'Status / Foto Awal', key: 'status', width: 25 },
          { header: 'Foto Live (Terbaru)', key: 'live', width: 25 },
          { header: 'Foto KTP', key: 'ktp', width: 30 }
        ];
        for (let j = 0; j < maxAttendances; j++) {
          columns.push({ header: `Kehadiran ${j+1}`, key: `att_${j}`, width: 20 });
        }
      }
      
      worksheet.columns = columns;

      // Style Headers
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      for (let i = 0; i < filtered.length; i++) {
        const r = filtered[i];
        let rowData: any = {};
        
        if (type === 'video') {
          rowData = {
            no: i + 1,
            name: r.full_name,
            nik: r.identity_number,
            period: `${r.period_start ? new Date(r.period_start).toLocaleDateString() : '-'} s/d ${r.period_end ? new Date(r.period_end).toLocaleDateString() : '-'}`,
            course: r.course_name,
            video: r.video_breakdown || `${Math.round(r.avg_video_progress || 0)}%`,
            progress: `${Math.round(r.avg_video_progress || 0)}%`,
            status: r.avg_video_progress >= 90 ? 'Completed' : 'In Progress'
          };
        } else if (type === 'assessment') {
          rowData = {
            no: i + 1,
            name: r.full_name,
            nik: r.identity_number,
            period: `${r.period_start ? new Date(r.period_start).toLocaleDateString() : '-'} s/d ${r.period_end ? new Date(r.period_end).toLocaleDateString() : '-'}`,
            course: r.course_name,
            score: r.detailed_scores ? r.detailed_scores : (r.final_score != null ? Math.round(r.final_score) : '-'),
            status: r.detailed_statuses ? r.detailed_statuses.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ') : (r.assessment_status || 'BELUM MENGERJAKAN'),
            attempt: r.final_score != null ? '#1' : '#0'
          };
        } else {
          rowData = {
            no: i + 1,
            name: r.full_name,
            nik: r.identity_number,
            kelas: r.class_name,
            period: `${r.period_start ? new Date(r.period_start).toLocaleDateString() : '-'} s/d ${r.period_end ? new Date(r.period_end).toLocaleDateString() : '-'}`,
            course: r.course_name,
            video: r.video_breakdown || `${Math.round(r.avg_video_progress || 0)}%`,
            assignment_link: r.assignment_link || '-',
            score: r.detailed_scores ? r.detailed_scores : (r.final_score != null ? Math.round(r.final_score) : '-'),
            status: r.detailed_statuses ? r.detailed_statuses.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ') : (r.assessment_status || '-')
          };
        }
        
        const row = worksheet.addRow(rowData);

        // Make row tall enough for images if not video report
        if (type !== 'video') {
          row.height = 100;
          row.alignment = { vertical: 'top', wrapText: true };

          // Add Images if exist
          const latestAttendancePhoto = r.attendance_photos && r.attendance_photos.length > 0 ? r.attendance_photos[r.attendance_photos.length - 1] : null;
          const livePhotoToUse = latestAttendancePhoto || r.live_photo_data;
          
          const initialPhotoToUse = r.initial_photo_data || r.live_photo_data;

          if (initialPhotoToUse && type === 'final') {
            try {
              const initialB64 = await getBase64ImageFromUrl(initialPhotoToUse);
              if (initialB64) {
                const base64Data = initialB64.split(',')[1] || initialB64;
                const imageId = workbook.addImage({
                  base64: base64Data,
                  extension: 'jpeg',
                });
                worksheet.addImage(imageId, {
                  tl: { col: 9, row: i + 1 }, // Column 10 (0-indexed 9) is Status / Foto Awal
                  ext: { width: 100, height: 80 }
                });
              }
            } catch (e) {
              console.error("Failed to add initial photo to excel", e);
            }
          }
          
          if (livePhotoToUse) {
            try {
              const liveB64 = await getBase64ImageFromUrl(livePhotoToUse);
              if (liveB64) {
                const base64Data = liveB64.split(',')[1] || liveB64;
                const imageId = workbook.addImage({
                  base64: base64Data,
                  extension: 'jpeg',
                });
                const colIndex = type === 'assessment' ? 8 : 10; // Column 11 (0-indexed 10) is Foto Live
                worksheet.addImage(imageId, {
                  tl: { col: colIndex, row: i + 1 },
                  ext: { width: 100, height: 80 }
                });
              }
            } catch (e) {
              console.error("Failed to add live photo to excel", e);
            }
          }

          if (r.ktp_photo_data) {
            try {
              const ktpB64 = await getBase64ImageFromUrl(r.ktp_photo_data);
              if (ktpB64) {
                const base64Data = ktpB64.split(',')[1] || ktpB64;
                const imageId = workbook.addImage({
                  base64: base64Data,
                  extension: 'jpeg',
                });
                const colIndex = type === 'assessment' ? 9 : 11; // Column 12 (0-indexed 11) is Foto KTP
                worksheet.addImage(imageId, {
                  tl: { col: colIndex, row: i + 1 },
                  ext: { width: 150, height: 80 }
                });
              }
            } catch (e) {
              console.error("Failed to add ktp photo to excel", e);
            }
          }

          if (r.attendance_photos && r.attendance_photos.length > 0) {
            for (let j = 0; j < r.attendance_photos.length; j++) {
              try {
                const attB64 = await getBase64ImageFromUrl(r.attendance_photos[j]);
                if (attB64) {
                  const base64Data = attB64.split(',')[1] || attB64;
                  const imageId = workbook.addImage({
                    base64: base64Data,
                    extension: 'jpeg',
                  });
                  const colIndex = type === 'assessment' ? 8 + j : 11 + j;
                  worksheet.addImage(imageId, {
                    tl: { col: colIndex, row: i + 1 },
                    ext: { width: 100, height: 80 }
                  });
                }
              } catch (e) {
                console.error("Failed to add attendance photo to excel", e);
              }
            }
          }
        } else {
          row.alignment = { vertical: 'middle', wrapText: true };
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `${sheetName.replace(' ', '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);

    } catch (err: any) {
      console.error("Failed to generate Excel:", err);
      alert(`Failed to generate Excel: ${err.message || 'Unknown error'}`);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold text-indigo-600 flex items-center gap-2">
            <Book className="w-6 h-6" /> LMS Admin
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {user?.role !== "admin2" && (
            <button
              onClick={() => setActiveTab("courses")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left ${activeTab === "courses" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
            >
              <Book className="w-5 h-5" /> Courses
            </button>
          )}
          <button
            onClick={() => setActiveTab("reports-video")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left ${activeTab === "reports-video" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <Video className="w-5 h-5" /> Video Reports
          </button>
          <button
            onClick={() => setActiveTab("reports-assessment")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left ${activeTab === "reports-assessment" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <FileText className="w-5 h-5" /> Assessment Reports
          </button>
          <button
            onClick={() => setActiveTab("reports-final")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left ${activeTab === "reports-final" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <CheckCircle className="w-5 h-5" /> Final Reports
          </button>
        </nav>
        <div className="p-4 border-t">
          <div className="mb-4 px-4">
            <p className="text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-500">{user?.identity}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
          >
            <LogOut className="w-5 h-5" /> Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-auto">
        {activeTab === "courses" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Manage Courses</h2>
              <button 
                onClick={() => setIsAddModalOpen(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700"
              >
                <Plus className="w-5 h-5" /> Add Course
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map(course => (
                <div key={course.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-gray-900">{course.name}</h3>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2 py-1 text-xs rounded-full ${course.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {course.status}
                      </span>
                    </div>
                  </div>
                  <div className="mb-2">
                    <span className="inline-block px-2 py-1 text-[10px] font-semibold tracking-wider text-indigo-800 bg-indigo-100 rounded-full">
                      {course.category || 'DIKLAT KETRAMPILAN (SHORT COURSE)'}
                    </span>
                    {course.is_refreshing && (
                      <span className="inline-block ml-2 px-2 py-1 text-[10px] font-semibold tracking-wider text-teal-800 bg-teal-100 rounded-full">
                        REFRESING
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">{course.description}</p>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
                    <div className="flex items-center gap-1">
                      <Video className="w-4 h-4" /> {course.videos?.length || 0} Videos
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="w-4 h-4" /> {course.assessments?.length ? `${course.assessments.length} Assessment(s)` : 'No Assessment'}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button onClick={() => openEditModal(course)} className="flex-1 bg-gray-50 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 border border-gray-200">
                      Edit
                    </button>
                    <button 
                      onClick={() => openManageModal(course)}
                      className="flex-1 bg-indigo-50 text-indigo-700 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100 border border-indigo-200"
                    >
                      Manage Content
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "reports-video" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Video Progress Reports</h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => downloadExcel('video')} 
                  disabled={isGeneratingPDF}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 text-white ${isGeneratingPDF ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  <Download className="w-4 h-4" /> {isGeneratingPDF ? 'Generating...' : 'Download Excel'}
                </button>
                <button 
                  onClick={() => downloadPDF('video')} 
                  disabled={isGeneratingPDF}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 text-white ${isGeneratingPDF ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  <Download className="w-4 h-4" /> {isGeneratingPDF ? 'Generating PDF...' : 'Download PDF'}
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Jenis Pelatihan</label>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="">Semua Jenis Pelatihan</option>
                  <option value="DIKLAT KETRAMPILAN (SHORT COURSE)">DIKLAT KETRAMPILAN (SHORT COURSE)</option>
                  <option value="DIKLAT PENINGKATAN (PASIS)">DIKLAT PENINGKATAN (PASIS)</option>
                  <option value="DIKLAT PEMBENTUKAN TARUNA">DIKLAT PEMBENTUKAN TARUNA</option>
                  <option value="REFRESING">REFRESING</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Sub Pelatihan</label>
                <select value={filterCourseId} onChange={e => setFilterCourseId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="">Semua Sub Pelatihan</option>
                  {courses
                    .filter(c => filterCategory ? c.category === filterCategory || (filterCategory === 'REFRESING' && c.category === 'DIKLAT KETRAMPILAN (SHORT COURSE)') : true)
                    .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kelas</label>
                <select value={filterClassName} onChange={e => setFilterClassName(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="">Semua Kelas</option>
                  {Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map(letter => (
                    <option key={letter} value={letter}>{letter}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Periode Diklat Mulai</label>
                <input type="date" value={filterPeriodStart} onChange={e => setFilterPeriodStart(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Periode Diklat Selesai</label>
                <input type="date" value={filterPeriodEnd} onChange={e => setFilterPeriodEnd(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Aktivitas Mulai</label>
                <input type="date" value={filterActivityStart} onChange={e => setFilterActivityStart(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Aktivitas Selesai</label>
                <input type="date" value={filterActivityEnd} onChange={e => setFilterActivityEnd(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <button 
                  onClick={() => fetchReports()} 
                  disabled={isLoadingReports}
                  className={`px-4 py-1.5 rounded-md text-sm ${isLoadingReports ? 'bg-indigo-400 text-white cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                  {isLoadingReports ? 'Sedang Memuat...' : 'Terapkan Filter'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 min-w-[max-content]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Course</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Video</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filterReports(videoReports).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                        {isLoadingReports ? "Sedang memuat data..." : "Belum ada data. Silahkan klik 'Terapkan Filter' untuk menampilkan laporan."}
                      </td>
                    </tr>
                  ) : filterReports(videoReports).map((report, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{report.full_name}</div>
                        <div className="text-sm text-gray-500">{report.identity_number}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.course_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate whitespace-pre-wrap">{report.video_breakdown}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="text-sm text-gray-900 mr-2">{Math.round(report.avg_video_progress)}%</span>
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${report.avg_video_progress}%` }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {report.avg_video_progress >= 90 ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Completed</span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">In Progress</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "reports-assessment" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Assessment Reports</h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => downloadExcel('assessment')} 
                  disabled={isGeneratingPDF}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 text-white ${isGeneratingPDF ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  <Download className="w-4 h-4" /> {isGeneratingPDF ? 'Generating...' : 'Download Excel'}
                </button>
                <button 
                  onClick={() => downloadPDF('assessment')} 
                  disabled={isGeneratingPDF}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 text-white ${isGeneratingPDF ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  <Download className="w-4 h-4" /> {isGeneratingPDF ? 'Generating PDF...' : 'Download PDF'}
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Jenis Pelatihan</label>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="">Semua Jenis Pelatihan</option>
                  <option value="DIKLAT KETRAMPILAN (SHORT COURSE)">DIKLAT KETRAMPILAN (SHORT COURSE)</option>
                  <option value="DIKLAT PENINGKATAN (PASIS)">DIKLAT PENINGKATAN (PASIS)</option>
                  <option value="DIKLAT PEMBENTUKAN TARUNA">DIKLAT PEMBENTUKAN TARUNA</option>
                  <option value="REFRESING">REFRESING</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Sub Pelatihan</label>
                <select value={filterCourseId} onChange={e => setFilterCourseId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="">Semua Sub Pelatihan</option>
                  {courses
                    .filter(c => filterCategory ? c.category === filterCategory || (filterCategory === 'REFRESING' && c.category === 'DIKLAT KETRAMPILAN (SHORT COURSE)') : true)
                    .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kelas</label>
                <select value={filterClassName} onChange={e => setFilterClassName(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="">Semua Kelas</option>
                  {Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map(letter => (
                    <option key={letter} value={letter}>{letter}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Periode Diklat Mulai</label>
                <input type="date" value={filterPeriodStart} onChange={e => setFilterPeriodStart(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Periode Diklat Selesai</label>
                <input type="date" value={filterPeriodEnd} onChange={e => setFilterPeriodEnd(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Aktivitas Mulai</label>
                <input type="date" value={filterActivityStart} onChange={e => setFilterActivityStart(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Aktivitas Selesai</label>
                <input type="date" value={filterActivityEnd} onChange={e => setFilterActivityEnd(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <button 
                  onClick={() => fetchReports()} 
                  disabled={isLoadingReports}
                  className={`px-4 py-1.5 rounded-md text-sm ${isLoadingReports ? 'bg-indigo-400 text-white cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                  {isLoadingReports ? 'Sedang Memuat...' : 'Terapkan Filter'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 min-w-[max-content]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Course</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attempt</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Verification</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filterReports(assessmentReports).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                        {isLoadingReports ? "Sedang memuat data..." : "Belum ada data. Silahkan klik 'Terapkan Filter' untuk menampilkan laporan."}
                      </td>
                    </tr>
                  ) : filterReports(assessmentReports).map((report, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{report.full_name}</div>
                        <div className="text-sm text-gray-500">{report.identity_number}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.course_name}</td>
                      <td className="px-6 py-4 whitespace-pre-wrap text-sm font-bold text-gray-900">{report.detailed_scores || (report.final_score !== null ? Math.round(report.final_score) : '-')}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {report.detailed_statuses ? (
                          <div className="text-sm font-medium" dangerouslySetInnerHTML={{ __html: report.detailed_statuses }} />
                        ) : report.assessment_status === 'LULUS' ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> LULUS
                          </span>
                        ) : report.assessment_status === 'TIDAK LULUS' ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> TIDAK LULUS
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800 flex items-center gap-1">
                            BELUM MENGERJAKAN
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">#{report.final_score !== null ? 1 : 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600 hover:text-indigo-900 cursor-pointer" onClick={() => setPhotoModalData({ live: (report.attendance_photos && report.attendance_photos.length > 0) ? report.attendance_photos[report.attendance_photos.length - 1] : report.live_photo_data, initial: report.initial_photo_data || report.live_photo_data, ktp: report.ktp_photo_data, attendances: report.attendance_photos || [] })}>
                        View Photos
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "reports-final" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Final Reports</h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => downloadExcel('final')} 
                  disabled={isGeneratingPDF}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 text-white ${isGeneratingPDF ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  <Download className="w-4 h-4" /> {isGeneratingPDF ? 'Generating...' : 'Download Excel'}
                </button>
                <button 
                  onClick={() => downloadPDF('final')} 
                  disabled={isGeneratingPDF}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 text-white ${isGeneratingPDF ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  <Download className="w-4 h-4" /> {isGeneratingPDF ? 'Generating PDF...' : 'Download PDF'}
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Jenis Pelatihan</label>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="">Semua Jenis Pelatihan</option>
                  <option value="DIKLAT KETRAMPILAN (SHORT COURSE)">DIKLAT KETRAMPILAN (SHORT COURSE)</option>
                  <option value="DIKLAT PENINGKATAN (PASIS)">DIKLAT PENINGKATAN (PASIS)</option>
                  <option value="DIKLAT PEMBENTUKAN TARUNA">DIKLAT PEMBENTUKAN TARUNA</option>
                  <option value="REFRESING">REFRESING</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Sub Pelatihan</label>
                <select value={filterCourseId} onChange={e => setFilterCourseId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="">Semua Sub Pelatihan</option>
                  {courses
                    .filter(c => filterCategory ? c.category === filterCategory || (filterCategory === 'REFRESING' && c.category === 'DIKLAT KETRAMPILAN (SHORT COURSE)') : true)
                    .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kelas</label>
                <select value={filterClassName} onChange={e => setFilterClassName(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="">Semua Kelas</option>
                  {Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map(letter => (
                    <option key={letter} value={letter}>{letter}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Periode Diklat Mulai</label>
                <input type="date" value={filterPeriodStart} onChange={e => setFilterPeriodStart(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Periode Diklat Selesai</label>
                <input type="date" value={filterPeriodEnd} onChange={e => setFilterPeriodEnd(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Aktivitas Mulai</label>
                <input type="date" value={filterActivityStart} onChange={e => setFilterActivityStart(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Aktivitas Selesai</label>
                <input type="date" value={filterActivityEnd} onChange={e => setFilterActivityEnd(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <button 
                  onClick={() => fetchReports()} 
                  disabled={isLoadingReports}
                  className={`px-4 py-1.5 rounded-md text-sm ${isLoadingReports ? 'bg-indigo-400 text-white cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                  {isLoadingReports ? 'Sedang Memuat...' : 'Terapkan Filter'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 min-w-[max-content]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Course</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Video Progress</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Link Tugas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ass. Score</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ass. Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Verification</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filterReports(finalReports).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-500">
                        {isLoadingReports ? "Sedang memuat data..." : "Belum ada data. Silahkan klik 'Terapkan Filter' untuk menampilkan laporan."}
                      </td>
                    </tr>
                  ) : filterReports(finalReports).map((report, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{report.full_name}</div>
                        <div className="text-sm text-gray-500">{report.identity_number}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.class_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.course_name}</td>
                      <td className="px-6 py-4 whitespace-pre-wrap text-sm text-gray-600">
                        {report.video_breakdown}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {report.assignment_link ? (
                          <a href={report.assignment_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                            Lihat
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-pre-wrap text-sm font-bold text-gray-900">{report.detailed_scores || (report.final_score !== null ? Math.round(report.final_score) : '-')}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {report.detailed_statuses ? (
                          <div className="text-sm font-medium" dangerouslySetInnerHTML={{ __html: report.detailed_statuses }} />
                        ) : report.assessment_status === 'LULUS' ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> LULUS
                          </span>
                        ) : report.assessment_status === 'TIDAK LULUS' ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> BELUM LULUS
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600 hover:text-indigo-900 cursor-pointer" onClick={() => setPhotoModalData({ live: (report.attendance_photos && report.attendance_photos.length > 0) ? report.attendance_photos[report.attendance_photos.length - 1] : report.live_photo_data, initial: report.initial_photo_data || report.live_photo_data, ktp: report.ktp_photo_data, attendances: report.attendance_photos || [] })}>
                        View Photos
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Photo Modal */}
      {photoModalData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl my-8">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">Verification Photos</h3>
              <button onClick={() => setPhotoModalData(null)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Foto Live (Awal)</h4>
                  {photoModalData.initial ? (
                    <img src={photoModalData.initial} alt="Initial Live" className="w-full rounded-lg border border-gray-200" />
                  ) : (
                    <div className="w-full aspect-video bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 text-sm">No photo</div>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Foto Live (Terbaru)</h4>
                  {photoModalData.live ? (
                    <img src={photoModalData.live} alt="Latest Live" className="w-full rounded-lg border border-gray-200" />
                  ) : (
                    <div className="w-full aspect-video bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 text-sm">No photo</div>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">KTP Photo</h4>
                  {photoModalData.ktp ? (
                    <img src={photoModalData.ktp} alt="KTP" className="w-full rounded-lg border border-gray-200" />
                  ) : (
                    <div className="w-full aspect-video bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 text-sm">No photo</div>
                  )}
                </div>
              </div>
              
              {photoModalData.attendances && photoModalData.attendances.length > 0 && (
                <div>
                  <h4 className="text-md font-bold text-gray-900 mb-4 border-t pt-6">Foto Kehadiran Harian ({photoModalData.attendances.length})</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {photoModalData.attendances.map((url, idx) => (
                      <div key={idx}>
                        <img src={url} alt={`Attendance ${idx+1}`} className="w-full rounded-lg border border-gray-200" />
                        <p className="text-xs text-center text-gray-500 mt-1">Kehadiran {idx+1}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Course Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Add New Course</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddCourse} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course Name</label>
                <input
                  type="text"
                  required
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g. Introduction to React"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  required
                  rows={3}
                  value={newCourseDesc}
                  onChange={(e) => setNewCourseDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Course description..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Material Link (Optional)</label>
                <input
                  type="url"
                  value={newCourseMaterialLink}
                  onChange={(e) => setNewCourseMaterialLink(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="https://drive.google.com/..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Pelatihan</label>
                <select
                  value={newCourseCategory}
                  onChange={(e) => setNewCourseCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="DIKLAT KETRAMPILAN (SHORT COURSE)">DIKLAT KETRAMPILAN (SHORT COURSE)</option>
                  <option value="DIKLAT PENINGKATAN (PASIS)">DIKLAT PENINGKATAN (PASIS)</option>
                  <option value="DIKLAT PEMBENTUKAN TARUNA">DIKLAT PEMBENTUKAN TARUNA</option>
                </select>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  Create Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Course Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Edit Course</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditCourse} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course Name</label>
                <input
                  type="text"
                  required
                  value={editCourseName}
                  onChange={(e) => setEditCourseName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  required
                  value={editCourseDesc}
                  onChange={(e) => setEditCourseDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Material Link (Optional)</label>
                <input
                  type="url"
                  value={editCourseMaterialLink}
                  onChange={(e) => setEditCourseMaterialLink(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Pelatihan</label>
                <select
                  value={editCourseCategory}
                  onChange={(e) => setEditCourseCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="DIKLAT KETRAMPILAN (SHORT COURSE)">DIKLAT KETRAMPILAN (SHORT COURSE)</option>
                  <option value="DIKLAT PENINGKATAN (PASIS)">DIKLAT PENINGKATAN (PASIS)</option>
                  <option value="DIKLAT PEMBENTUKAN TARUNA">DIKLAT PEMBENTUKAN TARUNA</option>
                </select>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Content Modal */}
      {isManageModalOpen && selectedCourse && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gray-50">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Manage Content: {selectedCourse.name}</h3>
                <p className="text-sm text-gray-500 mt-1">Add videos and set up the assessment for this course.</p>
              </div>
              <button onClick={() => setIsManageModalOpen(false)} className="text-gray-400 hover:text-gray-500 p-2">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row gap-8">
              {/* Left Column: Existing Videos & Material Link */}
              <div className="flex-1 space-y-8">
                {/* Global Refreshing Config */}
                <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-semibold text-teal-900">Pengaturan Periode Pendaftaran Refresing</h4>
                    <button 
                      onClick={handleCopyRefreshingLink}
                      className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2"
                    >
                      <Copy className="w-4 h-4" />
                      Salin Link Refresing
                    </button>
                  </div>
                  
                  <div className="space-y-3 mb-4">
                    {refreshingPeriods.map((period, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border border-teal-100">
                        <span className="text-sm font-medium text-teal-800">
                          {new Date(period.start).toLocaleDateString('id-ID')} - {new Date(period.end).toLocaleDateString('id-ID')}
                        </span>
                        <button onClick={() => handleRemovePeriod(idx)} className="text-red-500 hover:text-red-700 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {refreshingPeriods.length === 0 && (
                      <p className="text-sm text-teal-600 italic">Belum ada periode yang disetting untuk refresing. Peserta tidak dapat mendaftar kursus ini sebagai refresing.</p>
                    )}
                  </div>

                  <div className="flex gap-2 items-end mt-4">
                    <div className="flex-1">
                      <label className="block text-xs text-teal-700 font-medium mb-1">Mulai</label>
                      <input type="date" value={newPeriodStart} onChange={e=>setNewPeriodStart(e.target.value)} className="w-full border-teal-200 rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-teal-700 font-medium mb-1">Selesai</label>
                      <input type="date" value={newPeriodEnd} onChange={e=>setNewPeriodEnd(e.target.value)} className="w-full border-teal-200 rounded px-2 py-1.5 text-sm" />
                    </div>
                    <button onClick={handleAddPeriod} disabled={isSavingPeriods || !newPeriodStart || !newPeriodEnd} className="bg-teal-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-teal-700 disabled:opacity-50 h-[34px]">
                      {isSavingPeriods ? '...' : 'Tambah'}
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3 text-sm">Course Material Link (Google Drive, Dropbox, etc.)</h4>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={materialLink}
                      onChange={e => setMaterialLink(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <button
                      onClick={handleSaveMaterialLink}
                      disabled={isSavingMaterial}
                      className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isSavingMaterial ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                    <Video className="w-5 h-5 text-indigo-600" /> Existing Videos
                  </h4>
                  
                  {selectedCourse.videos && selectedCourse.videos.length > 0 ? (
                  <div className="space-y-3">
                    {selectedCourse.videos.map((video: any, idx: number) => {
                      const videoAssessment = selectedCourse.assessments?.find((a: any) => a.video_id === video.id);
                      return (
                        <div key={video.id} className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-4 shadow-sm">
                          <div className="flex gap-4 items-start">
                            <div className="bg-indigo-100 text-indigo-700 font-bold w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h5 className="font-medium text-gray-900 truncate">{video.title}</h5>
                              <p className="text-xs text-gray-500 mt-1 truncate">ID: {video.youtube_id}</p>
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`refreshing-video-${video.id}`}
                                  checked={video.is_refreshing || false}
                                  onChange={() => handleToggleVideoRefreshing(video.id, video.is_refreshing || false)}
                                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <label htmlFor={`refreshing-video-${video.id}`} className="text-xs font-medium text-gray-700">Tersedia untuk Refresing</label>
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                if (deletingVideoId === video.id) {
                                  handleDeleteVideo(video.id);
                                } else {
                                  setDeletingVideoId(video.id);
                                  setTimeout(() => setDeletingVideoId(null), 3000);
                                }
                              }}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              {deletingVideoId === video.id ? <span className="text-xs font-bold">Hapus?</span> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                          
                          {/* Video Assessment Section */}
                          <div className="pl-12 border-t border-gray-100 pt-3">
                            {videoAssessment ? (
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-sm">
                                <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <p className="font-medium">Assessment Configured</p>
                                    <p className="text-xs mt-1">Passing Grade: {videoAssessment.passing_score} | Duration: {videoAssessment.duration_minutes}m</p>
                                    <p className="text-xs mt-1 text-gray-700">
                                      Mandatory: {videoAssessment.is_mandatory ? 'Yes' : 'No'} | Acak: {videoAssessment.is_randomized ? 'Yes' : 'No'} | Show 1by1: {videoAssessment.show_one_by_one ? 'Yes' : 'No'}
                                    </p>
                                    <p className="text-xs mt-1 text-red-600 font-medium">Strict Mode: {videoAssessment.is_strict_mode ? 'Enabled' : 'Disabled'} | Anti-Copy: {videoAssessment.prevent_copypaste ? 'Enabled' : 'Disabled'} | Anti-Split: {videoAssessment.prevent_split_screen ? 'Enabled' : 'Disabled'}</p>
                                    {videoAssessment.audio_link && (
                                      <p className="text-xs mt-1 truncate max-w-xs">
                                        Audio: <a href={videoAssessment.audio_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{videoAssessment.audio_link}</a>
                                      </p>
                                    )}
                                    <div className="flex items-center gap-2 mt-2">
                                      <input
                                        type="checkbox"
                                        id={`refreshing-video-assessment-${videoAssessment.id}`}
                                        checked={videoAssessment.is_refreshing || false}
                                        onChange={() => handleToggleAssessmentRefreshing(videoAssessment.id, videoAssessment.is_refreshing || false)}
                                        className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      <label htmlFor={`refreshing-video-assessment-${videoAssessment.id}`} className="text-xs font-medium text-blue-800">Tersedia untuk Refresing</label>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-2 mt-2">
                                  <button onClick={downloadTemplate} className="flex-1 px-2 py-1.5 bg-white border border-blue-300 rounded text-xs font-medium hover:bg-blue-100 flex items-center justify-center gap-1">
                                    <Download className="w-3 h-3" /> Template
                                  </button>
                                  <button onClick={() => {
                                    setUploadingAssessmentId(videoAssessment.id);
                                    fileInputRef.current?.click();
                                  }} className="flex-1 px-2 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 flex items-center justify-center gap-1">
                                    <Upload className="w-3 h-3" /> Import CSV
                                  </button>
                                  <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                                  <button 
                                    onClick={() => {
                                      if (viewingQuestionsForAssessmentId === videoAssessment.id) {
                                        setViewingQuestionsForAssessmentId(null);
                                      } else {
                                        setViewingQuestionsForAssessmentId(videoAssessment.id);
                                        supabase.from('questions').select('*').eq('assessment_id', videoAssessment.id).order('order_num', { ascending: true })
                                          .then(({ data }) => setAssessmentQuestions(data || []));
                                      }
                                    }} 
                                    className="flex-1 px-2 py-1.5 bg-white border border-blue-300 rounded text-xs font-medium hover:bg-blue-100 transition-colors"
                                  >
                                    {viewingQuestionsForAssessmentId === videoAssessment.id ? 'Hide' : 'View'}
                                  </button>
                                </div>
                                
                                {viewingQuestionsForAssessmentId === videoAssessment.id && assessmentQuestions.length > 0 && (
                                  <div className="space-y-2 mt-3 max-h-64 overflow-y-auto pr-2">
                                    {assessmentQuestions.map((q, qIdx) => (
                                      <div key={q.id} className="bg-white border border-gray-200 rounded p-2 shadow-sm relative text-xs text-gray-800">
                                        <button 
                                          onClick={() => handleDeleteQuestion(q.id)}
                                          className="absolute top-1 right-1 text-red-500 hover:text-red-700 p-0.5"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                        <p className="font-medium pr-6 mb-1">{qIdx + 1}. {q.question_text}</p>
                                        <div className="space-y-1">
                                          {q.options.map((opt: string, oIdx: number) => (
                                            <div key={oIdx} className={`p-1 rounded border ${oIdx === q.correct_option_index ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                                              {String.fromCharCode(65 + oIdx)}. {opt}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : isCreatingAssessment && creatingAssessmentForVideoId === video.id ? (
                              <form onSubmit={handleCreateAssessment} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2 text-sm">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700">Passing Grade (0-100)</label>
                                  <input type="number" min="0" max="100" value={passingGrade} onChange={e => setPassingGrade(Number(e.target.value))} className="w-full mt-1 px-2 py-1 border rounded text-xs" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700">Duration (Minutes)</label>
                                  <input type="number" min="1" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))} className="w-full mt-1 px-2 py-1 border rounded text-xs" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700">Audio Link (Optional)</label>
                                  <input type="url" value={audioLink} onChange={e => setAudioLink(e.target.value)} placeholder="https://..." className="w-full mt-1 px-2 py-1 border rounded text-xs" />
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <input type="checkbox" id={`isMandatory-${video.id}`} checked={isMandatory} onChange={e => setIsMandatory(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                  <label htmlFor={`isMandatory-${video.id}`} className="text-xs font-medium text-gray-700">Wajib dikerjakan (Mandatory)</label>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <input type="checkbox" id={`isStrictMode-${video.id}`} checked={isStrictMode} onChange={e => setIsStrictMode(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                  <label htmlFor={`isStrictMode-${video.id}`} className="text-xs font-medium text-gray-700">Aktifkan Strict Mode (Kunci Tab dll)</label>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <input type="checkbox" id={`isRandomized-${video.id}`} checked={isRandomized} onChange={e => setIsRandomized(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                  <label htmlFor={`isRandomized-${video.id}`} className="text-xs font-medium text-gray-700">Acak Urutan Soal (Sistem Otomatis)</label>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <input type="checkbox" id={`showOneByOne-${video.id}`} checked={showOneByOne} onChange={e => setShowOneByOne(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                  <label htmlFor={`showOneByOne-${video.id}`} className="text-xs font-medium text-gray-700">Tampilkan Soal Per Satuan (Satu per satu)</label>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <input type="checkbox" id={`preventCopypaste-${video.id}`} checked={preventCopypaste} onChange={e => setPreventCopypaste(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                  <label htmlFor={`preventCopypaste-${video.id}`} className="text-xs font-medium text-gray-700">Cegah Copy-Paste & Screenshot</label>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <input type="checkbox" id={`preventSplitScreen-${video.id}`} checked={preventSplitScreen} onChange={e => setPreventSplitScreen(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                  <label htmlFor={`preventSplitScreen-${video.id}`} className="text-xs font-medium text-gray-700">Anti Split Screen (Full-Screen & Diskualifikasi Ke-2)</label>
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <button type="button" onClick={() => setIsCreatingAssessment(false)} className="flex-1 py-1 bg-gray-200 rounded text-xs font-medium">Cancel</button>
                                  <button type="submit" className="flex-1 py-1 bg-indigo-600 text-white rounded text-xs font-medium">Save</button>
                                </div>
                              </form>
                            ) : (
                              <button onClick={() => { setIsCreatingAssessment(true); setCreatingAssessmentForVideoId(video.id); setAudioLink(""); }} className="w-full py-2 border border-dashed border-gray-300 rounded text-gray-500 text-xs font-medium hover:border-indigo-500 hover:text-indigo-600 transition-colors">
                                + Add Assessment for this Video
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
                    No videos added yet. Add your first video using the form.
                  </div>
                )}

                <div className="pt-6 mt-6 border-t border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-indigo-600" /> Final Assessment
                  </h4>
                  {(() => {
                    const finalAssessment = selectedCourse.assessments?.find((a: any) => !a.video_id);
                    return finalAssessment ? (
                      <div className="flex flex-col gap-4">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Final Assessment Configured</p>
                              <p className="text-sm mt-1">Passing Grade: {finalAssessment.passing_score} | Duration: {finalAssessment.duration_minutes}m</p>
                              <p className="text-sm mt-1 text-gray-700">
                                Mandatory: {finalAssessment.is_mandatory ? 'Yes' : 'No'} | Acak: {finalAssessment.is_randomized ? 'Yes' : 'No'} | Show 1by1: {finalAssessment.show_one_by_one ? 'Yes' : 'No'}
                              </p>
                              <p className="text-sm mt-1 text-red-600 font-medium">Strict Mode: {finalAssessment.is_strict_mode ? 'Enabled' : 'Disabled'} | Anti-Copy: {finalAssessment.prevent_copypaste ? 'Enabled' : 'Disabled'} | Anti-Split: {finalAssessment.prevent_split_screen ? 'Enabled' : 'Disabled'}</p>
                              {finalAssessment.audio_link && (
                                <p className="text-sm mt-1 truncate max-w-sm">
                                  Audio: <a href={finalAssessment.audio_link} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline">{finalAssessment.audio_link}</a>
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <input
                                  type="checkbox"
                                  id={`refreshing-final-assessment-${finalAssessment.id}`}
                                  checked={finalAssessment.is_refreshing || false}
                                  onChange={() => handleToggleAssessmentRefreshing(finalAssessment.id, finalAssessment.is_refreshing || false)}
                                  className="rounded border-green-300 text-green-600 focus:ring-green-500"
                                />
                                <label htmlFor={`refreshing-final-assessment-${finalAssessment.id}`} className="text-sm font-medium text-green-800">Tersedia untuk Refresing</label>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button onClick={downloadTemplate} className="flex-1 px-3 py-2 bg-white border border-green-300 rounded text-sm font-medium hover:bg-green-100 flex items-center justify-center gap-2">
                              <Download className="w-4 h-4" /> Template
                            </button>
                            <button onClick={() => {
                              setUploadingAssessmentId(finalAssessment.id);
                              fileInputRef.current?.click();
                            }} className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 flex items-center justify-center gap-2">
                              <Upload className="w-4 h-4" /> Import CSV
                            </button>
                            <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                          </div>
                          <button 
                            onClick={() => {
                              if (viewingQuestionsForAssessmentId === finalAssessment.id) {
                                setViewingQuestionsForAssessmentId(null);
                              } else {
                                setViewingQuestionsForAssessmentId(finalAssessment.id);
                                // Fetch questions for this assessment
                                supabase.from('questions').select('*').eq('assessment_id', finalAssessment.id).order('order_num', { ascending: true })
                                  .then(({ data }) => setAssessmentQuestions(data || []));
                              }
                            }} 
                            className="w-full mt-2 px-3 py-2 bg-white border border-green-300 rounded text-sm font-medium hover:bg-green-100 transition-colors"
                          >
                            {viewingQuestionsForAssessmentId === finalAssessment.id ? 'Hide Questions' : 'View Questions'}
                          </button>
                        </div>

                        {viewingQuestionsForAssessmentId === finalAssessment.id && assessmentQuestions.length > 0 && (
                          <div className="space-y-3 mt-2 max-h-96 overflow-y-auto pr-2">
                            {assessmentQuestions.map((q, idx) => (
                              <div key={q.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm relative">
                                <button 
                                  onClick={() => handleDeleteQuestion(q.id)}
                                  className="absolute top-3 right-3 text-red-500 hover:text-red-700 p-1 bg-red-50 rounded-md"
                                  title="Delete question"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                                <p className="font-medium text-gray-900 text-sm pr-8 mb-3">{idx + 1}. {q.question_text}</p>
                                <div className="space-y-2">
                                  {q.options.map((opt: string, oIdx: number) => (
                                    <div key={oIdx} className={`text-xs p-2 rounded border ${oIdx === q.correct_option_index ? 'bg-green-50 border-green-200 text-green-800 font-medium' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                                      {String.fromCharCode(65 + oIdx)}. {opt}
                                      {oIdx === q.correct_option_index && ' (Correct)'}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : isCreatingAssessment && creatingAssessmentForVideoId === null ? (
                      <form onSubmit={handleCreateAssessment} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700">Passing Grade (0-100)</label>
                          <input type="number" min="0" max="100" value={passingGrade} onChange={e => setPassingGrade(Number(e.target.value))} className="w-full mt-1 px-2 py-1 border rounded" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700">Duration (Minutes)</label>
                          <input type="number" min="1" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))} className="w-full mt-1 px-2 py-1 border rounded" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700">Audio Link (Optional)</label>
                          <input type="url" value={audioLink} onChange={e => setAudioLink(e.target.value)} placeholder="https://..." className="w-full mt-1 px-2 py-1 border rounded" />
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <input type="checkbox" id="isMandatoryFinal" checked={isMandatory} onChange={e => setIsMandatory(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                          <label htmlFor="isMandatoryFinal" className="text-xs font-medium text-gray-700">Wajib dikerjakan (Mandatory)</label>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <input type="checkbox" id="isStrictModeFinal" checked={isStrictMode} onChange={e => setIsStrictMode(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                          <label htmlFor="isStrictModeFinal" className="text-xs font-medium text-gray-700">Aktifkan Strict Mode (Kunci Tab dll)</label>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <input type="checkbox" id="isRandomizedFinal" checked={isRandomized} onChange={e => setIsRandomized(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                          <label htmlFor="isRandomizedFinal" className="text-xs font-medium text-gray-700">Acak Urutan Soal (Sistem Otomatis)</label>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <input type="checkbox" id="showOneByOneFinal" checked={showOneByOne} onChange={e => setShowOneByOne(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                          <label htmlFor="showOneByOneFinal" className="text-xs font-medium text-gray-700">Tampilkan Soal Per Satuan (Satu per satu)</label>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <input type="checkbox" id="preventCopypasteFinal" checked={preventCopypaste} onChange={e => setPreventCopypaste(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                          <label htmlFor="preventCopypasteFinal" className="text-xs font-medium text-gray-700">Cegah Copy-Paste & Screenshot</label>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <input type="checkbox" id="preventSplitScreenFinal" checked={preventSplitScreen} onChange={e => setPreventSplitScreen(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                          <label htmlFor="preventSplitScreenFinal" className="text-xs font-medium text-gray-700">Anti Split Screen (Full-Screen & Diskualifikasi Ke-2)</label>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button type="button" onClick={() => setIsCreatingAssessment(false)} className="flex-1 py-1.5 bg-gray-200 rounded text-sm font-medium">Cancel</button>
                          <button type="submit" className="flex-1 py-1.5 bg-indigo-600 text-white rounded text-sm font-medium">Save</button>
                        </div>
                      </form>
                    ) : (
                      <button onClick={() => { setIsCreatingAssessment(true); setCreatingAssessmentForVideoId(null); setAudioLink(""); }} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 font-medium hover:border-indigo-500 hover:text-indigo-600 transition-colors">
                        + Create Final Assessment
                      </button>
                    );
                  })()}
                </div>
              </div>
              </div>

              {/* Right Column: Add New Video Form */}
              <div className="w-full lg:w-96 bg-gray-50 p-6 rounded-xl border border-gray-200 h-fit">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Add New Video</h4>
                <form onSubmit={handleAddVideo} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Video Title</label>
                    <input
                      type="text"
                      required
                      value={newVideoTitle}
                      onChange={(e) => setNewVideoTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      placeholder="e.g. Chapter 1: Introduction"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">YouTube URL or ID</label>
                    <input
                      type="text"
                      required
                      value={newVideoYoutubeId}
                      onChange={(e) => setNewVideoYoutubeId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                    />
                    <p className="text-xs text-gray-500 mt-1">Paste the full URL or just the video ID.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                    <textarea
                      rows={3}
                      value={newVideoDesc}
                      onChange={(e) => setNewVideoDesc(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      placeholder="Video description..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
                  >
                    Add Video
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
