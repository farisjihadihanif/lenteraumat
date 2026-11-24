// Aturan pemilihan buku Internet Archive: tahun terbit asli, hak cipta, topik terlarang,
// kategori, dan kunci duplikat. Fungsi murni, dipakai scripts/impor-arsip.js.
const TAHUN_MAKS = 1928;
const JILID_MAKS = 2; // jilid per judul berseri

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const gabung = (v) => arr(v).join(" ; ");

// ---------- Tahun ----------
const tahunDi = (teks) => [...String(teks).matchAll(/(?<!\d)(1[5-9]\d\d|20\d\d)(?!\d)/g)].map((m) => Number(m[1]));

// Semua tahun di kolom tanggal: "1903-1940" -> 1903 & 1940, "1886-8" -> 1888, "1913-14" -> 1914.
function tahunTanggal(teks) {
  const out = tahunDi(teks);
  // Akhir rentang yang disingkat; "1925-03-01" (tanggal lengkap) bukan rentang.
  for (const m of String(teks).matchAll(/(?<!\d)(1[5-9]\d\d)\s*-\s*(\d{1,2})(?![\d-])/g)) out.push(Number(m[1].slice(0, 4 - m[2].length) + m[2]));
  return out;
}

const SERIAL = /periodical|journals?\b|yearbook|annuals?\b|proceedings|transactions|bulletin|bolet[ií]n|anales|revue|revista|zeitschrift|sitzungsberichte|verhandelingen|encyclop|enzyklop|\bseries\b|collections\b/i;

// Tahun terbit jilid itu sendiri. Arsip sering mengisi date/year dengan tahun AWAL seri.
// Hasil: { tahun } atau { alasan } bila tidak bisa dipastikan.
function tahunAsli(meta) {
  const judul = gabung(meta.title);
  const jilid = [gabung(meta.volume), judul.match(/\b(?:v|vol|volume|t|bd|jilid)\.?\s*\d+.*$/i)?.[0] || ""].join(" ");
  const tanggal = gabung(meta.date) || gabung(meta.year);
  const tahunJilid = tahunTanggal(gabung(meta.volume));
  const semua = [...tahunTanggal(`${gabung(meta.date)} `), ...tahunDi(gabung(meta.year)), ...tahunJilid];
  // Tahun di judul hanya dipakai untuk menolak ("1900; or, The last President" bukan tahun terbit).
  const lewat = semua.find((t) => t > TAHUN_MAKS);
  if (lewat) return { alasan: `terbit ${lewat}` };
  if (tahunJilid.length) return { tahun: Math.max(...tahunJilid) };
  if (/\d{2}-{1,2}\s*[?\]]|\d{3}-\s*[?\]]|1[89]--|1\d\d-\?/.test(tanggal)) return { alasan: `tahun tidak pasti (${tanggal})` };
  if (/\d{4}\s*-\s*[\]?]*\s*$/.test(tanggal)) return { alasan: `tahun jilid tidak pasti (seri sejak ${tanggal})` };
  if (!semua.length) return { alasan: "tahun tidak tercatat" };
  const tahun = Math.max(...semua);
  const serial = SERIAL.test(judul) || /periodical|serial/i.test(gabung(meta.subject));
  // Jilid tanpa tahun sendiri: tahun yang tercatat bisa jadi tahun awal seri.
  if (jilid.trim() && (serial || tahun >= 1900)) return { alasan: `tahun jilid tidak pasti (seri sejak ${tahun})` };
  if (/periodical|serial/i.test(gabung(meta.subject))) return { alasan: `tahun terbitan berkala tidak pasti (sejak ${tahun})` };
  return { tahun };
}

