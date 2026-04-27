-- Add category and is_refreshing columns to courses table
ALTER TABLE public.courses ADD COLUMN category text DEFAULT 'DIKLAT KETRAMPILAN (SHORT COURSE)';
ALTER TABLE public.courses ADD COLUMN is_refreshing boolean DEFAULT false;
