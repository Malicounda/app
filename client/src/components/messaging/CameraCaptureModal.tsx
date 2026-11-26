import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, RefreshCw, RotateCcw, Upload, X, AlertCircle, Loader2 } from "lucide-react";

interface CameraCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export default function CameraCaptureModal({
  open,
  onClose,
  onCapture,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(
    async (mode: "environment" | "user") => {
      stopStream();
      setError(null);
      setIsStarting(true);

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        setIsStarting(false);
        setError(
          "L'accès direct à la caméra n'est pas disponible sur ce navigateur (connexion HTTPS requise)."
        );
        return;
      }

      try {
        // Essayer d'abord le mode demandé (arrière par défaut sur mobile), puis fallback générique (webcam PC)
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: mode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;

        // Détecter s'il y a plusieurs caméras pour afficher le bouton de bascule
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === "videoinput");
          setHasMultipleCameras(videoInputs.length > 1);
        } catch {
          setHasMultipleCameras(false);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        const name = err?.name || "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError(
            "Accès à la caméra refusé. Veuillez autoriser la caméra dans votre navigateur."
          );
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setError("Aucune caméra détectée sur cet appareil.");
        } else if (name === "NotReadableError" || name === "TrackStartError") {
          setError(
            "La caméra est déjà utilisée par une autre application."
          );
        } else {
          setError("Impossible de démarrer la caméra de l'appareil.");
        }
      } finally {
        setIsStarting(false);
      }
    },
    [stopStream]
  );

  // Démarrer/arrêter la caméra à l'ouverture/fermeture du modal ou lors du changement de caméra
  useEffect(() => {
    if (!open) {
      stopStream();
      if (capturedUrl) {
        URL.revokeObjectURL(capturedUrl);
        setCapturedUrl(null);
      }
      setCapturedBlob(null);
      setError(null);
      return;
    }

    if (!capturedUrl) {
      startCamera(facingMode);
    }

    return () => {
      stopStream();
    };
  }, [open, facingMode, capturedUrl, startCamera, stopStream]);

  // Libérer l'URL blob si démontage
  useEffect(() => {
    return () => {
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    };
  }, [capturedUrl]);

  if (!open) return null;

  const handleTakePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopStream();
        const url = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedUrl(url);
      },
      "image/jpeg",
      0.9
    );
  };

  const handleRetake = () => {
    if (capturedUrl) {
      URL.revokeObjectURL(capturedUrl);
    }
    setCapturedUrl(null);
    setCapturedBlob(null);
  };

  const handleConfirm = () => {
    if (!capturedBlob) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
      now.getHours()
    )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const file = new File([capturedBlob], `photo_${stamp}.jpg`, {
      type: "image/jpeg",
    });
    stopStream();
    onCapture(file);
    onClose();
  };

  const handleClose = () => {
    stopStream();
    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[20000] bg-black/90 flex flex-col items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="relative w-full h-full sm:h-auto sm:max-w-lg sm:rounded-2xl overflow-hidden bg-slate-950 flex flex-col shadow-2xl border border-white/10">
        {/* Barre supérieure */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/60 text-white shrink-0">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-emerald-400" />
            <span className="text-sm font-bold">Prendre une photo</span>
          </div>
          <div className="flex items-center gap-2">
            {hasMultipleCameras && !capturedUrl && !error && (
              <button
                type="button"
                onClick={() =>
                  setFacingMode((prev) =>
                    prev === "environment" ? "user" : "environment"
                  )
                }
                className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                title="Changer de caméra"
              >
                <RefreshCw className="h-4 w-4 text-white" />
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              title="Fermer"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>

        {/* Zone vidéo / aperçu */}
        <div className="relative flex-1 sm:flex-none sm:aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
          {capturedUrl ? (
            <img
              src={capturedUrl}
              alt="Aperçu de la photo"
              className="w-full h-full object-contain"
            />
          ) : error ? (
            <div className="flex flex-col items-center justify-center text-center px-6 py-10 gap-4">
              <div className="h-14 w-14 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertCircle className="h-7 w-7 text-red-400" />
              </div>
              <p className="text-sm text-white/90 max-w-xs leading-relaxed">
                {error}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => startCamera(facingMode)}
                  className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-colors"
                >
                  Réessayer
                </button>
                <button
                  type="button"
                  onClick={() => fallbackInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Importer une image
                </button>
              </div>
              <input
                ref={fallbackInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    onCapture(f);
                    onClose();
                  }
                }}
              />
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {isStarting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-2 text-white">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                  <span className="text-xs font-medium text-white/80">
                    Activation de la caméra...
                  </span>
                </div>
              )}
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Contrôles inférieurs */}
        {!error && (
          <div className="px-6 py-5 bg-black/80 flex items-center justify-center gap-6 shrink-0">
            {capturedUrl ? (
              <>
                <button
                  type="button"
                  onClick={handleRetake}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-sm font-semibold transition-all active:scale-95"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reprendre
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-lg transition-all active:scale-95"
                >
                  <Check className="h-4 w-4" />
                  Utiliser la photo
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isStarting}
                onClick={handleTakePhoto}
                className="h-16 w-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/30 active:scale-90 disabled:opacity-40 flex items-center justify-center transition-all shadow-lg"
                title="Prendre la photo"
              >
                <span className="h-12 w-12 rounded-full bg-white block" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}
