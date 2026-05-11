-- Add treasury stamp issue/expiry dates for annual renewal handling
ALTER TABLE IF EXISTS hunter_attachments
  ADD COLUMN IF NOT EXISTS treasury_stamp_issue_date DATE,
  ADD COLUMN IF NOT EXISTS treasury_stamp_expiry_date DATE;
