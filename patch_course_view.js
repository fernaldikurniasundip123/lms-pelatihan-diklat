import fs from 'fs';
let content = fs.readFileSync('src/pages/user/CourseView.tsx', 'utf-8');

const target1 = `        {/* Left Column - Video Player */}
        <div className="flex-1 flex flex-col gap-6">
          {activeVideo ? (
            <div className="bg-black rounded-2xl aspect-video shadow-xl overflow-hidden relative">
              <YouTubePlayer 
                videoId={activeVideo.youtube_id} 
                initialProgressPct={activeVideo.progress_percentage || 0}
                onProgress={handleProgress}
                onComplete={handleComplete}
              />
            </div>
          ) : (
            <div className="bg-gray-200 rounded-2xl aspect-video flex items-center justify-center text-gray-500">
              No video selected
            </div>
          )}

          {activeVideo && (
            <div className="flex flex-col gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{activeVideo.title}</h2>
                <p className="text-gray-600 leading-relaxed">{activeVideo.description}</p>
              </div>
            </div>
          )}
        </div>`;

const rep1 = `        {/* Left Column - Video Player */}
        <div className="flex-1 flex flex-col gap-6">
          {(!isRefreshing && activeVideo) ? (
            <div className="bg-black rounded-2xl aspect-video shadow-xl overflow-hidden relative">
              <YouTubePlayer 
                videoId={activeVideo.youtube_id} 
                initialProgressPct={activeVideo.progress_percentage || 0}
                onProgress={handleProgress}
                onComplete={handleComplete}
              />
            </div>
          ) : isRefreshing ? (
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col" style={{ minHeight: '600px' }}>
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  Materi Refresing
                </h3>
              </div>
              <div className="flex-1 w-full bg-gray-100">
                {assessments.find(a => !a.video_id)?.refreshing_material_link ? (
                  <iframe 
                    src={assessments.find(a => !a.video_id)?.refreshing_material_link} 
                    className="w-full h-full border-0"
                    title="Materi Refresing"
                    allowFullScreen
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 flex-col gap-2 p-8 text-center">
                    <p>Materi belum tersedia</p>
                  </div>
                )}
              </div>
              {assessments.find(a => !a.video_id)?.refreshing_material_link && (
                <div className="p-3 bg-gray-50 border-t border-gray-200 text-center">
                  <a 
                    href={assessments.find(a => !a.video_id)?.refreshing_material_link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 font-medium hover:underline"
                  >
                    Buka di tab baru (jika PDF tidak muncul)
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-200 rounded-2xl aspect-video flex items-center justify-center text-gray-500">
              No video selected
            </div>
          )}

          {!isRefreshing && activeVideo && (
            <div className="flex flex-col gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{activeVideo.title}</h2>
                <p className="text-gray-600 leading-relaxed">{activeVideo.description}</p>
              </div>
            </div>
          )}
        </div>`;

console.log("Replacing 1: ", content.includes(target1));
content = content.replace(target1, rep1);

const target2 = `            <div className="p-6 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Course Content</h3>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: \`\${course.progress || 0}%\` }}></div>
                </div>
                <span className="font-medium">{Math.round(course.progress || 0)}%</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">`;

const rep2 = `            {!isRefreshing && (
              <div className="p-6 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Course Content</h3>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: \`\${course.progress || 0}%\` }}></div>
                  </div>
                  <span className="font-medium">{Math.round(course.progress || 0)}%</span>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-2">`;

console.log("Replacing 2: ", content.includes(target2));
content = content.replace(target2, rep2);

const target3 = `                {/* Link Tugas Section */}
                <div className="bg-indigo-50 rounded-xl border border-indigo-100 overflow-hidden">`;

const rep3 = `                {/* Link Tugas Section */}
                {!isRefreshing && (
                  <div className="bg-indigo-50 rounded-xl border border-indigo-100 overflow-hidden">`;

console.log("Replacing 3: ", content.includes(target3));
content = content.replace(target3, rep3);

const target4 = `                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveAssignment}
                          disabled={isSubmittingAssignment || !assignmentLink.trim() || assignmentSaved}
                          className={\`flex-1 py-2 rounded-lg text-sm font-medium transition-colors \${
                            assignmentSaved 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'
                          }\`}
                        >
                          {isSubmittingAssignment ? 'Menyimpan...' : assignmentSaved ? 'Tugas Tersimpan ✓' : 'Simpan Link Tugas'}
                        </button>
                        {assignmentSaved && (
                          <button
                            onClick={async () => {
                              if (confirm('Apakah Anda yakin ingin menghapus link tugas ini?')) {
                                setIsSubmittingAssignment(true);
                                try {
                                  const { error } = await supabase
                                    .from('enrollments')
                                    .update({ assignment_link: null })
                                    .eq('user_id', user.id)
                                    .eq('course_id', courseId);
                                  if (error) throw error;
                                  setAssignmentLink('');
                                  setAssignmentSaved(false);
                                } catch (err) {
                                  console.error(err);
                                  alert('Gagal menghapus link tugas');
                                } finally {
                                  setIsSubmittingAssignment(false);
                                }
                              }
                            }}
                            className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                            title="Hapus Link Tugas"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}`;

const rep4 = `                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveAssignment}
                          disabled={isSubmittingAssignment || !assignmentLink.trim() || assignmentSaved}
                          className={\`flex-1 py-2 rounded-lg text-sm font-medium transition-colors \${
                            assignmentSaved 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'
                          }\`}
                        >
                          {isSubmittingAssignment ? 'Menyimpan...' : assignmentSaved ? 'Tugas Tersimpan ✓' : 'Simpan Link Tugas'}
                        </button>
                        {assignmentSaved && (
                          <button
                            onClick={async () => {
                              if (confirm('Apakah Anda yakin ingin menghapus link tugas ini?')) {
                                setIsSubmittingAssignment(true);
                                try {
                                  const { error } = await supabase
                                    .from('enrollments')
                                    .update({ assignment_link: null })
                                    .eq('user_id', user.id)
                                    .eq('course_id', courseId);
                                  if (error) throw error;
                                  setAssignmentLink('');
                                  setAssignmentSaved(false);
                                } catch (err) {
                                  console.error(err);
                                  alert('Gagal menghapus link tugas');
                                } finally {
                                  setIsSubmittingAssignment(false);
                                }
                              }
                            }}
                            className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                            title="Hapus Link Tugas"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}`;

console.log("Replacing 4: ", content.includes(target4));
content = content.replace(target4, rep4);

// Wait, I also need to hide the videos list if isRefreshing.
const target5 = `              {course.videos?.map((video: any, idx: number) => {`;
const rep5 = `              {!isRefreshing && course.videos?.map((video: any, idx: number) => {`;

console.log("Replacing 5: ", content.includes(target5));
content = content.replace(target5, rep5);


fs.writeFileSync('src/pages/user/CourseView.tsx', content);
