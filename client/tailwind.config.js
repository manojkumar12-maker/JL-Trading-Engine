/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1419",
        panel: "#161b22",
        line: "#232b35",
        up: "#3fb950",
        down: "#f85149",
      },
    },
  },
  plugins: [],
};
