ALTER TABLE health_centers
  ADD COLUMN IF NOT EXISTS barangay_name VARCHAR(100);

UPDATE health_centers
SET barangay_name = 'Zone I'
WHERE barangay_name IS NULL
  AND (name ILIKE '%zone i%' OR name ILIKE '%zone 1%')
  AND type = 'barangay';

UPDATE health_centers
SET barangay_name = 'Santa Cruz',
    name = 'Barangay Santa Cruz Health Center',
    address = 'Barangay Santa Cruz, Koronadal City, South Cotabato'
WHERE barangay_name IS NULL
  AND (name ILIKE '%sta%cruz%' OR name ILIKE '%santa cruz%')
  AND type = 'barangay';
