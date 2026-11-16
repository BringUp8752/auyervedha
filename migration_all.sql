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

-- ===== Stock, richer product text, server-saved carts =====
CREATE TABLE IF NOT EXISTS carts(
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;

-- every product has a stock number (edit it in Admin -> Products)
UPDATE products SET stock=100 WHERE stock IS NULL;
ALTER TABLE products ALTER COLUMN stock SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_stock_nonneg') THEN
    ALTER TABLE products ADD CONSTRAINT products_stock_nonneg CHECK (stock>=0);
  END IF;
END $$;

-- Product text by type of preparation. Only rows you have not edited yourself (how_to_use still empty) are changed.
-- No dose numbers are written: copy exact dose and ingredients from each manufacturer's label in Admin -> Products -> Details.
UPDATE products SET
 description = CASE
  WHEN name ILIKE '%Hair Oil%' OR name ILIKE '%Hair Growth Oil%' THEN 'Herbal Ayurvedic hair oil made with traditional herbs in a base oil, for scalp and hair care.'
  WHEN name ILIKE '%Thailam%' OR name ILIKE '%Keram%' OR name ILIKE '% Oil' THEN 'Traditional Kerala Ayurvedic medicated oil prepared by cooking herbs in oil, mainly for external application and massage.'
  WHEN name ILIKE '%Face Pack%' THEN 'Herbal face pack made from powdered Ayurvedic herbs for skin care.'
  WHEN name ILIKE '%Soap%' THEN 'Herbal Ayurvedic bath soap for daily skin cleansing.'
  WHEN name ILIKE '%Gel%' OR name ILIKE '%Cream%' THEN 'Herbal Ayurvedic skin-care product for external use.'
  WHEN name ILIKE '%Cleanser%' THEN 'Herbal hair cleanser used for washing hair, in place of regular shampoo.'
  WHEN name ILIKE '%Sandalwood Powder%' THEN 'Fine herbal sandalwood powder commonly used in skin care.'
  WHEN name ILIKE '%Kwath Tablets%' THEN 'Tablet form of a classical Ayurvedic kwath (herbal decoction), convenient to take without preparing the decoction.'
  WHEN name ILIKE '%Tablets%' OR name ILIKE '%Capsules%' OR name ILIKE '%Pills%' OR name ILIKE '%Gulika%' OR name ILIKE '%Guggulu%' OR name ILIKE '%vatakam%' THEN 'Classical Ayurvedic herbal formulation in tablet, pill or capsule form.'
  WHEN name ILIKE '%rishta%' OR name ILIKE '%asavam%' THEN 'Traditional Ayurvedic fermented herbal tonic (arishtam / asavam). Contains naturally generated alcohol from fermentation.'
  WHEN name ILIKE '%Choornam%' THEN 'Traditional Ayurvedic herbal powder (choornam) made from finely ground dried herbs.'
  WHEN name ILIKE '%Kwath%' THEN 'Classical Ayurvedic herbal decoction (kwath / kashayam) preparation.'
  WHEN name ILIKE '%Ghritham%' THEN 'Medicated ghee (ghritham) prepared with herbs, a classical Ayurvedic preparation taken internally.'
  WHEN name ILIKE '%Syrup%' THEN 'Ayurvedic herbal syrup.'
  WHEN name ILIKE '%Lehyam%' OR name ILIKE '%Rasayanam%' OR name ILIKE '%Chyavanprash%' THEN 'Herbal Ayurvedic preparation (lehyam / rasayanam) made with herbs, sweetener and ghee, traditionally taken as a tonic.'
  ELSE 'Traditional Kerala Ayurvedic product.' END,
 how_to_use = CASE
  WHEN name ILIKE '%Hair Oil%' OR name ILIKE '%Hair Growth Oil%' THEN 'Massage gently into scalp and hair and wash off as directed on the label. Do a small patch test first; keep away from eyes.'
  WHEN name ILIKE '%Thailam%' OR name ILIKE '%Keram%' OR name ILIKE '% Oil' THEN 'For external use unless the label says otherwise. Do a small patch test first, apply as directed by your Ayurvedic physician or the label, and keep away from eyes.'
  WHEN name ILIKE '%Face Pack%' THEN 'Mix with water, rose water or as directed on the label, apply to clean skin and wash off when dry. Do a patch test first.'
  WHEN name ILIKE '%Soap%' THEN 'Use like a regular bath soap. Stop use if irritation occurs.'
  WHEN name ILIKE '%Gel%' OR name ILIKE '%Cream%' THEN 'Apply a thin layer on clean skin. Do a patch test first and stop use if irritation occurs.'
  WHEN name ILIKE '%Cleanser%' OR name ILIKE '%Sandalwood Powder%' THEN 'Use as directed on the label. Do a patch test first and stop use if irritation occurs.'
  WHEN name ILIKE '%rishta%' OR name ILIKE '%asavam%' THEN 'Dose and timing depend on the person and condition; take as directed by your Ayurvedic physician or the label. Contains naturally generated alcohol.'
  WHEN name ILIKE '%Choornam%' THEN 'Usually mixed with warm water, honey, ghee or buttermilk as advised by your physician. Take the dose given by your physician or the label.'
  WHEN name ILIKE '%Ghritham%' OR name ILIKE '%Lehyam%' OR name ILIKE '%Rasayanam%' OR name ILIKE '%Chyavanprash%' THEN 'Take as directed by your Ayurvedic physician or the label, commonly with warm milk or warm water. Dose depends on the person.'
  ELSE 'Take only as directed by your Ayurvedic physician or as printed on the product label. The right dose and timing depend on the person and condition.' END
WHERE how_to_use IS NULL;
