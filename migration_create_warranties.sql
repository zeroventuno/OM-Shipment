-- Create warranties table
CREATE TABLE IF NOT EXISTS public.warranties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    protocol_number TEXT UNIQUE NOT NULL,
    start_date DATE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    agent TEXT,
    serial_number TEXT NOT NULL,
    bike_model TEXT,
    bike_size TEXT,
    problem_description TEXT,
    notes TEXT,
    paint_details TEXT,
    components_details TEXT,
    status TEXT DEFAULT 'aperto', -- aperto, in corso, chiuso
    solution TEXT, -- pintura, reparazione + pintura, sostituzione
    producer TEXT, -- Barra, Pedemonte, Barra + Pedemonte, Univer, Univer + Barra
    new_serial_number TEXT
);

-- Enable RLS
ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all actions for authenticated users or public (depending on project setup)
-- For this project, it seems we use a single public model or simple auth
CREATE POLICY "Allow all on warranties" ON public.warranties FOR ALL USING (true);
