/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        scribble: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"Roboto"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      colors: {
        // Morandi / Chalkboard palette
        paper: '#fdfbf7', // Warm off-white
        ink: '#2c3e50',   // Soft black
        'chalk-blue': '#a8d8ea',
        'chalk-pink': '#f4a6b2',
        'chalk-yellow': '#f9e79f',
        'chalk-green': '#a9dfbf',
        'chalk-gray': '#d5d8dc',
      },
      borderRadius: {
        'hand-drawn': '255px 15px 225px 15px / 15px 225px 15px 255px', // Irregular circle
      }
    },
  },
  plugins: [],
}
