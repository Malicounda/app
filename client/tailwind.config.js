/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	container: {
  		center: true,
  		padding: {
  			DEFAULT: '1rem',
  			sm: '1.5rem',
  			lg: '2rem',
  			xl: '2.5rem',
  			'2xl': '3rem'
  		},
  		screens: {
  			sm: '640px',
  			md: '768px',
  			lg: '1024px',
  			xl: '1280px',
  			'2xl': '1400px'
  		}
  	},
  	screens: {
  		'xs': '475px',
  		'sm': '640px',
  		'md': '768px',
  		'lg': '1024px',
  		'xl': '1280px',
  		'2xl': '1536px',
  		// Breakpoints pour l'accessibilité
  		'motion-reduce': { 'raw': '(prefers-reduced-motion: reduce)' },
  		'high-contrast': { 'raw': '(prefers-contrast: high)' },
  		'print': { 'raw': 'print' }
  	},
  	extend: {
  		// Unités relatives pour la responsivité
  		spacing: {
  			'18': '4.5rem',
  			'88': '22rem',
  			'128': '32rem',
  			'144': '36rem',
  			// Unités viewport
  			'vh-10': '10vh',
  			'vh-20': '20vh',
  			'vh-30': '30vh',
  			'vh-40': '40vh',
  			'vh-50': '50vh',
  			'vh-60': '60vh',
  			'vh-70': '70vh',
  			'vh-80': '80vh',
  			'vh-90': '90vh',
  			'vw-10': '10vw',
  			'vw-20': '20vw',
  			'vw-30': '30vw',
  			'vw-40': '40vw',
  			'vw-50': '50vw',
  			'vw-60': '60vw',
  			'vw-70': '70vw',
  			'vw-80': '80vw',
  			'vw-90': '90vw',
  		},
  		fontSize: {
  			'xs': ['0.75rem', { lineHeight: '1rem' }],
  			'sm': ['0.875rem', { lineHeight: '1.25rem' }],
  			'base': ['1rem', { lineHeight: '1.5rem' }],
  			'lg': ['1.125rem', { lineHeight: '1.75rem' }],
  			'xl': ['1.25rem', { lineHeight: '1.75rem' }],
  			'2xl': ['1.5rem', { lineHeight: '2rem' }],
  			'3xl': ['1.875rem', { lineHeight: '2.25rem' }],
  			'4xl': ['2.25rem', { lineHeight: '2.5rem' }],
  			'5xl': ['3rem', { lineHeight: '1' }],
  			'6xl': ['3.75rem', { lineHeight: '1' }],
  			'7xl': ['4.5rem', { lineHeight: '1' }],
  			'8xl': ['6rem', { lineHeight: '1' }],
  			'9xl': ['8rem', { lineHeight: '1' }],
  			// Tailles responsives
  			'responsive-xs': ['clamp(0.75rem, 2vw, 0.875rem)', { lineHeight: '1.25rem' }],
  			'responsive-sm': ['clamp(0.875rem, 2.5vw, 1rem)', { lineHeight: '1.5rem' }],
  			'responsive-base': ['clamp(1rem, 3vw, 1.125rem)', { lineHeight: '1.75rem' }],
  			'responsive-lg': ['clamp(1.125rem, 3.5vw, 1.25rem)', { lineHeight: '1.75rem' }],
  			'responsive-xl': ['clamp(1.25rem, 4vw, 1.5rem)', { lineHeight: '2rem' }],
  			'responsive-2xl': ['clamp(1.5rem, 5vw, 2rem)', { lineHeight: '2.25rem' }],
  			'responsive-3xl': ['clamp(1.875rem, 6vw, 2.5rem)', { lineHeight: '2.5rem' }],
  		},
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: 0
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: 0
  				}
  			},
  			'fade-in': {
  				'0%': { opacity: '0', transform: 'translateY(10px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' }
  			},
  			'slide-in-right': {
  				'0%': { transform: 'translateX(100%)' },
  				'100%': { transform: 'translateX(0)' }
  			},
  			'slide-in-left': {
  				'0%': { transform: 'translateX(-100%)' },
  				'100%': { transform: 'translateX(0)' }
  			},
  			'scale-in': {
  				'0%': { transform: 'scale(0.95)', opacity: '0' },
  				'100%': { transform: 'scale(1)', opacity: '1' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'fade-in': 'fade-in 0.3s ease-out',
  			'slide-in-right': 'slide-in-right 0.3s ease-out',
  			'slide-in-left': 'slide-in-left 0.3s ease-out',
  			'scale-in': 'scale-in 0.2s ease-out'
  		},
  		// Utilitaires pour l'accessibilité
  		backdropBlur: {
  			'xs': '2px',
  		},
  		// Grid responsive
  		gridTemplateColumns: {
  			'auto-fit-xs': 'repeat(auto-fit, minmax(200px, 1fr))',
  			'auto-fit-sm': 'repeat(auto-fit, minmax(250px, 1fr))',
  			'auto-fit-md': 'repeat(auto-fit, minmax(300px, 1fr))',
  			'auto-fit-lg': 'repeat(auto-fit, minmax(350px, 1fr))',
  			'auto-fill-xs': 'repeat(auto-fill, minmax(200px, 1fr))',
  			'auto-fill-sm': 'repeat(auto-fill, minmax(250px, 1fr))',
  			'auto-fill-md': 'repeat(auto-fill, minmax(300px, 1fr))',
  			'auto-fill-lg': 'repeat(auto-fill, minmax(350px, 1fr))',
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
