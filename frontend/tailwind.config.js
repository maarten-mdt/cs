/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#86a33d",
          dark: "#5f7c27",
        },
        surface: "#1a1b1d",
        panel: "#202224",
        border: {
          dark: "#2a2c2f",
        },
      },
    },
  },
  plugins: [],
};
