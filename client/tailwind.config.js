/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Warna LenteraUmat. Nilainya dari variabel CSS (lihat index.css) supaya
        // mode gelap cukup mengganti variabel, tanpa mengubah tiap halaman.
        ink: { DEFAULT: "rgb(var(--ink) / <alpha-value>)", soft: "rgb(var(--ink-soft) / <alpha-value>)", mute: "rgb(var(--ink-mute) / <alpha-value>)" },
        lantern: { DEFAULT: "#F79319", dark: "#D97A06", soft: "rgb(var(--lantern-soft) / <alpha-value>)", text: "rgb(var(--lantern-text) / <alpha-value>)" },
        danger: "rgb(var(--danger) / <alpha-value>)",
        teal: { DEFAULT: "rgb(var(--teal) / <alpha-value>)", bright: "#07A5A8", soft: "rgb(var(--teal-soft) / <alpha-value>)", deep: "rgb(var(--teal-deep) / <alpha-value>)" },
        lamp: "#FFC93C",
        mist: "rgb(var(--mist) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        night: "rgb(var(--night) / <alpha-value>)",
        // Hijau tetap (tidak berubah di mode gelap) untuk latar tombol & pita LUMA: teks putih selalu kontras.
        forest: { DEFAULT: "#2F6667", deep: "#234F50" },
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
