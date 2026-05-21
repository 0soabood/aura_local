/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        deep: '#0a0a14',
        primary: '#10101f',
        panel: '#141425',
        card: '#1a1a30',
        'card-hover': '#22223a',
        input: '#0e0e1a',
        border: '#2a2a45',
        purple: {
          DEFAULT: '#a855f7',
          glow: 'rgba(168, 85, 247, 0.3)',
          strong: 'rgba(168, 85, 247, 0.5)',
        },
        cyan: {
          DEFAULT: '#22d3ee',
          glow: 'rgba(34, 211, 238, 0.3)',
          strong: 'rgba(34, 211, 238, 0.5)',
        },
        green: '#10b981',
        amber: '#f59e0b',
        rose: '#f43f5e',
      },
      fontFamily: {
        display: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-purple': '0 0 20px rgba(168, 85, 247, 0.3)',
        'glow-cyan': '0 0 20px rgba(34, 211, 238, 0.3)',
        'glow-purple-strong': '0 0 40px rgba(168, 85, 247, 0.5), 0 0 80px rgba(168, 85, 247, 0.2)',
        'glow-cyan-strong': '0 0 40px rgba(34, 211, 238, 0.5), 0 0 80px rgba(34, 211, 238, 0.2)',
        'panel': '0 4px 24px rgba(0, 0, 0, 0.4)',
      },
      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '16px',
        'xl': '24px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'flow': 'flow 1.5s linear infinite',
      },
      keyframes: {
        glow: {
          '0%': { opacity: '0.6' },
          '100%': { opacity: '1' },
        },
        flow: {
          '0%': { 'stroke-dashoffset': '20' },
          '100%': { 'stroke-dashoffset': '0' },
        },
      },
    },
  },
  plugins: [],
}
