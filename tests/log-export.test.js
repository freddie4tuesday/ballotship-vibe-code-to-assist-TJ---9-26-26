/*
  The after-action log, three ways out (build 7): "Download the log (web page)",
  "Download as Word", and "Print". All three come from one function in the page,
  so they must say the same thing. Plays a 1-round game on one screen with a
  facilitator note containing a link, characters that need escaping (< > &) and a
  picture, then:

    - downloads the web page and the Word file, and prints (into a hidden frame)
    - checks the .docx is a well-formed package: right parts, XML that parses,
      the picture and the link carried across
    - checks every paragraph, heading and list item of the web page is in the
      Word file, and that Print holds exactly the web page's text (no boards)
    - if python-docx is installed, opens the .docx with it as a second opinion
      (a different reader from the browser's; LibreOffice is worth a look by hand)
*/
const fs = require("fs"), os = require("os"), path = require("path"), zlib = require("zlib");
const { execFileSync } = require("child_process");
const JSZip = require("jszip");
const { reporter, launch, screenOn } = require("./helpers");
const { setup, step } = require("./driver");

/* A real (valid) PNG: a small gradient. */
function makePng(w, h) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = (x * 255 / w) | 0; raw[i + 1] = (y * 255 / h) | 0; raw[i + 2] = 128; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const norm = t => String(t).replace(/\s+/g, " ").trim();
const unxml = t => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

