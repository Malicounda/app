const fs = require('fs');
let content = fs.readFileSync('client/src/components/hunters/HunterDetails.tsx', 'utf8');

// Add submitError state
content = content.replace(
  "  const [confirmDateChange, setConfirmDateChange] = useState(false);",
  "  const [confirmDateChange, setConfirmDateChange] = useState(false);\n  const [submitError, setSubmitError] = useState<string | null>(null);"
);

// Clear submitError on modal open
content = content.replace(
  "    setConfirmDateChange(false);\n  };",
  "    setConfirmDateChange(false);\n    setSubmitError(null);\n  };"
);

// Update mutation to set error
const mutationTarget = \    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }\;
const mutationReplace = \    onError: (error: Error) => {
      setSubmitError(error.message);
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }\;
content = content.replace(mutationTarget, mutationReplace);

// Clear error on submit start
content = content.replace(
  "  const handleDocumentSubmit = () => {",
  "  const handleDocumentSubmit = () => {\n    setSubmitError(null);"
);

// Show error in UI
const uiTarget = \            {!fileToUpload && documentsByType[updatingDoc || ''] && updatingDoc !== 'hunterPhoto' && (
              <div className="flex items-center space-x-2 mt-4 bg-yellow-50 p-3 rounded border border-yellow-200">
                <input \;
const uiReplace = \            {submitError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 mt-4 rounded shadow-sm">
                <p className="text-sm font-bold text-red-800 flex items-center gap-2">
                  <Ban className="h-4 w-4" /> Modification refusée
                </p>
                <p className="text-sm text-red-700 mt-1">{submitError}</p>
              </div>
            )}
            {!fileToUpload && documentsByType[updatingDoc || ''] && updatingDoc !== 'hunterPhoto' && (
              <div className="flex items-center space-x-2 mt-4 bg-yellow-50 p-3 rounded border border-yellow-200">
                <input \;
content = content.replace(uiTarget, uiReplace);

fs.writeFileSync('client/src/components/hunters/HunterDetails.tsx', content, 'utf8');
