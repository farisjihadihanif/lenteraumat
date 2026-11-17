const mongoose = require("mongoose");

mongoose.set("strictQuery", true);

async function connect(url) {
  if (!url) throw new Error("MONGO_URL belum diisi di .env");
  await mongoose.connect(url);
  return mongoose.connection;
}

module.exports = { connect, mongoose };
