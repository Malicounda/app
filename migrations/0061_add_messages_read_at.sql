-- Migration: Ajouter la colonne read_at à la table messages (lecture des messages individuels)
-- Date: 2026-04-28

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'read_at') THEN
            ALTER TABLE messages ADD COLUMN read_at TIMESTAMP;
        END IF;
        RAISE NOTICE 'Colonne read_at ajoutée ou déjà présente dans la table messages';
    ELSE
        RAISE NOTICE 'Table messages n''existe pas - elle sera créée lors de l''initialisation du schéma';
    END IF;
END $$;
