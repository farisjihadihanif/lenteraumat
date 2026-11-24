// Kirim email lewat SMTP (mis. Gmail + App Password). Dipakai untuk lupa password.
const nodemailer = require("nodemailer");
const config = require("../config");

let transport = null;
const configured = () => Boolean(config.smtp.user && config.smtp.pass);

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transport;
}

// Bisa diganti di tes.
let sender = (msg) => getTransport().sendMail(msg);
const setSender = (fn) => {
  sender = fn;
};

async function send({ to, subject, text, html }) {
  return sender({ from: config.smtp.from || `LenteraUmat <${config.smtp.user}>`, to, subject, text, html });
}

module.exports = { send, configured, setSender };
