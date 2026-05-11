-- Enforce uniqueness on numero_piece/type_piece (case-insensitive) for contrevenants
DO $$
BEGIN
  -- Create unique index only if it does not already exist
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'uq_contrevenants_numero_piece'
      AND n.nspname = 'public'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_contrevenants_numero_piece
             ON public.contrevenants (LOWER(numero_piece))
             WHERE numero_piece IS NOT NULL';
  END IF;
END;
$$;
