-- Create allowed_seafarer_codes table
CREATE TABLE IF NOT EXISTS public.allowed_seafarer_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on allowed_seafarer_codes (to make it accessible or public)
ALTER TABLE public.allowed_seafarer_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read allowed_seafarer_codes" ON public.allowed_seafarer_codes
  FOR SELECT USING (true);

CREATE POLICY "Allow admin all allowed_seafarer_codes" ON public.allowed_seafarer_codes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon select / insert allowed_seafarer_codes" ON public.allowed_seafarer_codes
  FOR ALL TO anon USING (true) WITH CHECK (true);


-- Create latihan_verifications table for separate storage of Latihan Ujian photos
CREATE TABLE IF NOT EXISTS public.latihan_verifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  seafarer_code text,
  live_photo_url text,
  ktp_photo_url text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on latihan_verifications
ALTER TABLE public.latihan_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read latihan_verifications" ON public.latihan_verifications
  FOR SELECT USING (true);

CREATE POLICY "Allow anon insert/update latihan_verifications" ON public.latihan_verifications
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated manage latihan_verifications" ON public.latihan_verifications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
