-- Add expiry and issue date columns for hunter attachments requiring expiration
-- id_card, weapon_permit, insurance, weapon_receipt, treasury_stamp

ALTER TABLE hunter_attachments
  ADD COLUMN IF NOT EXISTS id_card_issue_date DATE,
  ADD COLUMN IF NOT EXISTS id_card_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS weapon_permit_issue_date DATE,
  ADD COLUMN IF NOT EXISTS weapon_permit_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS insurance_issue_date DATE,
  ADD COLUMN IF NOT EXISTS insurance_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS weapon_receipt_issue_date DATE,
  ADD COLUMN IF NOT EXISTS weapon_receipt_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS treasury_stamp_issue_date DATE,
  ADD COLUMN IF NOT EXISTS treasury_stamp_expiry_date DATE;

-- Optional: backfill logic could be added here if you have a way to infer expiry dates
-- For now, leave existing rows as NULL to force re-upload or manual update.
