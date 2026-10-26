// Client query list builder: turns pasted bank lines into the triage from the
// transaction-queries skill (A confident, B likely, C only the client knows,
// D for the accountant), a grouped and numbered client message, accountant
// notes and a bookkeeping table. Runs in the browser and in node
// (module.exports) for tests. Nothing pasted is sent anywhere.
(function () {
  var MAX_QUESTIONS = 25;

  // ---- Parsing -----------------------------------------------------------
  var DATE_RE = /^(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?|\d{1,2} [A-Za-z]{3}(?: \d{2,4})?)\b/;
  var AMOUNT_RE = /(-|−)?[£$€]?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?$/;
  var DIR_IN = /^(IN|CR|CREDIT|PAID IN|MONEY IN)$/i, DIR_OUT = /^(OUT|DR|DEBIT|PAID OUT|MONEY OUT)$/i;

  function parseOne(raw) {
    // Quoted CSV cells and thousands separators lose their commas; any other
    // comma (a CSV column break) becomes a space.
    var s = String(raw).replace(/\t/g, " ").replace(/"([^"]*)"/g, function (m, x) { return x.replace(/,/g, ""); })
      .replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (!s) return null;
    var date = "", dir = null, m = DATE_RE.exec(s);
    if (m) { date = m[1]; s = s.slice(m[0].length).trim(); }
    var tail = /\s+([A-Za-z ]+)$/.exec(s);
    if (tail && (DIR_IN.test(tail[1].trim()) || DIR_OUT.test(tail[1].trim()))) {
      dir = DIR_IN.test(tail[1].trim()) ? "in" : "out";
      s = s.slice(0, tail.index).trim();
    }
    var a = AMOUNT_RE.exec(s);
    if (!a) return null;
    var amount = parseFloat(a[2].replace(/,/g, "") + (a[3] || ""));
    var desc = s.slice(0, a.index).replace(/[\s,;|]+$/, "").trim();
    if (!desc || !(amount > 0)) return null;
    return { date: date, desc: desc, amount: amount, negative: !!a[1], dir: dir };
  }

  // Lines with no IN/OUT word: a minus sign means money out. If any line in
  // the paste has a minus sign, unsigned amounts are money in; otherwise
  // they follow opts.unsigned ("out" by default, as most pasted lists are
  // payments).
  function parseLines(text, unsigned) {
    var rows = [], skipped = [];
    String(text || "").split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var r = parseOne(line);
      if (r) rows.push(r); else skipped.push(line.trim());
    });
    var signed = rows.some(function (r) { return r.negative && !r.dir; });
    rows.forEach(function (r) {
      if (!r.dir) r.dir = r.negative ? "out" : (signed ? "in" : (unsigned === "in" ? "in" : "out"));
      delete r.negative;
    });
    return { rows: rows, skipped: skipped };
  }

  // Never repeat long account or card numbers: keep the last 4 digits.
  function mask(s) { return String(s).replace(/\d[\d ]{6,}\d/g, function (d) { var n = d.replace(/ /g, ""); return n.length >= 8 ? "****" + n.slice(-4) : d; }); }

  // ---- Classification ----------------------------------------------------
  function has(re, d) { return re.test(d); }
  var R = {
    taxUK: /\bHMRC\b|H ?M ?REVENUE|\bHMRC\s?(VAT|PAYE|SA|NDDS|CUMBERNAULD|SHIPLEY)/,
    taxUS: /\bIRS\b|USATAXPYMT|EFTPS|\bTREAS\b|DEPT OF REVENUE|STATE TAX|FRANCHISE TAX|\bDOR\b/,
    personalTax: /\bSA\b|SELF ?ASSESS|NDDS|1040|ES TAX|ESTIMATED/,
    cash: /\bCASH\b|\bATM\b|CSH WDL|\bLINK\b|WITHDRAWAL/,
    processor: /STRIPE|SUMUP|SQUARE|SQ \*|ZETTLE|IZETTLE|SHOPIFY PAY|PAYPAL|ETSY PAY|EBAY.*PAYOUT|AMAZON PAY|VINTED|GOCARDLESS|WORLDPAY|DOJO/,
    payout: /PAYOUT|TRANSFER|SETTLEMENT|DEPOSIT|PAYMENT/,
    market: /AMZN|AMAZON|\bEBAY\b|\bETSY\b|PAYPAL|ALIEXPRESS|TEMU|WISH\.COM/,
    mixed: /TESCO|SAINSBURY|\bASDA\b|MORRISON|\bALDI\b|\bLIDL\b|WAITROSE|\bCO-?OP\b|\bM ?& ?S\b|ICELAND|WALMART|\bTARGET\b|COSTCO|KROGER|SAFEWAY|WHOLE FOODS|\bSHELL\b|\bESSO\b|TEXACO|CHEVRON|EXXON|MOBIL|PETROL|\bFUEL\b|MCDONALD|STARBUCKS|COSTA|\bPRET\b|GREGGS|RESTAURANT|DELIVEROO|UBER ?EATS|JUST ?EAT|DOORDASH|GRUBHUB|\bPUB\b|NANDO/,
    software: /ADOBE|MICROSOFT|MSFT|GOOGLE ?(WORKSPACE|\*GSUITE|CLOUD)|GSUITE|\bXERO\b|QUICKBOOKS|INTUIT|FREEAGENT|\bSAGE\b|DROPBOX|\bZOOM\b|CANVA|SLACK|SQUARESPACE|\bWIX\b|GODADDY|MAILCHIMP|NOTION|OPENAI|CHATGPT|ANTHROPIC|CLAUDE\.AI|HUBSPOT|CALENDLY|1PASSWORD|LINKEDIN PREM/,
    phone: /VODAFONE|\bEE\b|\bO2\b|\bTHREE\b|\bBT\b|BT GROUP|\bSKY\b|VIRGIN MEDIA|VERIZON|AT ?& ?T|T-?MOBILE|COMCAST|XFINITY|SPECTRUM|PLUSNET|TALKTALK|GIFFGAFF/,
    trade: /SCREWFIX|TOOLSTATION|WICKES|\bB ?& ?Q\b|TRAVIS PERKINS|HOWDENS|CITY PLUMBING|PLUMBASE|JEWSON|SELCO|BUILDBASE|CEF\b|EDMUNDSON|HOME DEPOT|LOWE'?S|MENARDS|FERGUSON|GRAINGER/,
    bankFee: /\bCHARGES?\b|\bFEES?\b|ACCOUNT FEE|OVERDRAFT|COMMISSION|SERVICE CHARGE/,
    interest: /\bINTEREST\b|\bINT PAID\b|GROSS INT/,
    loan: /\bLOAN\b|\bFINANCE\b|FUNDING CIRCLE|IWOCA|BOUNCE ?BACK|\bBBL\b|\bCBILS\b|\bLEASE\b|HIRE PURCHASE|\bHP\b|CAPITAL ON TAP|\bSBA\b|KABBAGE|ONDECK/,
    insurance: /INSURANCE|\bINS\b|DIRECT LINE|AVIVA|\bAXA\b|HISCOX|SIMPLY BUSINESS|ADMIRAL|ZURICH|ALLSTATE|GEICO|PROGRESSIVE|STATE FARM/,
    refund: /REFUND|RFND|REVERSAL|CHARGEBACK|RETURN/,
    ownTfr: /SAVINGS|SAVER|\bISA\b|\bTO A\/C\b|OWN ACCOUNT|\bPOT\b|INTERNAL TRANSFER|TFR TO|TRANSFER TO/,
    toPerson: /^(FPS|FPO|FP|SO|STO|BP|BILL PAYMENT|BILL PAY|ZELLE|VENMO|CASH ?APP|TFR|TRANSFER|FASTER PAYMENT|ONLINE PAYMENT|MOB|IB)\b|^[A-Z]\.? ?[A-Z][A-Z'\-]+$|^(MR|MRS|MS|MISS|DR) /,
    moneyIn: /^(BGC|FPI|TFR|TRANSFER|FASTER PAYMENT|CREDIT|ZELLE|VENMO|DEPOSIT|MOBILE DEPOSIT|CHQ|CHEQUE|CHECK)\b|\bFROM\b/
  };

  function merchantKey(d) {
    var keys = [["AMAZON", /AMZN|AMAZON/], ["eBay", /\bEBAY\b/], ["Etsy", /\bETSY\b/], ["PayPal", /PAYPAL/]];
    for (var i = 0; i < keys.length; i++) if (keys[i][1].test(d)) return keys[i][0] === "AMAZON" ? "Amazon" : keys[i][0];
    var w = d.replace(/[^A-Z0-9 &]/g, " ").trim().split(/\s+/)[0] || "";
    return w.charAt(0) + w.slice(1).toLowerCase();
  }

  // opts: {country: "uk"|"us", entity: "sole"|"company", vat: bool, capital: number}
  function classify(row, opts) {
    var d = row.desc.toUpperCase(), out = row.dir === "out", uk = opts.country !== "us";
    var company = opts.entity === "company", big = row.amount >= (opts.capital || 1000);
    var r = { group: "C", category: "", confidence: "Low", bucket: "", question: "", guess: "", options: [], note: "" };
    function set(g, cat, conf, bucket, q, opts2, guess) {
      r.group = g; r.category = cat; r.confidence = conf; r.bucket = bucket || ""; r.question = q || ""; r.options = opts2 || []; r.guess = guess || "";
    }
    var tax = uk ? R.taxUK : R.taxUS;
    if (has(tax, d) || has(R.taxUK, d) || has(R.taxUS, d)) {
      var agency = has(R.taxUS, d) && !has(R.taxUK, d) ? "IRS or state" : "HMRC";
      if (out) {
        set("B", "Tax payment: which tax? [check]", "Medium", "Tax payments",
          "Which tax was this?", agency === "HMRC" ? ["VAT", "PAYE/payroll", "Corporation Tax", "Self Assessment (personal)", "Other: ___"] : ["Estimated tax (personal)", "Payroll tax", "Sales tax", "Business income tax", "Other: ___"]);
        if (company && has(R.personalTax, d)) { r.group = "D"; r.note = "Looks like personal tax paid from the company account. If so it's a director's loan account item, not an expense."; }
        else if (company) r.note = "If any of this is the director's personal tax, it goes to the director's loan account, not expenses.";
      } else {
        set("B", "Tax refund: which tax? [check]", "Medium", "Tax refunds", "Which tax was this refund for?", ["VAT", "Corporation Tax", "Self Assessment (personal)", "Other: ___"]);
      }
      return r;
    }
    if (has(R.loan, d)) {
      set("D", out ? "Loan or finance repayment (split capital and interest)" : "Loan received (liability, not income)", "Medium",
        out ? "Loans and finance" : "Money paid in", out ? "Is this a loan or finance agreement? Please send the agreement or a yearly statement." : "Is this a loan? Who from, and is there an agreement?", []);
      r.note = out ? "Finance or loan payment: needs the agreement to split capital, interest and any asset (HP/lease)." : "Possible loan in: book as a liability once confirmed, never as sales.";
      return r;
    }
    if (has(R.cash, d)) {
      if (out) {
        set("C", company ? "Cash: [ask]" : "Cash: drawings unless a receipt shows a business cost", "Low", "Cash withdrawals",
          "What was this cash used for?", ["Business cost (do you have a receipt?)", "Wages or casual labour", "Personal", "Other: ___"]);
        if (company) r.note = "Cash taken from a company account with no business receipt is usually a director's loan account item.";
      } else {
        set("C", "Cash paid in: [ask]", "Low", "Money paid in", "What was this cash?", ["Takings from customers", "Your own money", "Loan", "Other: ___"]);
        if (big) { r.group = "D"; r.note = "Large cash deposit: check the source before booking. Factual review only."; }
      }
      return r;
    }
    if (!out && has(R.processor, d)) {
      set("A", "Sales: payout (net of fees; record gross sales and fees separately)", "High");
      return r;
    }
    if (!out && has(R.interest, d)) { set("A", "Bank interest received", "High"); return r; }
    if (out && has(R.bankFee, d) && !has(R.market, d)) { set("A", "Bank charges", "High"); return r; }
    if (out && has(R.interest, d)) { set("A", "Bank interest paid", "Medium"); return r; }
    if (has(R.refund, d)) {
      set("B", out ? "Refund to a customer: [check]" : "Refund received: [check]", "Medium", "Refunds",
        out ? "Which sale was this refund for?" : "What was this refund for?", ["Reply with the order or what you bought"], out ? "a refund to a customer" : "a refund on a business purchase");
      return r;
    }
    if (has(R.software, d)) {
      set(out ? "A" : "B", out ? "Software and subscriptions" : "Money in from a software company: [check]", out ? "High" : "Low",
        out ? "" : "Money paid in", out ? "" : "What was this payment from?", out ? [] : ["Refund", "Sale", "Other: ___"]);
      return r;
    }
    if (out && has(R.phone, d)) {
      set("B", "Phone and internet (business share?)", "Medium", "Phone and internet",
        "Is this phone or broadband business-only, mixed, or personal?", ["Business only", "Mixed: about __% business", "Personal"], "business use");
      return r;
    }
    if (out && has(R.insurance, d)) {
      set("B", "Insurance: business or personal? [check]", "Medium", "Insurance",
        "What does this insurance cover?", ["Business (public liability, tools, van)", "Personal (home, own car)", "Other: ___"], "business insurance");
      return r;
    }
    if (out && has(R.trade, d)) {
      set("B", "Materials", "Medium", "Trade suppliers", "Was this materials for a job, tools or equipment, or personal?", ["Materials for a job", "Tools or equipment", "Personal"], "materials for a job");
      if (big) { r.group = "D"; r.note = "Over the capitalisation threshold: may be equipment (a capital item), not materials."; }
      return r;
    }
    if (out && has(R.market, d)) {
      set("B", "Supplies or stock: [check]", "Low", merchantKey(d) + " orders", "What did you buy?", ["Stock for resale", "Equipment", "Office or packing supplies", "Personal", "Other: ___"], "business supplies");
      if (big) { r.group = "D"; r.note = "Over the capitalisation threshold: could be a capital item. Ask what it was."; }
      return r;
    }
    if (out && has(R.mixed, d)) {
      set("B", "Personal (drawings) unless business", "Low", "Shops, food and fuel", "Business or personal?", ["Business (what for?)", "Personal", "Part business: £__"], "personal");
      return r;
    }
    if (has(R.ownTfr, d)) {
      set("B", "Transfer between own accounts (not income or expense)", "Medium", "Transfers", "Is this a move between your own accounts? Which account?", ["Yes, my own account: ___", "No: ___"], "a transfer to your own account");
      r.note = "Match both sides of any own-account transfer so it isn't double counted.";
      return r;
    }
    if (out && has(R.toPerson, d)) {
      set("C", "Payment to a person: [ask]", "Low", "Payments to people", "What was this payment for?",
        ["Wages", "Subcontractor (invoice?)", "Loan repayment", "Refund to a customer", "Personal", "Other: ___"]);
      r.note = uk ? "Payment to an individual: if wages, are they on payroll? If construction work, check CIS (verify the subcontractor; 20% or 30% deduction unless gross status). If family, are they genuinely working?"
        : "Payment to an individual: if wages, are they on payroll? If a contractor, get a W-9; payments of $2,000 or more in 2026 go on a 1099-NEC ($600 for 2025 payments). If family, are they genuinely working?";
      r.group = row.amount >= 500 ? "D" : "C";
      return r;
    }
    if (!out) {
      set("C", "Money in: [ask] (not sales until confirmed)", "Low", "Money paid in", "What was this money?",
        ["Payment from a customer (which job/invoice?)", company ? "Money you put in or lent the company" : "Your own money", "Loan from someone else", "Refund", "Grant", "Other: ___"]);
      if (big) { r.group = "D"; r.note = company ? "Large unexplained money in: could be a director's loan or capital. Don't book as sales until confirmed." : "Large unexplained money in: could be capital or a loan. Don't book as sales until confirmed."; }
      return r;
    }
    set(big ? "D" : "C", "Unknown: [ask]", "Low", "Other payments", "What was this payment for?", ["Business cost: ___", "Personal", "Other: ___"]);
    if (big) r.note = "Over the capitalisation threshold: could be a capital item. Ask what it was.";
    return r;
  }

  // ---- Building the outputs ---------------------------------------------
  function money(n, cur) { return cur + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function build(text, opts) {
    opts = opts || {};
    var cur = opts.country === "us" ? "$" : "£";
    var parsed = parseLines(text, opts.unsigned);
    var items = parsed.rows.map(function (row, i) {
      var c = classify(row, opts);
      return { n: i + 1, date: row.date, desc: mask(row.desc), amount: row.amount, dir: row.dir, c: c };
    });
    var totals = { in: 0, out: 0 };
    items.forEach(function (it) { totals[it.dir] += it.amount; });
    totals.in = Math.round(totals.in * 100) / 100; totals.out = Math.round(totals.out * 100) / 100;

    // Questions: every B, C and D line that has a question. Biggest first; at
    // most MAX_QUESTIONS now, the rest go in the next batch.
    var asked = items.filter(function (it) { return it.c.question; })
      .sort(function (a, b) { return b.amount - a.amount || a.n - b.n; });
    var now = asked.slice(0, MAX_QUESTIONS), later = asked.slice(MAX_QUESTIONS);

    // Group by bucket in a fixed order; batch 3+ similar "likely" lines.
    var order = ["Money paid in", "Payments to people", "Cash withdrawals", "Loans and finance", "Tax payments", "Tax refunds", "Transfers", "Trade suppliers", "Insurance", "Phone and internet", "Shops, food and fuel", "Refunds", "Other payments"];
    var buckets = {};
    now.forEach(function (it) { (buckets[it.c.bucket] = buckets[it.c.bucket] || []).push(it); });
    var names = Object.keys(buckets).sort(function (a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 50 : ia) - (ib < 0 ? 50 : ib) || (a < b ? -1 : 1);
    });
    var q = 0, lines = [], sms = [];
    var line = function (it) { return (it.date ? it.date + "  " : "") + money(it.amount, cur) + (it.dir === "in" ? " in" : "") + "  " + it.desc; };
    names.forEach(function (name) {
      var list = buckets[name].sort(function (a, b) { return a.n - b.n; });
      lines.push("", name.toUpperCase());
      var guessed = list.filter(function (it) { return it.c.group === "B" && it.c.guess; });
      if (guessed.length >= 3 && guessed.length === list.length && guessed.every(function (it) { return it.c.guess === guessed[0].c.guess; })) {
        q++;
        lines.push(q + ". These " + list.length + " payments look like " + list[0].c.guess + ". Reply OK, or give the number of any that aren't and what they were:");
        list.forEach(function (it, k) { lines.push("   " + q + String.fromCharCode(97 + k) + ") " + line(it)); });
        sms.push(q + ". " + list.length + " " + name.toLowerCase() + ": all " + list[0].c.guess + "?");
        return;
      }
      list.forEach(function (it) {
        q++;
        var text = q + ". " + line(it) + "\n   ";
        if (it.c.group === "B" && it.c.guess) text += "We think this is " + it.c.guess + ". Reply OK or correct it.";
        else text += it.c.question + (it.c.options.length ? " " + it.c.options.join(" / ") : "");
        lines.push(text);
        sms.push(q + ". " + money(it.amount, cur) + " " + it.desc + (it.date ? " (" + it.date + ")" : "") + ": " + (it.c.guess ? it.c.guess + "?" : it.c.question));
      });
    });
    var replyBy = opts.replyBy || "[date]";
    var message = ["Hi [first name],", "",
      "We're doing your bookkeeping and there " + (q === 1 ? "is 1 line" : "are " + q + " lines") + " on your bank statement we can't work out on our own. Getting these right means your accounts and tax are correct, and that you don't pay more tax than you need to.",
      "", "Could you reply by " + replyBy + "? Just reply with the numbers, e.g. \"1 OK, 2 personal, 3 van insurance\". If you have a receipt or invoice for anything over " + cur + (opts.capital || 1000).toLocaleString("en-GB") + ", please send that too."]
      .concat(lines).concat(["", "Thanks,", "[name]"]).join("\n");
    if (!q) message = "";
    var whatsapp = q && q < 6 ? "Hi [name], quick one for your bookkeeping. Can you tell me what these were?\n" + sms.join("\n") + "\nReply with the numbers. Thanks!" : "";
    var notes = items.filter(function (it) { return it.c.group === "D" || (it.c.note && it.c.group !== "A"); }).map(function (it) {
      return "#" + it.n + " " + line(it) + ": " + (it.c.note || "Needs review.");
    });
    if (opts.vat) {
      var vatq = items.filter(function (it) { return it.dir === "out" && it.c.group !== "A" && /Materials|Supplies|Unknown|Insurance|Phone/.test(it.c.category); });
      if (vatq.length) notes.push("VAT: reclaim only with a valid VAT invoice (a simplified invoice is fine up to £250) and only the business share of mixed-use costs. Lines to check: " + vatq.map(function (it) { return "#" + it.n; }).join(", ") + ".");
    }
    return {
      items: items, skipped: parsed.skipped, totals: totals, questions: q, later: later.map(function (it) { return it.n; }),
      message: message, whatsapp: whatsapp, notes: notes,
      counts: ["A", "B", "C", "D"].reduce(function (o, g) { o[g] = items.filter(function (it) { return it.c.group === g; }).length; return o; }, {})
    };
  }

  var api = { parseLines: parseLines, classify: classify, build: build, mask: mask };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var GROUP = { A: "A Confident", B: "B Likely", C: "C Ask client", D: "D Accountant" };

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("qb-go"), out = document.getElementById("qb-out");
    if (!btn || !out) return;
    function val(id) { var el = document.getElementById(id); return el ? el.value : ""; }
    function copyBtn(id) { return " <button type=\"button\" class=\"qb-copy\" data-for=\"" + id + "\">Copy</button>"; }
    btn.addEventListener("click", function () {
      var cur = val("qb-country") === "us" ? "$" : "£";
      var r = build(val("qb-lines"), {
        country: val("qb-country"), entity: val("qb-entity"), vat: val("qb-vat") === "yes",
        capital: parseFloat(val("qb-cap")) || 1000, replyBy: val("qb-reply") || "[date]", unsigned: val("qb-unsigned")
      });
      if (!r.items.length) { out.innerHTML = "<p><strong>No lines recognised.</strong> Each line needs a description and an amount, e.g. <code>05/09 AMZN MKTP UK 86.40 OUT</code>.</p>"; return; }
      var html = "<p><strong>" + r.items.length + " lines</strong>: " + r.counts.A + " confident, " + r.counts.B + " likely, " + r.counts.C + " to ask, " + r.counts.D + " for the accountant. Money in " + money(r.totals.in, cur) + ", money out " + money(r.totals.out, cur) + ": check these match your export.</p>";
      if (r.skipped.length) html += "<p><strong>Skipped " + r.skipped.length + " line(s)</strong> with no amount: " + esc(r.skipped.slice(0, 3).join(" | ")) + (r.skipped.length > 3 ? " …" : "") + "</p>";
      if (r.message) html += "<h3>Client message (" + r.questions + " questions)" + copyBtn("qb-msg") + "</h3><pre class=\"email\" id=\"qb-msg\">" + esc(r.message) + "</pre>";
      if (r.later.length) html += "<p>" + r.later.length + " smaller lines held back for next week (lines " + r.later.join(", ") + "), so the first list stays under 25.</p>";
      if (r.whatsapp) html += "<h3>WhatsApp or text version" + copyBtn("qb-sms") + "</h3><pre class=\"email\" id=\"qb-sms\">" + esc(r.whatsapp) + "</pre>";
      if (r.notes.length) html += "<h3>Notes for the accountant (not for the client)</h3><ul>" + r.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>";
      html += "<h3>Bookkeeping table</h3><div style=\"overflow-x:auto\"><table class=\"t\"><tr><th>#</th><th>Date</th><th>Description</th><th>Amount</th><th>In/Out</th><th>Proposed category</th><th>Group</th><th>Confidence</th></tr>";
      r.items.forEach(function (it) {
        html += "<tr><td>" + it.n + "</td><td>" + esc(it.date) + "</td><td>" + esc(it.desc) + "</td><td>" + it.amount.toFixed(2) + "</td><td>" + it.dir + "</td><td>" + esc(it.c.category) + "</td><td>" + GROUP[it.c.group] + "</td><td>" + it.c.confidence + "</td></tr>";
      });
      html += "</table></div><p class=\"small\">These are pattern-based guesses from the description only. Check before you post: every Low-confidence line and every accountant note.</p>";
      out.innerHTML = html;
      Array.prototype.forEach.call(out.querySelectorAll(".qb-copy"), function (b) {
        b.addEventListener("click", function () {
          var t = document.getElementById(b.getAttribute("data-for")).textContent;
          if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { b.textContent = "Copied"; });
        });
      });
    });
  });
})();
