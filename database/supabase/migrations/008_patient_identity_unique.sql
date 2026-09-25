-- Prevent duplicate patient registrations when existing rows are already unique.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_patients_identity') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM (
        SELECT lower(btrim(first_name)), lower(btrim(last_name)), birth_date
        FROM patients
        GROUP BY 1, 2, 3
        HAVING COUNT(*) > 1
      ) duplicates
    ) THEN
      CREATE UNIQUE INDEX uq_patients_identity
        ON patients (lower(btrim(first_name)), lower(btrim(last_name)), birth_date);
    ELSE
      RAISE NOTICE 'Skipped uq_patients_identity because duplicate name/birth-date rows already exist.';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_patients_contact') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM (
        SELECT regexp_replace(contact_number, '\D', '', 'g') AS digits
        FROM patients
        WHERE contact_number IS NOT NULL AND btrim(contact_number) <> ''
        GROUP BY 1
        HAVING COUNT(*) > 1
      ) duplicates
    ) THEN
      CREATE UNIQUE INDEX uq_patients_contact
        ON patients (regexp_replace(contact_number, '\D', '', 'g'))
        WHERE contact_number IS NOT NULL AND btrim(contact_number) <> '';
    ELSE
      RAISE NOTICE 'Skipped uq_patients_contact because duplicate contact numbers already exist.';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_patients_email') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM (
        SELECT lower(btrim(email)) AS email_key
        FROM patients
        WHERE email IS NOT NULL AND btrim(email) <> ''
        GROUP BY 1
        HAVING COUNT(*) > 1
      ) duplicates
    ) THEN
      CREATE UNIQUE INDEX uq_patients_email
        ON patients (lower(btrim(email)))
        WHERE email IS NOT NULL AND btrim(email) <> '';
    ELSE
      RAISE NOTICE 'Skipped uq_patients_email because duplicate emails already exist.';
    END IF;
  END IF;
END $$;
