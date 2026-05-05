import fs from 'fs';

let content = fs.readFileSync('src/pages/admin/Dashboard.tsx', 'utf-8');
content = content.replace(/c => filterCategory \? c.category === filterCategory \|\| \(filterCategory === 'REFRESING' && c.category === 'DIKLAT KETRAMPILAN \(SHORT COURSE\)'\) : true/g, "c => filterCategory ? c.category === filterCategory || (filterCategory === 'REFRESING' && (c.is_refreshing || c.videos?.some((v: any) => v.is_refreshing) || c.assessments?.some((a: any) => a.is_refreshing))) : true");

fs.writeFileSync('src/pages/admin/Dashboard.tsx', content);
