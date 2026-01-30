-- Add photo_urls column to shipments table
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS photo_urls text[] DEFAULT '{}';
