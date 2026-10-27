// Month-end close checklist builder: turns a client's set-up (UK or US,
// accruals or cash basis, company or sole trader, VAT or sales tax, payroll,
// CIS, payment processors, stock, foreign currency, loans) and the month
// being closed into a dated checklist on working days (weekends and the
// chosen bank holidays skipped), the tax and payroll deadlines that follow
// that month, and a CSV for Excel or Google Sheets. Runs in the browser and
// in node (module.exports) for tests. Nothing typed is sent anywhere.
(function () {
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Bank holidays 2026-2027. UK: gov.uk/bank-holidays.json (fetched
  // 27 Oct 2026). US: OPM federal holiday schedule (observed dates).
  // Upkeep: add the next year each October.
  var HOLIDAYS = {
    ew: ["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
      "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28"],
    sc: ["2026-01-01", "2026-01-02", "2026-04-03", "2026-05-04", "2026-05-25", "2026-06-15", "2026-08-03", "2026-11-30", "2026-12-25", "2026-12-28",
      "2027-01-01", "2027-01-04", "2027-03-26", "2027-05-03", "2027-05-31", "2027-08-02", "2027-11-30", "2027-12-27", "2027-12-28"],
    ni: ["2026-01-01", "2026-03-17", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-07-13", "2026-08-31", "2026-12-25", "2026-12-28",
      "2027-01-01", "2027-03-17", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-07-12", "2027-08-30", "2027-12-27", "2027-12-28"],
    us: ["2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
      "2027-01-01", "2027-01-18", "2027-02-15", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-10-11", "2027-11-11", "2027-11-25", "2027-12-24"],
    none: []
  };
  var HOL_YEARS = [2026, 2027];

  // Dates are handled as UTC midnight so the day never shifts with time zone.
  function d(y, m, day) { return new Date(Date.UTC(y, m, day)); }
  function iso(dt) { return dt.toISOString().slice(0, 10); }
  function addDays(dt, n) { return new Date(dt.getTime() + n * 86400000); }
  function nice(dt) { return DAYS[dt.getUTCDay()] + " " + dt.getUTCDate() + " " + MONTHS[dt.getUTCMonth()].slice(0, 3) + " " + dt.getUTCFullYear(); }
  function isWorking(dt, hol) { var w = dt.getUTCDay(); return w !== 0 && w !== 6 && hol.indexOf(iso(dt)) < 0; }

  // Working day n after month end: 1 = first working day of the next month.
  // 0 = the last working day of the month itself.
  function workingDay(y, m, n, hol) {
    var dt = d(y, m + 1, 0);
    if (n <= 0) { while (!isWorking(dt, hol)) dt = addDays(dt, -1); return dt; }
    var c = 0;
    while (c < n) { dt = addDays(dt, 1); if (isWorking(dt, hol)) c++; }
    return dt;
  }

  // Each task: stage (1 before month end ... 5 sign-off), the group it sits
  // in, the text, and when it applies. Stages map to working days so the
  // last stage lands on the target day.
  var TASKS = [
    { s: 0, g: "Before month end", t: "Remind the client what you need and by when (statements, receipts, sales list, payroll changes).", when: "all" },
    { s: 0, g: "Before month end", t: "Check every sales invoice for work done this month is raised (compare with the job list or bookings).", when: "all" },
    { s: 0, g: "Before month end", t: "Confirm this month's payroll has been run and approved.", when: "payroll" },
    { s: 1, g: "Cash", t: "Reconcile every bank and credit card account to its month-end statement balance. Note both balances: they must match.", when: "all" },
    { s: 1, g: "Cash", t: "Reconcile Stripe, PayPal, Square, SumUp or other processor balances; split payouts into gross sales, fees and refunds.", when: "processors" },
    { s: 1, g: "Cash", t: "Match transfers between the client's own accounts on both sides.", when: "all" },
    { s: 1, g: "Cash", t: "Count or confirm petty cash, if used.", when: "all" },
    { s: 1, g: "Cash", t: "Check there are no unreconciled items older than this month, or note why.", when: "all" },
    { s: 2, g: "Suspense and queries", t: "Clear the suspense / uncategorised account, or send the client one grouped query list with a reply-by date.", when: "all" },
    { s: 2, g: "Sales and purchases", t: "Enter all supplier bills and receipts for the month; check for duplicates (same supplier, same amount, within about 7 days).", when: "all" },
    { s: 2, g: "Sales and purchases", t: "Match customer receipts and credit notes to invoices; match supplier payments to bills.", when: "accruals" },
    { s: 2, g: "Sales and purchases", t: "Check income and expenses are dated by when the money moved (cash basis), and nothing personal is in the business accounts.", when: "cash" },
    { s: 2, g: "Payroll", t: "Post the payroll journal: gross pay, employer NI, pension, net pay, PAYE/NI and pension liabilities.", when: "uk payroll" },
    { s: 2, g: "Payroll", t: "Post the payroll journal: gross wages, employer payroll taxes, net pay, federal and state withholding and benefit liabilities.", when: "us payroll" },
    { s: 2, g: "Payroll", t: "Check net pay agrees to the bank payments and last month's payroll liabilities have cleared to zero.", when: "payroll" },
    { s: 3, g: "Debtors and creditors", t: "Review aged debtors: flag anything over 60 days; list possible bad debts for the accountant (don't write off without approval).", when: "accruals" },
    { s: 3, g: "Debtors and creditors", t: "Review aged creditors: investigate debit balances (overpayments, unallocated payments).", when: "accruals" },
    { s: 3, g: "VAT", t: "Sense-check VAT codes: zero-rated vs exempt vs outside scope, reverse charge (including construction), no VAT claimed without a valid VAT invoice.", when: "vat" },
    { s: 3, g: "VAT", t: "Quarter end: agree the VAT control account to the VAT return report before preparing the return.", when: "vatquarter" },
    { s: 3, g: "VAT", t: "Not VAT-registered: check rolling 12-month taxable turnover against the VAT registration threshold (£90,000 from April 2024; check current).", when: "uk novat" },
    { s: 3, g: "CIS", t: "Record CIS deducted from the client's sales and withheld from subcontractors; check the monthly CIS return is filed (due the 19th).", when: "cis" },
    { s: 3, g: "Sales tax", t: "Agree sales tax collected by state to the liability account; note any state approaching an economic nexus threshold.", when: "salestax" },
    { s: 3, g: "Adjustments", t: "Post accruals for costs incurred but not yet billed (utilities, subcontractors, accountancy fee).", when: "accruals" },
    { s: 3, g: "Adjustments", t: "Release prepayments (insurance, annual software) and post deferred income for money received for work not yet done.", when: "accruals" },
    { s: 3, g: "Adjustments", t: "Post depreciation, if you post it monthly for this client.", when: "accruals" },
    { s: 3, g: "Adjustments", t: "Update stock or work in progress from the client's count or figure.", when: "stock" },
    { s: 3, g: "Adjustments", t: "Revalue foreign currency bank accounts and open invoices at the month-end rate (or check the software has).", when: "fx" },
    { s: 3, g: "Adjustments", t: "Split loan, finance and hire purchase payments into capital and interest from the lender's statement.", when: "loans" },
    { s: 3, g: "Owner", t: "Update the director's loan account; move personal items out of expenses; flag an overdrawn loan account to the accountant.", when: "uk company" },
    { s: 3, g: "Owner", t: "Record owner distributions and shareholder or member loans; move personal items out of expenses; flag anything unusual to the CPA.", when: "us company" },
    { s: 3, g: "Owner", t: "Post owner's drawings and money put in; move personal items out of expenses.", when: "sole" },
    { s: 4, g: "Review", t: "Review the trial balance for wrong-sign balances (negative bank with no overdraft, debit on a liability, credit on an asset).", when: "all" },
    { s: 4, g: "Review", t: "Compare with last month: explain any expense line that moved more than about 30% and £/$500.", when: "all" },
    { s: 4, g: "Review", t: "Check tax, payroll and pension liabilities look like one period's worth, not a growing balance.", when: "all" },
    { s: 4, g: "Review", t: "Check gross margin is in the usual range for the business.", when: "accruals" },
    { s: 5, g: "Sign-off", t: "Lock the period in the software (lock date / close the books).", when: "all" },
    { s: 5, g: "Sign-off", t: "Send the client a short month summary: sales, costs, profit, cash, what's due soon, open queries.", when: "all" },
    { s: 5, g: "Sign-off", t: "Note anything for the accountant (capital vs revenue, bad debts, director's loan, unusual items).", when: "all" }
  ];

  function applies(when, o) {
    return when.split(" ").every(function (w) {
      switch (w) {
        case "all": return true;
        case "uk": return o.country === "uk";
        case "us": return o.country === "us";
        case "payroll": return o.payroll;
        case "processors": return o.processors;
        case "accruals": return o.basis === "accruals";
        case "cash": return o.basis === "cash";
        case "vat": return o.country === "uk" && o.vat !== "none";
        case "novat": return o.vat === "none";
        case "vatquarter": return o.country === "uk" && isVatEnd(o.vat, o.m);
        case "cis": return o.country === "uk" && o.cis;
        case "salestax": return o.country === "us" && o.salestax;
        case "stock": return o.stock;
        case "fx": return o.fx;
        case "loans": return o.loans;
        case "company": return o.entity === "company";
        case "sole": return o.entity === "sole";
      }
      return false;
    });
  }

  // VAT stagger: the month (0-11) of the first quarter end in the year.
  // "mar" = Mar/Jun/Sep/Dec, "jan" = Jan/Apr/Jul/Oct, "feb" = Feb/May/Aug/Nov.
  var STAGGER = { jan: 0, feb: 1, mar: 2 };
  function isVatEnd(vat, m) {
    if (vat === "monthly") return true;
    if (!(vat in STAGGER)) return false;
    return (m - STAGGER[vat]) % 3 === 0;
  }

  // Stage -> working day for a target of T working days. Stage 0 is the
  // last working day of the month; stages 1..5 spread over 1..T.
  function stageDay(s, T) {
    if (s === 0) return 0;
    return Math.max(1, Math.min(T, Math.round(s * T / 5)));
  }

  function deadlines(o, hol) {
    var y = o.y, m = o.m, out = [];
    var n1 = d(y, m + 1, 1), n2 = d(y, m + 2, 1);
    function on(base, day) { return d(base.getUTCFullYear(), base.getUTCMonth(), day); }
    if (o.country === "uk") {
      if (o.payroll) {
        out.push({ date: on(n1, 22), what: "PAYE and National Insurance payment to HMRC for the tax month ending 5 " + MONTHS[n1.getUTCMonth()] + " (electronic; by post it must arrive by the 19th)." });
        out.push({ date: null, what: "Full Payment Submission (FPS): on or before each payday. Pension contributions: by your provider's due date." });
      }
      if (o.cis) out.push({ date: on(n1, 19), what: "CIS monthly return for the tax month ending 5 " + MONTHS[n1.getUTCMonth()] + "." });
      if (o.vat !== "none") {
        if (isVatEnd(o.vat, m)) out.push({ date: on(n2, 7), what: "VAT return and payment for the period ending " + d(y, m + 1, 0).getUTCDate() + " " + MONTHS[m] + " " + y + " (1 month and 7 days after the period end). Allow time for the payment to reach HMRC." });
        else {
          var k = m; while (!isVatEnd(o.vat, k)) k++;
          var qe = d(y, k + 1, 0);
          out.push({ date: null, what: "Not a VAT quarter end. Next VAT period ends " + qe.getUTCDate() + " " + MONTHS[qe.getUTCMonth()] + " " + qe.getUTCFullYear() + "." });
        }
      }
    } else {
      if (o.payroll) {
        out.push({ date: on(n1, 15), what: "Federal employment tax deposit for this month's payroll, if you're a monthly depositor (semiweekly depositors deposit within days of each payday)." });
        if (m % 3 === 2) {
          var last = d(y, m + 2, 0);
          out.push({ date: last, what: "Form 941 for the quarter ending " + d(y, m + 1, 0).getUTCDate() + " " + MONTHS[m] + " " + y + "." });
        }
        if (m === 11) out.push({ date: d(y + 1, 0, 31), what: "Forms W-2 to employees and the SSA, and Form 940 for " + y + "." });
      }
      if (o.salestax) out.push({ date: null, what: "Sales tax returns: due dates and frequency vary by state. Check each state's filing calendar." });
    }
    out.forEach(function (x) {
      if (!x.date) return;
      x.label = nice(x.date);
      if (!isWorking(x.date, hol)) x.label += o.country === "uk" ? " (weekend or bank holiday: pay early so it arrives in time)" : " (weekend or holiday: the IRS accepts the next business day)";
    });
    return out;
  }

  function csvCell(s) { s = String(s == null ? "" : s); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s; }

  function build(opts) {
    var o = {};
    o.country = opts.country === "us" ? "us" : "uk";
    var mm = /^(\d{4})-(\d{2})$/.exec(String(opts.month || "").trim());
    if (!mm) return { error: "Pick the month you're closing." };
    o.y = +mm[1]; o.m = +mm[2] - 1;
    if (o.m < 0 || o.m > 11) return { error: "Pick the month you're closing." };
    var T = parseInt(opts.target, 10);
    if (!(T >= 2 && T <= 15)) return { error: "Close target should be between 2 and 15 working days." };
    o.basis = opts.basis === "cash" ? "cash" : "accruals";
    o.entity = opts.entity === "sole" ? "sole" : "company";
    o.vat = o.country === "uk" && /^(jan|feb|mar|monthly)$/.test(opts.vat) ? opts.vat : "none";
    ["payroll", "cis", "salestax", "processors", "stock", "fx", "loans"].forEach(function (k) { o[k] = !!opts[k]; });
    var region = opts.region in HOLIDAYS ? opts.region : (o.country === "us" ? "us" : "ew");
    var hol = HOLIDAYS[region];

    var warnings = [];
    var endY = d(o.y, o.m + 2, 0).getUTCFullYear();
    if (region !== "none" && (HOL_YEARS.indexOf(o.y) < 0 || HOL_YEARS.indexOf(endY) < 0)) warnings.push("Bank holidays are only loaded for " + HOL_YEARS.join(" and ") + ", so dates outside those years skip weekends only.");
    if (T <= 3 && (o.payroll || o.basis === "accruals")) warnings.push("A " + T + "-day close with " + (o.payroll ? "payroll" : "accruals") + " is tight for a small practice: it only works if the client's records arrive on the first working day.");
    if (o.country === "uk" && o.cis && !o.payroll) warnings.push("CIS contractors usually run payroll too; tick payroll if this client has employees.");

    var tasks = [];
    TASKS.forEach(function (t) {
      if (!applies(t.when, o)) return;
      var wd = stageDay(t.s, T);
      var dt = workingDay(o.y, o.m, wd, hol);
      tasks.push({ stage: t.s, group: t.g, task: t.t, wd: wd, day: wd === 0 ? "Last working day" : "Working day " + wd, date: iso(dt), label: nice(dt) });
    });
    var closeDate = workingDay(o.y, o.m, T, hol);
    var dl = deadlines(o, hol);
    var monthLabel = MONTHS[o.m] + " " + o.y;
    var client = String(opts.client || "").trim().slice(0, 60);

    var csv = ["Client,Month,Group,Task,When,Date,Done,Notes"];
    tasks.forEach(function (t) { csv.push([client, monthLabel, t.group, t.task, t.day, t.date, "", ""].map(csvCell).join(",")); });
    dl.forEach(function (x) { csv.push([client, monthLabel, "Deadline", x.what, "", x.date ? iso(x.date) : "", "", ""].map(csvCell).join(",")); });

    var lines = ["Month-end close: " + (client ? client + ", " : "") + monthLabel, "Target: books closed by " + nice(closeDate) + " (working day " + T + ").", ""];
    var lastG = "";
    tasks.forEach(function (t) {
      var g = t.day + " (" + t.label + ")";
      if (g !== lastG) { lines.push(""); lines.push(g); lastG = g; }
      lines.push("[ ] " + t.group + ": " + t.task);
    });
    if (dl.length) {
      lines.push(""); lines.push("Deadlines after this month");
      dl.forEach(function (x) { lines.push("- " + (x.label ? x.label + ": " : "") + x.what); });
    }

    return {
      country: o.country, monthLabel: monthLabel, target: T, closeDate: iso(closeDate), closeLabel: nice(closeDate),
      tasks: tasks, deadlines: dl.map(function (x) { return { date: x.date ? iso(x.date) : null, label: x.label || "", what: x.what }; }),
      warnings: warnings, csv: csv.join("\r\n") + "\r\n", text: lines.join("\n").replace(/\n{3,}/g, "\n\n")
    };
  }

  var api = { build: build, workingDay: workingDay, isVatEnd: isVatEnd, stageDay: stageDay, HOLIDAYS: HOLIDAYS, iso: iso, d: d };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  // ---- Browser UI ----
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function syncCountry() {
    var c = $("me-country").value;
    Array.prototype.forEach.call(document.querySelectorAll("[data-me-country]"), function (el) { el.hidden = el.getAttribute("data-me-country") !== c; });
    var r = $("me-region");
    if (c === "us" && r.value !== "us" && r.value !== "none") r.value = "us";
    if (c === "uk" && r.value === "us") r.value = "ew";
  }
  function read() {
    var c = $("me-country").value;
    return {
      country: c, month: $("me-month").value, target: $("me-target").value, basis: $("me-basis").value,
      entity: $("me-entity").value, region: $("me-region").value, vat: c === "uk" ? $("me-vat").value : "none",
      payroll: $("me-payroll").checked, cis: c === "uk" && $("me-cis").checked, salestax: c === "us" && $("me-salestax").checked,
      processors: $("me-processors").checked, stock: $("me-stock").checked, fx: $("me-fx").checked, loans: $("me-loans").checked,
      client: $("me-client").value
    };
  }
  function run() {
    var res = build(read());
    var out = $("me-out");
    if (res.error) { out.innerHTML = "<p class=\"qb-warn\">" + esc(res.error) + "</p>"; return; }
    var h = "<p class=\"qb-due\"><strong>" + res.tasks.length + " tasks. Books closed for " + esc(res.monthLabel) + " by " + esc(res.closeLabel) + " (working day " + res.target + ").</strong> Tick them off here, or download the checklist for Excel or Google Sheets.</p>";
    res.warnings.forEach(function (w) { h += "<p class=\"qb-warn\">" + esc(w) + "</p>"; });
    var lastDay = "";
    res.tasks.forEach(function (t, i) {
      if (t.day !== lastDay) { if (lastDay) h += "</ul>"; h += "<h3>" + esc(t.day) + " <span class=\"me-date\">" + esc(t.label) + "</span></h3><ul class=\"me-list\">"; lastDay = t.day; }
      h += "<li><label><input type=\"checkbox\" data-me-i=\"" + i + "\"> <span class=\"me-g\">" + esc(t.group) + ":</span> " + esc(t.task) + "</label></li>";
    });
    h += "</ul>";
    if (res.deadlines.length) h += "<h3>Deadlines after this month</h3><ul>" + res.deadlines.map(function (x) { return "<li>" + (x.label ? "<strong>" + esc(x.label) + ":</strong> " : "") + esc(x.what) + "</li>"; }).join("") + "</ul>";
    h += "<p id=\"me-progress\" class=\"small\"></p>";
    h += "<p><button type=\"button\" id=\"me-csv\">Download for Excel / Sheets (.csv)</button> <button type=\"button\" id=\"me-copy\" class=\"ghost\">Copy as text</button> <button type=\"button\" id=\"me-print\" class=\"ghost\">Print</button> <span id=\"me-msg\" aria-live=\"polite\"></span></p>";
    out.innerHTML = h;
    function progress() {
      var boxes = out.querySelectorAll("input[data-me-i]"), n = 0;
      Array.prototype.forEach.call(boxes, function (b) { if (b.checked) n++; });
      $("me-progress").textContent = n + " of " + boxes.length + " done." + (n === boxes.length ? " Month closed." : "");
    }
    out.addEventListener("change", progress);
    progress();
    $("me-csv").onclick = function () {
      var blob = new Blob(["﻿" + res.csv], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "month-end-checklist-" + res.closeDate.slice(0, 7) + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
    };
    $("me-copy").onclick = function () {
      var msg = $("me-msg");
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(res.text).then(function () { msg.textContent = "Copied."; }, function () { msg.textContent = "Use the download instead."; });
      else msg.textContent = "Use the download instead.";
    };
    $("me-print").onclick = function () { window.print(); };
  }
  document.addEventListener("DOMContentLoaded", function () {
    if (!$("me-go")) return;
    $("me-country").addEventListener("change", syncCountry);
    $("me-go").addEventListener("click", run);
    syncCountry();
  });
})();
