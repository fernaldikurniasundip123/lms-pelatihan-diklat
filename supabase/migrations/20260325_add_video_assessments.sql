-- Migration to support per-video assessments
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS video_id UUID REFERENCES videos(id) ON DELETE CASCADE;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN DEFAULT true;

ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE;
