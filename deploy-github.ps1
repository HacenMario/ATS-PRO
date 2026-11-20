# ATS PRO v1.2.6 — سكربت الرفع إلى GitHub
# شغّله من مجلد المشروع بعد فك الأرشيف:  powershell -ExecutionPolicy Bypass -File .\deploy-github.ps1

$ErrorActionPreference = "Stop"
Write-Host "=== ATS PRO - deploy to GitHub ===" -ForegroundColor Cyan

# 1) تأكيد أمان: لا يجب وجود أي ملف core متتبع
git ls-files | Select-String -Pattern "(^|/)core$" | ForEach-Object {
    Write-Host "ممنوع: ملف core متتبع في المستودع ($_)" -ForegroundColor Red
    exit 1
}

# 2) هوية Git إن لم تكن مضبوطة
if (-not (git config user.email)) { $e = Read-Host "بريدك على GitHub"; git config user.email $e }
if (-not (git config user.name))  { $n = Read-Host "اسمك على GitHub";  git config user.name $n }

# 3) تاريخ نظيف (يستبدل كل التاريخ القديم — آمن لأن الأرشيف جديد)
if (Test-Path .git) { git remote remove origin 2>$null; git branch -M clean-base 2>$null }
git init
git add .
$staged = git status --short
if (($staged | Measure-Object).Count -eq 0) { Write-Host "لا توجد تغييرات للالتزام" -ForegroundColor Yellow }
git commit -m "ATS PRO v1.2.6" 2>$null
git branch -M main

# 4) الدفع
$repo = Read-Host "رابط المستودع (مثال: https://github.com/HacenMario/ATS-PRO.git)"
git remote add origin $repo
git push -u origin main --force

if ($LASTEXITCODE -eq 0) {
    Write-Host "تم الرفع بنجاح — Vercel و Railway سيتصلان بالمستودع الآن" -ForegroundColor Green
    Write-Host "تابع الخطوات في DEPLOY-AR.md"
} else {
    Write-Host "فشل الدفع — أرسل رسالة الخطأ كاملة" -ForegroundColor Red
}