(async () => {
  const r = reporter("After-action log: web page, Word and Print agree");
  let browser;
  try {
    browser = await launch();
    const { p, errors } = await setup(browser, "pass", null, null, null, { rounds: 1 });
    const NOTE = "Facilitator note: see the sample <chart> & the link", LINK = "https://example.com/report?a=1&b=2";
    await p.$eval("#dockTab", e => { if (e.getAttribute("aria-expanded") !== "true") e.click(); });
    await p.$eval("#msgText", (e, t) => { e.value = t; }, NOTE);
    await p.$eval("#msgLink", (e, t) => { e.value = t; }, LINK);
    await p.setInputFiles("#msgFile", { name: "chart.png", mimeType: "image/png", buffer: makePng(300, 150) });
    await p.waitForFunction(() => document.querySelectorAll("#pendFiles *").length > 0, null, { timeout: 10000 });
    await p.$eval("#btnSendMsg", e => e.click());
    for (let i = 0; i < 400 && (await screenOn(p)) !== "screen-over"; i++) { await step(p, "pass").catch(() => {}); await p.waitForTimeout(100); }
    r.check("game reaches the final screen", (await screenOn(p)) === "screen-over");

    const labels = await p.$$eval("#btnExport, #btnExportDoc, #btnPrint", els => els.map(e => e.textContent.trim()));
    r.check("the three buttons are labelled clearly", labels.join(" | ") === "Download the log (web page) | Download as Word | Print", labels.join(" | "));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballotship-log-"));
    const grab = async sel => { const [d] = await Promise.all([p.waitForEvent("download"), p.$eval(sel, e => e.click())]); const f = path.join(dir, d.suggestedFilename()); await d.saveAs(f); return { name: d.suggestedFilename(), file: f }; };
    const web = await grab("#btnExport"), word = await grab("#btnExportDoc");
    const today = new Date().toISOString().slice(0, 10);
    r.check("file names carry the date and the right extension", web.name === "ballotship-after-action-" + today + ".html" && word.name === "ballotship-after-action-" + today + ".docx", web.name + ", " + word.name);
    const html = fs.readFileSync(web.file, "utf8");

    // Print: the hidden frame holds the log.
    await p.$eval("#btnPrint", e => e.click());
    await p.waitForSelector("#printFrame", { state: "attached", timeout: 10000 });
    await p.waitForFunction(() => { const f = document.getElementById("printFrame"); return !f || (f.contentDocument && f.contentDocument.body && f.contentDocument.body.textContent.length > 100); }, null, { timeout: 10000 });
    const printed = await p.evaluate(() => { const f = document.getElementById("printFrame"); return f ? { text: f.contentDocument.body.textContent, grids: f.contentDocument.querySelectorAll(".grid, .cell").length } : null; });

    // A page to parse the log and the XML with (the browser's own parsers).
    const helper = await browser.newPage();
    const bodyText = h => helper.evaluate(h => new DOMParser().parseFromString(h, "text/html").body.textContent, h);
    // Each file records the moment it was made, so the "exported <time>" part is left out of comparisons.
    const stamp = t => norm(t).replace(/exported .*?(?=Outcome)/, "exported ");
    const webText = await bodyText(html);
    r.check("Print holds the log", !!printed && printed.text.length > 500);
    const same = !!printed && stamp(printed.text) === stamp(webText);
    if (!same && printed) { const a = stamp(printed.text), b = stamp(webText); let i = 0; while (i < a.length && a[i] === b[i]) i++; console.log("        first difference at " + i + ": print «" + a.slice(Math.max(0, i - 40), i + 60) + "» web «" + b.slice(Math.max(0, i - 40), i + 60) + "» (lengths " + a.length + " / " + b.length + ")"); }
    r.check("Print is the same text as the web page download", same);
    r.check("Print has no boards in it", !!printed && printed.grids === 0 && !/Their map|Click a cell/.test(printed.text));

    // The .docx package.
    const zip = await JSZip.loadAsync(fs.readFileSync(word.file));
    const names = Object.keys(zip.files);
    for (const part of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels", "docProps/core.xml"])
      r.check("Word file has " + part, names.includes(part));
    const xmls = {}; for (const n of names.filter(n => /\.(xml|rels)$/.test(n))) xmls[n] = await zip.file(n).async("string");
    const bad = [];
    for (const [n, x] of Object.entries(xmls)) if (await helper.evaluate(x => !!new DOMParser().parseFromString(x, "application/xml").querySelector("parsererror"), x)) bad.push(n);
    r.check("every XML part is well formed", bad.length === 0, bad.join(", "));
    const media = names.filter(n => /^word\/media\//.test(n));
    const nImg = (html.match(/<img /g) || []).length;
    r.check("the picture is in the Word file (" + nImg + " in the log, " + media.length + " in the .docx)", nImg >= 1 && media.length === nImg);
    if (media.length) {
      const png = await zip.file(media[0]).async("nodebuffer");
      r.check("...as a real PNG", png.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && png.length > 100);
    }
    r.check("the link is a real hyperlink", xmls["word/_rels/document.xml.rels"].includes('Target="' + LINK.replace(/&/g, "&amp;") + '"') && /TargetMode="External"/.test(xmls["word/_rels/document.xml.rels"]));

    // Every block of the web page is in the Word file.
    const docPars = [...xmls["word/document.xml"].matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map(m => norm(unxml([...m[1].matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map(x => x[1]).join(""))));
    const docText = docPars.join("\n");
    const blocks = await helper.evaluate(h => [...new DOMParser().parseFromString(h, "text/html").body.querySelectorAll("h1,h2,h3,h4,p,li")].map(e => e.textContent), html);
    const missing = blocks.map(b => norm(b).replace(/ exported .*$/, "")).filter(b => b && !docText.includes(b));
    r.check("every heading, paragraph and list item of the web page is in the Word file (" + blocks.length + " blocks)", missing.length === 0, missing.slice(0, 3).join(" || "));
    r.check("special characters survived (< > &)", docText.includes(NOTE));
    r.check("all 8 debrief prompts are there, numbered", [1, 2, 3, 4, 5, 6, 7, 8].every(n => docPars.some(x => x.startsWith(n + "."))));

    // Second opinion, if python-docx is installed.
    let py = null;
    try { py = JSON.parse(execFileSync("python3", ["-c", "import docx,json,sys; d=docx.Document(sys.argv[1]); print(json.dumps({'p':len(d.paragraphs),'pics':len(d.inline_shapes),'h1':[x.text for x in d.paragraphs if x.style.name=='Heading 1']}))", word.file]).toString()); } catch (e) {}
    if (py) {
      r.check("python-docx opens it: " + py.p + " paragraphs, " + py.pics + " picture(s)", py.p > 20 && py.pics === nImg);
      r.check("...with Outcome and Debrief prompts as Heading 1", py.h1.includes("Outcome") && py.h1.includes("Debrief prompts"), py.h1.join(", "));
    } else console.log("  SKIP  python-docx not installed; second-opinion check skipped (pip install python-docx)");

    r.check("no JavaScript errors", errors.length === 0, errors.join("; "));
  } catch (e) { r.fail("test crashed", e.message); console.log(e.stack); }
  finally { if (browser) await browser.close(); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
