import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        surface: {
          DEFAULT: '#0f0f12',
          50:  '#1a1a23',
          100: '#16161f',
          200: '#12121a',
          300: '#0f0f12',
        },
        // Acento secundário (verde neon) — usado com moderação: pontuação
        // viral, confirmações, indicadores de "ao vivo"/sucesso em destaque.
        // O roxo (brand) continua sendo a cor primária de ação.
        neon: {
          50:  '#ecfff5',
          200: '#a3ffd6',
          400: '#3dffb0',
          500: '#12e88f',
          600: '#0bc476',
          700: '#0a9c60',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-brand': 'linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)',
        'gradient-dark': 'linear-gradient(180deg, #0f0f12 0%, #1a1a23 100%)',
        'gradient-neon': 'linear-gradient(135deg, #12e88f 0%, #3dffb0 100%)',
        'glass': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
        'gradient': 'gradient 6s ease infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        glow: {
          from: { boxShadow: '0 0 20px rgba(124, 58, 237, 0.3)' },
          to: { boxShadow: '0 0 40px rgba(124, 58, 237, 0.6)' },
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-geist)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'glass': '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
        'brand': '0 0 30px rgba(124, 58, 237, 0.3)',
        'brand-lg': '0 0 60px rgba(124, 58, 237, 0.4)',
        'neon': '0 0 30px rgba(18, 232, 143, 0.3)',
      },
    },
  },
  plugins: [],
}

export default config
