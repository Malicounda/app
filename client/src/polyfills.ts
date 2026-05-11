// Polyfills pour la compatibilité navigateurs
import 'core-js/stable';

// Polyfills spécifiques pour les fonctionnalités utilisées dans l'application

// Polyfill pour Object.assign (IE11)
if (typeof Object.assign !== 'function') {
  Object.assign = function(target: any, ...sources: any[]) {
    if (target == null) {
      throw new TypeError('Cannot convert undefined or null to object');
    }
    const to = Object(target);
    for (let index = 0; index < sources.length; index++) {
      const nextSource = sources[index];
      if (nextSource != null) {
        for (const nextKey in nextSource) {
          if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
            to[nextKey] = nextSource[nextKey];
          }
        }
      }
    }
    return to;
  };
}

// Polyfill pour Array.from (IE11)
if (!Array.from) {
  Array.from = function(arrayLike: any, mapFn?: any, thisArg?: any) {
    const C = this;
    const items = Object(arrayLike);
    if (arrayLike == null) {
      throw new TypeError('Array.from requires an array-like object - not null or undefined');
    }
    const mapFunction = mapFn ? mapFn : undefined;
    const T = thisArg;
    const len = parseInt(items.length, 10);
    const A = typeof C === 'function' ? Object(new C(len)) : new Array(len);
    let k = 0;
    let kValue;
    while (k < len) {
      kValue = items[k];
      if (mapFunction) {
        A[k] = typeof T === 'undefined' ? mapFunction(kValue, k) : mapFunction.call(T, kValue, k);
      } else {
        A[k] = kValue;
      }
      k += 1;
    }
    A.length = len;
    return A;
  };
}

// Polyfill pour String.includes (IE11)
if (!String.prototype.includes) {
  String.prototype.includes = function(search: string, start?: number) {
    if (typeof start !== 'number') {
      start = 0;
    }
    if (start + search.length > this.length) {
      return false;
    } else {
      return this.indexOf(search, start) !== -1;
    }
  };
}

// Polyfill pour Array.includes (IE11)
if (!Array.prototype.includes) {
  Array.prototype.includes = function(searchElement: any, fromIndex?: number) {
    if (this == null) {
      throw new TypeError('"this" is null or not defined');
    }
    const o = Object(this);
    const len = parseInt(o.length, 10) || 0;
    if (len === 0) {
      return false;
    }
    const n = parseInt(String(fromIndex || 0), 10) || 0;
    let k = n >= 0 ? n : Math.max(len + n, 0);
    while (k < len) {
      if (o[k] === searchElement) {
        return true;
      }
      k++;
    }
    return false;
  };
}

// Polyfill pour Element.closest (IE11)
if (!Element.prototype.closest) {
  Element.prototype.closest = function(s: string) {
    let el: Element | null = this;
    if (!document.documentElement.contains(el)) return null;
    do {
      if (el.matches(s)) return el;
      el = (el.parentElement || el.parentNode) as Element | null;
    } while (el !== null && el.nodeType === 1);
    return null;
  };
}

// Polyfill pour Element.matches (IE11)
if (!Element.prototype.matches) {
  const proto = Element.prototype as any;
  Element.prototype.matches = 
    proto.matches || 
    proto.matchesSelector || 
    proto.mozMatchesSelector ||
    proto.msMatchesSelector || 
    proto.oMatchesSelector || 
    proto.webkitMatchesSelector ||
    function(this: Element, s: string) {
      const matches = ((this as any).document || (this as any).ownerDocument).querySelectorAll(s);
      let i = matches.length;
      while (--i >= 0 && matches.item(i) !== this) {}
      return i > -1;
    };
}

// Polyfill pour CSS Custom Properties (IE11)
if (typeof window !== 'undefined' && !window.CSS || !window.CSS.supports) {
  const supports = (property: string, value?: string) => {
    if (typeof value !== 'undefined') {
      return CSS.supports(property, value);
    }
    return CSS.supports(property);
  };
  
  if (window.CSS) {
    window.CSS.supports = supports;
  } else {
    (window as any).CSS = { supports };
  }
}

// Polyfill pour requestAnimationFrame (IE9)
if (typeof window !== 'undefined' && !window.requestAnimationFrame) {
  let lastTime = 0;
  window.requestAnimationFrame = function(callback: FrameRequestCallback) {
    const currTime = new Date().getTime();
    const timeToCall = Math.max(0, 16 - (currTime - lastTime));
    const id = window.setTimeout(() => {
      callback(currTime + timeToCall);
    }, timeToCall);
    lastTime = currTime + timeToCall;
    return id;
  };
  
  window.cancelAnimationFrame = function(id: number) {
    clearTimeout(id);
  };
}

// Configuration pour les polices et l'accessibilité
if (typeof window !== 'undefined') {
  // Détection de la préférence de mouvement réduit
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  
  // Détection de la préférence de contraste élevé
  const prefersHighContrast = window.matchMedia('(prefers-contrast: high)');
  
  // Application des préférences utilisateur
  if (prefersReducedMotion.matches) {
    document.documentElement.style.setProperty('--animation-duration', '0.01ms');
    document.documentElement.style.setProperty('--transition-duration', '0.01ms');
  }
  
  if (prefersHighContrast.matches) {
    document.documentElement.classList.add('high-contrast');
  }
  
  // Écoute des changements de préférences
  prefersReducedMotion.addEventListener('change', (e) => {
    if (e.matches) {
      document.documentElement.style.setProperty('--animation-duration', '0.01ms');
      document.documentElement.style.setProperty('--transition-duration', '0.01ms');
    } else {
      document.documentElement.style.removeProperty('--animation-duration');
      document.documentElement.style.removeProperty('--transition-duration');
    }
  });
  
  prefersHighContrast.addEventListener('change', (e) => {
    if (e.matches) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
  });
}

// Export pour utilisation dans l'application
export {};