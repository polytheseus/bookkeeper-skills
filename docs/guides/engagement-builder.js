// Engagement letter schedule builder: turns the services a bookkeeper has
// agreed with a client into the parts of an engagement letter that stop
// scope creep: a schedule per service (what we do, based on what volume,
// what we need from you and by when, what's not included), a fee table with
// totals, the out-of-scope, volume and late-records clauses, a checklist of
// the standard terms to take from a professional-body template (not drafted
// here), and a plain-English cover email. Runs in the browser and in node
// (module.exports) for tests. Nothing typed is sent anywhere.
(function () {
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function ord(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // Each service: id, country ("uk", "us" or "both"), name, freq (for the fee
  // table), do (deliverables; {due} = records-due day, {vol} = volume line),
  // need (client duties), not (exclusions).
  var SERVICES = [
    { id: "books", c: "both", name: "Monthly bookkeeping", freq: "month",
      do: ["Record and categorise your business bank and card transactions in {software} each month.", "Reconcile each business bank and card account to its statement by the {ready} of the following month.", "Send you a short list of any transactions we can't identify, once a month."],
      need: ["Give us read-only bank feeds, or statements, for every business account.", "Send receipts and invoices for each month by the {due} of the following month.", "Answer our monthly query list within 7 days."],
      not: ["Catch-up work for any period before {start} (we'll quote separately).", "Chasing your customers for payment (credit control) or paying your suppliers.", "Stock counts or valuing stock.", "Management accounts, forecasts or cash-flow reports unless listed in this schedule."] },
    { id: "vat", c: "uk", name: "VAT returns (Making Tax Digital)", freq: "quarter",
      do: ["Prepare your VAT return from the reconciled books each quarter.", "Send it to you for approval at least 10 working days before the deadline (1 month and 7 days after the quarter end).", "Submit it through MTD-compatible software once you've approved it in writing."],
      need: ["Approve the return, or tell us what's wrong, within 5 working days of receiving it.", "Pay HMRC yourself by the deadline (or keep enough in the account for the direct debit).", "Tell us before you change what you sell, start selling abroad, or buy a large asset."],
      not: ["VAT registration, deregistration or changing VAT scheme (quoted separately).", "VAT inspections, HMRC compliance checks or disputes.", "Advice on the VAT treatment of new or unusual transactions, land or property, or overseas sales.", "Errors in earlier returns we didn't prepare."] },
    { id: "salestax", c: "us", name: "Sales tax returns", freq: "filing period",
      do: ["Prepare sales tax returns for the states listed below from the reconciled books, on your filing frequency.", "Send each return to you for approval at least 5 business days before it's due.", "File it once you've approved it in writing."],
      need: ["Tell us every state where you're registered or think you may have nexus.", "Approve each return within 3 business days of receiving it.", "Pay the tax due yourself, or keep funds available for the debit."],
      not: ["Nexus studies, new state registrations or voluntary disclosure agreements (quoted separately).", "Audits or notices from state tax departments.", "Product taxability research for new products or new states.", "Use tax reviews or corrections to returns we didn't prepare."] },
    { id: "payroll", c: "both", name: "Payroll", freq: "pay run",
      do: [],
      need: ["Send hours, overtime, starters, leavers and pay changes at least 3 working days before each payday.", "Check and approve the payroll summary before we submit it.", "Pay your employees and the tax due yourself."],
      not: ["HR or employment-law advice, contracts or disciplinary matters.", "Calculating holiday pay, statutory pay or redundancy pay beyond standard payroll software calculations.", "Corrections to pay runs before {start}."] },
    { id: "mgmt", c: "both", name: "Management reports", freq: "month",
      do: ["Send you a profit and loss report and a balance sheet for the month, with last year's figures alongside where we have them, by the {report} of the following month.", "Add a short note on anything unusual in the month."],
      need: ["Tell us about any loans, asset purchases or money you've put in or taken out, so the reports are right."],
      not: ["Budgets, forecasts and cash-flow projections (quoted separately).", "Meetings to go through the reports beyond {meetings}.", "Reports for lenders, investors or grant bodies."] },
    { id: "yearend", c: "both", name: "Year-end file for your accountant", freq: "year",
      do: ["Close the books for your financial year and send your accountant a trial balance, the bank reconciliations, and lists of what you owe and what you're owed at the year end.", "Answer your accountant's questions about the books."],
      need: ["Tell us who your accountant is and give us permission to share your records with them.", "Send stock figures and any year-end information by 4 weeks after the year end."],
      not: ["Preparing or filing statutory accounts, tax returns or corporation tax returns (your accountant does these unless this letter says otherwise).", "Tax planning or advice on how to pay yourself."] }
  ];
  // Payroll deliverables differ by country.
  var PAYROLL_DO = {
    uk: ["Run payroll {payfreq} in {software} for up to {employees} employees.", "Send payslips to employees and submit the Full Payment Submission to HMRC on or before each payday.", "Tell you what to pay HMRC each month and when.", "Process starters and leavers you tell us about, and send P60s after the tax year ends."],
    us: ["Run payroll {payfreq} in {software} for up to {employees} employees.", "Calculate federal and state withholding and send pay stubs.", "Prepare the quarterly Form 941 and state payroll returns for your approval, and the year-end W-2s.", "Tell you what to deposit and when."]
  };
  var PAYROLL_NOT = {
    uk: ["Pension auto-enrolment duties of choosing a scheme and the declaration of compliance and re-enrolment, unless listed in this schedule.", "Benefits in kind and P11D forms."],
    us: ["Choosing or administering benefit plans, 401(k) or health insurance.", "1099-NEC forms for contractors, unless listed in this schedule.", "Workers' compensation audits."]
  };

  function money(n, cur) {
    var s = (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "");
    return cur + s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function num(v, def) {
    if (v === undefined || v === null || String(v).trim() === "") return def;
    var n = Number(String(v).replace(/[£$,\s]/g, ""));
    return isFinite(n) && n >= 0 ? n : NaN;
  }
  function fill(s, o) {
    return s.replace(/\{(\w+)\}/g, function (m, k) { return o[k] !== undefined ? o[k] : m; });
  }
  function dateText(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return "";
    return Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1];
  }
  // How many times a year each fee frequency is charged.
  var PER_YEAR = { month: 12, quarter: 4, year: 1 };

  function build(o) {
    o = o || {};
    var country = o.country === "us" ? "us" : "uk";
    var cur = country === "us" ? "$" : "£";
    var services = (o.services || []).filter(function (id) {
      return SERVICES.some(function (s) { return s.id === id && (s.c === "both" || s.c === country); });
    });
    if (!services.length) return { error: "Tick at least one service." };
    var start = dateText(o.start);
    if (!start) return { error: "Enter the start date." };
    var due = num(o.dueDay, 7), tx = num(o.transactions, ""), accts = num(o.accounts, ""), employees = num(o.employees, ""), queryMins = num(o.queryMinutes, 30);
    if (isNaN(due) || due < 1 || due > 28 || due % 1) return { error: "Records-due day must be a whole number from 1 to 28." };
    if (isNaN(queryMins)) return { error: "Included query time must be a number of minutes." };
    var ready = Math.min(due + 8, 28);
    var o2 = {
      software: (o.software || "").trim() || (country === "us" ? "QuickBooks Online" : "Xero"),
      due: ord(due), ready: ord(ready), report: ord(Math.min(ready + 3, 28)), start: start,
      employees: employees === "" ? "[number]" : employees, payfreq: o.payFreq || "monthly",
      meetings: "one 30-minute call a quarter"
    };
    var warnings = [];
    var schedules = [], fees = [], annual = 0;
    var feeIn = o.fees || {};
    services.forEach(function (id) {
      var s = SERVICES.filter(function (x) { return x.id === id; })[0];
      var does = (id === "payroll" ? PAYROLL_DO[country] : s.do).map(function (l) { return fill(l, o2); });
      var not = s.not.concat(id === "payroll" ? PAYROLL_NOT[country] : []).map(function (l) { return fill(l, o2); });
      var based = "";
      if (id === "books") {
        if (tx === "" || accts === "") warnings.push("Add the monthly transaction volume and number of accounts: without them you can't review the fee when the client grows.");
        based = "Up to " + (tx === "" ? "[number]" : tx) + " transactions a month across " + (accts === "" ? "[number]" : accts) + " bank and card account" + (accts === 1 ? "" : "s") + ".";
      }
      if (id === "payroll") {
        if (employees === "") warnings.push("Add the number of employees for the payroll schedule.");
        based = "Up to " + o2.employees + " employees, paid " + o2.payfreq + ".";
      }
      if (id === "salestax") based = "States: [list each state and its filing frequency].";
      if (id === "vat") based = "Your VAT quarters end in [months]; standard VAT accounting unless we agree otherwise in writing.";
      schedules.push({ id: id, name: s.name, does: does, based: based, need: s.need.map(function (l) { return fill(l, o2); }), not: not });
      var f = num(feeIn[id], "");
      if (isNaN(f)) return warnings.push("The fee for " + s.name + " isn't a number.");
      var freq = s.freq;
      if (id === "payroll") freq = "month";
      if (id === "salestax") freq = "month";
      var label = id === "payroll" ? "per month (" + o2.payfreq + " pay runs)" : id === "salestax" ? "per month (all filings)" : "per " + freq;
      var times = PER_YEAR[freq];
      if (f === "") { warnings.push("No fee entered for " + s.name + "."); fees.push({ name: s.name, label: label, fee: null, year: null }); return; }
      fees.push({ name: s.name, label: label, fee: f, year: f * times });
      annual += f * times;
    });
    var vatRate = country === "uk" && o.vatRegistered ? 0.2 : 0;
    var vat = Math.round(annual * vatRate * 100) / 100;
    var monthly = Math.round(annual / 12 * 100) / 100;
    var feeNote = country === "uk" ? (vatRate ? "Fees are shown before VAT. We'll add VAT at the standard rate (currently 20%)." : "We aren't registered for VAT, so no VAT is added.") : "Fees don't include any sales tax your state may charge on bookkeeping services.";

    var clauses = [
      { h: "Work that isn't in this letter", t: "If you ask us to do something that isn't listed in the schedules above, we'll tell you it's extra and give you a price or an estimate before we start. We won't start until you've agreed it in writing (an email is fine)." },
      { h: "Questions included in the fee", t: "The fee includes up to " + queryMins + " minutes a month of emails and calls about the services above. If you regularly need more, we'll talk to you about a different fee before charging for it." }
    ];
    if (services.indexOf("books") >= 0) clauses.push({ h: "If your business grows", t: "The bookkeeping fee is based on the volume in the schedule. If your transactions are above that for 3 months in a row, we'll tell you and agree a new fee before the next month's work." });
    clauses.push({ h: "If records arrive late", t: "We need your records by the " + o2.due + " of each month to do the work on time. If they arrive late or incomplete, we'll do the work as soon as we reasonably can, but we can't promise to meet a filing deadline" + (o.lateFee ? ", and work done in less than 5 working days before a deadline is charged at " + o.lateFee : "") + ". Any penalties or interest caused by late records are yours to pay." });
    clauses.push({ h: "Fees and payment", t: "We'll collect " + money(monthly, cur) + " a month" + (vatRate ? " plus VAT" : "") + " " + (o.payment || "by direct debit on the 1st of each month") + ". We review our fees each " + (o.review || "April") + " and will give you at least 30 days' notice of any change." });

    var terms = [
      "Who we are: legal name, address, and our professional body (if any) and its membership number.",
      country === "uk" ? "Money laundering: who supervises us (HMRC or our professional body), the identity and source-of-funds checks we must do before starting, that we must report suspicions, and that we can't tell you if we do." : "Your authority for us to deal with the IRS or state agencies (Form 8821 or 2848, if needed), and what we can and can't say on your behalf.",
      country === "uk" ? "Data protection (UK GDPR): that we're a controller of the personal data we process for you (the ICO's guidance treats accountants this way), our privacy notice, where data is stored, and how long we keep it." : "Privacy: how you store and protect client data, and, if you prepare tax returns, written consent for any use or disclosure of return information beyond preparing the return (IRC section 7216).",
      "Software and cloud providers we use, and whether we use AI tools on your data and under what controls.",
      "Responsibilities: you're responsible for the accuracy and completeness of the information you give us, for your own returns, and for keeping your original records.",
      country === "us" ? "That bookkeeping isn't an audit, review or compilation, and we give no assurance on the figures (CPA firms: follow the AICPA standards for any financial statements)." : "That bookkeeping isn't an audit, and we don't check the information you give us for fraud or error unless we agree to.",
      "Limitation of liability and professional indemnity insurance details (agree this with your insurer).",
      "Complaints: who to contact, and where to escalate (your professional body, if any).",
      "Record retention and returning your records when the engagement ends" + (country === "uk" ? " (identity records must be kept for 5 years after the relationship ends under the Money Laundering Regulations)" : "") + ".",
      "Ending the engagement: notice period on both sides, what happens to work in progress, handover to a new adviser" + (country === "uk" ? " (professional clearance)" : "") + ".",
      "Governing law" + (country === "uk" ? " (England and Wales, Scotland or Northern Ireland)" : " (your state)") + ", and that this letter replaces any earlier one.",
      "Signature and date for both sides, and a copy kept on file."
    ];

    var client = (o.client || "").trim(), practice = (o.practice || "").trim();
    var email = [
      "Subject: Your engagement letter" + (practice ? " from " + practice : ""),
      "",
      "Hi " + (client || "[first name]") + ",",
      "",
      "Attached is our engagement letter. It sets out what we'll do for you from " + start + ". Three parts matter most:",
      "",
      "1. What's included: " + schedules.map(function (s) { return s.name.toLowerCase(); }).join(", ") + ". Anything else is quoted before we start, so there are no surprise bills.",
      "2. What we need from you: your records by the " + o2.due + " of each month. That's what lets us hit your deadlines.",
      "3. The fee: " + money(monthly, cur) + " a month" + (vatRate ? " plus VAT" : "") + ", reviewed each " + (o.review || "April") + ".",
      "",
      "Please read it, and if it all looks right, sign and return it" + (o.sign ? " " + o.sign : "") + ". If anything isn't what we discussed, reply and we'll fix it before you sign.",
      "",
      "Thanks,",
      practice || "[your name]"
    ].join("\n");

    var L = [];
    L.push("SCHEDULE OF SERVICES" + (client ? " FOR " + client.toUpperCase() : ""));
    L.push("Start date: " + start);
    L.push("");
    schedules.forEach(function (s, i) {
      L.push("Schedule " + (i + 1) + ": " + s.name);
      L.push("What we'll do:");
      s.does.forEach(function (x) { L.push("- " + x); });
      if (s.based) L.push("Based on: " + s.based);
      L.push("What we need from you:");
      s.need.forEach(function (x) { L.push("- " + x); });
      L.push("Not included:");
      s.not.forEach(function (x) { L.push("- " + x); });
      L.push("");
    });
    L.push("FEES");
    fees.forEach(function (f) { L.push("- " + f.name + ": " + (f.fee === null ? "[fee]" : money(f.fee, cur)) + " " + f.label + (f.year === null ? "" : " (" + money(f.year, cur) + " a year)")); });
    L.push("Total: " + money(annual, cur) + " a year, collected as " + money(monthly, cur) + " a month" + (vatRate ? ". VAT at 20%: " + money(vat, cur) + " a year, total including VAT " + money(annual + vat, cur) : "") + ".");
    L.push(feeNote);
    L.push("");
    clauses.forEach(function (c) { L.push(c.h.toUpperCase()); L.push(c.t); L.push(""); });
    L.push("STANDARD TERMS TO TAKE FROM YOUR PROFESSIONAL BODY'S TEMPLATE (not drafted here; check each is covered):");
    terms.forEach(function (t) { L.push("[ ] " + t); });

    return {
      country: country, schedules: schedules, fees: fees, annual: annual, monthly: monthly, vat: vat,
      feeNote: feeNote, clauses: clauses, terms: terms, warnings: warnings, email: email, text: L.join("\n")
    };
  }

  var api = { build: build, SERVICES: SERVICES, ord: ord, money: money };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  // ---- DOM wiring ----
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function syncCountry() {
    var c = $("eb-country").value;
    Array.prototype.forEach.call(document.querySelectorAll("[data-eb-country]"), function (el) {
      var on = el.getAttribute("data-eb-country") === c;
      el.hidden = !on;
      Array.prototype.forEach.call(el.querySelectorAll("input"), function (i) { if (!on) i.checked = false; });
    });
    syncFees();
  }
  function syncFees() {
    Array.prototype.forEach.call(document.querySelectorAll("input[name=eb-svc]"), function (cb) {
      var row = $("eb-fee-" + cb.value);
      if (row) row.hidden = !cb.checked;
    });
  }
  function run() {
    var services = Array.prototype.slice.call(document.querySelectorAll("input[name=eb-svc]:checked")).map(function (e) { return e.value; });
    var fees = {};
    services.forEach(function (id) { var f = $("eb-fee-in-" + id); if (f) fees[id] = f.value; });
    var res = build({
      country: $("eb-country").value, services: services, fees: fees, start: $("eb-start").value,
      dueDay: $("eb-due").value, transactions: $("eb-tx").value, accounts: $("eb-accts").value,
      employees: $("eb-emp").value, payFreq: $("eb-payfreq").value, software: $("eb-software").value,
      queryMinutes: $("eb-mins").value, vatRegistered: $("eb-vat").checked, review: $("eb-review").value,
      client: $("eb-client").value, practice: $("eb-practice").value
    });
    var out = $("eb-out");
    if (res.error) { out.innerHTML = "<p class=\"qb-warn\">" + esc(res.error) + "</p>"; return; }
    var cur = res.country === "us" ? "$" : "£";
    var h = "<p class=\"qb-due\"><strong>" + res.schedules.length + " schedule" + (res.schedules.length === 1 ? "" : "s") + ", " + money(res.annual, cur) + " a year (" + money(res.monthly, cur) + " a month" + (res.vat ? " + VAT" : "") + ").</strong> " + esc(res.feeNote) + "</p>";
    res.warnings.forEach(function (w) { h += "<p class=\"qb-warn\">" + esc(w) + "</p>"; });
    res.schedules.forEach(function (s, i) {
      h += "<h3>Schedule " + (i + 1) + ": " + esc(s.name) + "</h3><p><strong>What we'll do</strong></p><ul>" + s.does.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
      if (s.based) h += "<p><strong>Based on:</strong> " + esc(s.based) + "</p>";
      h += "<p><strong>What we need from you</strong></p><ul>" + s.need.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
      h += "<p><strong>Not included</strong></p><ul>" + s.not.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    });
    h += "<h3>Clauses</h3>" + res.clauses.map(function (c) { return "<p><strong>" + esc(c.h) + ".</strong> " + esc(c.t) + "</p>"; }).join("");
    h += "<details><summary>Standard terms to check against your professional body's template (" + res.terms.length + ")</summary><ul>" + res.terms.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></details>";
    h += "<p><button type=\"button\" id=\"eb-copy\">Copy schedules + clauses</button> <button type=\"button\" id=\"eb-copy-email\" class=\"ghost\">Copy cover email</button> <button type=\"button\" id=\"eb-dl\" class=\"ghost\">Download .txt</button> <span id=\"eb-msg\" aria-live=\"polite\"></span></p>";
    h += "<details><summary>Preview the cover email</summary><pre class=\"email\">" + esc(res.email) + "</pre></details>";
    out.innerHTML = h;
    $("eb-copy").onclick = function () { copy(res.text); };
    $("eb-copy-email").onclick = function () { copy(res.email); };
    $("eb-dl").onclick = function () {
      var blob = new Blob([res.text + "\n\n----\n\n" + res.email], { type: "text/plain" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "engagement-letter-schedule-" + res.country + ".txt";
      document.body.appendChild(a); a.click(); a.remove();
    };
  }
  function copy(text) {
    var msg = $("eb-msg");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { msg.textContent = "Copied."; }, function () { msg.textContent = "Select and copy from the download instead."; });
    } else msg.textContent = "Use Download .txt instead.";
  }
  document.addEventListener("DOMContentLoaded", function () {
    if (!$("eb-go")) return;
    $("eb-country").addEventListener("change", syncCountry);
    Array.prototype.forEach.call(document.querySelectorAll("input[name=eb-svc]"), function (cb) { cb.addEventListener("change", syncFees); });
    $("eb-go").addEventListener("click", run);
    syncCountry();
  });
})();
