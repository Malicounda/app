const fs = require('fs');
let content = fs.readFileSync('client/src/components/hunters/HunterDetails.tsx', 'utf8');

// 1. Add state
const stateTarget = \  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState<string>('');\;
const stateReplace = \  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [confirmDateChange, setConfirmDateChange] = useState(false);\;
content = content.replace(stateTarget, stateReplace);

// 2. Reset state in openUpdateDialog
const openTarget = \    } else {
      setExpiryDate('');
    }
    setFileToUpload(null);
  };\;
const openReplace = \    } else {
      setExpiryDate('');
    }
    setFileToUpload(null);
    setConfirmDateChange(false);
  };\;
content = content.replace(openTarget, openReplace);

// 3. Add Checkbox UI and update button logic
const uiTarget = \            )}
            {updatingDoc === 'hunterPhoto' && (
              <p className="text-sm text-gray-500 mt-2">
                Note : La photo d'identité n'a pas de date d'expiration.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUpdatingDoc(null);
                setFileToUpload(null);
                setExpiryDate('');
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleDocumentSubmit}
              disabled={(!updatingDoc) || (!documentsByType[updatingDoc] && !fileToUpload) || updateDocument.isPending}
              className="mt-4 w-full"
            >
              {updateDocument.isPending ? 'Enregistrement...' : 'Enregistrer le document'}
            </Button>
          </DialogFooter>\;

const uiReplace = \            )}
            {updatingDoc === 'hunterPhoto' && (
              <p className="text-sm text-gray-500 mt-2">
                Note : La photo d'identité n'a pas de date d'expiration.
              </p>
            )}
            {!fileToUpload && documentsByType[updatingDoc || ''] && updatingDoc !== 'hunterPhoto' && (
              <div className="flex items-center space-x-2 mt-4 bg-yellow-50 p-3 rounded border border-yellow-200">
                <input 
                  type="checkbox" 
                  id="confirm-date" 
                  checked={confirmDateChange}
                  onChange={(e) => setConfirmDateChange(e.target.checked)}
                  className="h-4 w-4 text-yellow-600 rounded border-gray-300"
                />
                <Label htmlFor="confirm-date" className="text-sm text-yellow-800 cursor-pointer">
                  Je confirme vouloir modifier manuellement la date d'expiration du document existant.
                </Label>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6">
            <Button
              variant="outline"
              className="mt-2 sm:mt-0"
              onClick={() => {
                setUpdatingDoc(null);
                setFileToUpload(null);
                setExpiryDate('');
                setConfirmDateChange(false);
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleDocumentSubmit}
              disabled={
                (!updatingDoc) || 
                (!documentsByType[updatingDoc] && !fileToUpload) || 
                (documentsByType[updatingDoc] && !fileToUpload && updatingDoc !== 'hunterPhoto' && !confirmDateChange) || 
                updateDocument.isPending
              }
            >
              {updateDocument.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>\;

content = content.replace(uiTarget, uiReplace);

fs.writeFileSync('client/src/components/hunters/HunterDetails.tsx', content, 'utf8');
