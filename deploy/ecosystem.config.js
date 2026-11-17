// PM2: jalankan API (sekaligus menyajikan client/dist). Cukup 1 proses.
module.exports = {
  apps: [
    {
      name: "lentera-umat",
      cwd: __dirname + "/../api",
      script: "index.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "900M",
      env: { NODE_ENV: "production" },
      out_file: "/var/log/lentera-umat/out.log",
      error_file: "/var/log/lentera-umat/error.log",
      time: true,
    },
  ],
};
