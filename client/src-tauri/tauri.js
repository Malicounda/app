#!/usr/bin/env node

// Script temporaire pour résoudre l'erreur de module manquant
// Ce script redirige vers le CLI Tauri global

const { spawn } = require('child_process');
const path = require('path');

// Obtenir les arguments passés au script
const args = process.argv.slice(2);

// Exécuter le CLI Tauri global
const tauriProcess = spawn('tauri', args, {
  stdio: 'inherit',
  shell: true
});

tauriProcess.on('close', (code) => {
  process.exit(code);
});

tauriProcess.on('error', (err) => {
  console.error('Erreur lors de l\'exécution de tauri:', err);
  process.exit(1);
});
