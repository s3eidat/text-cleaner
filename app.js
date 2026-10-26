/* Text Cleaner — a fixed pipeline of line operations, all local. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;

  var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", middot: "·", bull: "•", euro: "€" };
  function decode(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e[0] === "#") {
        var n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return n > 0 && n <= 0x10FFFF && !(n >= 0xD800 && n <= 0xDFFF) ? String.fromCodePoint(n) : m;
      }
      return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m;
    });
  }
  // Text only: drop script/style/comments, turn block ends into line breaks, remove every tag, then decode entities.
  function stripHtml(s) {
    return decode(s
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|head|template)\b[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre|section|article|header|footer|ul|ol|table)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, ""));
  }
  // Pictographic emoji plus the joiners/modifiers that build them. ©, ® and ™ are kept: they are text symbols.
  var EMOJI = /(?![©®™])\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u{E0020}-\u{E007F}‍️⃣]/gu;

  function shuffle(a, rand) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function cryptoRand() { var u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; }

  var collator = new Intl.Collator(undefined, { sensitivity: "variant" });
  var natural = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  // o: options; rand: random source for shuffle. Returns {text, stats}.
  function clean(text, o, rand) {
    var s = text.replace(/\r\n?/g, "\n"), st = { dupes: 0, empty: 0 };
    if (o.html) s = stripHtml(s);
    if (o.emoji) s = s.replace(EMOJI, "");
    var lines = s.split("\n");
    if (o.trim) lines = lines.map(function (l) { return l.trim(); });
    if (o.collapse) lines = lines.map(function (l) { return l.replace(/[ \t ]{2,}/g, " "); });
    if (o.empty) { var n = lines.length; lines = lines.filter(function (l) { return /\S/.test(l); }); st.empty = n - lines.length; }
    if (o.dupes) {
      var seen = new Set(), before = lines.length;
      lines = lines.filter(function (l) { var k = o.ignoreCase ? l.toLocaleLowerCase() : l; if (seen.has(k)) return false; seen.add(k); return true; });
      st.dupes = before - lines.length;
    }
    if (o.sort === "az") lines.sort(collator.compare);
    else if (o.sort === "za") lines.sort(function (a, b) { return collator.compare(b, a); });
    else if (o.sort === "natural") lines.sort(natural.compare);
    else if (o.sort === "length") lines.sort(function (a, b) { return Array.from(a).length - Array.from(b).length || natural.compare(a, b); });
    if (o.reverse) lines.reverse();
    if (o.shuffle) shuffle(lines, rand || cryptoRand);
    if (o.number) {
      var w = String(lines.length).length;
      lines = lines.map(function (l, i) { return String(i + 1).padStart(w, " ") + ". " + l; });
    }
    return { text: lines.join("\n"), lines: lines.length, stats: st };
  }

  // ---------- UI ----------
  var DEFAULTS = { html: false, emoji: false, trim: true, collapse: true, empty: true, dupes: false, ignoreCase: false, sort: "none", reverse: false, shuffle: false, number: false };
  var input = $("#input"), out = $("#out"), statsEl = $("#stats");
  var saved = S3.store("clean.opts") || {}, o = {};
  Object.keys(DEFAULTS).forEach(function (k) { o[k] = k in saved ? saved[k] : DEFAULTS[k]; });
  var seed = (cryptoRand() * 4294967296) >>> 0;
  function seeded(sd) { var a = sd >>> 0; return function () { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

  function stat(label, value) { return '<div class="stat"><b>' + S3.esc(value) + "</b><span>" + S3.esc(label) + "</span></div>"; }
  function sync() {
    $$("#steps input[data-o]").forEach(function (c) { c.checked = !!o[c.dataset.o]; });
    $("[data-o=ignoreCase]").disabled = !o.dupes;
    $("#reshuffle").disabled = !o.shuffle;
    $$("#sort button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === o.sort)); });
    $(".tc-sort").classList.toggle("on", o.sort !== "none");
  }
  function render() {
    var t = input.value;
    if (!t) { out.textContent = ""; statsEl.innerHTML = stat("lines in", 0) + stat("lines out", 0) + stat("duplicates removed", 0) + stat("empty lines removed", 0) + stat("characters out", 0); return; }
    var r = clean(t, o, seeded(seed));
    out.textContent = r.text;
    statsEl.innerHTML = stat("lines in", t.split(/\r\n?|\n/).length.toLocaleString()) + stat("lines out", r.lines.toLocaleString()) +
      stat("duplicates removed", r.stats.dupes.toLocaleString()) + stat("empty lines removed", r.stats.empty.toLocaleString()) +
      stat("characters out", Array.from(r.text).length.toLocaleString());
  }
  function saveOpts() { S3.store("clean.opts", o); }

  $$("#steps input[data-o]").forEach(function (c) {
    c.addEventListener("change", function () { o[c.dataset.o] = c.checked; saveOpts(); sync(); render(); });
  });
  $$("#sort button").forEach(function (b) {
    b.addEventListener("click", function () { o.sort = b.dataset.v; saveOpts(); sync(); render(); });
  });
  $("#reshuffle").addEventListener("click", function () { seed = (cryptoRand() * 4294967296) >>> 0; render(); });
  $("#reset").addEventListener("click", function () { o = Object.assign({}, DEFAULTS); S3.store("clean.opts", undefined); sync(); render(); });
  input.addEventListener("input", S3.debounce(render, 120));
  $("#clear").addEventListener("click", function () { input.value = ""; render(); input.focus(); });
  $("#sample").addEventListener("click", function () {
    input.value = "  banana   split  \napple pie 🍎\n\nCherry tart\nbanana   split\nitem 10\nitem 2\n<b>Apple</b> pie &amp; cream\n   \nitem 1 🎉🎉\nApple pie 🍎";
    render();
  });
  $("#open input").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return;
    S3.readFile(f, "text").then(function (t) { input.value = t; render(); });
    e.target.value = "";
  });
  $("#copy").addEventListener("click", function () {
    if (!out.textContent) { S3.toast("Nothing to copy yet", "error"); return; }
    S3.copy(out.textContent); S3.done();
  });
  $("#save").addEventListener("click", function () { if (out.textContent) { S3.download(out.textContent + "\n", "cleaned.txt", "text/plain;charset=utf-8"); S3.done(); } });
  $("#use").addEventListener("click", function () { if (out.textContent) { input.value = out.textContent; render(); } });

  sync();
  render();

  window.S3_DEMO = function () {
    o = Object.assign({}, DEFAULTS, { html: true, emoji: true, dupes: true, ignoreCase: true, sort: "natural" });
    sync(); $("#sample").click();
  };

  window.S3_SELFTEST = function () {
    var base = Object.assign({}, DEFAULTS);
    var t = [
      [clean("  a  \n\n b   c \n", base).text, "a\nb c"],
      [clean("x\nX\nx", Object.assign({}, base, { dupes: true })).text, "x\nX"],
      [clean("x\nX\nx", Object.assign({}, base, { dupes: true, ignoreCase: true })).text, "x"],
      [clean("item 10\nitem 2\nitem 1", Object.assign({}, base, { sort: "natural" })).text, "item 1\nitem 2\nitem 10"],
      [clean("b\nC\na", Object.assign({}, base, { sort: "za" })).text, "C\nb\na"],
      [clean("ccc\na\nbb", Object.assign({}, base, { sort: "length" })).text, "a\nbb\nccc"],
      [clean("1\n2\n3", Object.assign({}, base, { reverse: true })).text, "3\n2\n1"],
      [clean("a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk", Object.assign({}, base, { number: true })).text.split("\n")[0], " 1. a"],
      [clean("<p>Hi &amp; <b>bye</b></p><script>alert(1)</script><p>x&#x41;&lt;</p>", Object.assign({}, base, { html: true })).text, "Hi & bye\nxA<"],
      [clean("ok 👍🏽 go 👨‍👩‍👧 © 2026 🇯🇴!", Object.assign({}, base, { emoji: true })).text, "ok go © 2026 !"],
      [clean("a\r\nb\r\n", base).text, "a\nb"]
    ];
    var sh = clean("1\n2\n3\n4\n5\n6", Object.assign({}, base, { shuffle: true }), seeded(1)).text.split("\n");
    var shOk = sh.length === 6 && sh.slice().sort().join("") === "123456";
    var st = clean("a\na\n\nb", Object.assign({}, base, { dupes: true })).stats;
    return t.every(function (p) { return p[0] === p[1]; }) && shOk && st.dupes === 1 && st.empty === 1;
  };
})();
