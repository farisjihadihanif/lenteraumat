const { HttpError } = require("./middleware/errors");

const str = (v, max = 500) => String(v ?? "").trim().slice(0, max);

function page(req, { def = 12, max = 50 } = {}) {
  const p = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(max, Math.max(1, parseInt(req.query.limit, 10) || def));
  return { page: p, limit, skip: (p - 1) * limit };
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function required(value, label) {
  if (value === undefined || value === null || String(value).trim() === "") throw new HttpError(400, `${label} wajib diisi.`);
  return value;
}

const USER_PUBLIC = "username namaLengkap fotoProfil role";

module.exports = { str, page, escapeRegex, required, USER_PUBLIC };
