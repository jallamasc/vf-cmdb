/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        vfdark: "#0f172a",
        vfpanel: "#1e293b",
      },
    },
  },
  plugins: [],
};
