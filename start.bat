@echo off
echo ========================================
echo    WhatsMyBGRank - Démarrage
echo ========================================
echo.

:: Vérifier si Node.js est installé
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js n'est pas installé !
    echo Téléchargez-le depuis : https://nodejs.org/
    pause
    exit /b 1
)

:: Aller dans le dossier du projet
cd /d "%~dp0"

:: Installer les dépendances si nécessaire
if not exist "node_modules" (
    echo 📦 Installation des dépendances...
    npm install
)

:: Démarrer le serveur de développement
echo 🚀 Démarrage du serveur...
echo.
echo 🌐 L'application s'ouvrira automatiquement dans votre navigateur
echo 📍 URL: http://localhost:5173
echo.
echo Pour arrêter le serveur, appuyez sur Ctrl+C
echo.

start "" http://localhost:5173
npm run dev

pause