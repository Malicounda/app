import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddAgentForm from '@/components/agents/AddAgentForm'; 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus } from 'lucide-react';

const CreateAgentPage: React.FC = () => {
  const [showAddRegionalAgentDialog, setShowAddRegionalAgentDialog] = useState(false);

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <Card className="max-w-3xl mx-auto mt-10 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold text-gray-700 text-center">Création de Compte Agent</CardTitle>
          <CardDescription className="text-center text-gray-500">
            Sélectionnez le type de compte agent à créer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="regional" className="w-full">
            <TabsList className="grid w-full grid-cols-1">
              <TabsTrigger value="regional">Agent Régional</TabsTrigger>
            </TabsList>
            <TabsContent value="regional">
              <div className="p-4 border rounded-md mt-4">
                <h3 className="text-lg font-medium mb-2">Créer un Agent Régional</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Les agents régionaux sont responsables de la supervision au niveau de la région.
                </p>
                <Button onClick={() => setShowAddRegionalAgentDialog(true)} className="w-full">
                  <UserPlus className="mr-2 h-4 w-4" /> Ouvrir le Formulaire Agent Régional
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {showAddRegionalAgentDialog && (
        <AddAgentForm 
          open={showAddRegionalAgentDialog} 
          onClose={() => setShowAddRegionalAgentDialog(false)} 
        />
      )}
    </div>
  );
};

export default CreateAgentPage; 
