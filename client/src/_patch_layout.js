const fs = require('fs');

function reorganizeLayout(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(
    `<CardContent className="grid gap-4">\n                  <div className="grid gap-4 md:grid-cols-2">`,
    `<CardContent className="space-y-8">\n                  <div>\n                    <h3 className="text-lg font-medium border-b pb-2 mb-4 text-primary">Thème Rapide</h3>\n                    <div className="grid gap-4 md:grid-cols-2">`
  );

  content = content.replace(
    `                </select>\n              </div>\n            </div>\n\n            <div className="grid gap-4 md:grid-cols-2">`,
    `                </select>\n              </div>\n            </div>\n          </div>\n\n          <div>\n            <h3 className="text-lg font-medium border-b pb-2 mb-4 text-primary">Interface du Domaine</h3>\n            <div className="grid gap-4 md:grid-cols-2">`
  );

  content = content.replace(
    `              <div className="space-y-2 md:col-span-2">\n                <div className="text-sm font-semibold mt-4 mb-2 border-b pb-2">Couleurs globales du thème pour ce domaine</div>\n                <div className="grid gap-4 md:grid-cols-2">`,
    `              <div className="space-y-2 md:col-span-2 mt-4">\n                <div className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Couleurs globales</div>\n                <div className="grid gap-4 grid-cols-2 md:grid-cols-4">`
  );

  content = content.replace(
    `                </div>\n              </div>\n\n              <div className="space-y-2 md:col-span-2">\n                <Label>Téléverser un logo / icône</Label>`,
    `                </div>\n              </div>\n\n              <div className="grid gap-4 md:grid-cols-2 md:col-span-2 mt-4">\n                <div className="space-y-2">\n                  <div className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Médias (Logo)</div>\n                  <Label>Téléverser un logo / icône</Label>`
  );

  content = content.replace(
    `                ) : null}\n              </div>\n\n              <div className="space-y-2 md:col-span-2">\n                <Label>Image de fond personnalisée (Remplace les couleurs)</Label>`,
    `                ) : null}\n              </div>\n\n              <div className="space-y-2">\n                <div className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Image de fond de page</div>\n                <Label>Image de fond personnalisée (Remplace les couleurs)</Label>`
  );

  content = content.replace(
    `                ) : null}\n              </div>\n            </div>\n\n              <div className="space-y-2 md:col-span-2">\n                <div className="text-sm font-semibold mt-4 mb-2 border-b pb-2">Personnalisation de la page de connexion</div>\n                <div className="grid gap-4 md:grid-cols-2">`,
    `                ) : null}\n              </div>\n            </div>\n          </div>\n\n          <div>\n            <h3 className="text-lg font-medium border-b pb-2 mb-4 text-primary">Page de Connexion (Login)</h3>\n            <div className="grid gap-4 md:grid-cols-2">`
  );

  // Since we added <div> wrapping "Interface du Domaine" and "Page de Connexion", we need to close them properly.
  // Wait, the "Page de Connexion" wrapping div should be closed right before the text "Les changements s'appliquent automatiquement..."
  content = content.replace(
    `                </div>\n              </div>\n\n            <div className="text-sm text-muted-foreground">`,
    `                </div>\n              </div>\n            </div>\n\n            <div className="text-sm text-muted-foreground">`
  );

  fs.writeFileSync(filePath, content);
  console.log('Layout patched.');
}

reorganizeLayout("c:\\Users\\HP\\Desktop\\Scodi\\client\\src\\pages\\SuperAdmin\\ThemePage.tsx");
