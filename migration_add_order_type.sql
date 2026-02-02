-- Migration to add order_type to shipments table

ALTER TABLE shipments 
ADD COLUMN order_type TEXT;

-- Optional: update existing records to have a default value if needed
-- UPDATE shipments SET order_type = 'Other' WHERE order_type IS NULL;
