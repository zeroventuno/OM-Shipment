-- Migration to add all_quotes column to shipments table
-- This column stores all the quotes that were compared for each shipment

ALTER TABLE shipments 
ADD COLUMN IF NOT EXISTS all_quotes JSONB;

-- Add a comment to document the column
COMMENT ON COLUMN shipments.all_quotes IS 'Stores all portal quotes that were compared for this shipment in JSON format';

-- Optional: Create an index if you plan to query within the JSON
-- CREATE INDEX IF NOT EXISTS idx_shipments_all_quotes ON shipments USING GIN (all_quotes);
