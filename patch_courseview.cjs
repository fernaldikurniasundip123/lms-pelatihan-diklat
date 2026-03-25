const fs = require('fs');
let code = fs.readFileSync('src/pages/user/CourseView.tsx', 'utf8');

code = code.replace(
  /const \[course, setCourse\] = useState<any>\(null\);/,
  `const [course, setCourse] = useState<any>(null);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [assessmentResults, setAssessmentResults] = useState<any[]>([]);`
);

code = code.replace(
  /\/\/ Fetch assessment result[\s\S]*?\.single\(\);/,
  `// Fetch assessments
      const { data: assessmentsData } = await supabase
        .from('assessments')
        .select('*')
        .eq('course_id', courseId);
      setAssessments(assessmentsData || []);

      // Fetch all assessment results
      const { data: resultsData } = await supabase
        .from('assessment_results')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', user.id);
      setAssessmentResults(resultsData || []);`
);

code = code.replace(
  /const totalItems = videosWithProgress\.length \+ 1;[\s\S]*?const progress = totalItems > 0 \? \(completedItems \/ totalItems\) \* 100 : 0;/,
  `const finalAssessment = assessmentsData?.find((a: any) => !a.video_id);
      const totalItems = videosWithProgress.length + (finalAssessment ? 1 : 0);
      let completedItems = videosWithProgress.filter((v: any) => v.completed || (v.progress_percentage || 0) >= 90).length;
      
      if (finalAssessment) {
        const finalResult = resultsData?.find((r: any) => r.assessment_id === finalAssessment.id);
        if (finalResult?.passed) completedItems += 1;
      }

      const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;`
);

code = code.replace(
  /const totalItems = updatedVideos\.length \+ 1;[\s\S]*?const progress = totalItems > 0 \? \(completedItems \/ totalItems\) \* 100 : 0;/,
  `const finalAssessment = assessments?.find((a: any) => !a.video_id);
          const totalItems = updatedVideos.length + (finalAssessment ? 1 : 0);
          let completedItems = updatedVideos.filter((v: any) => v.completed || (v.progress_percentage || 0) >= 90).length;
          
          if (finalAssessment) {
            const finalResult = assessmentResults?.find((r: any) => r.assessment_id === finalAssessment.id);
            if (finalResult?.passed) completedItems += 1;
          }
          
          const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;`
);

const oldVideoList = `              {course.videos?.map((video: any, idx: number) => {
                const isActive = activeVideo?.id === video.id;
                const isCompleted = video.completed || (video.progress_percentage || 0) >= 90;
                
                return (
                  <button
                    key={video.id}
                    onClick={() => setActiveVideo(video)}
                    className={\`w-full flex items-start gap-4 p-4 rounded-xl text-left transition-all \${isActive ? 'bg-indigo-50 border border-indigo-200 shadow-sm' : 'hover:bg-gray-50 border border-transparent'}\`}
                  >
                    <div className={\`mt-0.5 \${isCompleted ? 'text-green-500' : isActive ? 'text-indigo-600' : 'text-gray-400'}\`}>
                      {isCompleted ? <CheckCircle className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={\`text-sm font-medium line-clamp-2 \${isActive ? 'text-indigo-900' : 'text-gray-900'}\`}>
                        {idx + 1}. {video.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Video {video.progress_percentage > 0 && \`- \${Math.round(video.progress_percentage)}%\`}
                      </p>
                    </div>
                  </button>
                );
              })}`;

const newVideoList = `              {course.videos?.map((video: any, idx: number) => {
                const isActive = activeVideo?.id === video.id;
                const isCompleted = video.completed || (video.progress_percentage || 0) >= 90;
                const videoAssessment = assessments.find(a => a.video_id === video.id);
                const assessmentResult = videoAssessment ? assessmentResults.find(r => r.assessment_id === videoAssessment.id) : null;
                const isAssessmentPassed = assessmentResult?.passed;
                
                // Check if previous video's mandatory assessment is passed
                let isLocked = false;
                if (idx > 0) {
                  const prevVideo = course.videos[idx - 1];
                  const prevAssessment = assessments.find(a => a.video_id === prevVideo.id);
                  if (prevAssessment?.is_mandatory) {
                    const prevResult = assessmentResults.find(r => r.assessment_id === prevAssessment.id);
                    if (!prevResult?.passed) {
                      isLocked = true;
                    }
                  }
                }
                
                return (
                  <div key={video.id} className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        if (isLocked) {
                          alert("Anda harus menyelesaikan assessment pada video sebelumnya terlebih dahulu.");
                          return;
                        }
                        setActiveVideo(video);
                      }}
                      className={\`w-full flex items-start gap-4 p-4 rounded-xl text-left transition-all \${isActive ? 'bg-indigo-50 border border-indigo-200 shadow-sm' : 'hover:bg-gray-50 border border-transparent'} \${isLocked ? 'opacity-50 cursor-not-allowed' : ''}\`}
                    >
                      <div className={\`mt-0.5 \${isCompleted ? 'text-green-500' : isActive ? 'text-indigo-600' : 'text-gray-400'}\`}>
                        {isCompleted ? <CheckCircle className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={\`text-sm font-medium line-clamp-2 \${isActive ? 'text-indigo-900' : 'text-gray-900'}\`}>
                          {idx + 1}. {video.title} {isLocked && "(Terkunci)"}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Video {video.progress_percentage > 0 && \`- \${Math.round(video.progress_percentage)}%\`}
                        </p>
                      </div>
                    </button>
                    
                    {videoAssessment && isCompleted && (
                      <button
                        onClick={() => navigate(\`/course/\${course.id}/assessment/\${videoAssessment.id}/precheck\`)}
                        className={\`ml-12 mr-4 p-3 rounded-lg text-sm font-medium flex items-center justify-between transition-colors \${isAssessmentPassed ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100'}\`}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          <span>Assessment: {video.title}</span>
                        </div>
                        {isAssessmentPassed ? (
                          <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded-full">Lulus</span>
                        ) : (
                          <span className="text-xs bg-orange-200 text-orange-800 px-2 py-1 rounded-full">{videoAssessment.is_mandatory ? 'Wajib' : 'Opsional'}</span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}`;

code = code.replace(oldVideoList, newVideoList);

const oldFinalAssessment = `<button
                  onClick={() => navigate(\`/course/\${course.id}/assessment/precheck\`)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all bg-indigo-600 text-white hover:bg-indigo-700 shadow-md"
                >
                  <div className="mt-0.5">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">Final Assessment</p>
                    <p className="text-xs mt-1 text-indigo-100">
                      Ready to start
                    </p>
                  </div>
                </button>`;

const newFinalAssessment = `{assessments.find(a => !a.video_id) && (
                <button
                  onClick={() => {
                    const finalAssessment = assessments.find(a => !a.video_id);
                    navigate(\`/course/\${course.id}/assessment/\${finalAssessment.id}/precheck\`);
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all bg-indigo-600 text-white hover:bg-indigo-700 shadow-md"
                >
                  <div className="mt-0.5">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">Final Assessment</p>
                    <p className="text-xs mt-1 text-indigo-100">
                      Ready to start
                    </p>
                  </div>
                </button>
              )}`;

code = code.replace(oldFinalAssessment, newFinalAssessment);

fs.writeFileSync('src/pages/user/CourseView.tsx', code);
