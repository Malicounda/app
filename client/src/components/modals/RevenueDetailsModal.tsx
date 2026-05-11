import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, Printer, Coins, FileText, BanknoteIcon } from "lucide-react";

interface RevenueDetailsModalProps {
  open: boolean;
  onClose: () => void;
  revenue: number;
}

export default function RevenueDetailsModal({ open, onClose, revenue }: RevenueDetailsModalProps) {
  const [permitRevenue, setPermitRevenue] = useState(0);
  const [taxRevenue, setTaxRevenue] = useState(0);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);

  // Fetch permits for revenue calculation
  const { data: permits } = useQuery<any[]>({
    queryKey: ["/api/permits"],
    enabled: open,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch taxes for revenue calculation
  const { data: taxes } = useQuery<any[]>({
    queryKey: ["/api/taxes"],
    enabled: open,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  useEffect(() => {
    if (permits && taxes) {
      // Calculate permit revenue
      const permitTotal = permits.reduce(
        (sum: number, permit: any) => sum + Number(permit.price), 
        0
      );
      
      // Calculate tax revenue
      const taxTotal = taxes.reduce(
        (sum: number, tax: any) => sum + Number(tax.amount), 
        0
      );
      
      setPermitRevenue(permitTotal);
      setTaxRevenue(taxTotal);
      
      // Generate monthly revenue data
      generateMonthlyData(permits, taxes);
    }
  }, [permits, taxes]);

  const generateMonthlyData = (permits: any[], taxes: any[]) => {
    // Initialize data for last 3 months
    interface MonthlyRow {
      monthDate: Date;
      name: string;
      permitRevenue: number;
      taxRevenue: number;
      total: number;
    }
    const months: MonthlyRow[] = [];
    const now = new Date();
    
    for (let i = 0; i < 3; i++) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.unshift({
        monthDate: month,
        name: month.toLocaleDateString('fr-FR', { month: 'long' }),
        permitRevenue: 0,
        taxRevenue: 0,
        total: 0
      });
    }
    
    // Calculate revenue for each month
    if (permits) {
      permits.forEach((permit) => {
        const issueDate = new Date(permit.issueDate);
        months.forEach((month) => {
          if (issueDate.getMonth() === month.monthDate.getMonth() && 
              issueDate.getFullYear() === month.monthDate.getFullYear()) {
            month.permitRevenue += Number(permit.price);
            month.total += Number(permit.price);
          }
        });
      });
    }
    
    if (taxes) {
      taxes.forEach((tax) => {
        const issueDate = new Date(tax.issueDate);
        months.forEach((month) => {
          if (issueDate.getMonth() === month.monthDate.getMonth() && 
              issueDate.getFullYear() === month.monthDate.getFullYear()) {
            month.taxRevenue += Number(tax.amount);
            month.total += Number(tax.amount);
          }
        });
      });
    }
    
    setMonthlyData(months);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center justify-between">
            Détails des Recettes
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 no-print"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <div className="flex items-center mb-2">
              <FileText className="h-5 w-5 text-blue-700 mr-2" />
              <h3 className="font-medium text-blue-700">Permis</h3>
            </div>
            <p className="text-2xl font-semibold text-gray-900">{permitRevenue.toLocaleString()} FCFA</p>
            <p className="text-sm text-gray-500">{permits?.length || 0} permis enregistrés</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-100">
            <div className="flex items-center mb-2">
              <Coins className="h-5 w-5 text-green-700 mr-2" />
              <h3 className="font-medium text-green-700">Taxes d'Abattage</h3>
            </div>
            <p className="text-2xl font-semibold text-gray-900">{taxRevenue.toLocaleString()} FCFA</p>
            <p className="text-sm text-gray-500">{taxes?.length || 0} taxes enregistrées</p>
          </div>
        </div>
        
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b border-gray-200">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Recettes Mensuelles</h3>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mois</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Permis</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Taxes</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {monthlyData.map((month, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{month.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{month.permitRevenue.toLocaleString()} FCFA</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{month.taxRevenue.toLocaleString()} FCFA</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{month.total.toLocaleString()} FCFA</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        
        <DialogFooter className="mt-6 no-print">
          <Button 
            variant="outline" 
            onClick={handlePrint}
            className="flex items-center gap-2"
          >
            <Printer className="h-4 w-4" />
            Imprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
