import fs from 'fs';
let content = fs.readFileSync('src/pages/user/CourseView.tsx', 'utf-8');

const linkTugasTarget = `                {/* Link Tugas Section */}
                <div className="bg-indigo-50 rounded-xl border border-indigo-100 overflow-hidden">`;

const linkTugasReplacement = `                {/* Link Tugas Section */}
                {!isRefreshing && (
                <div className="bg-indigo-50 rounded-xl border border-indigo-100 overflow-hidden">`;

const linkTugasEndTarget = `                      </div>
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

const linkTugasEndReplacement = `                      </div>
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

// I need to add the refreshing material link rendering.
// Because it "materi di letakan di bagian video diklat bisa di scrol-scrol ke bawah untuk belajar dan setelahnya mengerjakan Final Asesment", I will wrap it in an iframe.
const materialTarget = `                {/* Final Assessment Section */}
                {assessments.find(a => !a.video_id) && (
                  <button`;

const materialReplacement = `                {/* Refreshing Material Link Section */}
                {isRefreshing && assessments.find(a => !a.video_id)?.refreshing_material_link && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        Materi Refresing
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Silahkan pelajari materi berikut sebelum mengerjakan Final Assessment.
                      </p>
                    </div>
                    <div className="w-full" style={{ height: '500px' }}>
                      <iframe 
                        src={assessments.find(a => !a.video_id)?.refreshing_material_link} 
                        className="w-full h-full border-0"
                        title="Materi Refresing PDF"
                        allowFullScreen
                      />
                    </div>
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
                  </div>
                )}

                {/* Final Assessment Section */}
                {assessments.find(a => !a.video_id) && (
                  <button`;

content = content.replace(linkTugasTarget, linkTugasReplacement);
content = content.replace(linkTugasEndTarget, linkTugasEndReplacement);
content = content.replace(materialTarget, materialReplacement);

// It's possible I might need to declare `isRefreshing` higher up or it's just inside the component.
// `isRefreshing` is defined inside `fetchCourseData`! So it's not a state.
fs.writeFileSync('src/pages/user/CourseView.tsx', content);
