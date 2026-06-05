-- Add mata_kuliah column to enrollments table
ALTER TABLE public.enrollments ADD COLUMN IF NOT EXISTS mata_kuliah text;
