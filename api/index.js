const config = require("./src/config");
const { connect } = require("./src/db");
const { createApp } = require("./src/app");
const { ensureAdmin } = require("./src/seed");

async function main() {
  if (!config.jwtSecret || config.jwtSecret.length < 16) {
    throw new Error("JWT_SECRET di .env belum diisi (minimal 16 karakter acak).");
  }
  await connect(config.mongoUrl);
  await ensureAdmin();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`API LenteraUmat jalan di http://localhost:${config.port}`);
    console.log(`LUMA: ${config.geminiApiKey ? `aktif (${config.geminiModel})` : "belum aktif (GEMINI_API_KEY kosong)"}`);
  });
}

main().catch((error) => {
  console.error("Server gagal mulai:", error.message);
  process.exit(1);
});
