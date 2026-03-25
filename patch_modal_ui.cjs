const fs = require('fs');
let code = fs.readFileSync('src/pages/admin/Dashboard.tsx', 'utf8');

const oldUI = `                <div className="pt-6 mt-6 border-t border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-indigo-600" /> Assessment
                  </h4>
                  {selectedCourse.assessment ? (
                    <div className="flex flex-col gap-4">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Assessment Configured</p>
                            <p className="text-sm mt-1">Passing Grade: {selectedCourse.assessment.passing_score} | Duration: {selectedCourse.assessment.duration_minutes}m</p>
                            <p className="text-sm mt-1 font-semibold">{assessmentQuestions.length} Questions imported</p>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button onClick={downloadTemplate} className="flex-1 px-3 py-2 bg-white border border-green-300 rounded text-sm font-medium hover:bg-green-100 flex items-center justify-center gap-2">
                            <Download className="w-4 h-4" /> Template
                          </button>
                          <button onClick={() => fileInputRef.current?.click()} className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 flex items-center justify-center gap-2">
                            <Upload className="w-4 h-4" /> Import CSV
                          </button>
                          <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                        </div>
                        <button 
                          onClick={() => setIsViewingQuestions(!isViewingQuestions)} 
                          className="w-full mt-2 px-3 py-2 bg-white border border-green-300 rounded text-sm font-medium hover:bg-green-100 transition-colors"
                        >
                          {isViewingQuestions ? 'Hide Questions' : 'View Questions'}
                        </button>
                      </div>

                      {isViewingQuestions && assessmentQuestions.length > 0 && (
                        <div className="space-y-3 mt-2 max-h-96 overflow-y-auto pr-2">
                          {assessmentQuestions.map((q, idx) => (
                            <div key={q.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm relative">
                              <button 
                                onClick={() => handleDeleteQuestion(q.id)}
                                className="absolute top-3 right-3 text-red-500 hover:text-red-700 p-1 bg-red-50 rounded-md"
                                title="Delete question"
                              >
                                <X className="w-4 h-4" />
                              </button>
                              <p className="font-medium text-gray-900 text-sm pr-8 mb-3">{idx + 1}. {q.question_text}</p>
                              <div className="space-y-2">
                                {q.options.map((opt: string, oIdx: number) => (
                                  <div key={oIdx} className={\`text-xs p-2 rounded border \${oIdx === q.correct_option_index ? 'bg-green-50 border-green-200 text-green-800 font-medium' : 'bg-gray-50 border-gray-200 text-gray-600'}\`}>
                                    {String.fromCharCode(65 + oIdx)}. {opt}
                                    {oIdx === q.correct_option_index && ' (Correct)'}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : isCreatingAssessment ? (
                    <form onSubmit={handleCreateAssessment} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Passing Grade (0-100)</label>
                        <input type="number" min="0" max="100" value={passingGrade} onChange={e => setPassingGrade(Number(e.target.value))} className="w-full mt-1 px-2 py-1 border rounded" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Duration (Minutes)</label>
                        <input type="number" min="1" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))} className="w-full mt-1 px-2 py-1 border rounded" />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button type="button" onClick={() => setIsCreatingAssessment(false)} className="flex-1 py-1.5 bg-gray-200 rounded text-sm font-medium">Cancel</button>
                        <button type="submit" className="flex-1 py-1.5 bg-indigo-600 text-white rounded text-sm font-medium">Save</button>
                      </div>
                    </form>
                  ) : (
                    <button onClick={() => setIsCreatingAssessment(true)} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 font-medium hover:border-indigo-500 hover:text-indigo-600 transition-colors">
                      + Create Final Assessment
                    </button>
                  )}
                </div>`;

