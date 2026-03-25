const fs = require('fs');
let code = fs.readFileSync('src/pages/admin/Dashboard.tsx', 'utf8');

code = code.replace(
  /const \[isCreatingAssessment, setIsCreatingAssessment\] = useState\(false\);/,
  `const [isCreatingAssessment, setIsCreatingAssessment] = useState(false);
  const [creatingAssessmentForVideoId, setCreatingAssessmentForVideoId] = useState<string | null>(null);
  const [isMandatory, setIsMandatory] = useState(true);
  const [uploadingAssessmentId, setUploadingAssessmentId] = useState<string | null>(null);
  const [viewingQuestionsForAssessmentId, setViewingQuestionsForAssessmentId] = useState<string | null>(null);`
);

code = code.replace(
  /const handleCreateAssessment = async \(e: React\.FormEvent\) => \{[\s\S]*?alert\("Failed to create assessment"\);\n    \}\n  \};/,
  `const handleCreateAssessment = async (e: React.FormEvent) => {
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
  };`
);

code = code.replace(
  /const handleFileUpload = \(e: React\.ChangeEvent<HTMLInputElement>\) => \{[\s\S]*?if \(!file \|\| !selectedCourse\?\.assessment\) return;/,
  `const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingAssessmentId) return;`
);

code = code.replace(
  /assessment_id: selectedCourse\.assessment\.id,/g,
  `assessment_id: uploadingAssessmentId,`
);

code = code.replace(
  /\.eq\('assessment_id', selectedCourse\.assessment\.id\)/g,
  `.eq('assessment_id', uploadingAssessmentId)`
);

fs.writeFileSync('src/pages/admin/Dashboard.tsx', code);
