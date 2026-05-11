import React from 'react';

type LegendProps = {
  showStatuses?: boolean;
  showZics?: boolean;
  showAmodiees?: boolean;
  showParcVisite?: boolean;
  showRegulation?: boolean;
  // Optional custom colors for statuses
  statusColors?: {
    open?: string;      // default #34D399
    partial?: string;   // default #FBBF24
    closed?: string;    // default #EF4444
  };
  // Optional colors for ZICs / Amodiées / Parcs / Régulation
  zicsColor?: string;       // default #3B82F6
  amodieesColor?: string;   // default #F472B6
  parcVisiteColor?: string; // default #f59e0b
  regulationColor?: string; // default #dc2626
};

const Legend: React.FC<LegendProps> = ({
  showStatuses = false,
  showZics = false,
  showAmodiees = false,
  showParcVisite = false,
  showRegulation = false,
  statusColors,
  zicsColor,
  amodieesColor,
  parcVisiteColor,
  regulationColor,
}) => {
  const open = statusColors?.open || '#34D399';
  const partial = statusColors?.partial || '#FBBF24';
  const closed = statusColors?.closed || '#EF4444';
  const zic = zicsColor || '#3B82F6';
  const amo = amodieesColor || '#F472B6';
  const parc = parcVisiteColor || '#f59e0b';
  const reg = regulationColor || '#dc2626';

  return (
    <div className="info legend" id="legend">
      {showStatuses && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, marginBottom: 6 }}>
          <div style={{ width: 14, height: 14, background: open, borderRadius: 2, border: '1px solid rgba(0,0,0,0.15)' }} />
          <div>Ouverte</div>
          <div style={{ width: 14, height: 14, background: partial, borderRadius: 2, border: '1px solid rgba(0,0,0,0.15)' }} />
          <div>Partiellement ouverte</div>
          <div style={{ width: 14, height: 14, background: closed, borderRadius: 2, border: '1px solid rgba(0,0,0,0.15)' }} />
          <div>Fermée</div>
        </div>
      )}
      {(showZics || showAmodiees || showParcVisite || showRegulation) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6 }}>
          {showZics && (
            <>
              <div style={{ width: 14, height: 14, background: zic, borderRadius: 2, border: '1px solid rgba(0,0,0,0.15)' }} />
              <div>ZIC</div>
            </>
          )}
          {showAmodiees && (
            <>
              <div style={{ width: 14, height: 14, background: amo, borderRadius: 2, border: '1px solid rgba(0,0,0,0.15)' }} />
              <div>Zone amodiée</div>
            </>
          )}
          {showParcVisite && (
            <>
              <div style={{ width: 14, height: 14, background: parc, borderRadius: 2, border: '1px solid rgba(0,0,0,0.15)' }} />
              <div>Parc de visite</div>
            </>
          )}
          {showRegulation && (
            <>
              <div style={{ width: 14, height: 14, background: reg, borderRadius: 2, border: '1px solid rgba(0,0,0,0.15)' }} />
              <div>Zone de régulation</div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Legend;