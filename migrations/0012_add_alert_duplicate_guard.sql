-- Remove existing duplicate alerts (same sender, nature, title and ~1m-coincident coordinates)
WITH duplicates AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY sender_id, nature, title, round(lat::numeric, 5), round(lon::numeric, 5)
            ORDER BY created_at ASC
        ) AS rn
    FROM alerts
    WHERE lat IS NOT NULL AND lon IS NOT NULL
)
DELETE FROM alerts
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- Enforce uniqueness on sender/nature/title around the same coordinates (rounded to ~1 m)
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_sender_nature_title_coords
ON alerts (
    sender_id,
    nature,
    title,
    (round(lat::numeric, 5)),
    (round(lon::numeric, 5))
);
