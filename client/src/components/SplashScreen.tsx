import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onLoadingComplete: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onLoadingComplete }) => {
  const [progress, setProgress] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);

  const statusMessages = [
    { text: 'Connexion à la base de données...', progress: 20 },
    { text: 'Chargement des configurations...', progress: 40 },
    { text: 'Vérification des permis...', progress: 60 },
    { text: 'Préparation de l\'interface...', progress: 80 },
    { text: 'Finalisation...', progress: 95 }
  ];

  useEffect(() => {
    // Créer les particules
    const particlesContainer = document.getElementById('splash-particles');
    if (particlesContainer) {
      const particleCount = 15;
      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'splash-particle';
        const size = Math.random() * 10 + 5;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.top = `${Math.random() * 100}%`;
        particle.style.animationDelay = `${Math.random() * 20}s`;
        particlesContainer.appendChild(particle);
      }
    }

    // Animation de progression
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => onLoadingComplete(), 500);
          return 100;
        }
        
        const newProgress = prev + 1;
        
        // Mettre à jour le message de statut
        const currentStatus = statusMessages.findIndex(
          (msg) => newProgress <= msg.progress
        );
        if (currentStatus !== -1 && currentStatus !== statusIndex) {
          setStatusIndex(currentStatus);
        }
        
        return newProgress;
      });
    }, 40); // 40ms * 100 = 4 secondes

    return () => clearInterval(interval);
  }, [onLoadingComplete, statusIndex]);

  return (
    <div className="splash-screen">
      <div id="splash-particles" className="splash-particles"></div>
      
      <div className="splash-container">
        <div className="splash-logo-container">
          <div className="splash-logo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="30" stroke="white" strokeWidth="4" fill="none"/>
              <path d="M20 34c0-8 8-14 12-14s12 6 12 14-8 14-12 14-12-6-12-14z" fill="white"/>
            </svg>
          </div>
          <div className="splash-logo-ring"></div>
        </div>

        <h1 className="splash-title">SCoDiPP</h1>
        <p className="splash-subtitle">
          Système de Contrôle et de Digitalisation des Permis et des Prélèvements
        </p>

        <div className="splash-loading-container">
          <div className="splash-loading-info">
            <span>Chargement...</span>
            <span>{progress}%</span>
          </div>
          <div className="splash-loading-bar">
            <div 
              className="splash-loading-progress" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        <p className="splash-status">
          {statusIndex < statusMessages.length 
            ? statusMessages[statusIndex].text 
            : 'Prêt!'}
        </p>
      </div>

      <div className="splash-version">Version 1.0.0</div>

      <style>{`
        .splash-screen {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: linear-gradient(135deg, #43a047 0%, #66bb6a 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          color: white;
        }

        .splash-particles {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
        }

        .splash-particle {
          position: absolute;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          animation: splash-float 15s infinite linear;
        }

        .splash-container {
          text-align: center;
          animation: splash-fadeInUp 1s ease-out;
          position: relative;
          z-index: 1;
          max-width: 90%;
        }

        .splash-logo-container {
          position: relative;
          width: 150px;
          height: 150px;
          margin: 0 auto 30px;
        }

        .splash-logo {
          width: 100%;
          height: 100%;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(10px);
          border: 2px solid rgba(255, 255, 255, 0.2);
          position: relative;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }

        .splash-logo svg {
          width: 80px;
          height: 80px;
          fill: white;
        }

        .splash-logo::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.1), transparent);
          transform: rotate(45deg);
          animation: splash-shine 3s infinite;
        }

        .splash-logo-ring {
          position: absolute;
          top: -10px;
          left: -10px;
          right: -10px;
          bottom: -10px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: transparent;
          animation: splash-spin 3s linear infinite;
        }

        .splash-title {
          font-size: 48px;
          font-weight: 700;
          margin-bottom: 10px;
          letter-spacing: 2px;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        }

        .splash-subtitle {
          font-size: 18px;
          opacity: 0.9;
          margin-bottom: 40px;
          max-width: 600px;
          margin-left: auto;
          margin-right: auto;
          line-height: 1.5;
        }

        .splash-loading-container {
          width: 400px;
          margin: 0 auto;
        }

        .splash-loading-bar {
          width: 100%;
          height: 8px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 10px;
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
        }

        .splash-loading-progress {
          height: 100%;
          background: linear-gradient(90deg, #ffffff, #a8edea, #ffffff);
          border-radius: 4px;
          transition: width 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .splash-loading-progress::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
          animation: splash-shimmer 1.5s infinite;
        }

        .splash-loading-info {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          opacity: 0.8;
          margin-bottom: 20px;
        }

        .splash-status {
          margin-top: 20px;
          font-size: 16px;
          opacity: 0.9;
          min-height: 24px;
          transition: opacity 0.3s ease;
        }

        .splash-version {
          position: absolute;
          bottom: 20px;
          right: 20px;
          font-size: 12px;
          opacity: 0.6;
        }

        @keyframes splash-fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes splash-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes splash-shine {
          0% { transform: translateX(-100%) translateY(-100%) rotate(45deg); }
          100% { transform: translateX(100%) translateY(100%) rotate(45deg); }
        }

        @keyframes splash-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        @keyframes splash-float {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10%, 90% { opacity: 1; }
          100% { transform: translateY(-100px) translateX(20px); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;