const newUI = `                <div className="pt-6 mt-6 border-t border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-indigo-600" /> Final Assessment
                  </h4>
                  {(() => {
                    const finalAssessment = selectedCourse.assessments?.find((a: any) => !a.video_id);
                    return finalAssessment ? (
                      <div className="flex flex-col gap-4">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Final Assessment Configured</p>
                              <p className="text-sm mt-1">Passing Grade: {finalAssessment.passing_score} | Duration: {finalAssessment.duration_minutes}m</p>
                              <p className="text-sm mt-1">Mandatory: {finalAssessment.is_mandatory ? 'Yes' : 'No'}</p>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button onClick={downloadTemplate} className="flex-1 px-3 py-2 bg-white border border-green-300 rounded text-sm font-medium hover:bg-green-100 flex items-center justify-center gap-2">
                              <Download className="w-4 h-4" /> Template
                            </button>
                            <button onClick={() => {
                              setUploadingAssessmentId(finalAssessment.id);
                              fileInputRef.current?.click();
                            }} className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 flex items-center justify-center gap-2">
                              <Upload className="w-4 h-4" /> Import CSV
                            </button>
                            <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                          </div>
                          <button 
                            onClick={() => {
                              if (viewingQuestionsForAssessmentId === finalAssessment.id) {
                                setViewingQuestionsForAssessmentId(null);
                              } else {
                                setViewingQuestionsForAssessmentId(finalAssessment.id);
                                // Fetch questions for this assessment
                                supabase.from('questions').select('*').eq('assessment_id', finalAssessment.id).order('order_num', { ascending: true })
                                  .then(({ data }) => setAssessmentQuestions(data || []));
                              }
                            }} 
                            className="w-full mt-2 px-3 py-2 bg-white border border-green-300 rounded text-sm font-medium hover:bg-green-100 transition-colors"
                          >
                            {viewingQuestionsForAssessmentId === finalAssessment.id ? 'Hide Questions' : 'View Questions'}
                          </button>
                        </div>

                        {viewingQuestionsForAssessmentId === finalAssessment.id && assessmentQuestions.length > 0 && (
                          <div className="space-y-3 mt-2 max-h-96 overflow-y-auto pr-2">
                            {assessmentQuestions.map((q, idx) => (
                              <div key={q.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm relative">
                                <button 
                                  onClick={() => handleDeleteQuestion(q.id)}
                                  className="absolute top-3 right-3 text-red-500 hover:text-red-700 p-1 bg-red-50 rounded-md"
                                  title="Delete question"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                                <p className="font-medium text-gray-900 text-sm pr-8 mb-3">{idx + 1}. {q.question_text}</p>
                                <div className="space-y-2">
                                  {q.options.map((opt: string, oIdx: number) => (
                                    <div key={oIdx} className={\`text-xs p-2 rounded border \${oIdx === q.correct_option_index ? 'bg-green-50 border-green-200 text-green-800 font-medium' : 'bg-gray-50 border-gray-200 text-gray-600'}\`}>
                                      {String.fromCharCode(65 + oIdx)}. {opt}
                                      {oIdx === q.correct_option_index && ' (Correct)'}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : isCreatingAssessment && creatingAssessmentForVideoId === null ? (
                      <form onSubmit={handleCreateAssessment} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700">Passing Grade (0-100)</label>
                          <input type="number" min="0" max="100" value={passingGrade} onChange={e => setPassingGrade(Number(e.target.value))} className="w-full mt-1 px-2 py-1 border rounded" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700">Duration (Minutes)</label>
                          <input type="number" min="1" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))} className="w-full mt-1 px-2 py-1 border rounded" />
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <input type="checkbox" id="isMandatoryFinal" checked={isMandatory} onChange={e => setIsMandatory(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                          <label htmlFor="isMandatoryFinal" className="text-xs font-medium text-gray-700">Wajib dikerjakan (Mandatory)</label>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button type="button" onClick={() => setIsCreatingAssessment(false)} className="flex-1 py-1.5 bg-gray-200 rounded text-sm font-medium">Cancel</button>
                          <button type="submit" className="flex-1 py-1.5 bg-indigo-600 text-white rounded text-sm font-medium">Save</button>
                        </div>
                      </form>
                    ) : (
                      <button onClick={() => { setIsCreatingAssessment(true); setCreatingAssessmentForVideoId(null); }} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 font-medium hover:border-indigo-500 hover:text-indigo-600 transition-colors">
                        + Create Final Assessment
                      </button>
                    );
                  })()}
                </div>`;

// Now we also need to change the video list to include the assessment per video.
const oldVideoList = `{selectedCourse.videos.map((video: any, idx: number) => (
                      <div key={video.id} className="bg-white border border-gray-200 rounded-lg p-4 flex gap-4 items-start shadow-sm">
                        <div className="bg-indigo-100 text-indigo-700 font-bold w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className="font-medium text-gray-900 truncate">{video.title}</h5>
                          <p className="text-xs text-gray-500 mt-1 truncate">ID: {video.youtube_id}</p>
                        </div>
                        <button className="text-red-500 hover:text-red-700 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}`;

