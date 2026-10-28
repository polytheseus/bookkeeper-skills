// Bookkeeping fee calculator: works out a target hourly rate from the
// income you want, your overheads and your real billable hours; checks an
// existing client's effective rate; turns a client's monthly workload into a
// fixed monthly fee with the time behind it; prices a catch-up (clean-up)
// job with written assumptions; and builds a banded price list with add-ons
// as a CSV for Excel or Google Sheets. The task times are editable starting
// guesses, not market data. Runs in the browser and in node (module.exports)
// for tests. Nothing typed is sent anywhere.
(function () {
  // Minutes per item. Starting guesses only: the page tells users to time
  // three of their own clients and replace them.
  var TIMES = {
    txn: 1.0,          // code one bank-feed line (rules, matching)
    recon: 15,         // reconcile one bank or card account for a month
    bill: 2,           // enter or check one purchase bill or receipt
    invoice: 2,        // raise or check one sales invoice
    vatQ: 60,          // one quarterly VAT return (review + submit)
    vatM: 45,          // one monthly VAT return
    payrollRun: 20,    // fixed time per payroll run (RTI, pension, payslips)
    payrollEmp: 5,     // extra per employee per run
    cis: 20,           // one CIS monthly return
    report: 30,        // monthly management report or summary
    admin: 20          // client emails, queries, chasing per month
  };
  var RECORDS = { clean: 1.0, average: 1.15, messy: 1.35 };
  var CATCHUP = { statements: 20, some: 40, chaos: 70 };   // default contingency %
  var BANDS = [
    { name: "Essentials", txns: 50, accounts: 1, bills: 10, invoices: 5 },
    { name: "Standard", txns: 150, accounts: 2, bills: 30, invoices: 15 },
    { name: "Plus", txns: 300, accounts: 3, bills: 60, invoices: 30 }
  ];
  var VAT_RATE = 0.20;

  function num(v, dflt) {
    if (v === undefined || v === null || v === "") return dflt;
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(/[£$,\s]/g, ""));
    return isFinite(n) ? n : dflt;
  }
  function pos(v, dflt) { var n = num(v, dflt); return n < 0 ? 0 : n; }
  function roundUp(x, step) { step = step || 5; return x <= 0 ? 0 : Math.ceil(x / step - 1e-9) * step; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function money(x, cur) {
    var s = (Math.round(x * 100) / 100).toFixed(2).replace(/\.00$/, "");
    var parts = s.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (cur || "£") + parts.join(".");
  }
  function hrs(mins) { var h = mins / 60; return (Math.round(h * 10) / 10).toString(); }
  function times(over) {
    var t = {}, k;
    for (k in TIMES) t[k] = TIMES[k];
    if (over) for (k in over) if (t.hasOwnProperty(k)) t[k] = pos(over[k], t[k]);
    return t;
  }

  // Target hourly rate = (income wanted + overheads) / billable hours.
  function targetRate(o) {
    var income = pos(o.income, 0), overheads = pos(o.overheads, 0);
    var weeks = Math.min(pos(o.weeks, 46), 52), hpw = Math.min(pos(o.hoursPerWeek, 37.5), 100);
    var pct = Math.min(pos(o.billablePct, 65), 100);
    var hours = weeks * hpw * pct / 100;
    var warnings = [];
    if (hours <= 0) return { billableHours: 0, rate: 0, rateRounded: 0, warnings: ["Enter working weeks, hours and a billable percentage above zero."] };
    var rate = (income + overheads) / hours;
    if (pct > 80) warnings.push("Over 80% billable is rare for a solo practice once you count admin, chasing, CPD, marketing and software updates. 60-70% is a more usual planning figure.");
    if (weeks > 48) warnings.push("Over 48 working weeks leaves little room for holidays, bank holidays and sick days.");
    if (overheads === 0) warnings.push("No overheads entered. Software, insurance, AML supervision, membership and CPD all come out of your fees.");
    return { billableHours: Math.round(hours), rate: r2(rate), rateRounded: roundUp(rate, 1), warnings: warnings };
  }

  // Existing client: annual fee / hours spent.
  function effectiveRate(fee, hours, target) {
    fee = pos(fee, 0); hours = pos(hours, 0); target = pos(target, 0);
    if (hours <= 0) return null;
    var eff = fee / hours;
    var ratio = target > 0 ? eff / target : null;
    var verdict = ratio === null ? "" : ratio >= 1 ? "at or above target" : ratio >= 0.85 ? "a little under target" : ratio >= 0.7 ? "under target" : "well under target";
    var fair = target > 0 ? roundUp(target * hours, 5) : null;
    return { rate: r2(eff), ratio: ratio === null ? null : Math.round(ratio * 100), verdict: verdict, feeAtTarget: fair };
  }

  // Monthly workload -> minutes per task, then fee.
  function monthlyLines(c, t) {
    var L = [];
    function add(task, mins, note) { if (mins > 0) L.push({ task: task, mins: mins, note: note || "" }); }
    var txns = pos(c.txns, 0), accounts = pos(c.accounts, 0), bills = pos(c.bills, 0), inv = pos(c.invoices, 0);
    add("Code bank transactions", txns * t.txn, txns + " × " + t.txn + " min");
    add("Reconcile bank and card accounts", accounts * t.recon, accounts + " × " + t.recon + " min");
    add("Purchase bills and receipts", bills * t.bill, bills + " × " + t.bill + " min");
    add("Sales invoices", inv * t.invoice, inv + " × " + t.invoice + " min");
    if (c.vat === "quarterly") add("VAT return (quarterly, spread monthly)", t.vatQ / 3, t.vatQ + " min ÷ 3");
    if (c.vat === "monthly") add("VAT return (monthly)", t.vatM, t.vatM + " min");
    var emp = pos(c.employees, 0);
    if (emp > 0 && c.payroll && c.payroll !== "none") {
      var runs = c.payroll === "weekly" ? 52 / 12 : c.payroll === "fortnightly" ? 26 / 12 : c.payroll === "four-weekly" ? 13 / 12 : 1;
      add("Payroll (" + c.payroll + ", " + emp + (emp === 1 ? " employee" : " employees") + ")", runs * (t.payrollRun + emp * t.payrollEmp),
        (Math.round(runs * 100) / 100) + " runs × (" + t.payrollRun + " + " + emp + " × " + t.payrollEmp + " min)");
    }
    if (c.cis) add("CIS monthly return", t.cis, t.cis + " min");
    if (c.report) add("Monthly report or summary", t.report, t.report + " min");
    add("Client emails, queries and chasing", pos(c.admin, t.admin), "");
    return L;
  }

  function monthlyFee(c) {
    var t = times(c.times), rate = pos(c.rate, 0);
    var lines = monthlyLines(c, t);
    var base = lines.reduce(function (s, l) { return s + l.mins; }, 0);
    var factor = RECORDS[c.records] || 1;
    var cont = pos(c.contingency, 10);
    var mins = base * factor * (1 + cont / 100);
    var fee = rate * mins / 60;
    var rounded = roundUp(fee, 5);
    var warnings = [];
    if (rate <= 0) warnings.push("Work out your hourly rate first (step 1).");
    if (pos(c.txns, 0) > 0 && pos(c.accounts, 0) === 0) warnings.push("Transactions but no bank accounts: add at least one account to reconcile.");
    if (c.vat === "quarterly" || c.vat === "monthly") warnings.push("The VAT line covers the routine return only. Price VAT registration, partial exemption or corrections separately.");
    return {
      lines: lines.map(function (l) { return { task: l.task, mins: Math.round(l.mins), note: l.note }; }),
      baseMins: Math.round(base), factor: factor, contingency: cont, mins: Math.round(mins),
      hours: Math.round(mins / 6) / 10, fee: r2(fee), feeRounded: rounded, annual: rounded * 12,
      withVat: c.vatRegistered ? r2(rounded * (1 + VAT_RATE)) : null, warnings: warnings
    };
  }

  // Catch-up bookkeeping (clean-up): months behind x monthly coding work,
  // plus a contingency that depends on what records exist.
  function catchUp(c) {
    var t = times(c.times), rate = pos(c.rate, 0);
    var months = Math.min(pos(c.months, 0), 120), txns = pos(c.txnsPerMonth, 0), accounts = pos(c.accounts, 1);
    var state = CATCHUP.hasOwnProperty(c.state) ? c.state : "some";
    var cont = c.contingency === undefined || c.contingency === "" ? CATCHUP[state] : pos(c.contingency, CATCHUP[state]);
    var vatReturns = pos(c.vatReturns, 0);
    var lines = [];
    function add(task, mins, note) { if (mins > 0) lines.push({ task: task, mins: Math.round(mins), note: note }); }
    add("Code " + Math.round(months * txns) + " transactions", months * txns * t.txn, months + " months × " + txns + " × " + t.txn + " min");
    add("Reconcile " + accounts + (accounts === 1 ? " account" : " accounts") + " for " + months + " months", months * accounts * t.recon, months * accounts + " × " + t.recon + " min");
    if (vatReturns > 0) add("VAT returns (" + vatReturns + ")", vatReturns * t.vatQ, vatReturns + " × " + t.vatQ + " min");
    add("Set-up, query list and review", 60 + months * 10, "60 min + 10 min a month");
    var base = lines.reduce(function (s, l) { return s + l.mins; }, 0);
    var mins = base * (1 + cont / 100);
    var fee = rate * mins / 60, rounded = roundUp(fee, 25);
    var cur = c.currency || "£";
    var deposit = Math.min(pos(c.depositPct, 50), 100);
    var depAmt = roundUp(rounded * deposit / 100, 5);
    var period = (c.period || "").trim();
    var stateText = { statements: "full bank statements and most receipts are available", some: "bank statements are available but some receipts and invoices are missing", chaos: "bank statements still need to be downloaded or requested and many documents are missing" }[state];
    var quote = "Catch-up bookkeeping" + (period ? " for " + period : " for " + months + (months === 1 ? " month" : " months")) + ": " +
      accounts + (accounts === 1 ? " bank or card account" : " bank and card accounts") + ", about " + Math.round(months * txns).toLocaleString("en-GB") + " transactions, brought to reconciled balances" + (vatReturns > 0 ? " with " + vatReturns + " VAT " + (vatReturns === 1 ? "return" : "returns") + " prepared" : "") + ".\n\n" +
      "Fixed fee: " + money(rounded, cur) + (c.vatRegistered ? " plus VAT" : "") + (deposit > 0 ? ", with " + money(depAmt, cur) + " (" + deposit + "%) paid before work starts and the balance on completion" : "") + ".\n\n" +
      "This fee assumes:\n" +
      "- " + stateText.charAt(0).toUpperCase() + stateText.slice(1) + ".\n" +
      "- No more than about " + Math.round(months * txns * 1.1).toLocaleString("en-GB") + " transactions in total (10% over the estimate is included).\n" +
      "- You answer our query list within 7 days.\n" +
      "- Work that turns out to be outside this (extra accounts, earlier periods, HMRC correspondence, tax returns) is quoted separately before we start it.";
    var warnings = [];
    if (rate <= 0) warnings.push("Work out your hourly rate first (step 1).");
    if (months === 0 || txns === 0) warnings.push("Enter the months behind and transactions per month.");
    if (cont < 15) warnings.push("Catch-up work almost always takes longer than the estimate. Under 15% contingency is risky.");
    return { lines: lines, baseMins: Math.round(base), contingency: cont, mins: Math.round(mins), hours: Math.round(mins / 6) / 10, fee: r2(fee), feeRounded: rounded, deposit: depAmt, quote: quote, warnings: warnings };
  }

  // Banded price list: each band priced as a typical client at the top of
  // the band, plus add-ons priced from the same task times.
  function priceList(c) {
    var t = times(c.times), rate = pos(c.rate, 0), cur = c.currency || "£";
    var cont = pos(c.contingency, 10), factor = RECORDS[c.records] || 1;
    var bands = (c.bands || BANDS).map(function (b, i) {
      var mf = monthlyFee({ rate: rate, txns: b.txns, accounts: b.accounts, bills: b.bills, invoices: b.invoices, report: !!c.report, admin: c.admin, records: c.records, contingency: cont, times: c.times });
      return { name: b.name, upTo: b.txns, accounts: b.accounts, fee: mf.feeRounded, hours: mf.hours, from: i === 0 ? 0 : (c.bands || BANDS)[i - 1].txns + 1 };
    });
    function addOn(name, mins, unit) { return { name: name, fee: roundUp(rate * mins * factor * (1 + cont / 100) / 60, 5), unit: unit }; }
    var addons = [
      addOn("Quarterly VAT return", t.vatQ, "per return"),
      addOn("Payroll, monthly", t.payrollRun + t.payrollEmp, "per month for the first employee"),
      addOn("Each extra employee", t.payrollEmp, "per employee per month"),
      addOn("CIS monthly return", t.cis, "per month"),
      addOn("Extra bank or card account", t.recon, "per account per month"),
      addOn("Every 50 transactions over the band", 50 * t.txn, "per month"),
      addOn("Catch-up month (up to 100 transactions)", (100 * t.txn + t.recon) * (1 + CATCHUP.some / 100), "per month behind")
    ];
    var vatNote = c.vatRegistered ? " (plus VAT)" : "";
    var csv = [["Package or add-on", "Includes", "Price", "Per"]];
    bands.forEach(function (b) { csv.push([b.name, (b.from ? b.from + "-" : "Up to ") + b.upTo + " transactions a month, " + b.accounts + (b.accounts === 1 ? " bank account" : " bank accounts") + (c.report ? ", monthly report" : ""), money(b.fee, cur) + vatNote, "month"]); });
    addons.forEach(function (a) { csv.push([a.name, "", money(a.fee, cur) + vatNote, a.unit]); });
    var text = csv.slice(1).map(function (r) { return r[0] + (r[1] ? " (" + r[1] + ")" : "") + ": " + r[2] + " " + (r[3] === "month" ? "a month" : r[3]); }).join("\n");
    return { bands: bands, addons: addons, csv: toCsv(csv), text: text };
  }

  function cell(v) {
    var s = String(v);
    if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(rows) { return rows.map(function (r) { return r.map(cell).join(","); }).join("\r\n") + "\r\n"; }

  var api = { TIMES: TIMES, RECORDS: RECORDS, CATCHUP: CATCHUP, BANDS: BANDS, targetRate: targetRate, effectiveRate: effectiveRate, monthlyFee: monthlyFee, catchUp: catchUp, priceList: priceList, roundUp: roundUp, money: money, toCsv: toCsv };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  // ---- Browser wiring ----
  function $(id) { return document.getElementById(id); }
  function v(id) { var el = $(id); return el ? el.value : ""; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); }
  function warn(list) { return list.length ? "<p class=\"qb-warn\">" + list.map(esc).join("<br>") + "</p>" : ""; }
  function userTimes() {
    var o = {};
    Object.keys(TIMES).forEach(function (k) { var el = $("fc-t-" + k); if (el && el.value !== "") o[k] = el.value; });
    return o;
  }
  function cur() { return v("fc-cur") === "$" ? "$" : "£"; }
  function vatReg() { var el = $("fc-vatreg"); return !!(el && el.checked && cur() === "£"); }
  function copyBtn(btn, text) {
    btn.onclick = function () {
      var msg = btn.nextElementSibling;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { msg.textContent = "Copied."; }, function () { msg.textContent = "Select the text and copy it."; });
      else msg.textContent = "Select the text and copy it.";
    };
  }
  function table(lines, totalMins, extra, head) {
    var h = "<table class=\"t\"><tr><th>Task</th><th>" + (head || "Minutes a month") + "</th><th>Working</th></tr>";
    lines.forEach(function (l) { h += "<tr><td>" + esc(l.task) + "</td><td>" + l.mins + "</td><td>" + esc(l.note) + "</td></tr>"; });
    if (extra) h += "<tr><td>" + esc(extra[0]) + "</td><td>" + extra[1] + "</td><td>" + esc(extra[2]) + "</td></tr>";
    return h + "<tr><th>Total</th><th>" + totalMins + "</th><th>" + hrs(totalMins) + " hours</th></tr></table>";
  }

  function run() {
    var c = cur();
    document.querySelectorAll(".fc-cur").forEach(function (el) { el.textContent = c; });
    var vatBox = $("fc-vatreg-wrap"); if (vatBox) vatBox.hidden = c !== "£";

    var tr = targetRate({ income: v("fc-income"), overheads: v("fc-overheads"), weeks: v("fc-weeks"), hoursPerWeek: v("fc-hpw"), billablePct: v("fc-billable") });
    var rate = tr.rateRounded;
    $("fc-rate-out").innerHTML = tr.billableHours ? "<p class=\"qb-due\"><strong>Target rate: " + money(rate, c) + " an hour</strong>" + (vatReg() ? " (plus VAT)" : "") + ". That's " + money(num(v("fc-income"), 0) + num(v("fc-overheads"), 0), c) + " ÷ " + tr.billableHours.toLocaleString("en-GB") + " billable hours a year (" + v("fc-weeks") + " weeks × " + v("fc-hpw") + " hours × " + v("fc-billable") + "%).</p>" + warn(tr.warnings) : warn(tr.warnings);

    var er = effectiveRate(v("fc-cfee"), v("fc-chours"), rate);
    $("fc-eff-out").innerHTML = er ? "<p class=\"" + (er.ratio >= 100 ? "qb-due" : "qb-warn") + "\">Effective rate: <strong>" + money(er.rate, c) + " an hour</strong>, " + er.ratio + "% of your target (" + esc(er.verdict) + "). At your target rate this client's annual fee would be " + money(er.feeAtTarget, c) + ".</p>" : "";

    var client = { rate: rate, txns: v("fc-txns"), accounts: v("fc-accounts"), bills: v("fc-bills"), invoices: v("fc-invoices"), vat: v("fc-vat"), employees: v("fc-emp"), payroll: v("fc-payroll"), cis: $("fc-cis").checked, report: $("fc-report").checked, admin: v("fc-admin"), records: v("fc-records"), contingency: v("fc-cont"), times: userTimes(), vatRegistered: vatReg() };
    var mf = monthlyFee(client);
    var extraMins = mf.mins - mf.baseMins;
    $("fc-month-out").innerHTML = table(mf.lines, mf.mins, extraMins ? ["Records allowance (×" + mf.factor + ") and " + mf.contingency + "% contingency", extraMins, ""] : null) +
      "<p class=\"qb-due\"><strong>Monthly fee: " + money(mf.feeRounded, c) + "</strong>" + (mf.withVat !== null ? " plus VAT (" + money(mf.withVat, c) + " including VAT)" : "") + ", " + money(mf.annual, c) + " a year. " + mf.hours + " hours a month at " + money(rate, c) + " = " + money(mf.fee, c) + ", rounded up to the next " + c + "5.</p>" + warn(mf.warnings);

    var cu = catchUp({ rate: rate, months: v("fc-cu-months"), txnsPerMonth: v("fc-cu-txns"), accounts: v("fc-cu-accounts"), state: v("fc-cu-state"), vatReturns: v("fc-cu-vat"), contingency: v("fc-cu-cont"), depositPct: v("fc-cu-dep"), period: v("fc-cu-period"), times: userTimes(), currency: c, vatRegistered: vatReg() });
    $("fc-cu-out").innerHTML = table(cu.lines, cu.mins, ["Contingency " + cu.contingency + "%", cu.mins - cu.baseMins, ""], "Minutes") +
      "<p class=\"qb-due\"><strong>Catch-up fee: " + money(cu.feeRounded, c) + "</strong>" + (vatReg() ? " plus VAT" : "") + " (" + cu.hours + " hours, rounded up to the next " + c + "25)" + (cu.deposit ? "; deposit " + money(cu.deposit, c) : "") + ".</p>" + warn(cu.warnings) +
      "<p><strong>Quote with assumptions</strong> (edit before sending):</p><pre class=\"email\" id=\"fc-cu-quote\">" + esc(cu.quote) + "</pre><p><button type=\"button\" id=\"fc-cu-copy\" class=\"ghost\">Copy quote</button> <span aria-live=\"polite\"></span></p>";
    copyBtn($("fc-cu-copy"), cu.quote);

    var pl = priceList({ rate: rate, contingency: v("fc-cont"), records: "average", report: $("fc-report").checked, admin: v("fc-admin"), times: userTimes(), currency: c, vatRegistered: vatReg() });
    var h = "<table class=\"t\"><tr><th>Package or add-on</th><th>Price</th><th>Per</th></tr>";
    pl.bands.forEach(function (b) { h += "<tr><td><strong>" + esc(b.name) + "</strong>: " + (b.from ? b.from + "–" : "up to ") + b.upTo + " transactions a month, " + b.accounts + (b.accounts === 1 ? " bank account" : " bank accounts") + "</td><td>" + money(b.fee, c) + "</td><td>month</td></tr>"; });
    pl.addons.forEach(function (a) { h += "<tr><td>" + esc(a.name) + "</td><td>" + money(a.fee, c) + "</td><td>" + esc(a.unit) + "</td></tr>"; });
    h += "</table>" + (vatReg() ? "<p class=\"small\">Prices are before VAT.</p>" : "") +
      "<p><button type=\"button\" id=\"fc-csv\">Download price list (.csv)</button> <button type=\"button\" id=\"fc-pl-copy\" class=\"ghost\">Copy as text</button> <span aria-live=\"polite\"></span></p>";
    $("fc-pl-out").innerHTML = h;
    $("fc-csv").onclick = function () {
      var blob = new Blob(["﻿" + pl.csv], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "bookkeeping-price-list.csv";
      document.body.appendChild(a); a.click(); a.remove();
    };
    copyBtn($("fc-pl-copy"), pl.text);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var tool = $("fc-tool");
    if (!tool) return;
    Object.keys(TIMES).forEach(function (k) { var el = $("fc-t-" + k); if (el && el.value === "") el.value = TIMES[k]; });
    tool.addEventListener("input", run);
    tool.addEventListener("change", run);
    $("fc-cu-state").addEventListener("change", function () { $("fc-cu-cont").value = CATCHUP[v("fc-cu-state")]; run(); });
    run();
  });
})();
