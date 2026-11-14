-- Run ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- Adds: delivery address fields, UPI payment reference, payment status, product details, coupon rules.
-- Your existing products, orders and coupons are kept.

-- Orders: delivery address + UPI payment check
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_line1 TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_line2 TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_city TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_state TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_pin TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utr TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'Awaiting verification';
-- old demo orders had no payment
UPDATE orders SET payment_status='Demo (no payment)' WHERE utr IS NULL;
-- one UPI transaction ID can be used for one order only
CREATE UNIQUE INDEX IF NOT EXISTS orders_utr_unique ON orders (upper(utr)) WHERE utr IS NOT NULL;

-- Products: details shown on the product page
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS how_to_use TEXT;
UPDATE products SET description = CASE category_id
  WHEN 1 THEN 'Traditional Kerala Ayurvedic medicated oil, mainly for external use.'
  WHEN 2 THEN 'Traditional Ayurvedic herbal formulation in tablet, pill or capsule form.'
  WHEN 3 THEN 'Herbal Ayurvedic beauty and hair-care product.'
  WHEN 4 THEN 'Traditional Ayurvedic fermented herbal tonic (arishtam / asavam).'
  WHEN 5 THEN 'Traditional Ayurvedic herbal powder or decoction (choornam / kwath).'
  WHEN 6 THEN 'Traditional Ayurvedic herbal preparation or health supplement.'
  ELSE 'Traditional Kerala Ayurvedic product.' END
WHERE description IS NULL;

-- Coupons: minimum order, offer text, show on store
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS min_order INT NOT NULL DEFAULT 0;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS public BOOLEAN NOT NULL DEFAULT false;
