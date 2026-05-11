import React, { useState } from 'react';
import { FaMapMarkerAlt, FaTrash, FaCrosshairs, FaTree, FaWater, FaCity, FaHome, FaSeedling } from 'react-icons/fa';
import { FaCow } from 'react-icons/fa6';
import './MarkerMenu.css';

interface MarkerType {
  id: string;
  name: string;
  icon: JSX.Element;
  color: string;
}

interface MarkerMenuProps {
  onSelectMarker: (type: string) => void;
  onDeleteMarkers: () => void;
}

const MarkerMenu: React.FC<MarkerMenuProps> = ({ onSelectMarker, onDeleteMarkers }) => {
  const [isOpen, setIsOpen] = useState(false);

  const markerTypes: MarkerType[] = [
    { id: 'village', name: 'Village', icon: <FaHome />, color: '#4CAF50' },
    { id: 'city', name: 'Ville', icon: <FaCity />, color: '#2196F3' },
    { id: 'water', name: 'Point d\'Eau', icon: <FaWater />, color: '#00BCD4' },
    { id: 'forest', name: 'Forêt', icon: <FaTree />, color: '#4CAF50' },
    { id: 'field', name: 'Champ', icon: <FaSeedling />, color: '#8BC34A' },
    { id: 'livestock', name: 'Élevage', icon: <FaCow />, color: '#795548' }
  ];

  return (
    <div className="marker-menu-container">
      <button 
        className="marker-menu-toggle"
        onClick={() => setIsOpen(!isOpen)}
        title="Menu des marqueurs"
      >
        <FaMapMarkerAlt />
      </button>
      
      {isOpen && (
        <div className="marker-menu-dropdown">
          <div className="marker-menu-header">
            <h4>Ajouter un marqueur</h4>
            <button 
              className="delete-markers-btn"
              onClick={() => {
                onDeleteMarkers();
                setIsOpen(false);
              }}
              title="Supprimer tous les marqueurs"
            >
              <FaTrash />
            </button>
          </div>
          
          <div className="marker-types">
            {markerTypes.map((marker) => (
              <button
                key={marker.id}
                className="marker-type-btn"
                onClick={() => {
                  onSelectMarker(marker.id);
                  setIsOpen(false);
                }}
                title={`Ajouter un marqueur ${marker.name}`}
                style={{ color: marker.color }}
              >
                {marker.icon}
                <span>{marker.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MarkerMenu;
