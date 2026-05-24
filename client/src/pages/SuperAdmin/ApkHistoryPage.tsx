import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Shield, Activity, MapPin, Search } from 'lucide-react';

export default function ApkHistoryPage() {
  const { data: sessions, isLoading, error } = useQuery({
    queryKey: ['active-sessions-history'],
    queryFn: async () => {
      const res = await authenticatedFetch('/api/auth/active-sessions');
      if (!res.ok) throw new Error('Erreur de récupération des sessions');
      const data = await res.json();
      if (data?.tableMissing) return [];
      return Array.isArray(data) ? data : data?.sessions ?? [];
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  const [searchTerm, setSearchTerm] = useState('');

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (!searchTerm) return sessions;
    
    return sessions.filter((session: any) => {
      const search = searchTerm.toLowerCase();
      const matricule = (session.agentMatricule || '').toLowerCase();
      const prenom = (session.agentPrenom || '').toLowerCase();
      const nom = (session.agentNom || '').toLowerCase();
      
      return matricule.includes(search) || prenom.includes(search) || nom.includes(search);
    });
  }, [sessions, searchTerm]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <Activity className="mx-auto h-8 w-8 animate-spin text-orange-500" />
          <p className="mt-2 text-sm text-slate-500">Chargement de l'audit APK...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        Erreur lors du chargement de l'historique APK.
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-7xl">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit APK & Alertes</h1>
          <p className="text-sm text-slate-500">
            Suivi des sessions actives et géolocalisation des agents sur le terrain
          </p>
        </div>
      </div>

      <Card className="border-0 shadow-lg flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-slate-500" />
              Sessions Actives et Historique GPS
            </CardTitle>
            <CardDescription className="mt-1">
              Liste des dernières connexions et remontées GPS via l'application mobile.
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Rechercher (Matricule, Nom...)" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-hidden">
          <div className="overflow-y-auto h-full relative">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="font-semibold text-slate-700">Utilisateur</TableHead>
                  <TableHead className="font-semibold text-slate-700">Appareil (Device ID)</TableHead>
                  <TableHead className="font-semibold text-slate-700">Position GPS</TableHead>
                  <TableHead className="font-semibold text-slate-700">Statut</TableHead>
                  <TableHead className="font-semibold text-slate-700">Dernière Activité</TableHead>
                  <TableHead className="font-semibold text-slate-700">Création</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSessions.length > 0 ? (
                  filteredSessions.map((session: any) => (
                    <TableRow key={session.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-medium text-slate-900">
                        <div>
                          {session.agentPrenom || session.agentNom ? (
                            <span className="font-bold">
                              {session.agentPrenom} {session.agentNom}
                            </span>
                          ) : (
                            <span>Utilisateur inconnu</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {session.agentMatricule ? (
                            <span className="font-mono text-teal-600">{session.agentMatricule}</span>
                          ) : (
                            <span>ID: {session.userId}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600 font-mono text-xs">
                        {session.deviceId || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {session.lat && session.lon ? (
                          <div className="flex items-center gap-1 text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-md w-fit">
                            <MapPin className="h-3 w-3 text-blue-500" />
                            {parseFloat(session.lat).toFixed(5)}, {parseFloat(session.lon).toFixed(5)}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Non disponible</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {session.isActive ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-0 shadow-none">
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200 border-0 shadow-none">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm">
                        {session.lastActivity 
                          ? format(new Date(session.lastActivity), 'dd MMM yyyy, HH:mm', { locale: fr }) 
                          : '-'}
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm">
                        {session.createdAt 
                          ? format(new Date(session.createdAt), 'dd MMM yyyy, HH:mm', { locale: fr }) 
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                      Aucune session APK enregistrée.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
