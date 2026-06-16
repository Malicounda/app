# Patch Login Pages
function Patch-File {
    param([string]$path, [string]$domainKey, [string]$defaultBgStyle, [string]$defaultBgColorClass, [string]$defaultTextClass, [string]$defaultBgClass)
    
    $content = [System.IO.File]::ReadAllText($path)
    $contentNorm = $content -replace "`r`n", "`n"

    # Insert state variable
    if (-not $contentNorm.Contains("const [loginTheme")) {
        $contentNorm = $contentNorm -replace "(const \[, setLocation\] = useLocation\(\);)", "`$1`n  const [loginTheme, setLoginTheme] = useState<{ bgImage?: string; bgColor?: string; primary?: string }>({});`n`n  useEffect(() => {`n    try {`n      const cfgStr = localStorage.getItem('theme:superadmin');`n      if (cfgStr) {`n        const cfg = JSON.parse(cfgStr);`n        const dTheme = cfg?.domains?.${domainKey} || {};`n        setLoginTheme({`n          bgImage: dTheme.loginBgImage,`n          bgColor: dTheme.loginBgColor,`n          primary: dTheme.loginPrimaryColor`n        });`n      }`n    } catch (e) {}`n  }, []);"
    }

    # Patch background in main div
    if ($domainKey -eq "CHASSE") {
        $contentNorm = $contentNorm -replace 'style=\{\{ backgroundImage: ''url\("/login_bg_chasse.png"\)'' \}\}', "style={{ backgroundImage: loginTheme.bgImage ? `'url(`"${loginTheme.bgImage}`")`' : 'url(`"/login_bg_chasse.png`")', backgroundColor: loginTheme.bgColor || undefined }}"
    } elseif ($domainKey -eq "ALERTE") {
        $contentNorm = $contentNorm -replace 'className="fixed inset-0 z-\[100\] bg-\[\#2d6a4f\] flex items-center justify-center overflow-auto p-4"', 'className="fixed inset-0 z-[100] flex items-center justify-center overflow-auto p-4 bg-cover bg-center bg-no-repeat"`n      style={{ backgroundImage: loginTheme.bgImage ? `'url(`"${loginTheme.bgImage}`")`' : undefined, backgroundColor: loginTheme.bgColor || "#2d6a4f" }}'
    } elseif ($domainKey -eq "REBOISEMENT") {
        $contentNorm = $contentNorm -replace 'className="fixed inset-0 z-\[100\] bg-gradient-to-br from-lime-50 via-green-50 to-emerald-100 flex items-center justify-center overflow-auto p-4"', 'className="fixed inset-0 z-[100] flex items-center justify-center overflow-auto p-4 bg-cover bg-center bg-no-repeat"`n      style={{ backgroundImage: loginTheme.bgImage ? `'url(`"${loginTheme.bgImage}`")`' : "none", backgroundColor: loginTheme.bgColor || undefined, ...(loginTheme.bgImage || loginTheme.bgColor ? {} : { background: "linear-gradient(to bottom right, #f7fee7, #f0fdf4, #d1fae5)" }) }}'
    }

    # Patch primary colors in components
    if ($domainKey -eq "CHASSE") {
        $contentNorm = $contentNorm -replace 'className="mb-3 inline-flex items-center gap-2 text-green-700 hover:text-green-800"', 'className="mb-3 inline-flex items-center gap-2 text-green-700 hover:text-green-800" style={loginTheme.primary ? { color: loginTheme.primary } : {}}'
        $contentNorm = $contentNorm -replace 'text-green-600', 'text-green-600" style={loginTheme.primary ? { color: loginTheme.primary } : {}} data-color="'
        $contentNorm = $contentNorm -replace 'bg-green-600', 'bg-green-600" style={loginTheme.primary ? { backgroundColor: loginTheme.primary } : {}} data-bg="'
        $contentNorm = $contentNorm -replace 'text-green-700', 'text-green-700" style={loginTheme.primary ? { color: loginTheme.primary } : {}} data-color="'
    } elseif ($domainKey -eq "ALERTE") {
        $contentNorm = $contentNorm -replace 'className="mb-3 inline-flex items-center gap-2 text-amber-700"', 'className="mb-3 inline-flex items-center gap-2 text-amber-700" style={loginTheme.primary ? { color: loginTheme.primary } : {}}'
        $contentNorm = $contentNorm -replace 'text-amber-600', 'text-amber-600" style={loginTheme.primary ? { color: loginTheme.primary } : {}} data-color="'
        $contentNorm = $contentNorm -replace 'bg-amber-600', 'bg-amber-600" style={loginTheme.primary ? { backgroundColor: loginTheme.primary } : {}} data-bg="'
    } elseif ($domainKey -eq "REBOISEMENT") {
        $contentNorm = $contentNorm -replace 'className="mb-3 inline-flex items-center gap-2 text-green-700 hover:text-green-800"', 'className="mb-3 inline-flex items-center gap-2 text-green-700 hover:text-green-800" style={loginTheme.primary ? { color: loginTheme.primary } : {}}'
        $contentNorm = $contentNorm -replace 'text-green-600', 'text-green-600" style={loginTheme.primary ? { color: loginTheme.primary } : {}} data-color="'
        $contentNorm = $contentNorm -replace 'bg-green-600', 'bg-green-600" style={loginTheme.primary ? { backgroundColor: loginTheme.primary } : {}} data-bg="'
    }

    # Fix formatting issues caused by blind replace
    $contentNorm = $contentNorm -replace 'data-color=""\s*', ''
    $contentNorm = $contentNorm -replace 'data-bg=""\s*', ''

    $finalContent = $contentNorm -replace "`n", "`r`n"
    [System.IO.File]::WriteAllText($path, $finalContent)
    Write-Output "SUCCESS: Patched $path"
}

Patch-File -path "c:\Users\HP\Desktop\Scodi\client\src\pages\Login.tsx" -domainKey "CHASSE"
Patch-File -path "c:\Users\HP\Desktop\Scodi\client\src\pages\AlerteLogin.tsx" -domainKey "ALERTE"
Patch-File -path "c:\Users\HP\Desktop\Scodi\client\src\pages\ReboisementLogin.tsx" -domainKey "REBOISEMENT"
