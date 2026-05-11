import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LinkHunterProfile } from './LinkHunterProfile';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';

type HunterProfileRow = {
  user?: { username?: string; email?: string } | null;
  hunter: { firstName: string; lastName: string; id: number };
  region?: string;
  zone?: string;
};

export function HunterProfilesManagement() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<number | undefined>();
  const [selectedHunter, setSelectedHunter] = useState<number | undefined>();

  const { data: profilesResp, isLoading, refetch } = useQuery({
    queryKey: ['hunter-profiles', user?.region, user?.zone],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (user?.region) params.append('region', user.region);
      if (user?.zone) params.append('zone', user.zone);

      return apiRequest({
        url: `/api/admin/hunter-profiles?${params.toString()}`,
        method: 'GET'
      });
    }
  });

  const profiles: HunterProfileRow[] = (profilesResp as any)?.data ?? [];

  const columns: any[] = [
    {
      accessorKey: 'user',
      header: 'Utilisateur',
      cell: ({ row }: { row: { original: HunterProfileRow } }) => (
        <div>
          <div className="font-medium">
            {row.original.user?.username || 'Non associé'}
          </div>
          <div className="text-sm text-gray-500">
            {row.original.user?.email}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'hunter',
      header: 'Chasseur',
      cell: ({ row }: { row: { original: HunterProfileRow } }) => (
        <div>
          <div className="font-medium">
            {row.original.hunter.firstName} {row.original.hunter.lastName}
          </div>
          <div className="text-sm text-gray-500">
            ID: {row.original.hunter.id}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }: { row: { original: HunterProfileRow } }) => (
        <Badge
          variant={row.original.user ? 'secondary' : 'outline'}
        >
          {row.original.user ? 'Associé' : 'Non associé'}
        </Badge>
      ),
    },
    {
      accessorKey: 'region',
      header: 'Région',
    },
    {
      accessorKey: 'zone',
      header: 'Zone',
    },
    {
      id: 'actions',
      cell: ({ row }: { row: { original: HunterProfileRow } }) => (
        <div className="flex space-x-2">
          {!row.original.user && (
            <Button
              size="sm"
              onClick={() => {
                setSelectedHunter(row.original.hunter.id);
                setShowLinkDialog(true);
              }}
            >
              Associer
            </Button>
          )}
        </div>
      ),
    },
  ];

  const filteredData = profiles?.filter((profile: HunterProfileRow) => 
    profile.hunter.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    profile.hunter.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (profile.user?.username?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  ) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Gestion des profils chasseurs</h1>
        <div className="flex items-center space-x-2">
          <Input
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      <DataTable
        columns={columns as any}
        data={filteredData as any}
      />

      {showLinkDialog && (
        <LinkHunterProfile
          open={showLinkDialog}
          onClose={() => {
            setShowLinkDialog(false);
            setSelectedUser(undefined);
            setSelectedHunter(undefined);
          }}
          onSuccess={() => {
            refetch();
          }}
          userId={selectedUser}
          hunterId={selectedHunter}
        />
      )}
    </div>
  );
}
