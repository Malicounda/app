# Patch App.tsx: replace lines 1090-1097 with expanded domain detection
$file = "c:\Users\HP\Desktop\Scodi\client\src\App.tsx"
$content = [System.IO.File]::ReadAllText($file)

$oldBlock = @"
  let pathDomain = '';
  if (lowerLoc.startsWith('/reboisement') || lowerLoc.startsWith('/pepinieres') || lowerLoc.startsWith('/zones-reboisees') || lowerLoc.startsWith('/declarations')) {
    pathDomain = 'REBOISEMENT';
  } else if (lowerLoc.startsWith('/alerte') || lowerLoc.startsWith('/alertes')) {
    pathDomain = 'ALERTE';
  } else if (lowerLoc.startsWith('/chasse') || lowerLoc.startsWith('/permits') || lowerLoc.startsWith('/guides') || lowerLoc === '/login') {
    pathDomain = 'CHASSE';
  }
"@

$newBlock = @"
  let pathDomain = '';
  // --- D`u00e9tection APK synchrone (priorit`u00e9 absolue) ---
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (ua.includes('ChasseAPK')) pathDomain = 'CHASSE';
    else if (ua.includes('AlerteAPK')) pathDomain = 'ALERTE';
  } catch (e) {}
  if (!pathDomain) {
    if (lowerLoc.startsWith('/reboisement') || lowerLoc.startsWith('/pepinieres') || lowerLoc.startsWith('/zones-reboisees') || lowerLoc.startsWith('/declarations') || lowerLoc.startsWith('/reboisement-login')) {
      pathDomain = 'REBOISEMENT';
    } else if (lowerLoc.startsWith('/alerte') || lowerLoc.startsWith('/alertes') || lowerLoc.startsWith('/supervisor') || lowerLoc.startsWith('/default-home')) {
      pathDomain = 'ALERTE';
    } else if (
      lowerLoc === '/login' || lowerLoc.startsWith('/hunter') || lowerLoc.startsWith('/guide') ||
      lowerLoc.startsWith('/admin') || lowerLoc.startsWith('/regional') || lowerLoc.startsWith('/sector') ||
      lowerLoc.startsWith('/sous-secteur') || lowerLoc.startsWith('/brigade') || lowerLoc.startsWith('/triage') ||
      lowerLoc.startsWith('/poste-control') || lowerLoc.startsWith('/dashboard') || lowerLoc.startsWith('/permits') ||
      lowerLoc.startsWith('/permit-request') || lowerLoc.startsWith('/gestion-permis') || lowerLoc.startsWith('/taxes') ||
      lowerLoc.startsWith('/guides') || lowerLoc.startsWith('/agents') || lowerLoc.startsWith('/hunters') ||
      lowerLoc.startsWith('/chasse') || lowerLoc.startsWith('/especes') || lowerLoc.startsWith('/infractions') ||
      lowerLoc.startsWith('/history') || lowerLoc.startsWith('/sms') || lowerLoc.startsWith('/alerts') ||
      lowerLoc.startsWith('/map') || lowerLoc.startsWith('/statistics') || lowerLoc.startsWith('/hunting') ||
      lowerLoc.startsWith('/profile') || lowerLoc.startsWith('/changeprofil') || lowerLoc.startsWith('/regions-zones') ||
      lowerLoc.startsWith('/accounts') || lowerLoc.startsWith('/settings') || lowerLoc.startsWith('/subaccounts')
    ) {
      pathDomain = 'CHASSE';
    }
  }
"@

# Normalize line endings for matching
$contentNorm = $content -replace "`r`n", "`n"
$oldNorm = $oldBlock -replace "`r`n", "`n"
$newNorm = $newBlock -replace "`r`n", "`n"

if ($contentNorm.Contains($oldNorm)) {
    $contentNorm = $contentNorm.Replace($oldNorm, $newNorm)
    # Write back with original line endings
    $finalContent = $contentNorm -replace "`n", "`r`n"
    [System.IO.File]::WriteAllText($file, $finalContent)
    Write-Output "SUCCESS: App.tsx patched"
} else {
    Write-Output "ERROR: Old block not found in App.tsx"
}
