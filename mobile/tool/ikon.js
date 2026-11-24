// Ikon adaptif dari logo web: node tool/ikon.js
const fs = require("fs"), path = require("path");
const svg = fs.readFileSync(path.join(__dirname, "../../client/public/Logo-lenteraUmat.svg"), "utf8");
const res = path.join(__dirname, "../android/app/src/main/res");
const attr = (s, n) => (s.match(new RegExp(`(?:^|[ ])${n}="([^"]*)"`)) || [])[1];
const argb = (c, o) => "#" + Math.round((o ?? 1) * 255).toString(16).padStart(2, "0").toUpperCase() + c.slice(1);
const grad = {};
for (const [, a, body] of svg.matchAll(/<linearGradient([^>]*)>([\s\S]*?)<\/linearGradient>/g))
  grad[attr(a, "id")] = { a, stops: [...body.matchAll(/<stop([^>]*)\/>/g)].map((m) => m[1]) };
const paths = [...svg.matchAll(/<path([^>]*)\/>/g)].map((m) => m[1]);

// Kanvas 108dp, lingkaran aman 66dp: sudut buku (titik terjauh, 117 satuan) masuk 33dp.
const S = 0.28, W = 156, H = 205;
const wrap = (body) => `<?xml version="1.0" encoding="utf-8"?>
<!-- Dibuat oleh tool/ikon.js dari logo web. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:scaleX="${S}"
        android:scaleY="${S}"
        android:translateX="${+(54 - (W * S) / 2).toFixed(2)}"
        android:translateY="${+(54 - (H * S) / 2).toFixed(2)}">
${body}    </group>
</vector>
`;
const one = (p, mono) => {
  const rule = attr(p, "fill-rule") === "evenodd" ? `\n            android:fillType="evenOdd"` : "";
  const d = `            android:pathData="${attr(p, "d")}"${rule}`;
  const fill = attr(p, "fill"), o = attr(p, "fill-opacity");
  if (mono) return `        <path\n${d}\n            android:fillColor="${argb("#000000", o)}" />\n`;
  const g = grad[(fill.match(/url\(#(.*)\)/) || [])[1]];
  if (!g) return `        <path\n${d}\n            android:fillColor="${argb(fill, o)}" />\n`;
  const items = g.stops.map((s) => `                    <item android:offset="${attr(s, "offset") ?? 0}" android:color="${argb(attr(s, "stop-color"))}" />\n`).join("");
  return `        <path\n${d}>
            <aapt:attr name="android:fillColor">
                <gradient
                    android:type="linear"
                    android:startX="${attr(g.a, "x1")}"
                    android:startY="${attr(g.a, "y1")}"
                    android:endX="${attr(g.a, "x2")}"
                    android:endY="${attr(g.a, "y2")}">
${items}                </gradient>
            </aapt:attr>
        </path>\n`;
};
const write = (f, s) => {
  fs.mkdirSync(path.dirname(path.join(res, f)), { recursive: true });
  fs.writeFileSync(path.join(res, f), s);
};
write("drawable/ic_launcher_foreground.xml", wrap(paths.map((p) => one(p)).join("")));
write("drawable/ic_launcher_monochrome.xml", wrap(paths.map((p) => one(p, true)).join("")));
write("values/colors.xml", `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
`);
write("mipmap-anydpi-v26/ic_launcher.xml", `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`);
