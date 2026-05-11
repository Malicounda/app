import React, { useState, useEffect } from 'react';
import { Search, Target, Minus, Plus } from 'lucide-react';

interface RadiusControlProps {
  onRadiusChange: (radius: number) => void;
  onSearch: (query: string) => void;
  className?: string;
  compact?: boolean;
}

export function RadiusControl({ onRadiusChange, onSearch, className = '', compact = false }: RadiusControlProps) {
  const [radius, setRadius] = useState(100);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(!compact);

  // Valeurs prédéfinies pour un accès rapide
  const presetValues = [10, 25, 50, 100, 200];

  const handleRadiusChange = (newRadius: number) => {
    const clampedRadius = Math.max(1, Math.min(1000, newRadius));
    setRadius(clampedRadius);
    onRadiusChange(clampedRadius);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim());
    }
  };

  const adjustRadius = (delta: number) => {
    handleRadiusChange(radius + delta);
  };

  // Version compacte (mobile)
  if (compact && !isExpanded) {
    return (
      <div className={`radius-control-compact ${className}`}>
        <button
          onClick={() => setIsExpanded(true)}
          className="radius-control-toggle"
          title="Ouvrir les contrôles"
        >
          <Target size={16} />
          <span className="radius-value">{radius}km</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`radius-control ${compact ? 'radius-control-mobile' : 'radius-control-desktop'} ${className}`}>
      {compact && (
        <button
          onClick={() => setIsExpanded(false)}
          className="radius-control-close"
          title="Fermer"
        >
          ×
        </button>
      )}

      {/* Ligne supérieure: compteur + recherche */}
      <div className="radius-top-row">
        {/* Contrôle de rayon */}
        <div className="radius-section">
          <div className="radius-input-group">
            <button
              onClick={() => adjustRadius(-10)}
              className="radius-btn radius-btn-minus"
              disabled={radius <= 10}
            >
              <Minus size={14} />
            </button>

            <div className="radius-input-container">
              <input
                type="number"
                value={radius}
                onChange={(e) => handleRadiusChange(parseInt(e.target.value) || 1)}
                className="radius-input"
                min="1"
                max="1000"
                step="1"
              />
              <span className="radius-unit">km</span>
            </div>

            <button
              onClick={() => adjustRadius(10)}
              className="radius-btn radius-btn-plus"
              disabled={radius >= 1000}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Barre de recherche */}
        <form onSubmit={handleSearchSubmit} className="search-section">
          <div className="search-input-group">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un lieu..."
              className="search-input"
            />
            <button type="submit" className="search-btn" disabled={!searchQuery.trim()}>
              <Search size={16} />
            </button>
          </div>
        </form>
      </div>

      {/* Valeurs prédéfinies (ligne inférieure sur toute la largeur) */}
      <div className="radius-presets">
        {presetValues.map((value) => (
          <button
            key={value}
            onClick={() => handleRadiusChange(value)}
            className={`radius-preset ${radius === value ? 'active' : ''}`}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}
