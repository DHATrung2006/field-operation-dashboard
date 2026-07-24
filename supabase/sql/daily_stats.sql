-- Daily Store Statistics
CREATE TABLE IF NOT EXISTS public.daily_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  region TEXT NOT NULL,
  total_store INT NOT NULL,
  ba_store INT NOT NULL,
  empty_store INT NOT NULL,
  shift_morning INT NOT NULL,
  shift_afternoon INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_daily_stats_date_region ON public.daily_stats (date, region);
