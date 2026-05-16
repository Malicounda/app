$path = "server/storage.ts"
$content = Get-Content -Path $path -Raw
# Add missing closing brace
$content = $content -replace '(?ms)(async deleteCatalogCategory\(id: number\): Promise<boolean> \{.*?catch.*?\{.*?\})(\s+)(// Push Notification operations)', "`$1`r`n    }`r`n`r`n    `$3"
# Fix double closing brace at the end if it was messed up
$content = $content -replace '(?ms)(\s+)(\})\s+(\})\s+(\})\s+(// Use the database storage implementation)', "`$1`r`n    }`r`n  }`r`n`r`n  `$5"
$content | Set-Content -Path $path
