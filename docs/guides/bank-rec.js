// Bank reconciliation builder: takes the statement closing balance, the
// balance in the books (cash book or accounting software) and the items on
// one side but not the other, and returns a two-sided reconciliation
// statement (adjusted bank balance vs adjusted book balance), the
// unexplained difference with likely causes (transposition, sign reversed,
// missing or doubled item), warnings for stale or misdated items, and a CSV
// for Excel or Google Sheets. UK or US wording. Runs in the browser and in
// node (module.exports) for tests. Nothing typed is sent anywhere.
(function () {
  var WORDS = {
    uk: {
      sym: "£", dit: "Uncleared lodgements (paid in, not yet on the statement)", out: "Unpresented cheques and payments (paid out, not yet on the statement)",
      ditShort: "Uncleared lodgements", outShort: "Unpresented payments", books: "cash book", cheque: "cheque", date: "dmy"
    },
    us: {
      sym: "$", dit: "Deposits in transit (in the books, not yet on the statement)", out: "Outstanding checks and payments (in the books, not yet on the statement)",
      ditShort: "Deposits in transit", outShort: "Outstanding checks", books: "books", cheque: "check", date: "mdy"
    }
  };

  // Money in pence/cents so sums never drift (0.1 + 0.2).
  function toMinor(n) { return Math.round(n * 100); }
  function fmt(minor, sym) {
    var neg = minor < 0, a = Math.abs(minor);
    var s = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + ("0" + (a % 100)).slice(-2);
    return (neg ? "-" : "") + (sym || "") + s;
  }

  // Parses "1,234.56", "£1,234.56", "-250", "(250.00)", "250.00 DR", "250 CR".
  function parseAmount(s) {
    s = String(s == null ? "" : s).trim();
    if (!s) return null;
    var neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
    var m = s.match(/\s*(DR|CR)$/i);
    if (m) { if (m[1].toUpperCase() === "DR") neg = !neg; s = s.slice(0, m.index).trim(); }
    if (/^-/.test(s)) { neg = !neg; s = s.slice(1).trim(); }
    s = s.replace(/^[£$€]/, "").trim();
    if (/^-/.test(s)) { neg = !neg; s = s.slice(1).trim(); }
    if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return null;
    var v = toMinor(parseFloat(s.replace(/,/g, "")));
    return neg ? -v : v;
  }

  // Dates at the start of a line: 2026-10-14, 14/10/2026, 14/10/26, 14-10-2026
  // (day first in the UK, month first in the US), or "14 Oct" / "Oct 14"
  // (year taken from the reconciliation date).
  var MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function utc(y, m, d) {
    var dt = new Date(Date.UTC(y, m, d));
    return dt.getUTCMonth() === m && dt.getUTCDate() === d ? dt : null;
  }
  function parseDate(s, order, refYear) {
    s = String(s || "").trim();
    var m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return utc(+m[1], +m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/))) {
      var y = +m[3]; if (y < 100) y += 2000;
      return order === "mdy" ? utc(y, +m[1] - 1, +m[2]) : utc(y, +m[2] - 1, +m[1]);
    }
    if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?(?:\s+(\d{4}))?$/)) && MON.indexOf(m[2].toLowerCase()) >= 0)
      return utc(m[3] ? +m[3] : refYear, MON.indexOf(m[2].toLowerCase()), +m[1]);
    if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?(?:\s+(\d{4}))?$/)) && MON.indexOf(m[1].toLowerCase()) >= 0)
      return utc(m[3] ? +m[3] : refYear, MON.indexOf(m[1].toLowerCase()), +m[2]);
    return null;
  }
  function iso(dt) { return dt ? dt.toISOString().slice(0, 10) : ""; }

  // One item per line: "date | description | amount", tab-separated, or
  // free text whose last number is the amount. Date optional.
  var AMT_END = /(\(?\s*-?\s*[£$€]?\s*-?\d[\d,]*(?:\.\d{1,2})?\s*\)?(?:\s*(?:DR|CR))?)\s*$/i;
  function parseLines(text, order, refYear) {
    var items = [], bad = [];
    String(text || "").split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      var parts = line.indexOf("|") >= 0 ? line.split("|") : line.indexOf("\t") >= 0 ? line.split("\t") : null;
      var date = null, desc = "", amt = null;
      if (parts) {
        parts = parts.map(function (p) { return p.trim(); }).filter(function (p) { return p !== ""; });
        if (parts.length) amt = parseAmount(parts[parts.length - 1]);
        if (parts.length > 1) date = parseDate(parts[0], order, refYear);
        desc = parts.slice(date ? 1 : 0, -1).join(" ");
      } else {
        var m = line.match(AMT_END);
        if (m) {
          amt = parseAmount(m[1].replace(/\s+/g, " ").replace(/\(\s+/, "(").replace(/\s+\)/, ")").replace(/^-\s+/, "-"));
          var rest = line.slice(0, m.index).trim();
          var dm = rest.match(/^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\.?(?:\s+\d{4})?|[A-Za-z]{3,9}\.?\s+\d{1,2},?(?:\s+\d{4})?)(?=\s|$)/);
          if (dm) { date = parseDate(dm[1], order, refYear); if (date) rest = rest.slice(dm[0].length).trim(); }
          desc = rest.replace(/^[,;:\-–]\s*/, "");
        }
      }
      if (amt === null) { bad.push(line); return; }
      items.push({ date: date, desc: desc || "(no description)", amount: amt });
    });
    return { items: items, bad: bad };
  }

  function csvCell(s) { s = String(s == null ? "" : s); if (/^[=+\-@]/.test(s) && !/^-\d+(\.\d+)?$/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s; }
  function sum(list) { return list.reduce(function (a, x) { return a + x.amount; }, 0); }
  function days(a, b) { return Math.round((b.getTime() - a.getTime()) / 86400000); }

  // Why might the books and the bank still disagree by `diff` (minor units)?
  function hints(diff, all, W) {
    var out = [], a = Math.abs(diff);
    if (!a) return out;
    all.forEach(function (x) {
      if (Math.abs(x.amount) === a) out.push("An item is exactly " + fmt(a, W.sym) + ": " + x.desc + " (" + x.list + "). Check it's on the right list, or that it hasn't been entered twice or missed in the " + W.books + ".");
      else if (Math.abs(x.amount) * 2 === a) out.push("Half the difference is " + fmt(a / 2, W.sym) + ", the same as " + x.desc + " (" + x.list + "). An item entered the wrong way round (money in as money out, or the reverse) makes a difference of twice its amount.");
    });
    if (a % 9 === 0) out.push("The difference divides exactly by 9 (" + fmt(a, "") + " ÷ 9 = " + fmt(a / 9, "") + "), the classic sign of two digits swapped (e.g. 54.00 keyed as 45.00) or a misplaced decimal point (e.g. 1,000.00 keyed as 100.00). Compare each amount with the statement digit by digit.");
    if (a % 100 === 0 && a >= 1000) out.push("A round difference often means a typing slip in the pounds or dollars, or an opening balance that changed. Check last month's reconciled balance hasn't been altered by an edit to a closed period.");
    if (a % 2 === 0) out.push("Look for an entry of " + fmt(a / 2, W.sym) + " posted the wrong way round in the " + W.books + " (a receipt as a payment, or the reverse): that creates a difference of twice the amount.");
    out.push("Look for a single entry of " + fmt(a, W.sym) + " missing from, or entered twice in, the " + W.books + " or the lists above.");
    return out;
  }

  function build(opts) {
    var W = WORDS[opts.country === "us" ? "us" : "uk"];
    var order = W.date;
    var recDate = parseDate(opts.date, "dmy", 2026) || parseDate(opts.date, order, 2026);
    var refYear = recDate ? recDate.getUTCFullYear() : new Date().getUTCFullYear();
    var errors = [], warnings = [];
    var bank = parseAmount(opts.bank), books = parseAmount(opts.books);
    if (bank === null) errors.push("Enter the closing balance on the bank statement (a negative number, or DR, for an overdraft).");
    if (books === null) errors.push("Enter the balance in your " + W.books + " or accounting software on the same date.");

    var lists = {};
    [["dit", W.ditShort], ["out", W.outShort], ["bankOnly", "On the statement, not in the " + W.books]].forEach(function (k) {
      var p = parseLines(opts[k[0]], order, refYear);
      p.bad.forEach(function (b) { errors.push("Couldn't find an amount in this line (" + k[1] + "): \"" + b + "\". Put the amount last, e.g. \"14/10 | Cheque 1043 | 250.00\"."); });
      p.items.forEach(function (x) { x.list = k[1]; });
      lists[k[0]] = p.items;
    });
    if (errors.length) return { ok: false, errors: errors };

    // Items in transit are amounts, not signed movements: a negative entry
    // on these two lists is almost always a typing slip, so use its size and say so.
    ["dit", "out"].forEach(function (k) {
      lists[k].forEach(function (x) {
        if (x.amount < 0) { x.amount = -x.amount; warnings.push("\"" + x.desc + "\" was entered as a negative on " + x.list + ". The tool uses " + fmt(x.amount, W.sym) + ": the list already decides whether it adds or subtracts."); }
      });
    });

    var dit = sum(lists.dit), out = sum(lists.out), bankOnly = sum(lists.bankOnly);
    var bankIn = lists.bankOnly.filter(function (x) { return x.amount >= 0; });
    var bankOutL = lists.bankOnly.filter(function (x) { return x.amount < 0; });
    var adjBank = bank + dit - out;
    var adjBooks = books + bankOnly;
    var diff = adjBank - adjBooks;

    var all = lists.dit.concat(lists.out, lists.bankOnly);
    if (recDate) {
      all.forEach(function (x) {
        if (!x.date) return;
        var age = days(x.date, recDate);
        if (age < 0) warnings.push("\"" + x.desc + "\" is dated " + iso(x.date) + ", after the reconciliation date. It belongs in next month's reconciliation unless the date is a typo.");
        else if (x.list === W.ditShort && age > 7) warnings.push("\"" + x.desc + "\" was paid in " + age + " days before the reconciliation date and still isn't on the statement. Deposits usually clear within a few working days: check it was actually banked, and with the client.");
        else if (x.list === W.outShort && age > 182) warnings.push("\"" + x.desc + "\" has been outstanding for over 6 months. Banks often won't pay a " + W.cheque + " that old" + (W.cheque === "check" ? " (UCC § 4-404)" : "") + ". Ask the client whether it should be reissued or cancelled, and agree the entry with the accountant.");
        else if (x.list === W.outShort && age > 60) warnings.push("\"" + x.desc + "\" has been outstanding for " + age + " days. Ask the client whether the payee received it.");
      });
    }
    if (!recDate && all.some(function (x) { return x.date; })) warnings.push("Add the reconciliation date to check for stale and misdated items.");

    var name = String(opts.account || "").trim() || "Bank account";
    var dateLabel = recDate ? iso(recDate) : String(opts.date || "").trim();
    var title = "Bank reconciliation: " + name + (dateLabel ? " at " + dateLabel : "");

    function rows(list, sign) {
      return list.map(function (x) { return { date: iso(x.date), desc: x.desc, amount: sign * Math.abs(x.amount) }; });
    }
    var sections = [
      { side: "bank", label: "Balance per bank statement", total: bank },
      { side: "bank", label: "Add: " + W.dit, items: rows(lists.dit, 1), total: dit },
      { side: "bank", label: "Less: " + W.out, items: rows(lists.out, -1), total: -out },
      { side: "bank", label: "Adjusted bank balance", total: adjBank, strong: true },
      { side: "books", label: "Balance per " + W.books, total: books },
      { side: "books", label: "Add: money in on the statement, not yet in the " + W.books + " (interest, receipts)", items: rows(bankIn, 1), total: sum(bankIn) },
      { side: "books", label: "Less: money out on the statement, not yet in the " + W.books + " (charges, direct debits, fees)", items: rows(bankOutL, -1), total: sum(bankOutL) },
      { side: "books", label: "Adjusted " + W.books + " balance", total: adjBooks, strong: true }
    ];

    var lines = [title, ""];
    var csv = ["Section,Date,Description,Amount"];
    sections.forEach(function (s) {
      if (s.items && !s.items.length) return;
      if (s.items) {
        lines.push(s.label);
        s.items.forEach(function (x) {
          lines.push("  " + (x.date ? x.date + "  " : "") + x.desc + "  " + fmt(x.amount, W.sym));
          csv.push([s.label, x.date, x.desc, fmt(x.amount, "").replace(/,/g, "")].map(csvCell).join(","));
        });
        lines.push("  Total " + fmt(s.total, W.sym));
      } else {
        lines.push(s.label + ": " + fmt(s.total, W.sym));
        csv.push([s.label, "", "", fmt(s.total, "").replace(/,/g, "")].map(csvCell).join(","));
        if (s.strong) lines.push("");
      }
    });
    lines.push(diff === 0 ? "Difference: 0.00. Reconciled." : "Unexplained difference: " + fmt(diff, W.sym) + " (adjusted bank minus adjusted " + W.books + ")");
    csv.push(["Unexplained difference", "", "", fmt(diff, "").replace(/,/g, "")].map(csvCell).join(","));
    if (lists.bankOnly.length) lines.push("", "To do: post the " + lists.bankOnly.length + " statement-only item" + (lists.bankOnly.length > 1 ? "s" : "") + " in the " + W.books + ", so next month starts from the adjusted balance.");
    lines.push("", "Prepared by: ________  Date: ________  Reviewed by: ________");

    return {
      ok: true, reconciled: diff === 0, sym: W.sym, words: W, title: title, sections: sections,
      bank: bank, books: books, adjBank: adjBank, adjBooks: adjBooks, diff: diff,
      hints: hints(diff, all, W), warnings: warnings, toPost: lists.bankOnly.length,
      text: lines.join("\n"), csv: csv.join("\r\n") + "\r\n"
    };
  }

  var api = { build: build, parseAmount: parseAmount, parseDate: parseDate, parseLines: parseLines, fmt: fmt, iso: iso, WORDS: WORDS };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  // ---- page wiring ----
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function syncCountry() {
    var W = WORDS[$("br-country").value];
    $("br-dit-l").textContent = W.dit;
    $("br-out-l").textContent = W.out;
    $("br-books-l").firstChild.textContent = "Balance in your " + W.books + " or software on the same date ";
    $("br-bankonly-l").firstChild.textContent = "On the statement but not yet in your " + W.books + " ";
    Array.prototype.forEach.call(document.querySelectorAll(".br-sym"), function (el) { el.textContent = W.sym; });
  }
  function read() {
    return {
      country: $("br-country").value, account: $("br-account").value, date: $("br-date").value,
      bank: $("br-bank").value, books: $("br-books").value,
      dit: $("br-dit").value, out: $("br-out").value, bankOnly: $("br-bankonly").value
    };
  }
  function run() {
    var res = build(read()), out = $("br-out-res");
    if (!res.ok) { out.innerHTML = res.errors.map(function (e) { return "<p class=\"qb-warn\">" + esc(e) + "</p>"; }).join(""); return; }
    var h = "<h3>" + esc(res.title) + "</h3><table class=\"t br-st\">";
    var side = "";
    res.sections.forEach(function (s) {
      if (s.items && !s.items.length) return;
      if (s.side !== side) { side = s.side; h += "<tr><th colspan=\"2\">" + (side === "bank" ? "Bank side" : "Books side") + "</th></tr>"; }
      if (s.items) {
        h += "<tr><td colspan=\"2\">" + esc(s.label) + "</td></tr>";
        s.items.forEach(function (x) { h += "<tr class=\"br-item\"><td>" + (x.date ? esc(x.date) + " · " : "") + esc(x.desc) + "</td><td class=\"num\">" + esc(fmt(x.amount, res.sym)) + "</td></tr>"; });
      } else {
        h += "<tr" + (s.strong ? " class=\"br-tot\"" : "") + "><td>" + esc(s.label) + "</td><td class=\"num\">" + esc(fmt(s.total, res.sym)) + "</td></tr>";
      }
    });
    h += "</table>";
    h += res.reconciled
      ? "<p class=\"qb-due\"><strong>Reconciled.</strong> The adjusted bank balance and the adjusted " + esc(res.words.books) + " balance agree.</p>"
      : "<p class=\"qb-warn\"><strong>Unexplained difference: " + esc(fmt(res.diff, res.sym)) + "</strong> (adjusted bank minus adjusted " + esc(res.words.books) + "). Don't post it to suspense: find it. Likely causes, most specific first:</p><ul>" + res.hints.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (res.toPost) h += "<p>Next: post the " + res.toPost + " statement-only item" + (res.toPost > 1 ? "s" : "") + " in the " + esc(res.words.books) + ", so next month starts from the adjusted balance.</p>";
    res.warnings.forEach(function (w) { h += "<p class=\"qb-warn\">" + esc(w) + "</p>"; });
    h += "<p><button type=\"button\" id=\"br-csv\">Download for Excel / Sheets (.csv)</button> <button type=\"button\" id=\"br-copy\" class=\"ghost\">Copy as text</button> <button type=\"button\" id=\"br-print\" class=\"ghost\">Print</button> <span id=\"br-msg\" aria-live=\"polite\"></span></p>";
    out.innerHTML = h;
    $("br-csv").onclick = function () {
      var blob = new Blob(["﻿" + res.csv], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "bank-reconciliation" + (res.title.indexOf(" at ") > 0 ? "-" + res.title.split(" at ").pop() : "") + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
    };
    $("br-copy").onclick = function () {
      var done = function () { $("br-msg").textContent = "Copied."; };
      if (navigator.clipboard) navigator.clipboard.writeText(res.text).then(done, function () { $("br-msg").textContent = "Copy failed: select the table and copy instead."; });
    };
    $("br-print").onclick = function () { window.print(); };
  }
  function example() {
    var uk = $("br-country").value === "uk";
    $("br-account").value = "Business current account";
    $("br-date").value = "2026-10-31";
    $("br-bank").value = "4,812.40";
    $("br-books").value = "3,704.15";
    $("br-dit").value = uk ? "30/10/2026 | Paid in: Harper invoice 1187 | 1,250.00" : "10/30/2026 | Deposit: Harper invoice 1187 | 1,250.00";
    $("br-out").value = uk
      ? "27/10/2026 | Cheque 000412 Ashdown Supplies | 486.00\n29/10/2026 | Faster Payment to J Mills (pending) | 1,920.00"
      : "10/27/2026 | Check 412 Ashdown Supplies | 486.00\n10/29/2026 | ACH to J Mills (pending) | 1,920.00";
    $("br-bankonly").value = uk
      ? "31/10/2026 | Monthly account fee | -8.50\n31/10/2026 | Interest | 2.75\n28/10/2026 | Direct debit: phone contract | -42.00"
      : "10/31/2026 | Monthly service fee | -8.50\n10/31/2026 | Interest | 2.75\n10/28/2026 | Autopay: phone contract | -42.00";
    run();
  }
  $("br-country").onchange = syncCountry;
  $("br-go").onclick = run;
  $("br-example").onclick = example;
  syncCountry();
})();
