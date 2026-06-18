const fs = require('fs');

let content = fs.readFileSync('client/src/components/hunters/HunterDetails.tsx', 'utf8');

const target1 = \<DialogDescription>
              Téléchargez le nouveau document et renseignez sa date d'expiration si nécessaire.
            </DialogDescription>\;
const replace1 = \<DialogDescription>
              {documentsByType[updatingDoc || ''] 
                ? "Mettez à jour la date d'expiration ou téléchargez un nouveau fichier pour remplacer l'existant."
                : "Téléchargez le nouveau document et renseignez sa date d'expiration si nécessaire."}
            </DialogDescription>\;

content = content.replace(target1, replace1);

const target2 = \              {fileToUpload && (
                <p className="text-sm text-gray-500">
                  Fichier sélectionné: {fileToUpload.name} ({(fileToUpload.size / 1024).toFixed(2)} KB)
                </p>
              )}\;
const replace2 = \              {fileToUpload && (
                <p className="text-sm text-gray-500">
                  Fichier sélectionné: {fileToUpload.name} ({(fileToUpload.size / 1024).toFixed(2)} KB)
                </p>
              )}
              {!fileToUpload && documentsByType[updatingDoc || ''] && (
                <div className="bg-blue-50 border border-blue-200 p-2 mt-2 rounded">
                  <p className="text-xs text-blue-700">
                    ℹ️ Fichier déjà existant sur le serveur. Vous n'êtes pas obligé d'en sélectionner un nouveau si vous modifiez juste la date.
                  </p>
                </div>
              )}\;

content = content.replace(target2, replace2);

fs.writeFileSync('client/src/components/hunters/HunterDetails.tsx', content, 'utf8');
