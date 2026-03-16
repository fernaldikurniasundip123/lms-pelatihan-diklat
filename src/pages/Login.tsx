import { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [fullName, setFullName] = useState("");
  const [className, setClassName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [seafarerCode, setSeafarerCode] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [courses, setCourses] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const selectedCourse = courses.find(c => c.id === courseId);
  const isBstOrKonvensi = selectedCourse && (
    selectedCourse.name.toLowerCase().includes('bst') || 
    selectedCourse.name.toLowerCase().includes('konvensi international')
  );
  const requiresSeafarerCode = courseId && !isBstOrKonvensi;

  useEffect(() => {
    const fetchCourses = async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
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
    setError("");

    try {
      // 1. Check if user exists or create new one
      let { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('full_name', fullName)
        .single();

      if (userError && userError.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error("Supabase error checking user:", userError);
        throw new Error(`Gagal memeriksa data pengguna: ${userError.message}`);
      }

      if (user) {
        if (user.role === 'admin' || user.role === 'admin2') {
          // Khusus admin, isian "Kelas" berfungsi sebagai password
          if (className !== 'admin123' && className !== 'report123' && className !== user.identity_number) {
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
        }
      } else {
        // Create new user
        let role = 'user';
        if (fullName === 'Admin Report' && className === 'report123') {
          role = 'admin2';
        } else if (className === 'admin123' || fullName.toLowerCase().includes('admin')) {
          throw new Error("Tidak dapat membuat akun admin baru");
        }
        
        const dummyIdentity = `${fullName.replace(/\s+/g, '').toUpperCase()}-${className}`;
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert([{ full_name: fullName, identity_number: dummyIdentity, class_name: className, role: role }])
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
          
          // Update user's identity_number with seafarer code if it's different
          if (user.identity_number !== seafarerCode) {
            const { data: updatedUser } = await supabase
              .from('users')
              .update({ identity_number: seafarerCode })
              .eq('id', user.id)
              .select()
              .single();
            if (updatedUser) user = updatedUser;
          }
        }

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
              period_end: new Date(periodEnd).toISOString()
            }]);
            
          if (enrollError) throw new Error("Gagal mendaftar pelatihan");
        }
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
    }
  };

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
              <label htmlFor="className" className="block text-sm font-medium text-gray-700">
                {isAdminLogin ? "Password Admin" : "Kelas"}
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
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdminLogin(!isAdminLogin);
                    setClassName("");
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-500"
                >
                  {isAdminLogin ? "Masuk sebagai Peserta?" : "Masuk sebagai Admin?"}
                </button>
              </div>
            </div>

            {!isAdminLogin && (
              <>
                <div>
                  <label htmlFor="courseId" className="block text-sm font-medium text-gray-700">
                    Jenis Pelatihan
                  </label>
                  <div className="mt-1">
                    <select
                      id="courseId"
                      name="courseId"
                      value={courseId}
                      onChange={(e) => setCourseId(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="">-- Pilih Pelatihan (Opsional untuk Admin) --</option>
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
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
              </>
            )}

            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Sign in
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
