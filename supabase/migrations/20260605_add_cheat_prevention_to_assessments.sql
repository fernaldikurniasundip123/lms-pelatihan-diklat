-- Add cheat prevention and UX columns to assessments table
ALTER TABLE public.assessments 
  ADD COLUMN IF NOT EXISTS is_strict_mode boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_randomized boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_one_by_one boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS prevent_copypaste boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS prevent_split_screen boolean DEFAULT false;
