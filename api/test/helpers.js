const os = require("os");
const path = require("path");
const fs = require("fs");

// Pengaturan khusus tes, dipasang sebelum modul aplikasi dimuat.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lu-test-"));
process.env.UPLOAD_DIR = tmp;
process.env.JWT_SECRET = "test-secret-yang-cukup-panjang-123";
process.env.GEMINI_API_KEY = "test-key";
process.env.CLOUDINARY_URL = "";
process.env.AUTH_RATE_LIMIT = "10000";
process.env.CLIENT_DIST = path.join(tmp, "no-dist");

const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const request = require("supertest");
const bcrypt = require("bcryptjs");

let mongod;
async function start() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { createApp } = require("../src/app");
  return createApp();
}
async function stop() {
  await mongoose.disconnect();
  await mongod?.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
}
async function reset() {
  for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
}

// PDF kecil yang valid dengan teks per halaman.
function makePdf(pages = ["Halaman satu tentang sabar dan syukur dalam kehidupan sehari-hari."]) {
  const objs = [];
  const add = (s) => objs.push(s) && objs.length;
  const catalog = add("");
  const pagesObj = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids = [];
  for (const text of pages) {
    const stream = `BT /F1 12 Tf 50 750 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function makeAdmin(app, { username = "admin", email = "admin@lu.id", password = "rahasia123" } = {}) {
  const User = require("../src/models/User");
  await User.create({ username, email, namaLengkap: "Admin", password: await bcrypt.hash(password, 10), role: "admin" });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ identifier: email, password }).expect(200);
  return agent;
}

async function makeUser(app, username = "faris") {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/register")
    .send({ username, email: `${username}@lu.id`, password: "rahasia123", namaLengkap: username.toUpperCase() })
    .expect(201);
  return agent;
}

function uploadBook(agent, fields = {}, pdf = makePdf()) {
  const req = agent.post("/api/books");
  const data = { judul: "Buku Sabar", penulis: "Ust. Ahmad", kategori: "Akidah & Akhlak", ...fields };
  for (const [k, v] of Object.entries(data)) req.field(k, String(v));
  return req.attach("file", pdf, { filename: "buku.pdf", contentType: "application/pdf" });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { start, stop, reset, makePdf, PNG, makeAdmin, makeUser, uploadBook, request, wait };