const newVideoList = `{selectedCourse.videos.map((video: any, idx: number) => {
                      const videoAssessment = selectedCourse.assessments?.find((a: any) => a.video_id === video.id);
                      return (
                        <div key={video.id} className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-4 shadow-sm">
                          <div className="flex gap-4 items-start">
                            <div className="bg-indigo-100 text-indigo-700 font-bold w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h5 className="font-medium text-gray-900 truncate">{video.title}</h5>
                              <p className="text-xs text-gray-500 mt-1 truncate">ID: {video.youtube_id}</p>
                            </div>
                            <button className="text-red-500 hover:text-red-700 p-1">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          
                          {/* Video Assessment Section */}
                          <div className="pl-12 border-t border-gray-100 pt-3">
                            {videoAssessment ? (
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-sm">
                                <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <p className="font-medium">Assessment Configured</p>
                                    <p className="text-xs mt-1">Passing Grade: {videoAssessment.passing_score} | Duration: {videoAssessment.duration_minutes}m</p>
                                    <p className="text-xs mt-1">Mandatory: {videoAssessment.is_mandatory ? 'Yes' : 'No'}</p>
                                  </div>
                                </div>
                                <div className="flex gap-2 mt-2">
                                  <button onClick={() => {
                                    setUploadingAssessmentId(videoAssessment.id);
                                    fileInputRef.current?.click();
                                  }} className="flex-1 px-2 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 flex items-center justify-center gap-1">
                                    <Upload className="w-3 h-3" /> Import CSV
                                  </button>
                                  <button 
                                    onClick={() => {
                                      if (viewingQuestionsForAssessmentId === videoAssessment.id) {
                                        setViewingQuestionsForAssessmentId(null);
                                      } else {
                                        setViewingQuestionsForAssessmentId(videoAssessment.id);
                                        supabase.from('questions').select('*').eq('assessment_id', videoAssessment.id).order('order_num', { ascending: true })
                                          .then(({ data }) => setAssessmentQuestions(data || []));
                                      }
                                    }} 
                                    className="flex-1 px-2 py-1.5 bg-white border border-blue-300 rounded text-xs font-medium hover:bg-blue-100 transition-colors"
                                  >
                                    {viewingQuestionsForAssessmentId === videoAssessment.id ? 'Hide' : 'View'}
                                  </button>
                                </div>
                                
                                {viewingQuestionsForAssessmentId === videoAssessment.id && assessmentQuestions.length > 0 && (
                                  <div className="space-y-2 mt-3 max-h-64 overflow-y-auto pr-2">
                                    {assessmentQuestions.map((q, qIdx) => (
                                      <div key={q.id} className="bg-white border border-gray-200 rounded p-2 shadow-sm relative text-xs text-gray-800">
                                        <button 
                                          onClick={() => handleDeleteQuestion(q.id)}
                                          className="absolute top-1 right-1 text-red-500 hover:text-red-700 p-0.5"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                        <p className="font-medium pr-6 mb-1">{qIdx + 1}. {q.question_text}</p>
                                        <div className="space-y-1">
                                          {q.options.map((opt: string, oIdx: number) => (
                                            <div key={oIdx} className={\`p-1 rounded border \${oIdx === q.correct_option_index ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600'}\`}>
                                              {String.fromCharCode(65 + oIdx)}. {opt}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : isCreatingAssessment && creatingAssessmentForVideoId === video.id ? (
                              <form onSubmit={handleCreateAssessment} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2 text-sm">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700">Passing Grade (0-100)</label>
                                  <input type="number" min="0" max="100" value={passingGrade} onChange={e => setPassingGrade(Number(e.target.value))} className="w-full mt-1 px-2 py-1 border rounded text-xs" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700">Duration (Minutes)</label>
                                  <input type="number" min="1" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))} className="w-full mt-1 px-2 py-1 border rounded text-xs" />
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <input type="checkbox" id={\`isMandatory-\${video.id}\`} checked={isMandatory} onChange={e => setIsMandatory(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                  <label htmlFor={\`isMandatory-\${video.id}\`} className="text-xs font-medium text-gray-700">Wajib dikerjakan (Mandatory)</label>
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <button type="button" onClick={() => setIsCreatingAssessment(false)} className="flex-1 py-1 bg-gray-200 rounded text-xs font-medium">Cancel</button>
                                  <button type="submit" className="flex-1 py-1 bg-indigo-600 text-white rounded text-xs font-medium">Save</button>
                                </div>
                              </form>
                            ) : (
                              <button onClick={() => { setIsCreatingAssessment(true); setCreatingAssessmentForVideoId(video.id); }} className="w-full py-2 border border-dashed border-gray-300 rounded text-gray-500 text-xs font-medium hover:border-indigo-500 hover:text-indigo-600 transition-colors">
                                + Add Assessment for this Video
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}`;

code = code.replace(oldUI, newUI);
code = code.replace(oldVideoList, newVideoList);

fs.writeFileSync('src/pages/admin/Dashboard.tsx', code);
