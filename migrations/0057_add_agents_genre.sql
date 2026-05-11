ALTER TABLE agents
ADD COLUMN IF NOT EXISTS genre TEXT;

ALTER TABLE agents
ADD CONSTRAINT agents_genre_check CHECK (genre IN ('H','F') OR genre IS NULL);
