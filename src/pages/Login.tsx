import { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [fullName, setFullName] = useState("");
  const [className, setClassName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [courses, setCourses] = useState<any[]>([]);
  const [error, setError] = useState("");
  const { login } = useAuthStore();
  const navigate = useNavigate();

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
        .eq('class_name', className)
        .single();

      if (userError && userError.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error("Supabase error checking user:", userError);
        throw new Error(`Gagal memeriksa data pengguna: ${userError.message}`);
      }

      if (!user) {
        // Create new user, generate a dummy identity_number since it might be required in DB
        const dummyIdentity = `${fullName.replace(/\s+/g, '').toUpperCase()}-${className}`;
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert([{ full_name: fullName, identity_number: dummyIdentity, class_name: className, role: 'user' }])
          .select()
          .single();
          
        if (createError) throw new Error("Gagal membuat akun baru");
        user = newUser;
      }

      // 2. Handle enrollment if course selected
      if (courseId && user.role !== 'admin') {
        if (!periodStart || !periodEnd) {
          throw new Error("Periode Diklat Mulai dan Selesai harus diisi untuk pendaftaran pelatihan");
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
      
      if (user.role === "admin") {
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
                Kelas
              </label>
              <div className="mt-1">
                <input
                  id="className"
                  name="className"
                  type="text"
                  required
                  maxLength={2}
                  pattern="[A-Za-z]{1,2}"
                  title="Maksimal 2 huruf abjad (misal: AB)"
                  placeholder="Contoh: AB"
                  value={className}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase();
                    setClassName(val);
                  }}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm uppercase"
                />
              </div>
            </div>

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
