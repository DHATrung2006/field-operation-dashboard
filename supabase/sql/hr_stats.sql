-- HR Statistics
CREATE TABLE IF NOT EXISTS public.hr_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  total_headcount INT NOT NULL,
  new_hires INT NOT NULL,
  terminations INT NOT NULL,
  active_shifts INT NOT NULL,
  checkin_on_time INT NOT NULL,
  checkin_late_10 INT NOT NULL,
  checkin_late_15 INT NOT NULL,
  checkin_late_20 INT NOT NULL,
  turnover_rate NUMERIC,
  open_positions INT,
  avg_time_to_fill INTERVAL,
  training_hours NUMERIC,
  training_completion_rate NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for faster date queries
CREATE INDEX IF NOT EXISTS idx_hr_stats_date ON public.hr_stats (date);
