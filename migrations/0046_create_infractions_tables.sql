-- =====================================================
-- 📘 BASE DE DONNÉES : GESTION DES INFRACTIONS
-- Version : finale
-- Objectif : Gestion des infractions, contrevenants et PV
-- =====================================================

-- -----------------------------------------------------
-- 1️⃣ TABLE : code_infractions
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS code_infractions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    nature VARCHAR(255) NOT NULL,
    description TEXT,
    article_code VARCHAR(255),
    code_collectivite VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- 2️⃣ TABLE : agents_verbalisateurs
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS agents_verbalisateurs (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    matricule VARCHAR(50) UNIQUE,
    fonction VARCHAR(100),
    signature BYTEA,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- 3️⃣ TABLE : contrevenants
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS contrevenants (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100),
    filiation VARCHAR(255),
    photo BYTEA,
    piece_identite BYTEA,
    numero_piece VARCHAR(100),
    type_piece VARCHAR(100),
    signature BYTEA,
    donnees_biometriques BYTEA,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- 4️⃣ TABLE : lieux
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS lieux (
    id SERIAL PRIMARY KEY,
    region VARCHAR(100),
    departement VARCHAR(100),
    commune VARCHAR(100),
    arrondissement VARCHAR(100),
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- 5️⃣ TABLE : infractions
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS infractions (
    id SERIAL PRIMARY KEY,
    code_infraction_id INT NOT NULL REFERENCES code_infractions(id) ON DELETE CASCADE,
    lieu_id INT REFERENCES lieux(id) ON DELETE SET NULL,
    date_infraction TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    agent_id INT REFERENCES agents_verbalisateurs(id) ON DELETE SET NULL,
    montant_chiffre DECIMAL(12,2),
    montant_lettre VARCHAR(255),
    numero_quittance VARCHAR(100),
    photo_quittance BYTEA,
    photo_infraction BYTEA,
    autres_pieces BYTEA[],
    observations TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- 6️⃣ TABLE : contrevenants_infractions
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS contrevenants_infractions (
    id SERIAL PRIMARY KEY,
    contrevenant_id INT NOT NULL REFERENCES contrevenants(id) ON DELETE CASCADE,
    infraction_id INT NOT NULL REFERENCES infractions(id) ON DELETE CASCADE,
    role VARCHAR(100),
    date_implication TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contrevenant_id, infraction_id)
);

-- -----------------------------------------------------
-- 7️⃣ TABLE : proces_verbaux
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS proces_verbaux (
    id SERIAL PRIMARY KEY,
    infraction_id INT NOT NULL REFERENCES infractions(id) ON DELETE CASCADE,
    date_generation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fichier_pv BYTEA,
    numero_pv VARCHAR(50) UNIQUE,
    piece_jointe BYTEA,
    nom_piece_jointe VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- 8️⃣ FONCTION : Conversion du montant en lettres
-- -----------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION nombre_en_lettres(nombre DECIMAL)
RETURNS TEXT AS $$
DECLARE
    unite TEXT[] := ARRAY[
        'zéro','un','deux','trois','quatre','cinq','six','sept','huit','neuf',
        'dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'
    ];
    dizaine TEXT[] := ARRAY[
        '','dix','vingt','trente','quarante','cinquante','soixante','soixante-dix','quatre-vingt','quatre-vingt-dix'
    ];
    entier INT;
    partie_entier INT;
    partie_decimal INT;
    resultat TEXT := '';
BEGIN
    entier := FLOOR(nombre);
    partie_entier := entier;
    partie_decimal := (nombre - partie_entier) * 100;

    IF partie_entier < 20 THEN
        resultat := unite[partie_entier + 1];
    ELSIF partie_entier < 100 THEN
        resultat := dizaine[partie_entier / 10] || '-' || unite[(partie_entier % 10) + 1];
    ELSE
        resultat := partie_entier::TEXT;
    END IF;

    IF partie_decimal > 0 THEN
        resultat := resultat || ' francs et ' || partie_decimal::TEXT || ' centimes';
    ELSE
        resultat := resultat || ' francs CFA';
    END IF;

    RETURN INITCAP(resultat);
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------
-- 9️⃣ TRIGGER : Remplissage automatique du montant en lettres
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION maj_montant_lettre()
RETURNS TRIGGER AS $$
BEGIN
    NEW.montant_lettre := nombre_en_lettres(NEW.montant_chiffre);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_montant_lettre ON infractions;
CREATE TRIGGER trig_montant_lettre
BEFORE INSERT OR UPDATE OF montant_chiffre ON infractions
FOR EACH ROW
EXECUTE FUNCTION maj_montant_lettre();

-- -----------------------------------------------------
-- 🔍 10️⃣ INDEX pour performance
-- -----------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_infractions_date ON infractions(date_infraction);
CREATE INDEX IF NOT EXISTS idx_code_infractions_code ON code_infractions(code);
CREATE INDEX IF NOT EXISTS idx_contrevenants_nom ON contrevenants(nom);
CREATE INDEX IF NOT EXISTS idx_infractions_agent ON infractions(agent_id);
CREATE INDEX IF NOT EXISTS idx_proces_verbaux_infraction ON proces_verbaux(infraction_id);

-- =====================================================
-- ✅ BASE DE DONNÉES CONFIGURÉE AVEC SUCCÈS
-- =====================================================
