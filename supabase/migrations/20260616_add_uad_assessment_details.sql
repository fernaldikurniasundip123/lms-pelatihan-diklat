-- Add show_in_uad and max_questions columns to assessments table
ALTER TABLE public.assessments 
  ADD COLUMN IF NOT EXISTS show_in_uad boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_questions integer DEFAULT NULL;
