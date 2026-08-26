import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0A0A0C',
        panel: '#121214',
        elevated: '#1A1A1E',
        line: '#26262C',
        crimson: '#FF3B4E',
        emerald: '#22C55E',
        amber: '#F59E0B',
        cyan: '#22D3EE',
      },
    },
  },
  plugins: [],
} satisfies Config
