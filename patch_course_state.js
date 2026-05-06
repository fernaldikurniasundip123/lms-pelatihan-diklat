import fs from 'fs';
let content = fs.readFileSync('src/pages/user/CourseView.tsx', 'utf-8');

content = content.replace(
  "const [isChatOpen, setIsChatOpen] = useState(false);",
  "const [isChatOpen, setIsChatOpen] = useState(false);\n  const [isRefreshing, setIsRefreshing] = useState(false);"
);

content = content.replace(
  "const isRefreshing = enrollmentData?.category === 'REFRESING';",
  "const refreshingStatus = enrollmentData?.category === 'REFRESING';\n      setIsRefreshing(refreshingStatus);"
);

content = content.replace(
  "if (isRefreshing) {",
  "if (refreshingStatus) {"
);

content = content.replace(
  "if (isRefreshing) {", // this handles the second instance in fetchCourse
  "if (refreshingStatus) {"
);


fs.writeFileSync('src/pages/user/CourseView.tsx', content);
