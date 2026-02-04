-- Migration to add customer_cost_pickup field to shipments table
-- This field indicates whether the shipment is at customer cost or picked up in person

ALTER TABLE shipments 
ADD COLUMN IF NOT EXISTS customer_cost_pickup BOOLEAN DEFAULT FALSE;

-- Add a comment to document the column
COMMENT ON COLUMN shipments.customer_cost_pickup IS 'Indicates if shipment is at customer cost or picked up in person (no quotes, tracking, or photos required)';
