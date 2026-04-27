-- Add is_refreshing column to videos and assessments tables
ALTER TABLE public.videos ADD COLUMN is_refreshing boolean DEFAULT false;
ALTER TABLE public.assessments ADD COLUMN is_refreshing boolean DEFAULT false;
ALTER TABLE public.enrollments ADD COLUMN category text DEFAULT 'REGULAR';
