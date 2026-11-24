// API sekali pakai di memori untuk session_live_test.dart.
const path = require("path");
const h = require(path.join(__dirname, "..", "..", "api", "test", "helpers.js"));
h.start().then((app) => app.listen(4555, () => console.log("siap di http://localhost:4555")));
