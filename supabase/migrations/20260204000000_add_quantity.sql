-- Migration to add quantity to shipments table

ALTER TABLE shipments 
ADD COLUMN quantity INTEGER DEFAULT 1;

-- Update existing records to have a quantity of 1
UPDATE shipments SET quantity = 1 WHERE quantity IS NULL;
