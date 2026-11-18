/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        tunnel: {
          bg: "#0B0E1E",
          card: "#161B33",
          border: "#2A3158",
          neonCyan: "#00F0FF",
          neonPink: "#FF007A",
          gold: "#FFD700",
          goldLight: "#FFE57F",
        },
      },
    },
  },
  plugins: [],
};
