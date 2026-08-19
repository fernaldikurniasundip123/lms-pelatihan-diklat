import { useState, useEffect } from "react";
import { 
  Plus, 
  Trash2, 
  Save, 
  Video, 
  Check, 
  Info, 
  Search, 
  Sparkles,
  Database,
  RefreshCw,
  AlertCircle
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface Course {
  id: string;
  name: string;
  category: string;
  description?: string;
  diklat_periods?: any[];
  refreshing_periods?: any[];
  period_start?: string;
  period_end?: string;
}

export interface CourseMapping {
  course_id: string;
  periods: string[];
}

export interface ZoomConfig {
  id: string;
  meeting_name: string;
  zoom_link: string;
  course_ids: (string | CourseMapping)[]; // List of mapped course IDs or mappings with periods
}

interface SinkronusSettingsProps {
  courses: Course[];
}

export default function SinkronusSettings({ courses }: SinkronusSettingsProps) {
  const [zoomConfigs, setZoomConfigs] = useState<ZoomConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // Local storage indicators
  const [isusingLocalFallback, setIsUsingLocalFallback] = useState(false);

  // Search filter for course checkbox list
  const [courseSearch, setCourseSearch] = useState("");

  useEffect(() => {
    fetchConfigs();
  }, []);

  const getCourseAvailablePeriods = (course: any): string[] => {
    if (!course) return [];
    const periods: string[] = [];

    // 1. diklat_periods from Kelola Konten (Pengaturan Periode Diklat Ketrampilan)
    if (Array.isArray(course.diklat_periods)) {
      course.diklat_periods.forEach((p: any) => {
        if (typeof p === 'string' && p.trim()) {
          periods.push(p.trim());
        } else if (p && typeof p === 'object') {
          const startStr = p.start ? (p.start.includes('-') ? p.start.split('-').reverse().join('/') : p.start) : '';
          const endStr = p.end ? (p.end.includes('-') ? p.end.split('-').reverse().join('/') : p.end) : '';
          if (startStr && endStr) {
            periods.push(`${startStr} s/d ${endStr}`);
          } else if (startStr || endStr) {
            periods.push(startStr || endStr);
          }
        }
      });
    }

    // Catatan: Periode Refresing (refreshing_periods) dikecualikan sesuai instruksi

    // 2. period_start & period_end dari course langsung jika tidak memiliki list diklat_periods
    if (periods.length === 0 && course.period_start && course.period_end) {
      const s = course.period_start.includes('-') ? course.period_start.split('-').reverse().join('/') : course.period_start;
      const e = course.period_end.includes('-') ? course.period_end.split('-').reverse().join('/') : course.period_end;
      const singleP = `${s} s/d ${e}`;
      if (!periods.includes(singleP)) {
        periods.push(singleP);
      }
    }

    return Array.from(new Set(periods));
  };

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("zoom_settings")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }
      
      if (data && data.length > 0) {
        setZoomConfigs(data.map((item: any) => ({
          id: item.id,
          meeting_name: item.meeting_name,
          zoom_link: item.zoom_link,
          course_ids: Array.isArray(item.course_ids) ? item.course_ids : []
        })));
        setIsUsingLocalFallback(false);
      } else {
        // Initialize default Link 1 & Link 2 if empty
        initDefaultConfigs();
      }
    } catch (e) {
      // Table doesn't exist error probably
      setIsUsingLocalFallback(true);
      loadLocalConfigs();
    } finally {
      setLoading(false);
    }
  };

  const initDefaultConfigs = () => {
    const defaults: ZoomConfig[] = [
      { id: "1", meeting_name: "Embed Link Zoom 1", zoom_link: "https://zoom.us/j/98765432101", course_ids: [] },
      { id: "2", meeting_name: "Embed Link Zoom 2", zoom_link: "https://zoom.us/j/12345678902", course_ids: [] }
    ];
    setZoomConfigs(defaults);
  };

  const loadLocalConfigs = () => {
    const stored = localStorage.getItem("local_zoom_settings");
    if (stored) {
      setZoomConfigs(JSON.parse(stored));
    } else {
      initDefaultConfigs();
    }
  };

  const handleAddConfig = () => {
    const newId = crypto.randomUUID();
    const newConfig: ZoomConfig = {
      id: newId,
      meeting_name: `Embed Link Zoom ${zoomConfigs.length + 1}`,
      zoom_link: "https://zoom.us/j/...",
      course_ids: []
    };
    setZoomConfigs([...zoomConfigs, newConfig]);
  };

  const handleRemoveConfig = (id: string) => {
    setZoomConfigs(zoomConfigs.filter(item => item.id !== id));
  };

  const handleUpdateConfig = (id: string, field: keyof ZoomConfig, value: any) => {
    setZoomConfigs(zoomConfigs.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const getSelectedCourseMapping = (config: ZoomConfig, courseId: string): CourseMapping | null => {
    if (!Array.isArray(config.course_ids)) return null;
    const found = config.course_ids.find(item => {
      if (typeof item === 'string') return item === courseId;
      return item && typeof item === 'object' && item.course_id === courseId;
    });
    if (!found) return null;
    return typeof found === 'string' ? { course_id: found, periods: [] } : found;
  };

  const handleToggleCourse = (configId: string, courseId: string) => {
    const targetCourse = courses.find(c => c.id === courseId);
    const availablePeriods = getCourseAvailablePeriods(targetCourse);

    setZoomConfigs(zoomConfigs.map(item => {
      if (item.id === configId) {
        const mapping = getSelectedCourseMapping(item, courseId);
        const isSelected = mapping !== null;
        let updatedCourseIds: (string | CourseMapping)[] = [];

        if (isSelected) {
          // Remove
          updatedCourseIds = item.course_ids.filter(c => {
            const cid = typeof c === 'string' ? c : c.course_id;
            return cid !== courseId;
          });
        } else {
          // Add mapping with all available periods connected from Kelola Konten by default
          updatedCourseIds = [...item.course_ids, { course_id: courseId, periods: [...availablePeriods] }];
        }
        return { ...item, course_ids: updatedCourseIds };
      }
      return item;
    }));
  };

  const handleTogglePeriod = (configId: string, courseId: string, periodStr: string) => {
    setZoomConfigs(zoomConfigs.map(item => {
      if (item.id === configId) {
        const updatedCourseIds = item.course_ids.map(c => {
          const cid = typeof c === 'string' ? c : c.course_id;
          if (cid === courseId) {
            const currentPeriods = (typeof c === 'object' && Array.isArray(c.periods)) ? c.periods : [];
            const isAlreadySelected = currentPeriods.includes(periodStr);
            const newPeriods = isAlreadySelected 
              ? currentPeriods.filter(p => p !== periodStr)
              : [...currentPeriods, periodStr];
            return { course_id: courseId, periods: newPeriods };
          }
          return c;
        });
        return { ...item, course_ids: updatedCourseIds };
      }
      return item;
    }));
  };

  const handleToggleSelectAllPeriods = (configId: string, courseId: string, availablePeriods: string[]) => {
    setZoomConfigs(zoomConfigs.map(item => {
      if (item.id === configId) {
        const updatedCourseIds = item.course_ids.map(c => {
          const cid = typeof c === 'string' ? c : c.course_id;
          if (cid === courseId) {
            const currentPeriods = (typeof c === 'object' && Array.isArray(c.periods)) ? c.periods : [];
            const isAllSelected = availablePeriods.length > 0 && availablePeriods.every(p => currentPeriods.includes(p));
            return { 
              course_id: courseId, 
              periods: isAllSelected ? [] : [...availablePeriods] 
            };
          }
          return c;
        });
        return { ...item, course_ids: updatedCourseIds };
      }
      return item;
    }));
  };

  const handleSaveAll = async () => {
    setLoading(true);
    setStatusMsg(null);

    try {
      if (isusingLocalFallback) {
        localStorage.setItem("local_zoom_settings", JSON.stringify(zoomConfigs));
        setStatusMsg({ type: "success", text: "Konfigurasi pembelajaran sinkronus zoom berhasil disimpan di LocalStorage!" });
        setLoading(false);
        return;
      }

      // Supabase Save attempt: We upsert row by row or overwrite.
      // Easiest is to upsert
      for (const config of zoomConfigs) {
        const payload = {
          meeting_name: config.meeting_name,
          zoom_link: config.zoom_link,
          course_ids: config.course_ids
        };

        // If UUID, we upsert, if numeric (like '1', '2' original defaults) we regenerate UUID
        const isRealUuid = config.id.length > 5;
        const targetId = isRealUuid ? config.id : crypto.randomUUID();

        const { error } = await supabase
          .from("zoom_settings")
          .upsert([{
            id: targetId,
            ...payload
          }], { onConflict: "id" });

        if (error) throw error;
      }

      setStatusMsg({ type: "success", text: "Semua pengaturan Pembelajaran Sinkronus Zoom berhasil disinkronkan ke Database Supabase!" });
      fetchConfigs(); // reload
    } catch (err: any) {
      console.warn("Failed saving zoom configs to database. Saving locally instead:", err);
      setIsUsingLocalFallback(true);
      localStorage.setItem("local_zoom_settings", JSON.stringify(zoomConfigs));
      setStatusMsg({ 
        type: "success", 
        text: "Penyimpanan Database dialihkan ke LocalStorage karena tabel di Supabase belum dimigrasi." 
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredCoursesList = courses.filter(c => {
    const search = courseSearch.toLowerCase();
    if (!search) return true;
    return c.name.toLowerCase().includes(search) || c.category.toLowerCase().includes(search);
  });

  return (
    <div className="bg-slate-50 min-h-screen p-1 text-slate-800">
      
      {/* Upper header action banner */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full mb-2 inline-block">
              KONFIGURASI SINKRONUS
            </span>
            <h2 className="text-2xl font-black text-gray-950 flex items-center gap-2">
              <Video className="w-7 h-7 text-indigo-600" /> Atur Pembelajaran Sinkronus Zoom Meeting
            </h2>
            <p className="text-sm text-gray-500 mt-1 max-w-3xl leading-relaxed">
              Petakan link webinar Zoom (Embed/Meeting Link) untuk setiap jenis diklat / mata pelajaran. Peserta lms pelaut yang memilih kategori <strong>Pembelajaran Sinkronus</strong> akan diarahkan masuk ke Zoom Meeting SDK sesuai dengan diklat yang mereka ikuti.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2 flex-shrink-0">
            <button
              onClick={handleAddConfig}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition border border-gray-300 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Tambah Zoom Link baru
            </button>
            <button
              onClick={handleSaveAll}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-75 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition shadow"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>Simpan Semua Pengaturan</span>
            </button>
          </div>
        </div>

        {/* Database connectivity Banner indicator */}
        <div className="mt-4 flex flex-wrap gap-3 items-center">
          {isusingLocalFallback ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 flex items-center gap-2.5 text-xs text-amber-800">
              <Info className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                <strong>Mode Simulasi Aktif:</strong> Data disimpan di browser lokal (LocalStorage). Untuk menyimpan ke server cloud Supabase, jalankan file migrasi <code>20260620_add_zoom_meeting_support.sql</code> di editor database Anda.
              </span>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 flex items-center gap-2.5 text-xs text-emerald-800">
              <Database className="w-4 h-4 text-emerald-500 shrink-0" />
              <span><strong>Tersambung Cloud Supabase:</strong> Data pengaturan Zoom sinkronus langsung disatukan dengan database server pusat.</span>
            </div>
          )}
        </div>

        {/* Status notification toast */}
        {statusMsg && (
          <div className={`mt-4 p-4 rounded-xl flex items-start gap-2.5 text-xs font-semibold ${
            statusMsg.type === "success" 
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200" 
              : "bg-red-50 text-red-800 border border-red-200"
          }`}>
            <Check className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{statusMsg.text}</span>
          </div>
        )}
      </div>

      {/* Main Configurations lists cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {zoomConfigs.map((config, idx) => (
          <div key={config.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition duration-200 overflow-hidden flex flex-col">
            
            {/* Header of card */}
            <div className="bg-slate-900 px-5 py-3 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-indigo-400" />
                <span className="font-extrabold text-xs tracking-wider uppercase font-mono">Zoom Configuration #{idx + 1}</span>
              </div>
              <button
                onClick={() => handleRemoveConfig(config.id)}
                className="text-red-400 hover:text-red-300 p-1 rounded-full hover:bg-white/10 transition"
                title="Hapus Link"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Inputs body */}
            <div className="p-5 flex-1 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Nama Sesi / Topik Zoom</label>
                <input
                  type="text"
                  value={config.meeting_name}
                  onChange={(e) => handleUpdateConfig(config.id, "meeting_name", e.target.value)}
                  placeholder="Misal: Link Zoom 1 - Kelas Teknika"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-slate-50 text-gray-900 font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Webinar Zoom Link (URL / Embed Code)</label>
                <input
                  type="text"
                  value={config.zoom_link}
                  onChange={(e) => handleUpdateConfig(config.id, "zoom_link", e.target.value)}
                  placeholder="Paste URL zoom webinar atau iframe link..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-slate-50 text-gray-900 font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
                />
              </div>

              {/* Course Mapping Panel */}
              <div className="flex-1 flex flex-col border border-gray-250 bg-slate-50/50 rounded-xl p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-bold text-indigo-950 uppercase tracking-wide">Pilih Jenis Diklat Yang Memakai Zoom Ini ({config.course_ids.length}) :</span>
                  
                  {/* Local mini search box */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-2" />
                    <input
                      type="text"
                      placeholder="Cari diklat..."
                      value={courseSearch}
                      onChange={(e) => setCourseSearch(e.target.value)}
                      className="border border-gray-300 pl-7 pr-2 py-0.5 rounded text-xs bg-white text-gray-800 w-36 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Courses Checklist scrollbox */}
                <div className="max-h-[340px] overflow-y-auto pr-1 space-y-2.5">
                  {filteredCoursesList.map(c => {
                    const mapping = getSelectedCourseMapping(config, c.id);
                    const isChecked = mapping !== null;
                    const availablePeriods = getCourseAvailablePeriods(c);
                    const selectedPeriods = (mapping?.periods && Array.isArray(mapping.periods)) ? mapping.periods : [];
                    
                    return (
                      <div key={c.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs">
                        <button
                          type="button"
                          onClick={() => handleToggleCourse(config.id, c.id)}
                          className={`w-full text-left px-3.5 py-2.5 text-xs flex justify-between items-center transition-all ${
                            isChecked 
                              ? "bg-indigo-50/90 border-b border-indigo-200 font-semibold text-indigo-950" 
                              : "hover:bg-slate-50 text-gray-700"
                          }`}
                        >
                          <div>
                            <p className="font-bold text-gray-900 leading-snug">{c.name}</p>
                            <span className="text-[10px] text-gray-500 block uppercase font-mono tracking-wider">{c.category}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {availablePeriods.length > 0 && (
                              <span className="text-[10px] bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                                {availablePeriods.length} Periode di Konten
                              </span>
                            )}
                            {isChecked ? (
                              <span className="bg-indigo-600 text-white rounded-full p-0.5">
                                <Check className="w-3.5 h-3.5 stroke-[3px]" />
                              </span>
                            ) : (
                              <span className="w-4 h-4 rounded-full border border-gray-300 inline-block" />
                            )}
                          </div>
                        </button>
                        
                        {isChecked && (
                          <div className="p-3 bg-indigo-50/30 border-t border-indigo-100 flex flex-col gap-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-[10px] font-bold text-indigo-950 uppercase tracking-wider block">
                                Periode Diklat Terhubung ({selectedPeriods.length}/{availablePeriods.length} Aktif):
                              </label>
                              {availablePeriods.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleSelectAllPeriods(config.id, c.id, availablePeriods);
                                  }}
                                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline"
                                >
                                  {availablePeriods.every(p => selectedPeriods.includes(p)) ? "Batal Semua" : "Pilih Semua"}
                                </button>
                              )}
                            </div>

                            {availablePeriods.length > 0 ? (
                              <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                                {availablePeriods.map((periodStr, pIdx) => {
                                  const isPeriodActive = selectedPeriods.includes(periodStr);
                                  return (
                                    <label
                                      key={pIdx}
                                      onClick={(e) => e.stopPropagation()}
                                      className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition ${
                                        isPeriodActive
                                          ? "bg-white border-indigo-400 text-indigo-950 font-bold shadow-xs"
                                          : "bg-slate-50 border-gray-200 text-gray-600 hover:bg-slate-100"
                                      }`}
                                    >
                                      <span className="font-mono text-[11px]">{periodStr}</span>
                                      <input
                                        type="checkbox"
                                        checked={isPeriodActive}
                                        onChange={() => handleTogglePeriod(config.id, c.id, periodStr)}
                                        className="h-3.5 w-3.5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                      />
                                    </label>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 leading-relaxed">
                                <strong>Info:</strong> Diklat ini belum memiliki periode yang disimpan pada menu <strong>Kelola Konten</strong> (Pengaturan Periode Diklat). Silakan atur periode di menu Kelola Konten agar otomatis muncul di sini.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filteredCoursesList.length === 0 && (
                    <div className="py-6 text-center text-xs text-gray-400 font-medium">
                      Tidak ada diklat yang cocok dengan kata pencarian.
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Bottom count display */}
            <div className="border-t border-gray-150 px-5 py-2.5 bg-slate-50 text-[10px] md:text-xs text-gray-500 font-medium flex justify-between items-center">
              <span>Pemetaan Course Terkait: <strong className="text-indigo-600">{config.course_ids.length} Diklat</strong></span>
              <span>Updated: Just now</span>
            </div>

          </div>
        ))}

        {zoomConfigs.length === 0 && (
          <div className="col-span-full bg-white rounded-2xl p-12 text-center border border-gray-200">
            <Video className="w-12 h-12 text-gray-400 mx-auto animate-pulse" />
            <h3 className="font-extrabold text-lg text-slate-800 mt-4">Belum ada Link Zoom Meeting</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">Tambahkan pengaturan Link Zoom Sinkronus Anda agar peserta dapat bergabung untuk kelas diklat pelaut di LMS.</p>
            <button
              onClick={handleAddConfig}
              className="mt-4 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs"
            >
              <Plus className="w-4 h-4" /> Mulai Tambah Link
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
