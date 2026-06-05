import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);
async function run() {
  if (!supabaseUrl) {
    console.error("VITE_SUPABASE_URL is empty in process.env");
    return;
  }
  // 1. Fetch a course ID
  const { data: courses, error: courseError } = await supabase.from('courses').select('id, name').limit(1);
  if (courseError) {
    console.error("Failed to fetch courses:", courseError);
    return;
  }
  if (!courses || courses.length === 0) {
    console.log("No courses found.");
    return;
  }
  
  const courseId = courses[0].id;
  console.log(`Using course: ${courses[0].name} (${courseId})`);

  // 2. Try inserting payload representing UJIAN UAD or LATIHAN UJIAN
  const payload: any = {
    course_id: courseId,
    video_id: null,
    title: "TEST UJIAN UAD",
    passing_score: 70,
    duration_minutes: 60,
    is_mandatory: true,
    is_strict_mode: false,
    is_randomized: false,
    show_one_by_one: false,
    prevent_copypaste: false,
    prevent_split_screen: false
  };

  console.log("Attempting to insert payload:", payload);
  const { data, error } = await supabase.from('assessments').insert([payload]);
  
  console.log("Data:", JSON.stringify(data));
  console.log("Error:", JSON.stringify(error));
}
run();
