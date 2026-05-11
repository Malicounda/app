import React, { useEffect, useState } from 'react';

// Types pour jsPDF et jspdf-autotable
declare global {
  interface Window {
    jspdf: any;
    jspdfAutotable: any;
  }
}

// Hook pour charger les bibliothèques jsPDF et jspdf-autotable via CDN
export const usePdfLibraries = () => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fonction pour charger un script externe
    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Échec de chargement du script: ${src}`));
        document.head.appendChild(script);
      });
    };

    // Charger les scripts nécessaires
    const loadLibraries = async () => {
      try {
        // Charger jsPDF d'abord
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        // Puis charger jspdf-autotable qui dépend de jsPDF
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.29/jspdf.plugin.autotable.min.js');
        setLoaded(true);
      } catch (err) {
        console.error('Erreur lors du chargement des bibliothèques PDF:', err);
        setError('Impossible de charger les bibliothèques nécessaires pour générer des PDF');
      }
    };

    loadLibraries();
  }, []);

  return { loaded, error };
};

// Composant de chargement à afficher pendant le chargement des bibliothèques
export const PdfLibraryLoader = ({
  children,
  fallback = <div>Chargement des bibliothèques PDF...</div>
}: {
  children: React.ReactNode,
  fallback?: React.ReactNode
}) => {
  const { loaded, error } = usePdfLibraries();

  if (error) {
    return <div className="text-red-500">Erreur: {error}</div>;
  }

  if (!loaded) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

// Fonction utilitaire pour générer un PDF
export const generatePdf = ({
  title = 'Document',
  filename = 'document.pdf',
  tableData = [],
  tableColumns = [],
  additionalContent = null,
}: {
  title?: string,
  filename?: string,
  tableData?: any[],
  tableColumns?: any[],
  additionalContent?: ((doc: any) => void) | null,
}) => {
  if (!window.jspdf || !window.jspdfAutotable) {
    console.error('Les bibliothèques jsPDF ne sont pas chargées');
    return;
  }

  // Créer un nouveau document PDF
  const doc = new window.jspdf.jsPDF();

  // Ajouter le titre
  doc.setFontSize(18);
  doc.text(title, 14, 22);

  // Ajouter la date
  doc.setFontSize(11);
  doc.text(`Généré le: ${new Date().toLocaleDateString()}`, 14, 30);

  // Ajouter un tableau si des données sont fournies
  if (tableData.length > 0 && tableColumns.length > 0) {
    doc.autoTable({
      startY: 38,
      head: [tableColumns],
      body: tableData,
      headStyles: {
        fillColor: [0, 128, 0], // Vert pour correspondre à l'esthétique de l'application
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [240, 240, 240],
      },
      margin: { top: 10, right: 14, bottom: 10, left: 14 },
    });
  }

  // Exécuter du contenu personnalisé si fourni
  if (additionalContent) {
    additionalContent(doc);
  }

  // Enregistrer le PDF
  doc.save(filename);
};

// Exemple d'utilisation:
/*
// Dans un composant React:
import { PdfLibraryLoader, generatePdf } from '@/utils/pdfGenerator';

function ExportButton() {
  const handleExport = () => {
    generatePdf({
      title: 'Liste des Permis',
      filename: 'permis.pdf',
      tableColumns: ['ID', 'Chasseur', 'Type', 'Date d\'expiration'],
      tableData: [
        [1, 'Amadou Diop', 'Sportif', '31/12/2025'],
        [2, 'Fatou Sow', 'Coutumier', '15/06/2025'],
      ],
      additionalContent: (doc) => {
        // Ajouter du contenu personnalisé
        doc.setFontSize(10);
        doc.text('Direction des Eaux et Forêts du Sénégal', 14, doc.autoTable.previous.finalY + 10);
      },
    });
  };

  return (
    <PdfLibraryLoader fallback={<button disabled>Chargement...</button>}>
      <button onClick={handleExport}>Exporter en PDF</button>
    </PdfLibraryLoader>
  );
}
*/
