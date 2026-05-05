-- Add refreshing_periods column to courses table
    ALTER TABLE public.courses ADD COLUMN refreshing_periods jsonb DEFAULT '[]'::jsonb;
    
