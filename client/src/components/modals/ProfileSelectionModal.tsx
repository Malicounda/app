import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { resolveDomainConfig } from '@/lib/domainConfig';
import { useDomainVisual } from '@/lib/domainIcons';
import { apiRequest } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { useLocation } from 'wouter';

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  color: '#fff',
  padding: '2rem',
  boxShadow: '0 10px 30px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.1)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  textAlign: 'center',
  cursor: 'pointer',
  transition: 'transform 0.3s ease, box-shadow 0.3s ease',
};

type Domaine = {
  id: number;
  nomDomaine: string;
  codeSlug: string;
  description?: string | null;
  couleurTheme?: string | null;
  isActive: boolean;
  createdAt: string;
};

const ProfileSelectionModal: React.FC<{ isOpen: boolean; onOpenChange: (open: boolean) => void }> = ({ isOpen, onOpenChange }) => {
  const [, navigate] = useLocation();

  const { data: activeDomaines } = useQuery({
    queryKey: ['/api/domaines/public/active'],
    queryFn: () => apiRequest<Domaine[]>({ url: '/api/domaines/public/active', method: 'GET' }),
    retry: false,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const chooseProfile = (type: string) => {
    localStorage.setItem('profileType', type);
    localStorage.removeItem('just_registered');

    // Redirection selon le type de profil
    let path = '/register';

    switch (type) {
      case 'hunter':
        path = '/register';
        break;
      case 'circulation':
        path = '/produits-forestiers';
        break;
      case 'reforestation':
        path = '/reboisement-login';
        break;
      case 'collaborator':
        path = '/alerte-login';
        break;
      default:
        path = `/register/${type}`;
    }

    try {
      const domainMap: Record<string, string> = {
        hunter: 'CHASSE',
        circulation: 'PRODUITS FORESTIERS',
        reforestation: 'REBOISEMENT',
        collaborator: 'ALERTE',
      };
      const dom = domainMap[type];
      if (dom) localStorage.setItem('domain', dom);
    } catch {}

    navigate(path);
  };

  const ChasseVisual = useDomainVisual('CHASSE');
  const ProduitsVisual = useDomainVisual('PRODUITS_FORESTIERS');
  const ReboisementVisual = useDomainVisual('REBOISEMENT');
  const AlerteVisual = useDomainVisual('ALERTE');

  const renderDomainIcon = (visual: { icon: any; logoUrl: string | undefined }) => {
    if (visual.logoUrl) return <img src={visual.logoUrl} alt="" className="w-12 h-12 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />;
    const Icon = visual.icon;
    return <Icon size={48} color="#fff" strokeWidth={1.5} />;
  };

  const fallbackIcons: Record<string,React.ReactElement> = {
    hunter: renderDomainIcon(ChasseVisual),
    circulation: renderDomainIcon(ProduitsVisual),
    reforestation: renderDomainIcon(ReboisementVisual),
    collaborator: renderDomainIcon(AlerteVisual),
  };

  const profilesFallback = [
    { type: 'hunter', label: 'Chasse', description: 'Demande de permis et zones de chasse', icon: fallbackIcons.hunter, background: 'linear-gradient(135deg, #065f46, #047857)' },
    { type: 'circulation', label: 'Produits Forestiers', description: 'Circulation des produits forestiers', icon: fallbackIcons.circulation, background: 'linear-gradient(135deg, #0d9488, #14b8a6)' },
    { type: 'reforestation', label: 'Reboisement et Pépinières', description: 'Demande et suivi des plants', icon: fallbackIcons.reforestation, background: 'linear-gradient(135deg, #16a34a, #22c55e)' },
    { type: 'collaborator', label: 'Alerte', description: 'Signalement en temps réel des infractions et des incidents sur le terrain.', icon: fallbackIcons.collaborator, background: 'linear-gradient(135deg, #f59e0b, #facc15)' },
  ];

  const resolveProfileMeta = (d: Domaine) => {
    const cfg = resolveDomainConfig(d.nomDomaine, d.codeSlug);
    if (!cfg) return null;
    const typeMap: Record<string,string> = { chasse: 'hunter', 'produits-forestiers': 'circulation', reboisement: 'reforestation', alerte: 'collaborator' };
    const bgMap: Record<string,string> = { chasse: '#065f46, #047857', 'produits-forestiers': '#0d9488, #14b8a6', reboisement: '#16a34a, #22c55e', alerte: '#f59e0b, #facc15' };
    const iconMap: Record<string,React.ReactElement> = { chasse: fallbackIcons.hunter, 'produits-forestiers': fallbackIcons.circulation, reboisement: fallbackIcons.reforestation, alerte: fallbackIcons.collaborator };
    return {
      type: typeMap[cfg.key],
      label: d.nomDomaine,
      description: d.description || (cfg.key === 'chasse' ? 'Demande de permis et zones de chasse' : cfg.key === 'produits-forestiers' ? 'Circulation des produits forestiers' : cfg.key === 'reboisement' ? 'Demande et suivi des plants' : 'Signalement en temps réel des infractions et des incidents sur le terrain.'),
      icon: iconMap[cfg.key],
      background: `linear-gradient(135deg, ${bgMap[cfg.key]})`,
    };
  };

  const profiles = Array.isArray(activeDomaines) && activeDomaines.length > 0
    ? activeDomaines.map(resolveProfileMeta).filter(Boolean) as any[]
    : profilesFallback;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[85vh] overflow-y-auto px-4 py-6 sm:p-10 bg-gray-50">
        <DialogHeader>
          <DialogTitle className="text-3xl font-bold text-center text-gray-800">Sélectionnez votre activité</DialogTitle>
          <DialogDescription className="text-center text-lg text-gray-500 pt-2">
            Choisissez le profil qui correspond à votre activité principale pour continuer.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 sm:pt-8">
          {profiles.map((profile) => (
            <div
              key={profile.type}
              onClick={() => chooseProfile(profile.type)}
              style={{ ...cardStyle, background: profile.background }}
              className="transform hover:scale-105"
            >
              {profile.icon}
              <div className="text-2xl font-semibold mt-4">{profile.label}</div>
              <p className="opacity-90 mt-2">{profile.description}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileSelectionModal;