// ---------- Hak cipta ----------
function masalahHak(meta) {
  const teks = [meta["possible-copyright-status"], meta.rights, meta.copyright, meta.licenseurl].map(gabung).join(" | ");
  if (/rightsstatements\.org\/(?:page|vocab)\/(?:InC|UND|CNE)|possible this item is protected|permission/i.test(teks)) return "hak cipta tidak jelas";
  const bersih = teks.replace(/not[_ -]+in[_ -]+copyright/gi, "");
  if (/in[_ -]+copyright|all rights reserved|creativecommons\.org\/licenses\/[a-z-]*n[cd]/i.test(bersih)) return "masih berhak cipta / lisensi terbatas";
  return "";
}

// ---------- Topik terlarang ----------
const TERLARANG = [
  [/occult|goetia|clavicula|key of solomon|kybalion|hermetic philosoph|grimoire|necromanc|black magic|witchcraft|sorcer|demonolog|evil spirits|incantation|conjur|\bspells\b|magical spirit|\b(?:ritual|ceremonial|jewish|natural) magic\b|(?:^|\| )magic\b|\bmagick\b|books? of moses.*magic|satanis|tarot|clairvoyan|spiritualism|s[eé]ances?\b/i, "okultisme/sihir"],
  [/defen[cs]e of slavery|slavery.{0,30}(?:justif|defen[cs]e)|ku klux|racial (?:basis|hygiene|superiority|purity)|white supremac|passing of the great race|eugenic|anti-?semit|protocols of the .*elders of zion|aryan race|inferior races?|rising tide of color/i, "kebencian/rasisme"],
  [/anti-?vaccin|vaccination.{0,60}(?:useless|dangerous|delusion|crime|fraud|curse|evil)|(?:evils?|crime|curse|delusion) of vaccination/i, "misinformasi kesehatan"],
];
function topikTerlarang(meta) {
  const teks = [...arr(meta.title), ...arr(meta.subject)].join(" | ");
  return TERLARANG.find(([rx]) => rx.test(teks))?.[1] || "";
}

