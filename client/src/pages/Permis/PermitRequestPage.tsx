import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import HuntingPermitRequest from "@/pages/Permis/HuntingPermitRequest";
import MyRequests from "@/pages/Permis/MyRequests";

export default function PermitRequestPage() {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : undefined);
  const tabParam = params.get('tab');
  const defaultTab = tabParam === 'list' ? 'list' : 'create';
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">Demandes de Permis</h1>
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="create">Créer une demande</TabsTrigger>
          <TabsTrigger value="list">Mes demandes</TabsTrigger>
        </TabsList>
        <TabsContent value="create">
          <HuntingPermitRequest />
        </TabsContent>
        <TabsContent value="list">
          <MyRequests />
        </TabsContent>
      </Tabs>
    </div>
  );
}
