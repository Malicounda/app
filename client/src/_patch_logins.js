const fs = require('fs');
const path = require('path');

function patchFile(filePath, domainKey) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/\r\n/g, '\n');

  // Insert state
  if (!content.includes('const [loginTheme')) {
    content = content.replace(
      /(const \[, setLocation\] = useLocation\(\);)/,
      `$1\n  const [loginTheme, setLoginTheme] = useState<{ bgImage?: string; bgColor?: string; primary?: string }>({});\n\n  useEffect(() => {\n    try {\n      const cfgStr = localStorage.getItem('theme:superadmin');\n      if (cfgStr) {\n        const cfg = JSON.parse(cfgStr);\n        const dTheme = cfg?.domains?.${domainKey} || {};\n        setLoginTheme({\n          bgImage: dTheme.loginBgImage,\n          bgColor: dTheme.loginBgColor,\n          primary: dTheme.loginPrimaryColor\n        });\n      }\n    } catch (e) {}\n  }, []);`
    );
  }

  if (domainKey === 'CHASSE') {
    content = content.replace(
      /style=\{\{ backgroundImage: 'url\("\/login_bg_chasse\.png"\)' \}\}/,
      "style={{ backgroundImage: loginTheme.bgImage ? `url(\"${loginTheme.bgImage}\")` : 'url(\"/login_bg_chasse.png\")', backgroundColor: loginTheme.bgColor || undefined }}"
    );
    content = content.replace(
      /className="mb-3 inline-flex items-center gap-2 text-green-700 hover:text-green-800"/,
      `className="mb-3 inline-flex items-center gap-2 text-green-700 hover:text-green-800" style={loginTheme.primary ? { color: loginTheme.primary } : {}}`
    );
    content = content.replace(
      /text-green-600"/g,
      'text-green-600" style={loginTheme.primary ? { color: loginTheme.primary } : {}}'
    );
    content = content.replace(
      /bg-green-600"/g,
      'bg-green-600" style={loginTheme.primary ? { backgroundColor: loginTheme.primary } : {}}'
    );
    content = content.replace(
      /text-green-700"/g,
      'text-green-700" style={loginTheme.primary ? { color: loginTheme.primary } : {}}'
    );
  } else if (domainKey === 'ALERTE') {
    content = content.replace(
      /className="fixed inset-0 z-\[100\] bg-\[#2d6a4f\] flex items-center justify-center overflow-auto p-4"/,
      `className="fixed inset-0 z-[100] flex items-center justify-center overflow-auto p-4 bg-cover bg-center bg-no-repeat"\n      style={{ backgroundImage: loginTheme.bgImage ? \`url("\${loginTheme.bgImage}")\` : undefined, backgroundColor: loginTheme.bgColor || "#2d6a4f" }}`
    );
    content = content.replace(
      /className="mb-3 inline-flex items-center gap-2 text-amber-700"/,
      `className="mb-3 inline-flex items-center gap-2 text-amber-700" style={loginTheme.primary ? { color: loginTheme.primary } : {}}`
    );
    content = content.replace(
      /text-amber-600"/g,
      'text-amber-600" style={loginTheme.primary ? { color: loginTheme.primary } : {}}'
    );
    content = content.replace(
      /bg-amber-600"/g,
      'bg-amber-600" style={loginTheme.primary ? { backgroundColor: loginTheme.primary } : {}}'
    );
  } else if (domainKey === 'REBOISEMENT') {
    content = content.replace(
      /className="fixed inset-0 z-\[100\] bg-gradient-to-br from-lime-50 via-green-50 to-emerald-100 flex items-center justify-center overflow-auto p-4"/,
      `className="fixed inset-0 z-[100] flex items-center justify-center overflow-auto p-4 bg-cover bg-center bg-no-repeat"\n      style={{ backgroundImage: loginTheme.bgImage ? \`url("\${loginTheme.bgImage}")\` : "none", backgroundColor: loginTheme.bgColor || undefined, ...(loginTheme.bgImage || loginTheme.bgColor ? {} : { background: "linear-gradient(to bottom right, #f7fee7, #f0fdf4, #d1fae5)" }) }}`
    );
    content = content.replace(
      /className="mb-3 inline-flex items-center gap-2 text-green-700 hover:text-green-800"/,
      `className="mb-3 inline-flex items-center gap-2 text-green-700 hover:text-green-800" style={loginTheme.primary ? { color: loginTheme.primary } : {}}`
    );
    content = content.replace(
      /text-green-600"/g,
      'text-green-600" style={loginTheme.primary ? { color: loginTheme.primary } : {}}'
    );
    content = content.replace(
      /bg-green-600"/g,
      'bg-green-600" style={loginTheme.primary ? { backgroundColor: loginTheme.primary } : {}}'
    );
  }

  content = content.replace(/\n/g, '\r\n');
  fs.writeFileSync(filePath, content);
  console.log(`SUCCESS: Patched ${filePath}`);
}

patchFile("c:\\Users\\HP\\Desktop\\Scodi\\client\\src\\pages\\Login.tsx", "CHASSE");
patchFile("c:\\Users\\HP\\Desktop\\Scodi\\client\\src\\pages\\AlerteLogin.tsx", "ALERTE");
patchFile("c:\\Users\\HP\\Desktop\\Scodi\\client\\src\\pages\\ReboisementLogin.tsx", "REBOISEMENT");
