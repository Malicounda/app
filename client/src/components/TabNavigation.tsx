import React, { useState } from 'react';

interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onTabChange }) => {
  const tabs = ['maps', 'regulations', 'species'];

  return (
    <div className="flex border-b mb-6">
      {tabs.map(tab => (
        <button
          key={tab}
          className={`tab-btn py-3 px-6 font-medium ${activeTab === tab ? 'border-b-2 border-green-600 text-green-600' : 'text-gray-500 hover:text-green-600'}`}
          data-tab={tab}
          onClick={() => onTabChange(tab)}
        >
          {tab === 'maps' ? 'Cartes' : tab === 'regulations' ? 'Réglementation' : 'Espèces'}
        </button>
      ))}
    </div>
  );
};

export default TabNavigation;