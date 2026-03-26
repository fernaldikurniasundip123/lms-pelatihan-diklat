import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../../store/authStore";
import { LogOut, Book, Video, FileText, Plus, Users, CheckCircle, XCircle, X, Trash2, Download, Upload } from "lucide-react";
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

  // Manage Content Modal State
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
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
  const [uploadingAssessmentId, setUploadingAssessmentId] = useState<string | null>(null);
  const [viewingQuestionsForAssessmentId, setViewingQuestionsForAssessmentId] = useState<string | null>(null);
  const [passingGrade, setPassingGrade] = useState(70);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [filterCourseId, setFilterCourseId] = useState("");
  const [filterPeriodStart, setFilterPeriodStart] = useState("");
  const [filterPeriodEnd, setFilterPeriodEnd] = useState("");
  const [filterClassName, setFilterClassName] = useState("");
  const [filterDate, setFilterDate] = useState("");

  // Photo Modal State
  const [photoModalData, setPhotoModalData] = useState<{live: string | null, ktp: string | null, attendances: string[]} | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

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
    fetchReports();
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
    // Build queries with filters
    let vpQuery = supabase
      .from('video_progress')
      .select(`*, users!inner(full_name, identity_number, class_name), courses!inner(name), videos(title)`)
      .limit(10000);
      
    let arQuery = supabase
      .from('assessment_results')
      .select(`*, users!inner(full_name, identity_number, class_name, global_verifications(live_photo_url, ktp_photo_url)), courses!inner(name)`)
      .limit(10000);
      
    let enrollQuery = supabase
      .from('enrollments')
      .select(`*, users!inner(id, full_name, identity_number, class_name, global_verifications(live_photo_url, ktp_photo_url)), courses!inner(id, name)`)
      .limit(10000);

    // Apply filters
    if (filterCourseId) {
      vpQuery = vpQuery.eq('course_id', filterCourseId);
      arQuery = arQuery.eq('course_id', filterCourseId);
      enrollQuery = enrollQuery.eq('course_id', filterCourseId);
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
    if (filterDate) {
      const startOfDay = `${filterDate}T00:00:00.000Z`;
      const endOfDay = `${filterDate}T23:59:59.999Z`;
      vpQuery = vpQuery.gte('created_at', startOfDay).lte('created_at', endOfDay);
      arQuery = arQuery.gte('created_at', startOfDay).lte('created_at', endOfDay);
      enrollQuery = enrollQuery.gte('created_at', startOfDay).lte('created_at', endOfDay);
    }

    // Execute queries
    const assessmentsQuery = supabase.from('assessments').select('*');
    const [vpRes, arRes, enrollRes, assessmentsRes] = await Promise.all([
      vpQuery,
      arQuery,
      enrollQuery,
      assessmentsQuery
    ]);

    const vpData = vpRes.data;
    const arData = arRes.data;
    const enrollData = enrollRes.data;
    const assessmentsData = assessmentsRes.data;
    
    // Fetch total videos per course to calculate accurate percentage
    const { data: allVideos } = await supabase.from('videos').select('id, title, course_id, order_num').order('order_num', { ascending: true }).limit(10000);
    const videoCountByCourse: Record<string, number> = {};
    if (allVideos) {
      allVideos.forEach(v => {
        videoCountByCourse[v.course_id] = (videoCountByCourse[v.course_id] || 0) + 1;
      });
    }

    // Fetch all attendances
    const { data: allAttendances } = await supabase.storage.from('verifications').list('', { limit: 10000, search: '_login_attendance_' });
    const attendanceMap: Record<string, string[]> = {};
    if (allAttendances) {
      allAttendances.forEach(file => {
        const parts = file.name.split('_');
        if (parts.length >= 2) {
          const userId = parts[0];
          const key = userId;
          if (!attendanceMap[key]) attendanceMap[key] = [];
          
          const { data: publicUrlData } = supabase.storage.from('verifications').getPublicUrl(file.name);
          attendanceMap[key].push(publicUrlData.publicUrl);
        }
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
        
        if (finalAssessment) {
          const finalResults = userAr.filter((a: any) => a.assessment_id === finalAssessment.id);
          bestScore = finalResults.length > 0 ? Math.max(...finalResults.map((a: any) => a.score)) : null;
          passed = finalResults.some((a: any) => a.passed);
        } else {
          bestScore = userAr.length > 0 ? Math.max(...userAr.map((a: any) => a.score)) : null;
          passed = userAr.some((a: any) => a.passed);
        }
        const courseVideos = allVideos?.filter(v => v.course_id === en.course_id) || [];
        const videoBreakdown = courseVideos.map(v => {
          const vp = userVp.find((uvp: any) => uvp.video_id === v.id);
          const pct = vp ? (vp.progress_percentage || (vp.completed ? 100 : 0)) : 0;
          const isCompleted = vp ? (vp.completed || (vp.progress_percentage || 0) >= 90) : false;
          return `${v.title}: ${Math.round(pct)}% ${isCompleted ? '(Selesai)' : ''}`;
        }).join('\n');

        const totalVideosForCourse = videoCountByCourse[en.course_id] || 0;
        const totalProgressSum = userVp.reduce((acc: number, vp: any) => {
          const isCompleted = vp.completed || (vp.progress_percentage || 0) >= 90;
          return acc + (isCompleted ? 100 : (vp.progress_percentage || 0));
        }, 0);
        
        const avgVideo = totalVideosForCourse > 0 ? totalProgressSum / totalVideosForCourse : 0;
        
        const gv = en.users?.global_verifications?.[0] || en.users?.global_verifications;
        const attendanceKey = en.user_id;
        const attendancePhotos = attendanceMap[attendanceKey] || [];

        return {
          full_name: en.users?.full_name,
          identity_number: en.users?.identity_number,
          class_name: en.users?.class_name || '-',
          course_name: en.courses?.name,
          course_id: en.course_id,
          period_start: en.period_start,
          period_end: en.period_end,
          created_at: en.created_at,
          avg_video_progress: avgVideo,
          video_breakdown: videoBreakdown || 'No videos',
          final_score: bestScore,
          assessment_status: bestScore !== null ? (passed ? 'LULUS' : 'TIDAK LULUS') : null,
          assignment_link: en.assignment_link,
          live_photo_data: gv?.live_photo_url,
          ktp_photo_data: gv?.ktp_photo_url,
          attendance_photos: attendancePhotos
        };
      });
      setFinalReports(finalReps);
      setVideoReports(finalReps);
      setAssessmentReports(finalReps);
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
      .insert([{ name: newCourseName, description: newCourseDesc, status: 'active' }]);

    if (!error) {
      setIsAddModalOpen(false);
      setNewCourseName("");
      setNewCourseDesc("");
      fetchCourses();
    } else {
      alert("Failed to create course");
    }
  };

  const openManageModal = async (course: any) => {
    setSelectedCourse(course);
    setIsManageModalOpen(true);
    setIsViewingQuestions(false);
    setAssessmentQuestions([]);
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

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;

    const { error } = await supabase
      .from('assessments')
      .insert([{
        course_id: selectedCourse.id,
        video_id: creatingAssessmentForVideoId,
        passing_score: passingGrade,
        duration_minutes: durationMinutes,
        is_mandatory: isMandatory
      }]);

    if (!error) {
      setIsCreatingAssessment(false);
      setCreatingAssessmentForVideoId(null);
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
      if (filterDate && r.created_at && !r.created_at.startsWith(filterDate)) return false;
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
            r.final_score !== null ? Math.round(r.final_score).toString() : '-',
            r.assessment_status || 'BELUM MENGERJAKAN',
            r.final_score !== null ? '#1' : '#0'
          ]),
        });
      } else {
        const imagesMap = new Map();
        const bodyData = [];
        
        for (let i = 0; i < filtered.length; i++) {
          const r = filtered[i];
          const liveB64 = r.live_photo_data ? await getBase64ImageFromUrl(r.live_photo_data) : null;
          const ktpB64 = r.ktp_photo_data ? await getBase64ImageFromUrl(r.ktp_photo_data) : null;
          imagesMap.set(i, { live: liveB64, ktp: ktpB64 });
          
          bodyData.push([
            r.full_name + '\n' + r.identity_number,
            r.class_name || '-',
            r.course_name,
            `${r.period_start ? new Date(r.period_start).toLocaleDateString() : '-'} s/d ${r.period_end ? new Date(r.period_end).toLocaleDateString() : '-'}`,
            r.video_breakdown || `${Math.round(r.avg_video_progress || 0)}%`,
            r.final_score != null ? Math.round(r.final_score).toString() : '-',
            r.assessment_status || '-',
            '', // Live Photo placeholder
            ''  // KTP placeholder
          ]);
        }

        autoTable(doc, {
          startY: 40,
          head: [['User', 'Kelas', 'Course', 'Periode Diklat', 'Video Progress', 'Score', 'Status', 'Live Photo', 'KTP']],
          body: bodyData,
          styles: { cellPadding: 2, overflow: 'linebreak', minCellHeight: 20 },
          columnStyles: {
            7: { cellWidth: 25 }, // Live Photo
            8: { cellWidth: 35 }  // KTP
          },
          didDrawCell: (data) => {
            if (data.section === 'body') {
              const imgs = imagesMap.get(data.row.index);
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
      const { saveAs } = (await import('file-saver')).default;
      
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
          { header: 'Status', key: 'status', width: 15 },
          { header: 'Foto Live', key: 'live', width: 20 },
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
            score: r.final_score != null ? Math.round(r.final_score) : '-',
            status: r.assessment_status || 'BELUM MENGERJAKAN',
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
            score: r.final_score != null ? Math.round(r.final_score) : '-',
            status: r.assessment_status || '-'
          };
        }
        
        const row = worksheet.addRow(rowData);

        // Make row tall enough for images if not video report
        if (type !== 'video') {
          row.height = 80;
          row.alignment = { vertical: 'middle', wrapText: true };

          // Add Images if exist
          if (r.live_photo_data) {
            try {
              const liveB64 = await getBase64ImageFromUrl(r.live_photo_data);
              if (liveB64) {
                const imageId = workbook.addImage({
                  base64: liveB64,
                  extension: 'jpeg',
                });
                const colIndex = type === 'assessment' ? 7 : 9;
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
                const imageId = workbook.addImage({
                  base64: ktpB64,
                  extension: 'jpeg',
                });
                const colIndex = type === 'assessment' ? 8 : 10;
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
                  const imageId = workbook.addImage({
                    base64: attB64,
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
                    <span className={`px-2 py-1 text-xs rounded-full ${course.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {course.status}
                    </span>
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
                    <button className="flex-1 bg-gray-50 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 border border-gray-200">
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
                <select value={filterCourseId} onChange={e => setFilterCourseId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="">Semua Pelatihan</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Filter Hari (Tanggal)</label>
                <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <button 
                  onClick={() => fetchReports()} 
                  className="bg-indigo-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-indigo-700"
                >
                  Terapkan Filter
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
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
                  {filterReports(videoReports).map((report, idx) => (
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
                <select value={filterCourseId} onChange={e => setFilterCourseId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="">Semua Pelatihan</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Filter Hari (Tanggal)</label>
                <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <button 
                  onClick={() => fetchReports()} 
                  className="bg-indigo-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-indigo-700"
                >
                  Terapkan Filter
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
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
                  {filterReports(assessmentReports).map((report, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{report.full_name}</div>
                        <div className="text-sm text-gray-500">{report.identity_number}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.course_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{report.final_score !== null ? Math.round(report.final_score) : '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {report.assessment_status === 'LULUS' ? (
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600 hover:text-indigo-900 cursor-pointer" onClick={() => setPhotoModalData({ live: report.live_photo_data, ktp: report.ktp_photo_data, attendances: report.attendance_photos || [] })}>
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
                <select value={filterCourseId} onChange={e => setFilterCourseId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="">Semua Pelatihan</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Filter Hari (Tanggal)</label>
                <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <button 
                  onClick={() => fetchReports()} 
                  className="bg-indigo-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-indigo-700"
                >
                  Terapkan Filter
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
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
                  {filterReports(finalReports).map((report, idx) => (
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{report.final_score != null ? Math.round(report.final_score) : '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {report.assessment_status === 'LULUS' ? (
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600 hover:text-indigo-900 cursor-pointer" onClick={() => setPhotoModalData({ live: report.live_photo_data, ktp: report.ktp_photo_data, attendances: report.attendance_photos || [] })}>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Live Photo (Awal)</h4>
                  {photoModalData.live ? (
                    <img src={photoModalData.live} alt="Live" className="w-full rounded-lg border border-gray-200" />
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
              {/* Left Column: Existing Videos */}
              <div className="flex-1 space-y-4">
                <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
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
                                    <p className="text-xs mt-1">Mandatory: {videoAssessment.is_mandatory ? 'Yes' : 'No'}</p>
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
                                <div className="flex items-center gap-2 mt-2">
                                  <input type="checkbox" id={`isMandatory-${video.id}`} checked={isMandatory} onChange={e => setIsMandatory(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                  <label htmlFor={`isMandatory-${video.id}`} className="text-xs font-medium text-gray-700">Wajib dikerjakan (Mandatory)</label>
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <button type="button" onClick={() => setIsCreatingAssessment(false)} className="flex-1 py-1 bg-gray-200 rounded text-xs font-medium">Cancel</button>
                                  <button type="submit" className="flex-1 py-1 bg-indigo-600 text-white rounded text-xs font-medium">Save</button>
                                </div>
                              </form>
                            ) : (
                              <button onClick={() => { setIsCreatingAssessment(true); setCreatingAssessmentForVideoId(video.id); }} className="w-full py-2 border border-dashed border-gray-300 rounded text-gray-500 text-xs font-medium hover:border-indigo-500 hover:text-indigo-600 transition-colors">
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
                              <p className="text-sm mt-1">Mandatory: {finalAssessment.is_mandatory ? 'Yes' : 'No'}</p>
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
                        <div className="flex items-center gap-2 mt-2">
                          <input type="checkbox" id="isMandatoryFinal" checked={isMandatory} onChange={e => setIsMandatory(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                          <label htmlFor="isMandatoryFinal" className="text-xs font-medium text-gray-700">Wajib dikerjakan (Mandatory)</label>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button type="button" onClick={() => setIsCreatingAssessment(false)} className="flex-1 py-1.5 bg-gray-200 rounded text-sm font-medium">Cancel</button>
                          <button type="submit" className="flex-1 py-1.5 bg-indigo-600 text-white rounded text-sm font-medium">Save</button>
                        </div>
                      </form>
                    ) : (
                      <button onClick={() => { setIsCreatingAssessment(true); setCreatingAssessmentForVideoId(null); }} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 font-medium hover:border-indigo-500 hover:text-indigo-600 transition-colors">
                        + Create Final Assessment
                      </button>
                    );
                  })()}
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
