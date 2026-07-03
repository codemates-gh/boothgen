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
        canvas: '#1e1247',
        sidebar: { bg: '#1e1247', hover: '#2D1B69', active: '#3d2880', text: '#c4b5fd', textActive: '#FFFFFF' },
      },
      fontFamily: { sans: ['Inter','system-ui','sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
