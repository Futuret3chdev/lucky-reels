/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        casino: {
          bg: '#0a0a0f',
          card: '#111115',
          gold: '#d4af37',
          'gold-light': '#f4d35e',
          purple: '#9945ff',
          green: '#14f195',
          red: '#ff4757',
          border: '#222228',
        }
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}