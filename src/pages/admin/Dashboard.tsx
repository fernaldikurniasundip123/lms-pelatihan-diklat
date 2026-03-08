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
  const [newVideoTitle, setNewVideoTitle] = useState("");
  const [newVideoDesc, setNewVideoDesc] = useState("");
  const [newVideoYoutubeId, setNewVideoYoutubeId] = useState("");

  // Assessment State
  const [isCreatingAssessment, setIsCreatingAssessment] = useState(false);
  const [passingGrade, setPassingGrade] = useState(70);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [filterCourseId, setFilterCourseId] = useState("");
  const [filterPeriodStart, setFilterPeriodStart] = useState("");
  const [filterPeriodEnd, setFilterPeriodEnd] = useState("");
  const [filterClassName, setFilterClassName] = useState("");

  // Photo Modal State
  const [photoModalData, setPhotoModalData] = useState<{live: string | null, ktp: string | null} | null>(null);
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
      .order('created_at', { ascending: false });
    
    if (coursesData) {
      const formatted = coursesData.map(c => ({
        ...c,
        assessment: c.assessments && c.assessments.length > 0 ? c.assessments[0] : null
      }));
      setCourses(formatted);
    }
  };

  const fetchReports = async () => {
    // Video Reports
    const { data: vpData } = await supabase
      .from('video_progress')
      .select(`*, users(full_name, identity_number), courses(name), videos(title)`);
    
    if (vpData) {
      setVideoReports(vpData.map((vp: any) => ({
        full_name: vp.users?.full_name,
        identity_number: vp.users?.identity_number,
        course_name: vp.courses?.name,
        course_id: vp.course_id,
        video_title: vp.videos?.title,
        percentage: vp.progress_percentage || (vp.completed ? 100 : 0),
        is_completed: vp.completed
      })));
    }

    // Assessment Reports
    const { data: arData } = await supabase
      .from('assessment_results')
      .select(`*, users(full_name, identity_number, global_verifications(live_photo_url, ktp_photo_url)), courses(name)`);
    
    if (arData) {
      setAssessmentReports(arData.map((ar: any) => {
        const gv = ar.users?.global_verifications?.[0] || ar.users?.global_verifications;
        return {
          full_name: ar.users?.full_name,
          identity_number: ar.users?.identity_number,
          course_name: ar.courses?.name,
          course_id: ar.course_id,
          score: ar.score,
          status: ar.passed ? 'LULUS' : 'TIDAK LULUS',
          attempt_number: 1,
          live_photo_data: gv?.live_photo_url,
          ktp_photo_data: gv?.ktp_photo_url
        };
      }));
    }

    // Final Reports
    const { data: enrollData } = await supabase
      .from('enrollments')
      .select(`*, users(id, full_name, identity_number, class_name, global_verifications(live_photo_url, ktp_photo_url)), courses(id, name)`);
      
    // Fetch total videos per course to calculate accurate percentage
    const { data: allVideos } = await supabase.from('videos').select('id, title, course_id, order_num').order('order_num', { ascending: true });
    const videoCountByCourse: Record<string, number> = {};
    if (allVideos) {
      allVideos.forEach(v => {
        videoCountByCourse[v.course_id] = (videoCountByCourse[v.course_id] || 0) + 1;
      });
    }

    if (enrollData && vpData && arData) {
      const finalReps = enrollData.map((en: any) => {
        const userVp = vpData.filter((vp: any) => vp.user_id === en.user_id && vp.course_id === en.course_id);
        const userAr = arData.filter((ar: any) => ar.user_id === en.user_id && ar.course_id === en.course_id);
        
        const courseVideos = allVideos?.filter(v => v.course_id === en.course_id) || [];
        const videoBreakdown = courseVideos.map(v => {
          const vp = userVp.find((uvp: any) => uvp.video_id === v.id);
          const pct = vp ? (vp.progress_percentage || (vp.completed ? 100 : 0)) : 0;
          return `${v.title}: ${Math.round(pct)}%`;
        }).join('\n');

        const totalVideosForCourse = videoCountByCourse[en.course_id] || 0;
        const totalProgressSum = userVp.reduce((acc: number, vp: any) => acc + (vp.progress_percentage || (vp.completed ? 100 : 0)), 0);
        
        const avgVideo = totalVideosForCourse > 0 ? totalProgressSum / totalVideosForCourse : 0;
        const bestScore = userAr.length > 0 ? Math.max(...userAr.map((a: any) => a.score)) : null;
        const passed = userAr.some((a: any) => a.passed);
        
        const gv = en.users?.global_verifications?.[0] || en.users?.global_verifications;

        return {
          full_name: en.users?.full_name,
          identity_number: en.users?.identity_number,
          class_name: en.users?.class_name || '-',
          course_name: en.courses?.name,
          course_id: en.course_id,
          avg_video_progress: avgVideo,
          video_breakdown: videoBreakdown || 'No videos',
          final_score: bestScore,
          assessment_status: bestScore !== null ? (passed ? 'LULUS' : 'TIDAK LULUS') : null,
          assignment_link: en.assignment_link,
          live_photo_data: gv?.live_photo_url,
          ktp_photo_data: gv?.ktp_photo_url
        };
      });
      setFinalReports(finalReps);
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

  const openManageModal = (course: any) => {
    setSelectedCourse(course);
    setIsManageModalOpen(true);
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
        setSelectedCourse({ ...data, assessment: data.assessments?.[0] });
      }
    } else {
      alert("Failed to add video");
    }
  };

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;

    const { error } = await supabase
      .from('assessments')
      .insert([{
        course_id: selectedCourse.id,
        passing_score: passingGrade,
        duration_minutes: durationMinutes
      }]);

    if (!error) {
      setIsCreatingAssessment(false);
      fetchCourses();
      const { data } = await supabase
        .from('courses')
        .select('*, videos(*), assessments(*)')
        .eq('id', selectedCourse.id)
        .single();
        
      if (data) {
        setSelectedCourse({ ...data, assessment: data.assessments?.[0] });
      }
    } else {
      alert("Failed to create assessment");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCourse?.assessment) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const questions = results.data.map((row: any, idx: number) => {
          const options = [row.option_a, row.option_b, row.option_c, row.option_d].filter(Boolean);
          const correctAns = row[`option_${row.correct_answer?.toLowerCase()}`] || row.option_a;
          const correctIdx = options.indexOf(correctAns);
          
          return {
            assessment_id: selectedCourse.assessment.id,
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
        } else {
          alert("Failed to import questions.");
          console.error(error);
        }
      }
    });
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
      if (filterClassName && r.class_name && !r.class_name.toLowerCase().includes(filterClassName.toLowerCase())) return false;
      if (filterPeriodStart && r.period_start && r.period_start < filterPeriodStart) return false;
      if (filterPeriodEnd && r.period_end && r.period_end > filterPeriodEnd) return false;
      return true;
    });
  };

  const downloadPDF = async (type: 'video' | 'assessment' | 'final') => {
    setIsGeneratingPDF(true);
    try {
      const doc = new jsPDF();
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
          head: [['Name', 'NIK', 'Course', 'Video', 'Progress', 'Status']],
          body: filtered.map(r => [
            r.full_name,
            r.identity_number,
            r.course_name,
            r.video_title,
            `${Math.round(r.percentage)}%`,
            r.is_completed ? 'Completed' : 'In Progress'
          ]),
        });
      } else if (type === 'assessment') {
        autoTable(doc, {
          startY: 40,
          head: [['Name', 'NIK', 'Course', 'Score', 'Status', 'Attempt']],
          body: filtered.map(r => [
            r.full_name,
            r.identity_number,
            r.course_name,
            Math.round(r.score).toString(),
            r.status,
            `#${r.attempt_number}`
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
            r.video_breakdown || `${Math.round(r.avg_video_progress || 0)}%`,
            r.final_score != null ? Math.round(r.final_score).toString() : '-',
            r.assessment_status || '-',
            '', // Live Photo placeholder
            ''  // KTP placeholder
          ]);
        }

        autoTable(doc, {
          startY: 40,
          head: [['User', 'Kelas', 'Course', 'Video Progress', 'Score', 'Status', 'Live Photo', 'KTP']],
          body: bodyData,
          styles: { cellPadding: 2, overflow: 'linebreak', minCellHeight: 20 },
          columnStyles: {
            6: { cellWidth: 25 }, // Live Photo
            7: { cellWidth: 35 }  // KTP
          },
          didDrawCell: (data) => {
            if (data.section === 'body') {
              const imgs = imagesMap.get(data.row.index);
              if (data.column.index === 6 && imgs?.live) {
                doc.addImage(imgs.live, 'JPEG', data.cell.x + 2, data.cell.y + 2, 20, 16);
              }
              if (data.column.index === 7 && imgs?.ktp) {
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

  const downloadExcel = async (type: 'final') => {
    setIsGeneratingPDF(true); // Reuse loading state
    try {
      // Dynamic import to keep bundle small if not used
      const ExcelJS = (await import('exceljs')).default;
      const { saveAs } = (await import('file-saver')).default;
      
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Final Report');
      
      const filtered = filterReports(finalReports);

      // Add Headers
      worksheet.columns = [
        { header: 'No', key: 'no', width: 5 },
        { header: 'Nama Lengkap', key: 'name', width: 25 },
        { header: 'NIK/NRP', key: 'nik', width: 20 },
        { header: 'Kelas', key: 'kelas', width: 15 },
        { header: 'Pelatihan', key: 'course', width: 25 },
        { header: 'Video Progress', key: 'video', width: 30 },
        { header: 'Link Tugas', key: 'assignment_link', width: 30 },
        { header: 'Nilai Assessment', key: 'score', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Foto Live', key: 'live', width: 20 },
        { header: 'Foto KTP', key: 'ktp', width: 30 }
      ];

      // Style Headers
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      for (let i = 0; i < filtered.length; i++) {
        const r = filtered[i];
        const row = worksheet.addRow({
          no: i + 1,
          name: r.full_name,
          nik: r.identity_number,
          kelas: r.class_name,
          course: r.course_name,
          video: r.video_breakdown || `${Math.round(r.avg_video_progress || 0)}%`,
          assignment_link: r.assignment_link || '-',
          score: r.final_score != null ? Math.round(r.final_score) : '-',
          status: r.assessment_status || '-'
        });

        // Make row tall enough for images
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
              worksheet.addImage(imageId, {
                tl: { col: 8, row: i + 1 },
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
              worksheet.addImage(imageId, {
                tl: { col: 9, row: i + 1 },
                ext: { width: 150, height: 80 }
              });
            }
          } catch (e) {
            console.error("Failed to add ktp photo to excel", e);
          }
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Final_Report_${new Date().toISOString().split('T')[0]}.xlsx`);

    } catch (err) {
      console.error("Failed to generate Excel:", err);
      alert("Failed to generate Excel. Please try again.");
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
                      <FileText className="w-4 h-4" /> {course.assessment ? '1 Assessment' : 'No Assessment'}
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
              <button onClick={() => downloadPDF('video')} className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700">
                <Download className="w-4 h-4" /> Download PDF
              </button>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Jenis Pelatihan</label>
                <select value={filterCourseId} onChange={e => setFilterCourseId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="">Semua Pelatihan</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.video_title}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="text-sm text-gray-900 mr-2">{Math.round(report.percentage)}%</span>
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${report.percentage}%` }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {report.is_completed ? (
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
              <button onClick={() => downloadPDF('assessment')} className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700">
                <Download className="w-4 h-4" /> Download PDF
              </button>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Jenis Pelatihan</label>
                <select value={filterCourseId} onChange={e => setFilterCourseId(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                  <option value="">Semua Pelatihan</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{Math.round(report.score)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {report.status === 'LULUS' ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> LULUS
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> BELUM LULUS
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">#{report.attempt_number}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600 hover:text-indigo-900 cursor-pointer" onClick={() => setPhotoModalData({ live: report.live_photo_data, ktp: report.ktp_photo_data })}>
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
                <input type="text" placeholder="Cari kelas..." value={filterClassName} onChange={e => setFilterClassName(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Periode Diklat Mulai</label>
                <input type="date" value={filterPeriodStart} onChange={e => setFilterPeriodStart(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Periode Diklat Selesai</label>
                <input type="date" value={filterPeriodEnd} onChange={e => setFilterPeriodEnd(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600 hover:text-indigo-900 cursor-pointer" onClick={() => setPhotoModalData({ live: report.live_photo_data, ktp: report.ktp_photo_data })}>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Verification Photos</h3>
              <button onClick={() => setPhotoModalData(null)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Live Photo</h4>
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
                    {selectedCourse.videos.map((video: any, idx: number) => (
                      <div key={video.id} className="bg-white border border-gray-200 rounded-lg p-4 flex gap-4 items-start shadow-sm">
                        <div className="bg-indigo-100 text-indigo-700 font-bold w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className="font-medium text-gray-900 truncate">{video.title}</h5>
                          <p className="text-xs text-gray-500 mt-1 truncate">ID: {video.youtube_id}</p>
                        </div>
                        <button className="text-red-500 hover:text-red-700 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
                    No videos added yet. Add your first video using the form.
                  </div>
                )}

                <div className="pt-6 mt-6 border-t border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-indigo-600" /> Assessment
                  </h4>
                  {selectedCourse.assessment ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Assessment Configured</p>
                          <p className="text-sm mt-1">Passing Grade: {selectedCourse.assessment.passing_score} | Duration: {selectedCourse.assessment.duration_minutes}m</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={downloadTemplate} className="flex-1 px-3 py-2 bg-white border border-green-300 rounded text-sm font-medium hover:bg-green-100 flex items-center justify-center gap-2">
                          <Download className="w-4 h-4" /> Template
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 flex items-center justify-center gap-2">
                          <Upload className="w-4 h-4" /> Import CSV
                        </button>
                        <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                      </div>
                    </div>
                  ) : isCreatingAssessment ? (
                    <form onSubmit={handleCreateAssessment} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Passing Grade (0-100)</label>
                        <input type="number" min="0" max="100" value={passingGrade} onChange={e => setPassingGrade(Number(e.target.value))} className="w-full mt-1 px-2 py-1 border rounded" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Duration (Minutes)</label>
                        <input type="number" min="1" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))} className="w-full mt-1 px-2 py-1 border rounded" />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button type="button" onClick={() => setIsCreatingAssessment(false)} className="flex-1 py-1.5 bg-gray-200 rounded text-sm font-medium">Cancel</button>
                        <button type="submit" className="flex-1 py-1.5 bg-indigo-600 text-white rounded text-sm font-medium">Save</button>
                      </div>
                    </form>
                  ) : (
                    <button onClick={() => setIsCreatingAssessment(true)} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 font-medium hover:border-indigo-500 hover:text-indigo-600 transition-colors">
                      + Create Final Assessment
                    </button>
                  )}
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
