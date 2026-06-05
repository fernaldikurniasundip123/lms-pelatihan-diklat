-- Add mata_kuliah column to videos table
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS mata_kuliah text;
