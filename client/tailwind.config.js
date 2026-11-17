/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Warna LenteraUmat
        ink: { DEFAULT: "#143752", soft: "#3E5A72", mute: "#6B8094" },
        lantern: { DEFAULT: "#F79319", dark: "#D97A06", soft: "#FFF1DE" },
        teal: { DEFAULT: "#316B6C", bright: "#07A5A8", soft: "#E3F1F0", deep: "#1F4D4E" },
        lamp: "#FFC93C",
        mist: "#F3F6F6",
        line: "#DCE4E6",
      },
      fontFamily: {
        sans: ['"Manrope"', "system-ui", "sans-serif"],
        serif: ['"Literata"', "Georgia", "serif"],
      },
      boxShadow: {
        book: "0 1px 2px rgba(20,55,82,.18), 0 8px 18px -8px rgba(20,55,82,.45)",
        lift: "0 12px 32px -12px rgba(20,55,82,.35)",
      },
      keyframes: {
        glow: { "0%,100%": { opacity: ".55" }, "50%": { opacity: "1" } },
      },
      animation: { glow: "glow 3s ease-in-out infinite" },
    },
  },
  plugins: [],
};
