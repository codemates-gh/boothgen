import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#F97316', dark: '#EA6100', light: '#FED7AA',
          surface: '#FFF7ED',
        },
        canvas: '#1F1F3D',
        sidebar: { bg: '#1F1F3D', text: '#A1A1C2', textActive: '#FFFFFF' },
        monday: {
          blue: '#0085FF', blueDark: '#0073E6',
          green: '#00C875',
          orange: '#FDAB3D',
          red: '#E2445C', redDark: '#CC3A52',
          purple: '#784BD1',
          muted: '#676879',
        },
      },
      fontFamily: { sans: ['Poppins', 'system-ui', 'sans-serif'] },
      boxShadow: {
        card: '0 2px 16px rgba(0,0,0,0.06)',
        'card-md': '0 4px 24px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
export default config;
