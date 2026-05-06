import fs from 'fs';
let content = fs.readFileSync('src/pages/admin/Dashboard.tsx', 'utf-8');

content = content.replace(
  "const [viewingQuestionsForAssessmentId, setViewingQuestionsForAssessmentId] = useState<string | null>(null);",
  "const [viewingQuestionsForAssessmentId, setViewingQuestionsForAssessmentId] = useState<string | null>(null);\n  const [refreshingMaterialLinks, setRefreshingMaterialLinks] = useState<Record<string, string>>({});\n  const [isSavingRefreshingMaterial, setIsSavingRefreshingMaterial] = useState<Record<string, boolean>>({});"
);

const fnTarget = `  const handleToggleAssessmentRefreshing = async (assessmentId: string, currentValue: boolean) => {`;
const fnReplacement = `  const handleSaveRefreshingMaterialLink = async (assessmentId: string) => {
    setIsSavingRefreshingMaterial(prev => ({ ...prev, [assessmentId]: true }));
    const link = refreshingMaterialLinks[assessmentId] || null;
    const { error } = await supabase
      .from('assessments')
      .update({ refreshing_material_link: link })
      .eq('id', assessmentId);
    
    if (!error) {
      alert("Material PDF link ditambahkan sukses.");
      fetchCourses();
      setSelectedCourse((prev: any) => ({
        ...prev,
        assessments: prev.assessments.map((a: any) => a.id === assessmentId ? { ...a, refreshing_material_link: link } : a)
      }));
    } else {
      console.error(error);
      alert("Gagal memperbarui link. Error: " + error.message);
    }
    setIsSavingRefreshingMaterial(prev => ({ ...prev, [assessmentId]: false }));
  };

  const handleToggleAssessmentRefreshing = async (assessmentId: string, currentValue: boolean) => {`;
content = content.replace(fnTarget, fnReplacement);

const htmlTarget = `                                <label htmlFor={\`refreshing-final-assessment-\${finalAssessment.id}\`} className="text-sm font-medium text-green-800">Tersedia untuk Refresing</label>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2">`;
const htmlReplacement = `                                <label htmlFor={\`refreshing-final-assessment-\${finalAssessment.id}\`} className="text-sm font-medium text-green-800">Tersedia untuk Refresing</label>
                              </div>
                              
                              {finalAssessment.is_refreshing && (
                                <div className="mt-3 bg-white p-3 rounded border border-green-200">
                                  <label className="block text-xs font-medium text-green-800 mb-1">
                                    Upload PDF Materi Refresing (Link GD/External)
                                  </label>
                                  <div className="flex gap-2">
                                    <input 
                                      type="url"
                                      placeholder="https://..."
                                      value={refreshingMaterialLinks[finalAssessment.id] !== undefined ? refreshingMaterialLinks[finalAssessment.id] : (finalAssessment.refreshing_material_link || "")}
                                      onChange={(e) => setRefreshingMaterialLinks(prev => ({ ...prev, [finalAssessment.id]: e.target.value }))}
                                      className="flex-1 border border-green-300 rounded px-2 py-1 text-xs focus:ring-green-500 focus:border-green-500"
                                    />
                                    <button 
                                      onClick={() => handleSaveRefreshingMaterialLink(finalAssessment.id)}
                                      disabled={isSavingRefreshingMaterial[finalAssessment.id]}
                                      className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                                    >
                                      {isSavingRefreshingMaterial[finalAssessment.id] ? "Menyimpan..." : "Simpan"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2">`;
content = content.replace(htmlTarget, htmlReplacement);

fs.writeFileSync('src/pages/admin/Dashboard.tsx', content);
