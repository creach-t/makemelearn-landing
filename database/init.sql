-- Script d'initialisation de la base de données MakeMeLearn
-- Ce script est exécuté automatiquement lors de la création du container PostgreSQL

-- Création de la table des inscriptions
CREATE TABLE IF NOT EXISTS registrations (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    source VARCHAR(100) DEFAULT 'website',
    metadata JSONB DEFAULT '{}',
    is_verified BOOLEAN DEFAULT false,
    verification_token VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    unsubscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Création d'index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(email);
CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations(created_at);
CREATE INDEX IF NOT EXISTS idx_registrations_source ON registrations(source);
CREATE INDEX IF NOT EXISTS idx_registrations_is_verified ON registrations(is_verified);
CREATE INDEX IF NOT EXISTS idx_registrations_unsubscribed ON registrations(unsubscribed_at) WHERE unsubscribed_at IS NULL;

-- Création de la table des statistiques
CREATE TABLE IF NOT EXISTS stats (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value INTEGER DEFAULT 0,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(metric_name, date)
);

-- Index pour les statistiques
CREATE INDEX IF NOT EXISTS idx_stats_metric_date ON stats(metric_name, date);
CREATE INDEX IF NOT EXISTS idx_stats_date ON stats(date);

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger pour mettre à jour updated_at automatiquement
DROP TRIGGER IF EXISTS update_registrations_updated_at ON registrations;
CREATE TRIGGER update_registrations_updated_at
    BEFORE UPDATE ON registrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Fonction pour incrémenter les statistiques
CREATE OR REPLACE FUNCTION increment_stat(stat_name VARCHAR(100), increment_value INTEGER DEFAULT 1)
RETURNS void AS $$
BEGIN
    INSERT INTO stats (metric_name, metric_value, date)
    VALUES (stat_name, increment_value, CURRENT_DATE)
    ON CONFLICT (metric_name, date)
    DO UPDATE SET 
        metric_value = stats.metric_value + increment_value,
        created_at = CURRENT_TIMESTAMP;
END;
$$ language 'plpgsql';

-- Vue pour les statistiques d'inscription
CREATE OR REPLACE VIEW registration_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as daily_registrations,
    COUNT(*) FILTER (WHERE is_verified = true) as verified_registrations,
    COUNT(DISTINCT source) as unique_sources
FROM registrations 
WHERE unsubscribed_at IS NULL
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Insertion de quelques statistiques par défaut
INSERT INTO stats (metric_name, metric_value, date) VALUES 
    ('page_views', 0, CURRENT_DATE),
    ('api_calls', 0, CURRENT_DATE),
    ('registrations', 0, CURRENT_DATE)
ON CONFLICT (metric_name, date) DO NOTHING;

-- Fonction de nettoyage des anciennes données (à exécuter périodiquement)
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
    -- Nettoyer les statistiques de plus de 1 an
    DELETE FROM stats 
    WHERE date < CURRENT_DATE - INTERVAL '1 year';
    
    -- Nettoyer les tokens de vérification expirés (plus de 7 jours)
    UPDATE registrations 
    SET verification_token = NULL 
    WHERE verification_token IS NOT NULL 
    AND created_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
    
    -- Supprimer définitivement les inscriptions désabonnées depuis plus de 30 jours
    DELETE FROM registrations 
    WHERE unsubscribed_at IS NOT NULL 
    AND unsubscribed_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
END;
$$ language 'plpgsql';

-- Commentaires sur les tables
COMMENT ON TABLE registrations IS 'Table des inscriptions anticipées à MakeMeLearn';
COMMENT ON TABLE stats IS 'Table des statistiques diverses de la plateforme';
COMMENT ON COLUMN registrations.source IS 'Source de l''inscription (landing_page, social, etc.)';
COMMENT ON COLUMN registrations.metadata IS 'Métadonnées JSON avec informations additionnelles';
COMMENT ON COLUMN registrations.verification_token IS 'Token pour vérifier l''email (si implémenté)';

-- Affichage du résumé de l'initialisation
DO $$
BEGIN
    RAISE NOTICE '✅ Base de données MakeMeLearn initialisée avec succès';
    RAISE NOTICE '📊 Tables créées: registrations, stats';
    RAISE NOTICE '🔧 Fonctions créées: increment_stat, cleanup_old_data';
    RAISE NOTICE '📈 Vue créée: registration_stats';
    RAISE NOTICE '🌐 Prêt pour makemelearn.fr';
END $$;