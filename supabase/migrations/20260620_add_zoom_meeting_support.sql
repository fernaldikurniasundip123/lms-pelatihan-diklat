-- Create zoom_settings table to manage Configurations for Pembelajaran Sinkronus Zoom
CREATE TABLE IF NOT EXISTS public.zoom_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_name text NOT NULL,
  zoom_link text NOT NULL,
  course_ids jsonb NOT NULL DEFAULT '[]'::jsonb, -- Store list of course IDs mapped to this link
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for zoom_settings
ALTER TABLE public.zoom_settings ENABLE ROW LEVEL SECURITY;

-- Dynamic Policy for zoom_settings
CREATE POLICY "Allow read for anyone" ON public.zoom_settings FOR SELECT USING (true);
CREATE POLICY "Allow all for authenticated users" ON public.zoom_settings FOR ALL USING (auth.role() = 'authenticated');

-- Create zoom_logs table to track Zoom participant telemetry (duration, cameras, mic states)
CREATE TABLE IF NOT EXISTS public.zoom_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  seafarer_code text,
  class_name text,
  course_id uuid NOT NULL,
  course_name text NOT NULL,
  joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  duration_seconds integer DEFAULT 0,
  camera_on_seconds integer DEFAULT 0,
  camera_off_seconds integer DEFAULT 0,
  mic_on_seconds integer DEFAULT 0,
  last_active timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for zoom_logs
ALTER TABLE public.zoom_logs ENABLE ROW LEVEL SECURITY;

-- Dynamic Policy for zoom_logs
CREATE POLICY "Allow select for anyone" ON public.zoom_logs FOR SELECT USING (true);
CREATE POLICY "Allow insert/update for anyone" ON public.zoom_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow modify for authenticated users" ON public.zoom_logs FOR ALL USING (auth.role() = 'authenticated');
