/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cozi: {
          50: '#fbf8f5',
          100: '#f5efe8',
          200: '#ebdcd0',
          300: '#dec2b1',
          400: '#cca08c',
          500: '#bd846e',
          600: '#ab6e57',
          700: '#8e5845',
          800: '#754a3b',
          900: '#613e33',
        }
      }
    },
  },
  plugins: [],
}
