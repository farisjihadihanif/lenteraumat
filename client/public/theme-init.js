// Pasang tema tersimpan sebelum halaman tampil (mencegah kedip putih di mode gelap).
try {
  let theme = localStorage.getItem("lenteraumat_theme");
  if (!theme) {
    // Kunci sebelum ganti nama proyek: pindahkan supaya pilihan tema tidak hilang.
    theme = localStorage.getItem("theme");
    if (theme === "dark" || theme === "light") {
      localStorage.setItem("lenteraumat_theme", theme);
      localStorage.removeItem("theme");
    }
  }
  if (theme === "dark") document.documentElement.classList.add("dark");
} catch (e) {
  /* penyimpanan tidak tersedia */
}
