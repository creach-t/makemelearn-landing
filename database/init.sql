-- Création de la base de données MakeMeLearn
-- Script d'initialisation PostgreSQL

-- Extension pour UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table des inscriptions anticipées
CREATE TABLE IF NOT EXISTS registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT,
    source VARCHAR(100) DEFAULT 'landing_page',
    is_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    verification_sent_at TIMESTAMP WITH TIME ZONE,
    verification_attempts INTEGER DEFAULT 0,
    unsubscribed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Index pour optimiser les recherches
CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(email);
CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registrations_verified ON registrations(is_verified);
CREATE INDEX IF NOT EXISTS idx_registrations_source ON registrations(source);

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger pour mettre à jour updated_at
CREATE TRIGGER update_registrations_updated_at 
    BEFORE UPDATE ON registrations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Table des statistiques (pour tracking anonyme)
CREATE TABLE IF NOT EXISTS stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    metric_name VARCHAR(100) NOT NULL,
    metric_value INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les stats
CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_date_metric ON stats(date, metric_name);

-- Fonction pour incrémenter les stats
CREATE OR REPLACE FUNCTION increment_stat(
    metric VARCHAR(100),
    increment_by INTEGER DEFAULT 1,
    stat_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO stats (date, metric_name, metric_value)
    VALUES (stat_date, metric, increment_by)
    ON CONFLICT (date, metric_name)
    DO UPDATE SET 
        metric_value = stats.metric_value + increment_by,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ language 'plpgsql';

-- Vues utiles pour les statistiques
CREATE OR REPLACE VIEW registration_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as daily_registrations,
    COUNT(*) FILTER (WHERE is_verified = true) as verified_registrations,
    COUNT(DISTINCT SUBSTRING(email FROM '@(.*)$')) as unique_domains
FROM registrations 
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Vue pour les tendances hebdomadaires
CREATE OR REPLACE VIEW weekly_stats AS
SELECT 
    DATE_TRUNC('week', created_at) as week_start,
    COUNT(*) as weekly_registrations,
    COUNT(*) FILTER (WHERE is_verified = true) as weekly_verified,
    COUNT(DISTINCT source) as sources_count
FROM registrations 
GROUP BY DATE_TRUNC('week', created_at)
ORDER BY week_start DESC;

-- Insertion de données initiales pour les stats
INSERT INTO stats (date, metric_name, metric_value, metadata) VALUES
(CURRENT_DATE, 'page_views', 0, '{"description": "Vues de la page d\'accueil"}'),
(CURRENT_DATE, 'signup_attempts', 0, '{"description": "Tentatives d\'inscription"}'),
(CURRENT_DATE, 'signup_success', 0, '{"description": "Inscriptions réussies"}'),
(CURRENT_DATE, 'unique_visitors', 0, '{"description": "Visiteurs uniques estimés"}')
ON CONFLICT (date, metric_name) DO NOTHING;

-- Politique de nettoyage automatique (optionnel)
-- Supprimer les inscriptions non vérifiées après 90 jours
CREATE OR REPLACE FUNCTION cleanup_old_unverified_registrations()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM registrations 
    WHERE is_verified = false 
    AND created_at < (CURRENT_TIMESTAMP - INTERVAL '90 days');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log du nettoyage
    INSERT INTO stats (date, metric_name, metric_value, metadata)
    VALUES (CURRENT_DATE, 'cleanup_deleted', deleted_count, '{"description": "Nettoyage automatique"}')
    ON CONFLICT (date, metric_name) 
    DO UPDATE SET metric_value = stats.metric_value + deleted_count;
    
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Commentaires pour documentation
COMMENT ON TABLE registrations IS 'Table des inscriptions anticipées pour MakeMeLearn';
COMMENT ON COLUMN registrations.email IS 'Adresse email unique de l''utilisateur';
COMMENT ON COLUMN registrations.metadata IS 'Données supplémentaires en format JSON (préférences, origine, etc.)';
COMMENT ON COLUMN registrations.source IS 'Source de l''inscription (landing_page, social_media, etc.)';

COMMENT ON TABLE stats IS 'Table des statistiques générales de la plateforme';
COMMENT ON FUNCTION increment_stat IS 'Fonction pour incrémenter une métrique de façon atomique';

-- Affichage des tables créées
\dt