// ---------- Kategori ----------
// Pola dicocokkan ke "subjek | judul" (atau judul saja bila ada flag judul). Urutan menentukan prioritas.
const ISLAM = /\bislam|muslim|moslem|mussul?man|moosulman|muhammad|mohammed|mahomet|sufi|mosque|caliph|ottoman|othoman|\bmoors\b|crusade/i;
const ATURAN = [
  { rx: /juvenile|children's|for children/i, ke: "Anak" },
  { rx: /\bfiqh al-lugh/i, ke: "Bahasa" },
  { rx: /\bkoran\b|qur.?an\b|alcoran|tafsir/i, ke: "Al-Qur'an & Tafsir" },
  { rx: /hadith|hadis\b|sunnah/i, ke: "Hadis" },
  { rx: /islamic law|\bfiqh\b|fikih/i, ke: "Fikih" },
  { rx: /islamic (?:ethics|theology)|\bfaith of islam|religion of islam|creed of islam|sufism|\bsufis?\b|myst.*islam|islam.*(?:doctrin|theolog|mystic)/i, kecuali: /periodical|dictionar|encyclop|histor|travel/i, ke: "Akidah & Akhlak" },
  { rx: ISLAM, ke: "Sejarah Islam" },
  { rx: /victoria history|county of|\btopographical history/i, judul: true, ke: "Sejarah" },
  { rx: /encyclop/i, judul: true, ke: "Umum" },
  { rx: /biograph|memoirs?/i, judul: true, ke: "Biografi" },
  { rx: /dictionar|woordenboek|wörterbuch|vocabular|grammar|grammai?re|grammatica|phrase ?book|synonym|\blanguages?\b.*(?:textbook|stud)|-english\b|\bkamus\b/i, ke: "Bahasa" },
  { rx: /travels?|voyages?|reise|schiff|histor(?:y|ia|ie) general|general history/i, judul: true, ke: "Sejarah" },
  { rx: /natural history|historia natural|naturgeschichte|zoolog|botan|biolog|chemis|physic[as]|astronom|geolog|mathemat|trigonomet|geometry|anatomy|medicin|insects?\b|birds?\b|\bplants?\b|animals?\b|fish(?:es)?\b|minerals?\b|\bscience\b/i, ke: "Sains" },
  { rx: /\bart\b|\barts\b|ornament|drawing|architecture|music|painting|pottery|costume|handicraft|textile|decoration/i, ke: "Seni & Budaya" },
  { rx: /fiction|\bnovels?\b|poetry|\bpoems?\b|drama\b|\btales\b|short stories|folklore|literature/i, ke: "Sastra" },
  { rx: /biograph|memoirs?\b/i, ke: "Biografi" },
  { rx: /education|school|teaching/i, ke: "Pendidikan" },
  { rx: /histor|antiquit|travel|voyage/i, ke: "Sejarah" },
  { rx: /engineering|technolog/i, ke: "Teknologi" },
];
function pilihKategori(subjek, judul) {
  const teks = [...arr(subjek), judul].join(" | ");
  const a = ATURAN.find(({ rx, kecuali, judul: hanyaJudul }) => rx.test(hanyaJudul ? judul : teks) && !kecuali?.test(teks));
  return a ? a.ke : "Umum";
}

// ---------- Duplikat ----------
const polos = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/moslem/g, "muslim")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Judul pokok tanpa anak judul, jilid, dan kata sandang, supaya edisi berbeda dikenali sebagai karya yang sama.
function judulPokok(judul) {
  const awal = String(judul || "")
    .replace(/\((?:jilid|vol)[^)]*\)/gi, " ")
    .replace(/,?\s*\b(?:vol(?:ume)?|jilid)\b\.?\s*\w+\s*$/i, " ")
    .split(/[:;=]|\s\/\s|\bor, /i)
    .find((x) => polos(x));
  return polos(awal).replace(/^(?:the|a|an|le|la|les|der|die|das|el) /, "");
}
const jilidDari = (judul) => polos(String(judul || "").match(/\((?:jilid|vol)\s*([^)]*)\)|\bvol(?:ume)?\.?\s*(\w+)\s*$/i)?.slice(1).find(Boolean) || "");
const margaDari = (penulis) => {
  const p = String(penulis || "");
  if (!p || /^tidak diketahui$/i.test(p)) return "";
  const kata = polos(p.split(/[,;]/)[0]).split(" ");
  return p.includes(",") ? kata.join(" ") : kata.at(-1);
};

// Beda ejaan kecil ("univeral" / "universal") tetap dianggap sama.
function hampirSama(a, b) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 15 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const [x, y] = a.length >= b.length ? [a, b] : [b, a];
  return x.slice(i + 1) === (x.length === y.length ? y.slice(i + 1) : y.slice(i));
}

// Daftar karya yang sudah ada (katalog + hasil sesi ini).
function buatPencatat() {
  const karya = new Map();
  const daftar = (pokok) => [...karya].filter(([k]) => hampirSama(k, pokok)).flatMap(([, v]) => v);
  return {
    tambah({ judul, penulis, tahun }) {
      const pokok = judulPokok(judul);
      if (pokok) karya.set(pokok, [...(karya.get(pokok) || []), { jilid: jilidDari(judul), marga: margaDari(penulis), tahun }]);
    },
    // "" bila belum ada, selain itu alasannya.
    tolak({ judul, penulis, tahun }) {
      const jilid = jilidDari(judul);
      const marga = margaDari(penulis);
      const sama = daftar(judulPokok(judul)).filter((k) => !k.marga || !marga || k.marga === marga || k.tahun === tahun);
      if (sama.some((k) => k.jilid === jilid)) return "karya yang sama sudah ada";
      if (jilid && sama.length >= JILID_MAKS) return `sudah ada ${JILID_MAKS} jilid`;
      return "";
    },
  };
}

module.exports = { TAHUN_MAKS, JILID_MAKS, tahunAsli, masalahHak, topikTerlarang, pilihKategori, buatPencatat, judulPokok };
