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
    const { p, errors } = await setup(browser, "pass", null, null, null, { rounds: 1, ai: true });   // build 17: with the AI assignment ON, the log carries the AI lines and all 8 debrief prompts
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
    r.check("file names start with EXERCISE and carry the date and the right extension", web.name === "EXERCISE-ballotship-after-action-" + today + ".html" && word.name === "EXERCISE-ballotship-after-action-" + today + ".docx", web.name + ", " + word.name);
    if (process.env.KEEP_LOG_FILES) { fs.copyFileSync(word.file, path.join(process.env.KEEP_LOG_FILES, word.name)); }   // for opening the Word file in another program by hand
    const html = fs.readFileSync(web.file, "utf8");

    // Print: the hidden frame holds the log.
    // The page prints from a hidden frame and removes it as soon as printing ends, which a headless browser does at once,
    // so looking for the frame afterwards is a race. What is printed is the frame's own document (srcdoc); take it the moment
    // the frame is added.
    await p.evaluate(() => {
      window.__printedDoc = null;
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.id === "printFrame") window.__printedDoc = n.srcdoc; }))).observe(document.body, { childList: true });
    });
    await p.$eval("#btnPrint", e => e.click());
    await p.waitForFunction(() => window.__printedDoc, null, { timeout: 10000 });
    const printed = await p.evaluate(() => { const d = new DOMParser().parseFromString(window.__printedDoc, "text/html"); return { text: d.body.textContent, grids: d.querySelectorAll(".grid, .cell").length }; });

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

    // The exercise label (build 17): the wording the owner approved, in all three copies.
    const X = {
      banner: "THIS IS AN ELECTION EXERCISE. Everything in this log is fictional. The events, jurisdictions, people and attacks were made up for training and did not happen.",
      perInject: "Exercise only. Not a real event.",
      closing: "End of an election exercise log. Nothing in it describes a real event, a real jurisdiction or a real person.",
      page: "ELECTION EXERCISE. NOT A REAL EVENT.",
    };
    const nInjects = await helper.evaluate(h => new DOMParser().parseFromString(h, "text/html").querySelectorAll("article h3").length, html);
    const count = (t, x) => t.split(x).length - 1;
    const isExerciseTitle = await helper.evaluate(h => new DOMParser().parseFromString(h, "text/html").title, html);
    r.check("web page: the title says EXERCISE", isExerciseTitle === "EXERCISE - Ballotship after-action log", isExerciseTitle);
    const ends = await helper.evaluate(h => { const d = new DOMParser().parseFromString(h, "text/html"), ps = [...d.querySelectorAll("p.banner")], h1 = d.querySelector("h1"), last = [...d.querySelectorAll("li")].pop();
      return { n: ps.length, first: ps[0] && ps[0].textContent, second: ps[1] && ps[1].textContent, beforeTitle: !!(ps[0] && (ps[0].compareDocumentPosition(h1) & 4)), afterPrompts: !!(ps[1] && last && (ps[1].compareDocumentPosition(last) & 2)) }; }, html);
    r.check("web page: the banner comes before the title and the closing line after the last debrief prompt", ends.n === 2 && ends.first === X.banner && ends.second === X.closing && ends.beforeTitle && ends.afterPrompts, JSON.stringify(ends));
    r.check("web page: every inject carries its own 'Exercise only' line (" + nInjects + " injects)", nInjects >= 1 && count(webText, X.perInject) === nInjects, count(webText, X.perInject) + " lines");
    r.check("web page: the page header and footer line is there for printing", (html.match(/class=pagehead>ELECTION EXERCISE\. NOT A REAL EVENT\./g) || []).length === 1 && (html.match(/class=pagefoot>ELECTION EXERCISE\. NOT A REAL EVENT\./g) || []).length === 1 && /@media print\{\.pagehead,\.pagefoot\{display:block;position:fixed/.test(html));
    r.check("web page: the relay traffic heading says exercise messages, not real communications", /Relay traffic \(exercise messages, not real communications\)/.test(webText));
    r.check("Print carries the same label: banner, an 'Exercise only' line per inject, the closing line, and the header and footer", !!printed && printed.text.includes(X.banner) && count(printed.text, X.perInject) === nInjects && printed.text.includes(X.closing) && count(printed.text, X.page) === 2, printed && count(printed.text, X.page) + " page lines");

    // The .docx package.
    const zip = await JSZip.loadAsync(fs.readFileSync(word.file));
    const names = Object.keys(zip.files);
    for (const part of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels", "docProps/core.xml"])
      r.check("Word file has " + part, names.includes(part));
    const xmls = {}; for (const n of names.filter(n => /\.(xml|rels)$/.test(n))) xmls[n] = await zip.file(n).async("string");
    const bad = [];
    for (const [n, x] of Object.entries(xmls)) if (await helper.evaluate(x => !!new DOMParser().parseFromString(x, "application/xml").querySelector("parsererror"), x)) bad.push(n);
    r.check("every XML part is well formed", bad.length === 0, bad.join(", "));
    const docXml = xmls["word/document.xml"], txt = x => unxml([...x.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join(""));
    r.check("Word: a header and a footer on every page, each saying ELECTION EXERCISE. NOT A REAL EVENT.", names.includes("word/header1.xml") && names.includes("word/footer1.xml") && txt(xmls["word/header1.xml"]) === X.page && txt(xmls["word/footer1.xml"]) === X.page && /<w:headerReference w:type="default" r:id="rIdHdr"\/><w:footerReference w:type="default" r:id="rIdFtr"\/>/.test(docXml) && /header\+xml/.test(xmls["[Content_Types].xml"]) && /footer\+xml/.test(xmls["[Content_Types].xml"]));
    r.check("Word: the banner, an 'Exercise only' line per inject, and the closing line are in the body", txt(docXml).includes(X.banner) && count(txt(docXml), X.perInject) === nInjects && txt(docXml).includes(X.closing));
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
    r.check("the jurisdiction and the inject deck version are in the web page, the Word file and Print (build 18)", [webText, docText, printed.text].every(t => t.includes("Jurisdiction: Test County.") && t.includes("Inject deck: built-in set (16 injects).")));
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
