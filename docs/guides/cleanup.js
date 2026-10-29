// Bookkeeping cleanup (catch-up) plan builder: turns a client's set-up
// (UK or US, business type, year end, accounts, processors, VAT or sales
// tax, payroll, loans, the state of the records and the software) and the
// months to clean up into a phased checklist, a statement request list for
// every account and month, the filing deadlines those months feed (with
// the ones already passed flagged), a work order (oldest open year first)
// and a "here's what I need" client email. Runs in the browser and in node
// (module.exports) for tests. Nothing typed is sent anywhere.
(function () {
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // Dates are handled as UTC midnight so the day never shifts with time zone.
  function d(y, m, day) { return new Date(Date.UTC(y, m, day)); }
  function iso(dt) { return dt.toISOString().slice(0, 10); }
  function nice(dt) { return dt.getUTCDate() + " " + MONTHS[dt.getUTCMonth()] + " " + dt.getUTCFullYear(); }
  function monthEnd(y, m) { return d(y, m + 1, 0); }
  // n months later: the same day (clamped to the month's length), or the
  // last day of that month when lastDay is set (31 Mar + 9 = 31 Dec).
  function addMonths(dt, n, lastDay) {
    var y = dt.getUTCFullYear(), m = dt.getUTCMonth() + n;
    var end = d(y, m + 1, 0);
    if (lastDay) return end;
    return d(y, m, Math.min(dt.getUTCDate(), end.getUTCDate()));
  }
  function parseMonth(s) {
    var m = /^(\d{4})-(\d{1,2})$/.exec(String(s || "").trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2] - 1;
    if (mo < 0 || mo > 11 || y < 2000 || y > 2100) return null;
    return { y: y, m: mo };
  }
  function label(p) { return MONTHS[p.m] + " " + p.y; }
  function short(p) { return MONTHS[p.m].slice(0, 3) + " " + p.y; }
  function idx(p) { return p.y * 12 + p.m; }
  function fromIdx(i) { return { y: Math.floor(i / 12), m: i % 12 }; }
  function daysBetween(a, b) { return Math.round((b.getTime() - a.getTime()) / 86400000); }

  var ENTITIES = {
    uk: { sole: "Sole trader", partnership: "Partnership", company: "Limited company" },
    us: { sole: "Sole proprietor or single-member LLC", partnership: "Partnership or multi-member LLC", scorp: "S corporation", ccorp: "C corporation" }
  };

  // Filing deadlines fed by the months being cleaned up. Each period that
  // overlaps the cleanup range gives one or more deadlines.
  // UK: Self Assessment online return and balancing payment 31 January after
  // the tax year (6 Apr - 5 Apr); company accounts to Companies House 9 months
  // after the year end (private company), Corporation Tax payment 9 months and
  // 1 day after, CT600 12 months after (gov.uk, checked 29 Oct 2026).
  // US (calendar year): Form 1040 with Schedule C 15 April; Form 1065 and
  // 1120-S 15 March; Form 1120 15 April (the 15th day of the 4th month after
  // a fiscal year end, the 3rd month for a 30 June year end: Form 1120
  // instructions, checked 29 Oct 2026). Weekend and holiday moves are not applied.
  function deadlines(o, start, end, today) {
    var out = [];
    function push(date, what, period) {
      var left = daysBetween(today, date);
      out.push({ date: iso(date), label: nice(date), what: what, period: period, passed: left < 0, daysLeft: left });
    }
    var si = idx(start), ei = idx(end);
    if (o.country === "uk" && (o.entity === "sole" || o.entity === "partnership")) {
      // Tax year Y/Y+1 runs 6 Apr Y to 5 Apr Y+1; month M belongs to the tax year
      // whose 6 April is on or before the 6th of M (April onwards = Y).
      var first = start.m >= 3 ? start.y : start.y - 1;
      var last = end.m >= 3 ? end.y : end.y - 1;
      for (var ty = first; ty <= last; ty++) {
        var lab = ty + "/" + String(ty + 1).slice(2);
        push(d(ty + 2, 0, 31), (o.entity === "partnership" ? "Partnership return (SA800) and each partner's " : "") + "Self Assessment return for " + lab + " (online), and the tax for that year", lab);
      }
    } else if (o.country === "uk" && o.entity === "company") {
      var ye = o.yearEnd;
      // Every accounting year end on or after the range start, up to the first one on or after the range end.
      for (var y = start.y - 1; y <= end.y + 1; y++) {
        var yi = y * 12 + ye;
        if (yi < si || yi - 12 >= ei) continue;
        var yed = monthEnd(y, ye), lab2 = "year ended " + nice(yed);
        push(addMonths(yed, 9, true), "Annual accounts to Companies House (" + lab2 + ")", lab2);
        push(d(yed.getUTCFullYear(), yed.getUTCMonth() + 9, yed.getUTCDate() + 1), "Corporation Tax payment (" + lab2 + ", if profits under £1.5 million)", lab2);
        push(addMonths(yed, 12, true), "Company Tax Return CT600 (" + lab2 + ")", lab2);
      }
    } else if (o.country === "us") {
      var fye = o.entity === "ccorp" ? o.yearEnd : 11;
      for (var y2 = start.y - 1; y2 <= end.y + 1; y2++) {
        var yi2 = y2 * 12 + fye;
        if (yi2 < si || yi2 - 12 >= ei) continue;
        var yed2 = monthEnd(y2, fye), lab3 = fye === 11 ? "tax year " + y2 : "year ended " + nice(yed2);
        if (o.entity === "sole") push(d(y2 + 1, 3, 15), "Form 1040 with Schedule C for " + y2 + " (and the tax due)", lab3);
        else if (o.entity === "partnership") push(d(y2 + 1, 2, 15), "Form 1065 partnership return for " + y2 + " (K-1s to partners)", lab3);
        else if (o.entity === "scorp") push(d(y2 + 1, 2, 15), "Form 1120-S for " + y2 + " (K-1s to shareholders)", lab3);
        else push(d(yed2.getUTCFullYear(), yed2.getUTCMonth() + (fye === 5 ? 3 : 4), 15), "Form 1120 corporate return (" + lab3 + ")", lab3);
      }
    }
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  // Each task: phase, text, and when it applies.
  var PHASES = ["1. Scope and agree", "2. Gather the records", "3. Opening position", "4. Bank, cards and processors", "5. Categorise and clear", "6. Sales, bills and the balance sheet", "7. Tax and payroll checks", "8. Hand over and stay current"];
  var TASKS = [
    { p: 0, t: "Agree the cleanup scope in writing: the months, the accounts, what's included (and what isn't, e.g. filing returns), a fixed fee or estimate, and a deposit.", when: "all" },
    { p: 0, t: "New client? Do your client due diligence and get your engagement letter signed before you start.", when: "uk" },
    { p: 0, t: "New client? Get your engagement letter signed before you start, and a Form 8821 or 2848 if you need to see IRS records.", when: "us" },
    { p: 0, t: "Get access: the accounting software (as an adviser user), read-only bank feeds or statements, and the payment processors.", when: "all" },
    { p: 0, t: "Find the last return or accounts that were filed, and who prepared them. That's where the clean books have to start from.", when: "all" },
    { p: 1, t: "Ask for a full list of every account the business used in the period, including ones now closed: bank, savings, credit cards, loans, processors, petty cash.", when: "all" },
    { p: 1, t: "Request statements for every account and month in the request list below. PDFs, not just a feed export.", when: "all" },
    { p: 1, t: "Missing statements: most banks let the account holder download past statements online or order copies; ask the client to do it this week.", when: "missing" },
    { p: 1, t: "Get monthly reports from Stripe, PayPal, Square, SumUp, Shopify or Amazon showing gross sales, fees, refunds and payouts.", when: "processors" },
    { p: 1, t: "Get the sales records: invoices raised, or the till or booking system's monthly totals.", when: "all" },
    { p: 1, t: "Get receipts and bills for anything over an agreed amount, plus all supplier statements for the period.", when: "all" },
    { p: 1, t: "Get the loan, hire purchase and finance statements (they split interest from capital).", when: "loans" },
    { p: 1, t: "Get every payroll report for the period (payslips summary, PAYE or payroll tax liability, pension contributions).", when: "payroll" },
    { p: 1, t: "Get copies of every VAT return filed in the period and the HMRC VAT account statement (payments and any penalties).", when: "vat" },
    { p: 1, t: "Get copies of every sales tax return filed in the period, for each state the business is registered in.", when: "salestax" },
    { p: 2, t: "Agree the opening balances to the last filed accounts or return: bank, debtors, creditors, loans, VAT or sales tax owed, the owner's or director's account.", when: "all" },
    { p: 2, t: "No software yet: set up the file with a short chart of accounts for this business, then import or key the statements month by month.", when: "nosoftware" },
    { p: 2, t: "Moving from a spreadsheet: check the spreadsheet's closing figures before you import anything, and keep a copy of it as it was.", when: "spreadsheet" },
    { p: 2, t: "Software already in use: run a trial balance at the start date and compare it with the last filed figures. Note every difference before you change anything.", when: "messy" },
    { p: 2, t: "Lock the periods before the start date, so nothing you do changes figures that were already filed.", when: "software" },
    { p: 3, t: "Reconcile each account month by month, oldest first, to the closing balance on each statement. Don't move to the next month until the last one agrees.", when: "all" },
    { p: 3, t: "Delete duplicate bank-feed lines (they often appear after a feed reconnects) and add lines the feed missed.", when: "software" },
    { p: 3, t: "Record processor sales gross, with fees and refunds separately, and payouts as transfers to the bank.", when: "processors" },
    { p: 3, t: "Match every transfer between the client's own accounts on both sides.", when: "all" },
    { p: 3, t: "Reconcile the credit cards to their statement closing balances, not the payment due date.", when: "all" },
    { p: 4, t: "Set up bank rules for recurring suppliers and income first; they clear most lines in bulk.", when: "software" },
    { p: 4, t: "Code what's left, line by line, and send the client one grouped query list for lines only they can explain, with a reply-by date.", when: "all" },
    { p: 4, t: "Post personal spending from the business account to drawings, not expenses.", when: "unincorporated" },
    { p: 4, t: "Post personal spending and money taken out to the director's loan account, not expenses; flag an overdrawn balance at the year end to the accountant.", when: "ukcompany" },
    { p: 4, t: "Post personal spending to owner's draws or a shareholder loan account, not expenses; flag it to the tax preparer.", when: "uscorp" },
    { p: 4, t: "Clear the suspense, uncategorised or 'ask my accountant' account to nil, or list what's left and why.", when: "all" },
    { p: 5, t: "Review aged debtors: invoices showing unpaid that were actually paid (receipt coded to sales instead of matched), and genuine bad debts for the client to decide on.", when: "all" },
    { p: 5, t: "Review aged creditors: bills showing unpaid that were paid, and duplicates (same supplier, same amount, close dates).", when: "all" },
    { p: 5, t: "Split loan and finance repayments into interest and capital from the lender's statements; agree the balances.", when: "loans" },
    { p: 5, t: "List equipment and vehicles bought in the period for the accountant (capital items, not expenses).", when: "all" },
    { p: 5, t: "Count or value stock at each year end in the range, or ask the client for their figure in writing.", when: "stock" },
    { p: 5, t: "Check every balance sheet account at each year end in the range: each figure explained by a statement, a list or a note.", when: "all" },
    { p: 6, t: "Compare each filed VAT return with the cleaned books for the same period. Note every difference and which return it belongs to.", when: "vat" },
    { p: 6, t: "Errors on past VAT returns: small net errors (up to £10,000, or up to 1% of box 6 turnover with a £50,000 cap) can usually go on the next return; bigger or deliberate ones need form VAT652. Check VAT Notice 700/45 and agree it with the client.", when: "vat" },
    { p: 6, t: "Not VAT registered: check the rolling 12-month taxable turnover in the cleaned books against the registration threshold (£90,000 since 1 April 2024) for every month in the range.", when: "novat" },
    { p: 6, t: "Compare each filed sales tax return with the cleaned sales by state; list differences for the client and their tax adviser.", when: "salestax" },
    { p: 6, t: "Check the payroll journals in the books agree with the payroll reports, and the PAYE (or payroll tax) paid agrees with what was due.", when: "payroll" },
    { p: 6, t: "Check the CIS deductions on subcontractor payments and statements, if the business works in construction.", when: "uk" },
    { p: 6, t: "List the contractors paid enough to need a 1099-NEC in each calendar year in the range ($600 up to 2025; the threshold is $2,000 for payments made from 1 January 2026), with their W-9s.", when: "us" },
    { p: 7, t: "Send the accountant or tax preparer, for each year: trial balance, profit and loss, balance sheet, the reconciliations and a note of every adjustment you made.", when: "all" },
    { p: 7, t: "Send the client a one-page summary: what was wrong, what you fixed, what's still open, and any returns that need filing or correcting.", when: "all" },
    { p: 7, t: "Lock every cleaned period in the software.", when: "software" },
    { p: 7, t: "Move the client onto a monthly routine (statements, receipts and queries by a set day), so this never builds up again.", when: "all" }
  ];

  function applies(w, o) {
    var soft = o.software !== "none";
    switch (w) {
      case "all": return true;
      case "uk": return o.country === "uk";
      case "us": return o.country === "us";
      case "missing": return o.records !== "full";
      case "processors": return o.processors > 0;
      case "loans": return !!o.loans;
      case "payroll": return !!o.payroll;
      case "stock": return !!o.stock;
      case "vat": return o.country === "uk" && !!o.vat;
      case "novat": return o.country === "uk" && !o.vat;
      case "salestax": return o.country === "us" && !!o.salestax;
      case "nosoftware": return o.software === "none";
      case "spreadsheet": return o.software === "spreadsheet";
      case "messy": return o.software === "messy";
      case "software": return true; // by the end, the books are in software
      case "unincorporated": return o.entity === "sole" || o.entity === "partnership";
      case "ukcompany": return o.country === "uk" && o.entity === "company";
      case "uscorp": return o.country === "us" && (o.entity === "scorp" || o.entity === "ccorp");
    }
    return false;
  }

  function num(v, dflt) { var n = parseInt(String(v == null ? "" : v).replace(/[^\d-]/g, ""), 10); return isNaN(n) ? dflt : n; }
  function csvCell(s) { s = String(s == null ? "" : s); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s; }

  function build(opts, todayIso) {
    var o = {
      country: opts.country === "us" ? "us" : "uk", entity: opts.entity || "sole",
      yearEnd: Math.min(11, Math.max(0, num(opts.yearEnd, opts.country === "us" ? 11 : 2))),
      banks: Math.max(0, num(opts.banks, 1)), cards: Math.max(0, num(opts.cards, 0)), processors: Math.max(0, num(opts.processors, 0)),
      loans: !!opts.loans, payroll: !!opts.payroll, stock: !!opts.stock, vat: !!opts.vat, salestax: !!opts.salestax,
      records: ["full", "some", "none"].indexOf(opts.records) >= 0 ? opts.records : "some",
      software: ["none", "spreadsheet", "messy"].indexOf(opts.software) >= 0 ? opts.software : "messy",
      client: String(opts.client || "").trim()
    };
    if (!ENTITIES[o.country][o.entity]) o.entity = "sole";
    var start = parseMonth(opts.start), end = parseMonth(opts.end);
    if (!start || !end) return { error: "Choose the first and last month to clean up." };
    if (idx(end) < idx(start)) return { error: "The last month is before the first month. Swap them round." };
    var today = todayIso ? new Date(todayIso + "T00:00:00Z") : new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
    var months = idx(end) - idx(start) + 1;
    if (months > 120) return { error: "That's more than 10 years. Split the cleanup into smaller jobs." };
    if (o.banks + o.cards + o.processors === 0) return { error: "Add at least one account (bank, card or processor)." };
    var warnings = [];
    if (monthEnd(end.y, end.m) > today) warnings.push("The last month (" + label(end) + ") hasn't finished yet, so its statements won't be complete. Clean up to the last full month, then switch to the monthly routine.");
    if (months > 24) warnings.push(months + " months is a big job. Split it into one stage per year, oldest first, each with its own fee and sign-off, so the client sees progress and you get paid as you go.");
    if (o.records === "none") warnings.push("No statements yet: nothing can be reconciled until they arrive. Make getting them the first paid stage, or start the clock from the day the last one lands.");
    if (o.country === "uk" && o.vat && o.software === "none") warnings.push("VAT registered with no software: Making Tax Digital for VAT has applied to every VAT-registered business since April 2022, so records must be kept digitally and returns filed with compatible software (or a spreadsheet with bridging software).");

    var accounts = [];
    for (var i = 1; i <= o.banks; i++) accounts.push(o.banks === 1 ? "Bank account" : "Bank account " + i);
    for (var j = 1; j <= o.cards; j++) accounts.push(o.cards === 1 ? "Credit card" : "Credit card " + j);
    for (var k = 1; k <= o.processors; k++) accounts.push(o.processors === 1 ? "Payment processor (Stripe, PayPal, Square...)" : "Payment processor " + k);
    if (o.loans) accounts.push("Loans and finance (one statement each)");
    var period = label(start) + " to " + label(end);
    var requests = accounts.map(function (a) { return { account: a, from: label(start), to: label(end), statements: /^Loans/.test(a) ? "a statement at each year end in the period, or one covering the whole period" : months + (months === 1 ? " monthly statement" : " monthly statements") }; });

    var tasks = [];
    TASKS.forEach(function (t) { if (applies(t.when, o)) tasks.push({ phase: PHASES[t.p], task: t.t }); });

    var dl = deadlines(o, start, end, today);
    var passed = dl.filter(function (x) { return x.passed; });
    var soon = dl.filter(function (x) { return !x.passed && x.daysLeft <= 90; });
    if (passed.length) warnings.push(passed.length + (passed.length === 1 ? " filing deadline" : " filing deadlines") + " for these months " + (passed.length === 1 ? "has" : "have") + " already passed. Check with the client whether " + (passed.length === 1 ? "it was" : "they were") + " filed (and from what figures) before you agree the order of work.");
    if (soon.length) warnings.push("Deadline in the next 90 days: " + soon.map(function (x) { return x.what + ", " + x.label; }).join("; ") + ". Clean up the months that feed it first.");

    // Work order: one stage per accounting or tax period, oldest first. A
    // period whose deadline is closest (or passed and unfiled) goes first; the
    // simple rule of oldest first gives the same order in almost every case.
    var stages = [];
    var ye = o.country === "uk" && (o.entity === "sole" || o.entity === "partnership") ? 2 : (o.country === "us" && o.entity !== "ccorp" ? 11 : o.yearEnd);
    var cur = idx(start);
    while (cur <= idx(end)) {
      var p = fromIdx(cur);
      var yeIdx = p.y * 12 + ye; if (yeIdx < cur) yeIdx += 12;
      var stop = Math.min(yeIdx, idx(end));
      stages.push({ from: label(fromIdx(cur)), to: label(fromIdx(stop)), months: stop - cur + 1 });
      cur = stop + 1;
    }

    var client = o.client || "the client";
    var who = o.client ? o.client : "";
    var email = [];
    email.push("Subject: " + (who ? who + ": " : "") + "what I need to bring your books up to date");
    email.push("");
    email.push("Hi,");
    email.push("");
    email.push("Thanks for asking me to sort out the books. To bring them up to date for " + period + " (" + months + (months === 1 ? " month" : " months") + "), I need the following. Send what you can this week, even if some is missing; I'll start with the oldest months.");
    email.push("");
    requests.forEach(function (r) { email.push("- " + r.account + ": " + r.statements + ", " + r.from + " to " + r.to); });
    email.push("- A list of every account the business used in that time, including any you've closed");
    email.push("- Sales invoices, or monthly sales totals from your till or booking system");
    email.push("- Receipts and bills for anything over [£/$ amount]");
    if (o.payroll) email.push("- Payroll reports for each month");
    if (o.country === "uk" && o.vat) email.push("- Copies of the VAT returns filed in that time");
    if (o.country === "us" && o.salestax) email.push("- Copies of the sales tax returns filed in that time, for each state");
    if (o.stock) email.push("- Your stock figure at each year end (a count or your best estimate, in writing)");
    email.push("- The last tax return or accounts that were filed, and who did them");
    email.push("");
    if (o.records !== "full") email.push("If you can't find old statements, you can usually download them from your online banking or ask the bank for copies. Let me know if one is a problem and I'll suggest a way round it.");
    email.push("Statements as PDFs are best. Please don't send passwords or online banking logins.");
    email.push("");
    if (dl.length) {
      email.push("These months feed " + (dl.length === 1 ? "this deadline" : "these deadlines") + ":");
      dl.forEach(function (x) { email.push("- " + x.what + ": " + x.label + (x.passed ? " (passed: can you tell me if it was filed?)" : "")); });
      email.push("");
    }
    email.push("Once I have the statements I'll confirm the timetable. Any questions, just reply.");
    email.push("");
    email.push("[Your name]");

    var csv = ["Client,Section,Item,Detail,Date,Done,Notes"];
    requests.forEach(function (r) { csv.push([o.client, "Statements to request", r.account, r.statements + ", " + r.from + " to " + r.to, "", "", ""].map(csvCell).join(",")); });
    dl.forEach(function (x) { csv.push([o.client, "Deadline", x.what, x.passed ? "Passed: check if filed" : x.daysLeft + " days left", x.date, "", ""].map(csvCell).join(",")); });
    stages.forEach(function (s, n) { csv.push([o.client, "Work order", "Stage " + (n + 1), s.from + " to " + s.to + " (" + s.months + (s.months === 1 ? " month" : " months") + ")", "", "", ""].map(csvCell).join(",")); });
    tasks.forEach(function (t) { csv.push([o.client, t.phase, t.task, "", "", "", ""].map(csvCell).join(",")); });

    var text = ["Bookkeeping cleanup plan" + (who ? ": " + who : ""), ENTITIES[o.country][o.entity] + ", " + period + " (" + months + (months === 1 ? " month" : " months") + ")", ""];
    if (warnings.length) { warnings.forEach(function (w) { text.push("! " + w); }); text.push(""); }
    text.push("STATEMENTS TO REQUEST");
    requests.forEach(function (r) { text.push("[ ] " + r.account + ": " + r.statements + ", " + r.from + " to " + r.to); });
    if (dl.length) { text.push(""); text.push("DEADLINES THESE MONTHS FEED"); dl.forEach(function (x) { text.push("- " + x.label + ": " + x.what + (x.passed ? " (PASSED: check if filed)" : " (" + x.daysLeft + " days)")); }); }
    text.push(""); text.push("WORK ORDER");
    stages.forEach(function (s, n) { text.push((n + 1) + ". " + s.from + " to " + s.to); });
    var lastPhase = "";
    tasks.forEach(function (t) { if (t.phase !== lastPhase) { text.push(""); text.push(t.phase.toUpperCase()); lastPhase = t.phase; } text.push("[ ] " + t.task); });

    return {
      client: client, entityLabel: ENTITIES[o.country][o.entity], period: period, months: months, accounts: accounts.length,
      accountMonths: (o.banks + o.cards + o.processors) * months, requests: requests, deadlines: dl, stages: stages, tasks: tasks,
      warnings: warnings, email: email.join("\n"), csv: csv.join("\r\n") + "\r\n", text: text.join("\n")
    };
  }

  var api = { build: build, deadlines: deadlines, parseMonth: parseMonth, addMonths: addMonths, iso: iso, d: d, ENTITIES: ENTITIES, TASKS: TASKS };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  // ---- Browser UI ----
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function syncCountry() {
    var c = $("cu-country").value, e = $("cu-entity"), was = e.value;
    e.innerHTML = Object.keys(ENTITIES[c]).map(function (k) { return "<option value=\"" + k + "\">" + esc(ENTITIES[c][k]) + "</option>"; }).join("");
    if (ENTITIES[c][was]) e.value = was;
    if ($("cu-ye").getAttribute("data-c") !== c) { $("cu-ye").value = c === "us" ? "11" : "2"; $("cu-ye").setAttribute("data-c", c); }
    Array.prototype.forEach.call(document.querySelectorAll("[data-cu-country]"), function (el) { el.hidden = el.getAttribute("data-cu-country") !== c; });
    syncEntity();
  }
  function syncEntity() {
    var c = $("cu-country").value, e = $("cu-entity").value;
    $("cu-ye-wrap").hidden = !((c === "uk" && e === "company") || (c === "us" && e === "ccorp"));
  }
  function read() {
    var c = $("cu-country").value;
    return {
      country: c, entity: $("cu-entity").value, yearEnd: $("cu-ye").value, start: $("cu-start").value, end: $("cu-end").value,
      banks: $("cu-banks").value, cards: $("cu-cards").value, processors: $("cu-proc").value,
      loans: $("cu-loans").checked, payroll: $("cu-payroll").checked, stock: $("cu-stock").checked,
      vat: c === "uk" && $("cu-vat").checked, salestax: c === "us" && $("cu-salestax").checked,
      records: $("cu-records").value, software: $("cu-software").value, client: $("cu-client").value
    };
  }
  function run() {
    var res = build(read());
    var out = $("cu-out");
    if (res.error) { out.innerHTML = "<p class=\"qb-warn\">" + esc(res.error) + "</p>"; return; }
    var h = "<p class=\"qb-due\"><strong>" + esc(res.entityLabel) + ", " + esc(res.period) + ": " + res.months + (res.months === 1 ? " month" : " months") + " × " + res.accounts + (res.accounts === 1 ? " account" : " accounts") + ", " + res.tasks.length + " tasks.</strong> To price it, put these numbers into the <a href=\"how-much-to-charge-for-bookkeeping#catchup\">catch-up fee calculator</a>.</p>";
    res.warnings.forEach(function (w) { h += "<p class=\"qb-warn\">" + esc(w) + "</p>"; });
    h += "<h3>Statements to request</h3><ul class=\"me-list\">" + res.requests.map(function (r) { return "<li><label><input type=\"checkbox\" data-cu-i> <span class=\"me-g\">" + esc(r.account) + ":</span> " + esc(r.statements) + ", " + esc(r.from) + " to " + esc(r.to) + "</label></li>"; }).join("") + "</ul>";
    if (res.deadlines.length) {
      h += "<h3>Deadlines these months feed</h3><table class=\"t\"><tr><th>Due</th><th>What</th><th>Status</th></tr>" + res.deadlines.map(function (x) {
        return "<tr><td>" + esc(x.label) + "</td><td>" + esc(x.what) + "</td><td>" + (x.passed ? "<strong>Passed</strong>: check whether it was filed" : x.daysLeft + " days left") + "</td></tr>";
      }).join("") + "</table>";
    }
    h += "<h3>Work order</h3><ol>" + res.stages.map(function (s) { return "<li>" + esc(s.from) + " to " + esc(s.to) + " (" + s.months + (s.months === 1 ? " month" : " months") + "): reconcile, code and check, then sign off before the next.</li>"; }).join("") + "</ol>";
    var last = "";
    res.tasks.forEach(function (t) {
      if (t.phase !== last) { if (last) h += "</ul>"; h += "<h3>" + esc(t.phase) + "</h3><ul class=\"me-list\">"; last = t.phase; }
      h += "<li><label><input type=\"checkbox\" data-cu-i> " + esc(t.task) + "</label></li>";
    });
    h += "</ul><p id=\"cu-progress\" class=\"small\"></p>";
    h += "<h3>Email to the client</h3><pre class=\"email\" id=\"cu-email\">" + esc(res.email) + "</pre>";
    h += "<p><button type=\"button\" id=\"cu-copy-email\">Copy the email</button> <button type=\"button\" id=\"cu-csv\" class=\"ghost\">Download plan for Excel / Sheets (.csv)</button> <button type=\"button\" id=\"cu-copy\" class=\"ghost\">Copy plan as text</button> <button type=\"button\" id=\"cu-print\" class=\"ghost\">Print</button> <span id=\"cu-msg\" aria-live=\"polite\"></span></p>";
    out.innerHTML = h;
    function progress() {
      var boxes = out.querySelectorAll("input[data-cu-i]"), n = 0;
      Array.prototype.forEach.call(boxes, function (b) { if (b.checked) n++; });
      $("cu-progress").textContent = n + " of " + boxes.length + " done." + (n === boxes.length ? " Books up to date." : "");
    }
    out.addEventListener("change", progress);
    progress();
    function copy(s) {
      var msg = $("cu-msg");
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(function () { msg.textContent = "Copied."; }, function () { msg.textContent = "Select the text and copy it instead."; });
      else msg.textContent = "Select the text and copy it instead.";
    }
    $("cu-copy-email").onclick = function () { copy(res.email); };
    $("cu-copy").onclick = function () { copy(res.text); };
    $("cu-csv").onclick = function () {
      var blob = new Blob(["﻿" + res.csv], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "bookkeeping-cleanup-plan.csv";
      document.body.appendChild(a); a.click(); a.remove();
    };
    $("cu-print").onclick = function () { window.print(); };
  }
  function example() {
    $("cu-country").value = "uk"; syncCountry();
    $("cu-entity").value = "sole"; syncEntity();
    $("cu-start").value = "2025-04"; $("cu-end").value = "2026-09";
    $("cu-banks").value = 1; $("cu-cards").value = 1; $("cu-proc").value = 1;
    $("cu-loans").checked = false; $("cu-payroll").checked = false; $("cu-stock").checked = false; $("cu-vat").checked = false;
    $("cu-records").value = "some"; $("cu-software").value = "spreadsheet"; $("cu-client").value = "HALE01";
    run();
  }
  document.addEventListener("DOMContentLoaded", function () {
    if (!$("cu-go")) return;
    $("cu-country").addEventListener("change", syncCountry);
    $("cu-entity").addEventListener("change", syncEntity);
    $("cu-go").addEventListener("click", run);
    if ($("cu-example")) $("cu-example").addEventListener("click", example);
    syncCountry();
  });
})();
