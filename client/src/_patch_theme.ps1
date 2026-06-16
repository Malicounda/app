# Patch ThemePage.tsx: Add login theme fields
$file = "c:\Users\HP\Desktop\Scodi\client\src\pages\SuperAdmin\ThemePage.tsx"
$content = [System.IO.File]::ReadAllText($file)
$contentNorm = $content -replace "`r`n", "`n"

# 1. Add loginBgImage, loginPrimaryColor, loginBgColor to DomainTheme type
$oldType = @"
  inputBg?: string;
};
"@

$newType = @"
  inputBg?: string;
  // Login page customization
  loginBgImage?: string;
  loginBgColor?: string;
  loginPrimaryColor?: string;
};
"@

$contentNorm = $contentNorm.Replace(($oldType -replace "`r`n","`n"), ($newType -replace "`r`n","`n"))

# 2. Add the login theme section BEFORE the closing div of domain config (before "Les changements s'appliquent")
$oldClosing = @"
            <div className="text-sm text-muted-foreground">
              Les changements s'appliquent automatiquement sur la page d'accueil.
            </div>
"@

$newClosing = @"
              <div className="space-y-2 md:col-span-2">
                <div className="text-sm font-semibold mt-4 mb-2 border-b pb-2">Personnalisation de la page de connexion</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Couleur de fond (Login)</Label>
                    <ColorField
                      id="dom-login-bg"
                      value={domainTheme.loginBgColor || ""}
                      placeholder="#2d6a4f"
                      onChange={(next) => updateDomain({ loginBgColor: next })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Couleur principale (Login)</Label>
                    <ColorField
                      id="dom-login-primary"
                      value={domainTheme.loginPrimaryColor || ""}
                      placeholder="#16a34a"
                      onChange={(next) => updateDomain({ loginPrimaryColor: next })}
                    />
                  </div>
                </div>
                <div className="space-y-2 mt-3">
                  <Label>Image de fond de la page de connexion</Label>
                  <input
                    type="file"
                    accept="image/*"
                    className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-sm"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const dataUrl = await new Promise<string>((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onerror = () => reject(new Error('read-failed'));
                          reader.onload = () => resolve(String(reader.result || ''));
                          reader.readAsDataURL(file);
                        });
                        updateDomain({ loginBgImage: dataUrl });
                      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e); }
                    }}
                  />
                  {domainTheme.loginBgImage ? (
                    <div className="mt-2 flex items-center gap-3">
                      <img src={domainTheme.loginBgImage} alt="preview login bg" className="h-20 w-32 rounded bg-white object-cover shadow-sm" />
                      <Button type="button" variant="outline" onClick={() => updateDomain({ loginBgImage: '' })}>
                        Enlever l'image de fond login
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

            <div className="text-sm text-muted-foreground">
              Les changements s'appliquent automatiquement sur la page d'accueil.
            </div>
"@

$contentNorm = $contentNorm.Replace(($oldClosing -replace "`r`n","`n"), ($newClosing -replace "`r`n","`n"))

# Write back
$finalContent = $contentNorm -replace "`n", "`r`n"
[System.IO.File]::WriteAllText($file, $finalContent)
Write-Output "SUCCESS: ThemePage.tsx patched"
