/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",          
    "./src/**/*.{js,ts,jsx,tsx}", 
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  transformIgnorePatterns: [
    '/node_modules/(?!(axios)/)'
  ],
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
}