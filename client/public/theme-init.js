// Pasang tema tersimpan sebelum halaman tampil (mencegah kedip putih di mode gelap).
try {
  if (localStorage.getItem("theme") === "dark") document.documentElement.classList.add("dark");
} catch (e) {
  /* penyimpanan tidak tersedia */
}
