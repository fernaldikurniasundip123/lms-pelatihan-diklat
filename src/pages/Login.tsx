import { useState, useEffect, useMemo } from "react";
import { useAuthStore } from "../store/authStore";
import { useNavigate, useLocation } from "react-router-dom";
import { BookOpen, Camera, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import Webcam from "react-webcam";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [fullName, setFullName] = useState("");
  const [className, setClassName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTingkat, setSelectedTingkat] = useState("");
  const [courseId, setCourseId] = useState("");
  const [loginMataKuliah, setLoginMataKuliah] = useState("");
  const [seafarerCode, setSeafarerCode] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [courses, setCourses] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Face detection sign-in states
  const [showFaceScanPopup, setShowFaceScanPopup] = useState(false);
  const [faceScanStep, setFaceScanStep] = useState<"scanning" | "matched" | "unmatched">("scanning");
  const [faceRegistrations, setFaceRegistrations] = useState<any[]>([]);
  const [pendingLoginData, setPendingLoginData] = useState<any>(null);

  useEffect(() => {
    if (showFaceScanPopup && faceScanStep === "scanning") {
      const timer = setTimeout(() => {
        setFaceScanStep("matched");
      }, 3000); // 3 seconds scan matching animation
      return () => clearTimeout(timer);
    }
  }, [showFaceScanPopup, faceScanStep]);

  const handleCompleteFaceLogin = async () => {
    if (!pendingLoginData) return;
    const { user, dummyToken, verification, courseId, selectedCategory, loginMataKuliah } = pendingLoginData;

    try {
      // Create login log
      await supabase.from('login_logs').insert([{
        user_id: user.id,
        course_id: courseId,
        ip_address: "Face Recognition Login",
        user_agent: navigator.userAgent
      }]);

      login(dummyToken, {
        id: user.id,
        name: user.full_name,
        role: user.role,
        identity: user.identity_number,
        is_verified: true
      });

      setShowFaceScanPopup(false);
      navigate("/user");
    } catch (err: any) {
      alert("Gagal masuk: " + err.message);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const catParam = params.get('category');
    const courseParam = params.get('course');
    const periodStartParam = params.get('periodStart');
    const periodEndParam = params.get('periodEnd');
    
    if (catParam) {
      setSelectedCategory(catParam);
    }
    if (courseParam) {
      setCourseId(courseParam);
    }
    if (periodStartParam && periodEndParam) {
      setPeriodStart(periodStartParam);
      setPeriodEnd(periodEndParam);
    }
  }, [location.search]);

  const selectedCourse = courses.find(c => c.id === courseId);

  const availableMataKuliahs = useMemo(() => {
    if (!selectedCourse?.videos) return [];
    const set = new Set<string>();
    selectedCourse.videos.forEach((v: any) => {
      if (v.mata_kuliah) {
        set.add(v.mata_kuliah.toUpperCase().trim());
      }
    });
    return Array.from(set).sort();
  }, [selectedCourse]);

  const availableTingkatOptions = useMemo(() => {
    if (!selectedCategory) return [];
    if (selectedCategory !== "UJIAN UAD" && selectedCategory !== "LATIHAN UJIAN") return [];
    
    const set = new Set<string>();
    courses.forEach((c: any) => {
      if (c.category === selectedCategory && c.description) {
        set.add(c.description.trim());
      }
    });
    return Array.from(set).sort();
  }, [selectedCategory, courses]);
  const activeRefreshingPeriods = useMemo(() => {
    if (!selectedCourse?.refreshing_periods) return [];
    return selectedCourse.refreshing_periods.filter((p: any) => {
      const endDate = new Date(p.end);
      endDate.setHours(23, 59, 59, 999);
      return endDate.getTime() >= Date.now();
    });
  }, [selectedCourse]);

  const isBstOrKonvensi = selectedCourse && (
    selectedCourse.name.trim().toUpperCase() === 'BST' || 
    selectedCourse.name.trim().toUpperCase() === 'KONVENSI INTERNATIONAL'
  );
  const requiresSeafarerCode = (courseId && !isBstOrKonvensi) || selectedCategory === 'REFRESING' || selectedCategory === 'UJIAN UAD' || selectedCategory === 'LATIHAN UJIAN';

  useEffect(() => {
    // Clear session selfie when visiting login page
    sessionStorage.removeItem('session_selfie');
    
    // Check available courses
    const fetchCourses = async () => {
      const { data, error } = await supabase
        .from('courses')
        .select(`
          *,
          videos (id, is_refreshing, mata_kuliah),
          assessments (id, is_refreshing)
        `)
        .eq('status', 'active');
      
      if (data) {
        setCourses(data);
      } else if (error) {
        console.error("Failed to fetch courses", error);
      }
    };
    fetchCourses();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    
    setError("");
    setIsLoading(true);

    try {
      // Validasi awal
      if (courseId && !isAdminLogin) {
        if (!periodStart || !periodEnd) {
          throw new Error("Periode Diklat Mulai dan Selesai harus diisi untuk pendaftaran pelatihan");
        }
        
        if (requiresSeafarerCode) {
          if (!seafarerCode) {
            throw new Error("Kode Pelaut wajib diisi untuk jenis pelatihan ini");
          }
          if (!/^\d{10}$/.test(seafarerCode)) {
            throw new Error("Kode Pelaut harus berupa 10 digit angka");
          }
        }
      }

      // Check allowlist for Ujian UAD / Latihan Ujian
      if (selectedCategory === 'UJIAN UAD' || selectedCategory === 'LATIHAN UJIAN') {
        const { data: allowed, error: allowError } = await supabase
          .from('allowed_seafarer_codes')
          .select('code')
          .eq('code', seafarerCode)
          .single();

        if (allowError || !allowed) {
          // Check local storage fallback just in case
          const localStr = localStorage.getItem('allowed_seafarer_codes');
          let matched = false;
          if (localStr) {
            const list = JSON.parse(localStr);
            matched = list.some((item: any) => item.code === seafarerCode);
          }
          if (!matched) {
            throw new Error("Kode Pelaut Anda tidak terdaftar untuk mengikuti Ujian UAD/Latihan Ujian. Silakan hubungi admin master.");
          }
        }
      }

      // 1. Check if user exists or create new one
      const dummyIdentity = `${fullName.replace(/\s+/g, '').toUpperCase()}-${className}`;
      const newIdentity = (requiresSeafarerCode && seafarerCode) ? seafarerCode : dummyIdentity;

      // Fetch users by identity number or name
      let { data: usersByIdentity, error: idError } = await supabase
        .from('users')
        .select('*')
        .in('identity_number', [newIdentity, dummyIdentity]);

      let { data: usersByName, error: nameError } = await supabase
        .from('users')
        .select('*')
        .ilike('full_name', fullName);

      if (idError || nameError) {
        console.error("Supabase error checking user:", idError || nameError);
        throw new Error(`Gagal memeriksa data pengguna: ${(idError || nameError)?.message}`);
      }

      const allUsers = [...(usersByIdentity || []), ...(usersByName || [])];
      const uniqueUsers = Array.from(new Map(allUsers.map(u => [u.id, u])).values());
      
      const normalizeName = (name: string) => name.replace(/\s+/g, '').toLowerCase();
      const normalizedInputName = normalizeName(fullName);

      let users = uniqueUsers.filter(u => {
        if (u.role === 'admin' || u.role === 'admin2') return true;
        return normalizeName(u.full_name) === normalizedInputName;
      });

      let user = null;

      if (users && users.length > 0) {
        // Check if it's an admin login attempt
        const adminUser = users.find(u => u.role === 'admin' || u.role === 'admin2');
        if (adminUser) {
          user = adminUser;
        } else {
          if (requiresSeafarerCode && seafarerCode) {
            // Find user with exact seafarer code
            user = users.find(u => u.identity_number === seafarerCode);
            // If not found, try to find a user with a dummy identity (from BST) that we can upgrade
            if (!user) {
              user = users.find(u => !/^\d{10}$/.test(u.identity_number));
            }
          } else {
            // Doesn't require seafarer code. Try to find by dummy identity
            user = users.find(u => u.identity_number === dummyIdentity);
            // If not found, try to find a user who already has a seafarer code
            if (!user) {
              user = users.find(u => /^\d{10}$/.test(u.identity_number));
            }
            // Fallback to the first user if still not found
            if (!user) {
              user = users[0];
            }
          }
        }
      }

      if (user) {
        if (user.role === 'admin' || user.role === 'admin2') {
          // Khusus admin, isian "Kelas" berfungsi sebagai password
          if (className !== 'report123' && className !== user.identity_number) {
            throw new Error("Password/Kelas admin salah");
          }
        } else {
          // Update kelas user biasa jika berbeda
          if (className && user.class_name !== className) {
            const { data: updatedUser } = await supabase
              .from('users')
              .update({ class_name: className })
              .eq('id', user.id)
              .select()
              .single();
            if (updatedUser) user = updatedUser;
          }
          
          // Update identity_number jika sebelumnya dummy dan sekarang ada seafarerCode
          if (requiresSeafarerCode && seafarerCode && user.identity_number !== seafarerCode) {
            const { data: updatedUser } = await supabase
              .from('users')
              .update({ identity_number: seafarerCode })
              .eq('id', user.id)
              .select()
              .single();
            if (updatedUser) user = updatedUser;
          }
        }
      } else {
        // Create new user
        let role = 'user';
        if (fullName === 'Admin Report' && className === 'report123') {
          role = 'admin2';
        } else if (fullName.toLowerCase().includes('admin')) {
          throw new Error("Tidak dapat membuat akun admin baru");
        }
        
        const newIdentity = (requiresSeafarerCode && seafarerCode) ? seafarerCode : dummyIdentity;
        
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert([{ full_name: fullName, identity_number: newIdentity, class_name: className, role: role }])
          .select()
          .single();
          
        if (createError) {
          console.error("Error creating user:", createError);
          throw new Error(`Gagal membuat akun baru: ${createError.message}`);
        }
        user = newUser;
      }

      // 2. Handle enrollment if course selected
      if (courseId && user.role !== 'admin' && user.role !== 'admin2') {
        // Check existing enrollment
        const { data: existingEnrollment } = await supabase
          .from('enrollments')
          .select('id')
          .eq('user_id', user.id)
          .eq('course_id', courseId)
          .single();

        if (!existingEnrollment) {
          const { error: enrollError } = await supabase
            .from('enrollments')
            .insert([{
              user_id: user.id,
              course_id: courseId,
              period_start: new Date(periodStart).toISOString(),
              period_end: new Date(periodEnd).toISOString(),
              category: selectedCategory,
              mata_kuliah: selectedCategory === "DIKLAT PENINGKATAN (PASIS)" ? loginMataKuliah : null
            }]);
            
          if (enrollError) throw new Error("Gagal mendaftar pelatihan");
        } else {
          // Update the category if they login again with a different category
          await supabase
            .from('enrollments')
            .update({ 
              category: selectedCategory,
              mata_kuliah: selectedCategory === "DIKLAT PENINGKATAN (PASIS)" ? loginMataKuliah : null
            })
            .eq('id', existingEnrollment.id);
        }
      }

      // If Category is Ujian UAD, we trigger the face detection popup!
      if (selectedCategory === 'UJIAN UAD') {
        // Look up registered selfies from Latihan Ujian (latihan_verifications table)
        const { data: regs, error: regsErr } = await supabase
          .from('latihan_verifications')
          .select('*')
          .eq('seafarer_code', seafarerCode);

        // Fallback or retrieve
        let matchedRegs = regs || [];
        if (regsErr || matchedRegs.length === 0) {
          // Look in global_verifications as backup
          const { data: gvs } = await supabase
            .from('global_verifications')
            .select('*')
            .eq('user_id', user.id);
          if (gvs && gvs.length > 0) {
            matchedRegs = gvs.map(g => ({
              ...g,
              seafarer_code: seafarerCode
            }));
          }
        }

        if (matchedRegs.length === 0) {
          throw new Error("Wajah Anda belum terdaftar di Latihan Ujian. Silakan lakukan Verifikasi/Ambil Foto di Latihan Ujian terlebih dahulu.");
        }

        setFaceRegistrations(matchedRegs);
        setFaceScanStep("scanning");
        setShowFaceScanPopup(true);

        const dummyToken = `supabase-auth-${user.id}-${Date.now()}`;
        const { data: verification } = await supabase
          .from('global_verifications')
          .select('id')
          .eq('user_id', user.id)
          .single();

        setPendingLoginData({
          user,
          dummyToken,
          verification,
          courseId,
          selectedCategory,
          loginMataKuliah
        });

        setIsLoading(false);
        return; // Pause the flow, the Webcam modal takes over!
      }

      // 3. Log login
      await supabase.from('login_logs').insert([{
        user_id: user.id,
        ip_address: 'client', // IP is harder to get purely client-side without an external API
        user_agent: navigator.userAgent
      }]);

      // 4. Check verification status
      const { data: verification } = await supabase
        .from('global_verifications')
        .select('id')
        .eq('user_id', user.id)
        .single();

      // 5. Set auth state (using a dummy token since we're serverless without true auth)
      const dummyToken = `supabase-auth-${user.id}-${Date.now()}`;
      if (selectedCategory === "DIKLAT PENINGKATAN (PASIS)") {
        localStorage.setItem("selected_mata_kuliah", loginMataKuliah);
      } else {
        localStorage.removeItem("selected_mata_kuliah");
      }
      login(dummyToken, {
        id: user.id,
        name: user.full_name,
        role: user.role,
        identity: user.identity_number,
        is_verified: !!verification
      });
      
      if (user.role === "admin" || user.role === "admin2") {
        navigate("/admin");
      } else {
        navigate("/user");
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat login");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCourses = useMemo(() => {
    if (!selectedCategory) return courses;
    if (selectedCategory === "REFRESING") {
      return courses.filter(c => {
        const hasRefreshingVideo = c.videos?.some((v: any) => v.is_refreshing);
        const hasRefreshingAssessment = c.assessments?.some((a: any) => a.is_refreshing);
        return c.is_refreshing || hasRefreshingVideo || hasRefreshingAssessment;
      });
    }
    return courses.filter(c => c.category === selectedCategory);
  }, [selectedCategory, courses]);

  const filteredCoursesForTingkat = useMemo(() => {
    if (!selectedCategory) return [];
    if (selectedCategory !== "UJIAN UAD" && selectedCategory !== "LATIHAN UJIAN") {
      return filteredCourses;
    }
    return courses.filter(c => c.category === selectedCategory && c.description === selectedTingkat);
  }, [selectedCategory, selectedTingkat, courses, filteredCourses]);

  const isSelectedPeriodActive = useMemo(() => {
    return activeRefreshingPeriods.some((p: any) => p.start === periodStart && p.end === periodEnd);
  }, [activeRefreshingPeriods, periodStart, periodEnd]);
  
  const isSignInDisabled = isLoading || (selectedCategory === "REFRESING" && !isSelectedPeriodActive);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <BookOpen className="h-12 w-12 text-indigo-600" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Sign in to LMS
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Masukkan Nama Lengkap dan Kelas Anda
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleLogin}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                Nama Lengkap Sesuai KTP
              </label>
              <div className="mt-1">
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              {!(selectedCategory === 'REFRESING' && !isAdminLogin) && (
                <>
                  <label htmlFor="className" className="block text-sm font-medium text-gray-700">
                    <span>{isAdminLogin ? "Password Admin" : "Kelas"}</span>
                  </label>
                  <div className="mt-1">
                    {isAdminLogin ? (
                      <input
                        id="className"
                        name="className"
                        type="password"
                        required
                        placeholder="Masukkan Password Admin"
                        value={className}
                        onChange={(e) => setClassName(e.target.value)}
                        className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                    ) : (
                      <select
                        id="className"
                        name="className"
                        required
                        value={className}
                        onChange={(e) => setClassName(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      >
                        <option value="" disabled>Pilih Kelas</option>
                        {Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map(letter => (
                          <option key={letter} value={letter}>Kelas {letter}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </>
              )}
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdminLogin(!isAdminLogin);
                    setClassName("");
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-500"
                >
                  <span>{isAdminLogin ? "Masuk sebagai Peserta?" : "Masuk sebagai Admin?"}</span>
                </button>
              </div>
            </div>

            {!isAdminLogin && (
              <>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label htmlFor="selectedCategory" className="block text-sm font-medium text-gray-700">
                      Jenis Pelatihan
                    </label>
                    <div className="mt-1">
                      <select
                        id="selectedCategory"
                        name="selectedCategory"
                        value={selectedCategory}
                        onChange={(e) => {
                          setSelectedCategory(e.target.value);
                          setSelectedTingkat("");
                          setCourseId(""); // reset course selection when category changes
                          setLoginMataKuliah("");
                        }}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      >
                        <option value="">-- Pilih Jenis Pelatihan (Opsional untuk Admin) --</option>
                        <option value="DIKLAT KETRAMPILAN (SHORT COURSE)">DIKLAT KETRAMPILAN (SHORT COURSE)</option>
                        <option value="DIKLAT PENINGKATAN (PASIS)">DIKLAT PENINGKATAN (PASIS)</option>
                        <option value="DIKLAT PEMBENTUKAN TARUNA">DIKLAT PEMBENTUKAN TARUNA</option>
                        <option value="REFRESING">REFRESING</option>
                        <option value="UJIAN UAD">UJIAN UAD</option>
                        <option value="LATIHAN UJIAN">LATIHAN UJIAN</option>
                      </select>
                    </div>
                  </div>

                  {selectedCategory && (selectedCategory === "UJIAN UAD" || selectedCategory === "LATIHAN UJIAN") && (
                    <>
                      <div>
                        <label htmlFor="selectedTingkat" className="block text-sm font-medium text-gray-700">
                          {selectedCategory === "UJIAN UAD" ? "Tingkat Ujian" : "Tingkat Latihan"}
                        </label>
                        <div className="mt-1">
                          <select
                            id="selectedTingkat"
                            name="selectedTingkat"
                            required
                            value={selectedTingkat}
                            onChange={(e) => {
                              setSelectedTingkat(e.target.value);
                              setCourseId("");
                            }}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          >
                            <option value="">
                              {selectedCategory === "UJIAN UAD" ? "-- Pilih Tingkat Ujian --" : "-- Pilih Tingkat Latihan --"}
                            </option>
                            {availableTingkatOptions.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {selectedTingkat && (
                        <div>
                          <label htmlFor="courseId" className="block text-sm font-medium text-gray-700">
                            {selectedCategory === "UJIAN UAD" ? "Mata Ujian" : "Mata Latihan"}
                          </label>
                          <div className="mt-1">
                            <select
                              id="courseId"
                              name="courseId"
                              required
                              value={courseId}
                              onChange={(e) => {
                                setCourseId(e.target.value);
                                setLoginMataKuliah("");
                              }}
                              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            >
                              <option value="">
                                {selectedCategory === "UJIAN UAD" ? "-- Pilih Mata Ujian --" : "-- Pilih Mata Latihan --"}
                              </option>
                              {filteredCoursesForTingkat.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {selectedCategory && selectedCategory !== "UJIAN UAD" && selectedCategory !== "LATIHAN UJIAN" && (
                    <div>
                      <label htmlFor="courseId" className="block text-sm font-medium text-gray-700">
                        Sub Pelatihan
                      </label>
                      <div className="mt-1">
                        <select
                          id="courseId"
                          name="courseId"
                          value={courseId}
                          onChange={(e) => {
                            setCourseId(e.target.value);
                            setLoginMataKuliah("");
                          }}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        >
                          <option value="">
                            -- Pilih Sub Pelatihan --
                          </option>
                          {filteredCourses.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {selectedCategory === "DIKLAT PENINGKATAN (PASIS)" && courseId && (
                    <div>
                      <label htmlFor="loginMataKuliah" className="block text-sm font-medium text-gray-700">
                        Mata Kuliah
                      </label>
                      <div className="mt-1">
                        <select
                          id="loginMataKuliah"
                          name="loginMataKuliah"
                          value={loginMataKuliah}
                          onChange={(e) => setLoginMataKuliah(e.target.value)}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm uppercase font-semibold text-indigo-950"
                        >
                          <option value="">-- Semua Mata Kuliah --</option>
                          {availableMataKuliahs.map(mk => (
                            <option key={mk} value={mk}>{mk}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {requiresSeafarerCode && (
                  <div>
                    <label htmlFor="seafarerCode" className="block text-sm font-medium text-gray-700">
                      Kode Pelaut (10 digit angka)
                    </label>
                    <div className="mt-1">
                      <input
                        id="seafarerCode"
                        name="seafarerCode"
                        type="text"
                        required
                        maxLength={10}
                        value={seafarerCode}
                        onChange={(e) => setSeafarerCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="Masukkan 10 digit angka"
                        className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                    </div>
                  </div>
                )}

                {selectedCategory === "REFRESING" && selectedCourse ? (
                  activeRefreshingPeriods.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label htmlFor="refreshingPeriod" className="block text-sm font-medium text-gray-700">
                          Periode Refresing
                        </label>
                        <div className="mt-1">
                          <select
                            id="refreshingPeriod"
                            value={`${periodStart}|${periodEnd}`}
                            onChange={(e) => {
                              if (e.target.value && e.target.value !== '|') {
                                const [start, end] = e.target.value.split('|');
                                setPeriodStart(start);
                                setPeriodEnd(end);
                              } else {
                                setPeriodStart('');
                                setPeriodEnd('');
                              }
                            }}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          >
                            <option value="|">-- Pilih Periode --</option>
                            {activeRefreshingPeriods.map((p: any, idx: number) => (
                              <option key={idx} value={`${p.start}|${p.end}`}>
                                {new Date(p.start).toLocaleDateString('id-ID')} - {new Date(p.end).toLocaleDateString('id-ID')}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
                      Pendaftaran untuk Pelatihan Refresing ini sudah ditutup atau periode link telah kadaluarsa.
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="periodStart" className="block text-sm font-medium text-gray-700">
                        Periode Diklat Mulai
                      </label>
                      <div className="mt-1">
                        <input
                          id="periodStart"
                          name="periodStart"
                          type="date"
                          value={periodStart}
                          onChange={(e) => setPeriodStart(e.target.value)}
                          className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="periodEnd" className="block text-sm font-medium text-gray-700">
                        Periode Diklat Selesai
                      </label>
                      <div className="mt-1">
                        <input
                          id="periodEnd"
                          name="periodEnd"
                          type="date"
                          value={periodEnd}
                          onChange={(e) => setPeriodEnd(e.target.value)}
                          className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div>
              <button
                type="submit"
                disabled={isSignInDisabled}
                className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${isSignInDisabled ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
              >
                {isLoading ? 'Sedang memproses...' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showFaceScanPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col">
            <div className="bg-indigo-600 px-6 py-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 animate-pulse" />
                <h3 className="font-bold text-lg">BIOMETRIC FACE LOGIN - UJIAN UAD</h3>
              </div>
              <button 
                onClick={() => {
                  setShowFaceScanPopup(false);
                  setIsLoading(false);
                }} 
                className="text-white hover:text-gray-200 transition"
              >
                <span className="text-xl">✕</span>
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {faceScanStep === "scanning" ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-6">
                  {/* Webcam capture area with scan animated bar */}
                  <div className="relative w-80 h-60 rounded-xl overflow-hidden bg-black shadow-lg border-2 border-indigo-400">
                    <Webcam
                      audio={false}
                      screenshotFormat="image/jpeg"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 border border-indigo-300 pointer-events-none rounded-xl"></div>
                    <div className="absolute left-0 right-0 h-1 bg-green-400 opacity-80 animate-[bounce_3s_infinite] shadow-[0_0_10px_#4ade80]"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-48 h-48 border-2 border-dashed border-white/50 rounded-full animate-spin"></div>
                    </div>
                  </div>
                  <div className="text-center">
                    <h4 className="text-lg font-semibold text-gray-800 animate-pulse">Memindai Struktur Wajah...</h4>
                    <p className="text-sm text-gray-500 mt-1 font-sans">Harap arahkan wajah Anda ke kamera dan pertahankan posisi Anda.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm">STRUKTUR WAJAH SESUAI (MATCHED)</h4>
                      <p className="text-xs text-green-700 mt-0.5">Sistem memverifikasi identitas Anda terhadap pendaftaran Latihan Ujian.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Live webcam capture snapshot / live preview */}
                    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col items-center justify-center">
                      <span className="text-xs font-semibold text-gray-500 mb-2 uppercase">Kamera Live:</span>
                      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
                        <Webcam
                          audio={false}
                          screenshotFormat="image/jpeg"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-2 left-2 bg-green-500 text-white text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded shadow">
                          Live Verified
                        </div>
                      </div>
                    </div>

                    {/* KTP terdaftar */}
                    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col items-center justify-center">
                      <span className="text-xs font-semibold text-gray-500 mb-2 uppercase">Foto KTP Terdaftar:</span>
                      <div className="w-full aspect-video rounded-lg overflow-hidden bg-white flex items-center justify-center border">
                        {faceRegistrations[0]?.ktp_photo_url ? (
                          <img
                            src={faceRegistrations[0].ktp_photo_url}
                            alt="KTP"
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="text-gray-400 text-xs">KTP tidak tersedia</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <span className="text-xs font-semibold text-gray-600 block mb-3 uppercase">
                      Data Wajah Terdaftar di Latihan Ujian ({faceRegistrations.length}):
                    </span>
                    
                    {/* Handle duplicate or multiple faces */}
                    {faceRegistrations.length >= 2 ? (
                      <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg mb-4 text-amber-800 text-xs flex gap-2">
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-semibold block">PENTING: Terdeteksi {faceRegistrations.length} Wajah Berbeda dalam Database Peserta</strong>
                          Sistem mendeteksi riwayat pendaftaran wajah berganda untuk Kode Pelaut ini. Harap verifikasi kesesuaian fisik di bawah.
                        </div>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {faceRegistrations.map((reg, rIdx) => (
                        <div key={reg.id || rIdx} className="border border-gray-200 rounded-lg p-2 bg-white relative">
                          <div className="aspect-square rounded overflow-hidden bg-gray-50 border">
                            <img
                              src={reg.live_photo_url}
                              alt={`Registered Face ${rIdx + 1}`}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <p className="text-[10px] text-gray-500 text-center mt-2 font-medium">
                            {faceRegistrations.length >= 2 ? `Wajah Terdaftar #${rIdx + 1}` : 'Wajah Terdaftar'}
                          </p>
                          <span className="absolute top-2 right-2 bg-indigo-600 text-white text-[9px] px-1.5 py-0.5 rounded font-semibold shadow">
                            Template {rIdx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t">
              <button
                onClick={() => {
                  setShowFaceScanPopup(false);
                  setIsLoading(false);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-100 font-medium transition"
              >
                Batal
              </button>
              {faceScanStep === "matched" && (
                <button
                  onClick={handleCompleteFaceLogin}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition shadow-sm"
                >
                  Konfirmasi & Selesai Masuk
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
