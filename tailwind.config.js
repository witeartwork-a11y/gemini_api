/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./**/*.{tsx,ts,jsx,js}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        slate: {
          850: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        theme: {
          primary: 'var(--theme-primary)',
          secondary: 'var(--theme-secondary)',
          glow: 'var(--theme-glow)'
        }
      },
    },
  },
  plugins: [],
}
