import React, { useState, useRef, useEffect } from 'react';

interface ResponsiveImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  placeholder?: string;
  sizes?: string;
  quality?: number;
  loading?: 'lazy' | 'eager';
  onLoad?: () => void;
  onError?: () => void;
}

export const ResponsiveImage: React.FC<ResponsiveImageProps> = ({
  src,
  alt,
  width,
  height,
  className = '',
  priority = false,
  placeholder,
  sizes = '100vw',
  quality = 75,
  loading = 'lazy',
  onLoad,
  onError
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Intersection Observer pour le lazy loading
  useEffect(() => {
    if (priority || loading === 'eager') {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px'
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [priority, loading]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // Génération des sources responsive
  const generateSrcSet = (baseSrc: string) => {
    const baseUrl = baseSrc.split('.')[0];
    const extension = baseSrc.split('.').pop();
    
    return [
      `${baseUrl}-320w.${extension} 320w`,
      `${baseUrl}-640w.${extension} 640w`,
      `${baseUrl}-768w.${extension} 768w`,
      `${baseUrl}-1024w.${extension} 1024w`,
      `${baseUrl}-1280w.${extension} 1280w`,
      `${baseUrl}-1920w.${extension} 1920w`
    ].join(', ');
  };

  // Styles pour le placeholder et l'animation
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: placeholder ? 'transparent' : '#f3f4f6',
    ...(width && height ? { aspectRatio: `${width}/${height}` } : {})
  };

  const imageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'opacity 0.3s ease-in-out',
    opacity: isLoaded ? 1 : 0
  };

  if (hasError) {
    return (
      <div 
        className={`flex items-center justify-center bg-gray-200 text-gray-500 ${className}`}
        style={containerStyle}
        role="img"
        aria-label={alt}
      >
        <div className="text-center p-4">
          <svg className="w-8 h-8 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
          </svg>
          <p className="text-sm">Image non disponible</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={imgRef}
      className={`relative ${className}`}
      style={containerStyle}
    >
      {/* Placeholder/Skeleton */}
      {!isLoaded && (
        <div 
          className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 animate-pulse"
          style={{
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite'
          }}
        />
      )}

      {/* Image principale */}
      {isInView && (
        <picture>
          {/* Sources WebP pour les navigateurs modernes */}
          <source
            srcSet={generateSrcSet(src.replace(/\.[^/.]+$/, '.webp'))}
            sizes={sizes}
            type="image/webp"
          />
          
          {/* Sources AVIF pour les navigateurs ultra-modernes */}
          <source
            srcSet={generateSrcSet(src.replace(/\.[^/.]+$/, '.avif'))}
            sizes={sizes}
            type="image/avif"
          />
          
          {/* Image de fallback */}
          <img
            src={src}
            srcSet={generateSrcSet(src)}
            sizes={sizes}
            alt={alt}
            width={width}
            height={height}
            loading={loading}
            decoding="async"
            style={imageStyle}
            onLoad={handleLoad}
            onError={handleError}
            className="w-full h-full object-cover"
          />
        </picture>
      )}

      {/* Styles pour l'animation shimmer */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
};

// Hook pour l'optimisation d'images
export const useImageOptimization = () => {
  const [isWebPSupported, setIsWebPSupported] = useState(false);
  const [isAVIFSupported, setIsAVIFSupported] = useState(false);

  useEffect(() => {
    // Test du support WebP
    const webpTest = new Image();
    webpTest.onload = webpTest.onerror = () => {
      setIsWebPSupported(webpTest.height === 2);
    };
    webpTest.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';

    // Test du support AVIF
    const avifTest = new Image();
    avifTest.onload = avifTest.onerror = () => {
      setIsAVIFSupported(avifTest.height === 2);
    };
    avifTest.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAABgAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAABoAAAAAF0aXRlbwAAABAAABAAAAAAAAAAAAAAAAAAAAAAABAAEAAAAAAABAAEAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  }, []);

  return {
    isWebPSupported,
    isAVIFSupported,
    getOptimalFormat: (originalSrc: string) => {
      if (isAVIFSupported) return originalSrc.replace(/\.[^/.]+$/, '.avif');
      if (isWebPSupported) return originalSrc.replace(/\.[^/.]+$/, '.webp');
      return originalSrc;
    }
  };
};

export default ResponsiveImage;
