-- Migration: Ajouter les colonnes de pièces jointes aux tables messages et group_messages
-- Date: 2025-10-20

-- Vérifier si la table messages existe et ajouter les colonnes si elles n'existent pas
DO $$
BEGIN
    -- Vérifier si la table messages existe
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
        -- Ajouter les colonnes à la table messages si elles n'existent pas
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'attachment_path') THEN
            ALTER TABLE messages ADD COLUMN attachment_path TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'attachment_name') THEN
            ALTER TABLE messages ADD COLUMN attachment_name TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'attachment_mime') THEN
            ALTER TABLE messages ADD COLUMN attachment_mime TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'attachment_size') THEN
            ALTER TABLE messages ADD COLUMN attachment_size INTEGER;
        END IF;
        RAISE NOTICE 'Colonnes de pièces jointes ajoutées ou déjà présentes dans la table messages';
    ELSE
        RAISE NOTICE 'Table messages n''existe pas - elle sera créée lors de l''initialisation du schéma';
    END IF;

    -- Vérifier si la table group_messages existe et ajouter les colonnes si elle existe
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'group_messages') THEN
        -- Ajouter les colonnes à la table group_messages si elles n'existent pas
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'group_messages' AND column_name = 'attachment_path') THEN
            ALTER TABLE group_messages ADD COLUMN attachment_path TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'group_messages' AND column_name = 'attachment_name') THEN
            ALTER TABLE group_messages ADD COLUMN attachment_name TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'group_messages' AND column_name = 'attachment_mime') THEN
            ALTER TABLE group_messages ADD COLUMN attachment_mime TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'group_messages' AND column_name = 'attachment_size') THEN
            ALTER TABLE group_messages ADD COLUMN attachment_size INTEGER;
        END IF;
        RAISE NOTICE 'Colonnes de pièces jointes ajoutées ou déjà présentes dans la table group_messages';
    ELSE
        RAISE NOTICE 'Table group_messages n''existe pas - elle sera créée lors de l''initialisation du schéma';
    END IF;
END $$;
