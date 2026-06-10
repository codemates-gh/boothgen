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
        canvas: '#0F0F14',
        sidebar: { bg: '#0F0F14', hover: '#1C1C24', active: '#262630', text: '#A1A1AA', textActive: '#FFFFFF' },
      },
      fontFamily: { sans: ['Inter','system-ui','sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
