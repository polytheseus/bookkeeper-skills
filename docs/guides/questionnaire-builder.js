// Year-end client questionnaire builder: picks the questions that apply to a
// client (UK Self Assessment or US Form 1040; sole trader, landlord,
// director, K-1 and so on, plus this year's life changes), numbers them
// yes/no first with a one-line "why we ask", builds the matching document
// checklist, a records-due date worked back from the filing deadline, and a
// cover email. Runs in the browser and in node (module.exports) for tests.
// Nothing typed is sent anywhere.
(function () {
  var DAY = 86400000;
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Each question: id, country ("uk", "us" or "both"), tags (shown when the
  // client has any of them; "all" = everyone in that country), q, why, docs
  // (what to send on a "yes").
  var BANK = [
    // Everyone
    { id: "changes", c: "both", t: ["all"], q: "Have your address, bank details, or marital or civil partnership status changed since your last return?", why: "Some allowances and credits depend on it, and we need to write to the right address.", docs: ["New address and the date you moved", "Date of marriage, civil partnership, separation or divorce"] },
    { id: "other-income", c: "uk", t: ["all"], q: "Did you have any income we haven't seen: a job (P60 or P45), other self-employment, rent, savings interest, dividends, a pension, or income from abroad?", why: "HMRC already gets figures from employers, banks and pension providers, so a missing source is the most common reason for a letter.", docs: ["P60 for each job held at 5 April, and P45 for any job you left", "Interest statements from each bank or building society", "Dividend vouchers or a platform tax summary", "Pension payment statements"] },
    { id: "other-income-us", c: "us", t: ["all"], q: "Did you have any income we haven't seen: a job (W-2), freelance work (1099-NEC), interest or dividends (1099-INT, 1099-DIV), retirement income (1099-R), Social Security (SSA-1099) or unemployment (1099-G)?", why: "The IRS matches every one of these forms against your return.", docs: ["Every W-2 and 1099 you received for the year", "SSA-1099 if you received Social Security"] },
    { id: "platforms", c: "uk", t: ["all"], q: "Did you sell things or services online (eBay, Vinted, Etsy, Airbnb, Uber and similar)?", why: "Since 2024 these platforms send HMRC each seller's income, and the first £1,000 of trading income is tax-free.", docs: ["The yearly sales report or summary from each platform", "What you paid for the items, if you're selling stock"] },
    { id: "platforms-us", c: "us", t: ["all"], q: "Did you get paid through a payment app or online marketplace (PayPal, Venmo, Etsy, eBay, Airbnb and similar)?", why: "Platforms send a 1099-K when you're paid over $20,000 in more than 200 transactions, and some send one below that. Business income counts either way.", docs: ["Any Form 1099-K", "The platform's yearly sales summary"] },
    { id: "pension", c: "uk", t: ["all"], q: "Did you pay into a personal or private pension yourself (not through your payroll)?", why: "Higher and additional rate taxpayers can claim extra relief on the return; basic rate relief is added by the provider.", docs: ["Pension provider's statement of contributions for the tax year"] },
    { id: "gift-aid", c: "uk", t: ["all"], q: "Did you give to charity with Gift Aid?", why: "Higher rate taxpayers can claim extra relief on Gift Aid donations.", docs: ["Total Gift Aid donations (a list or the charities' statements)"] },
    { id: "gains", c: "uk", t: ["all"], q: "Did you sell or give away anything valuable: property other than your home, shares, crypto, or a business asset?", why: "There may be Capital Gains Tax. UK residential property sales have a separate report and payment within 60 days of completion.", docs: ["Sale and purchase dates and amounts", "Costs of buying, selling and improving", "Any 60-day property report already made"] },
    { id: "gains-us", c: "us", t: ["all"], q: "Did you sell shares, crypto, property or anything else valuable?", why: "Sales are reported on Form 8949 and Schedule D, and brokers send the IRS a 1099-B.", docs: ["1099-B and 1099-DA statements from brokers or exchanges", "Purchase dates and costs for anything without a broker statement"] },
    { id: "child-benefit", c: "uk", t: ["all"], q: "Did you or your partner get Child Benefit, and might either of you have income over £60,000?", why: "The High Income Child Benefit Charge claws back 1% of Child Benefit for every £200 over £60,000, and all of it over £80,000.", docs: ["Child Benefit amounts received in the year"] },
    { id: "student-loan", c: "uk", t: ["all"], q: "Do you have a student loan or postgraduate loan?", why: "Repayments on income that wasn't taxed through payroll are collected through the return.", docs: ["Your plan type (Plan 1, 2, 4, 5 or postgraduate)"] },
    { id: "poa", c: "uk", t: ["all"], q: "Have you paid anything to HMRC towards this year's tax already (payments on account in January and July)?", why: "So we can show you what's left to pay on 31 January.", docs: ["Dates and amounts paid, or a screenshot of your HMRC account"] },
    { id: "hmrc-letters", c: "uk", t: ["all"], q: "Have you had any letters from HMRC since your last return?", why: "Some letters change what goes on the return or need a reply before it's filed.", docs: ["A photo or scan of each letter"] },
    { id: "estimates-us", c: "us", t: ["all"], q: "Did you make estimated tax payments (federal or state) during the year?", why: "We need exact dates and amounts so they're credited and you aren't charged for underpaying.", docs: ["Dates and amounts of each payment (IRS online account or bank records)"] },
    { id: "dependants-us", c: "us", t: ["all"], q: "Did you support any dependants, or pay for childcare or education?", why: "Credits such as the Child Tax Credit, childcare credit and education credits depend on it.", docs: ["Name, date of birth and SSN for each dependant (give us these by phone or a secure portal, not email)", "Childcare provider's name, address, tax ID and amount paid", "Form 1098-T for tuition"] },
    { id: "health-us", c: "us", t: ["all"], q: "Did you have health insurance through the Marketplace (healthcare.gov or a state exchange)?", why: "Advance premium credits are reconciled on the return using Form 1095-A.", docs: ["Form 1095-A"] },
    { id: "mortgage-us", c: "us", t: ["all"], q: "Do you pay mortgage interest or property taxes on your home, or give to charity?", why: "Needed to see whether itemizing beats the standard deduction.", docs: ["Form 1098 mortgage interest statement", "Property tax bills", "Charity receipts"] },
    { id: "retirement-us", c: "us", t: ["all"], q: "Did you pay into an IRA or HSA yourself, or take money out of a retirement account?", why: "Contributions can be deductible; withdrawals are taxable and may have penalties.", docs: ["Form 5498 or contribution records", "Form 1099-R for withdrawals", "Form 5498-SA / 1099-SA for an HSA"] },

    // US new deductions, 2025 to 2028 (Schedule 1-A)
    { id: "tips-us", c: "us", t: ["tips"], q: "Did you receive tips in your job or business?", why: "A new deduction of up to $25,000 of qualified tips applies for 2025 to 2028, and your W-2 may not show tips separately.", docs: ["Tip logs, employer reports or point-of-sale summaries", "Records from each job with tips"] },
    { id: "overtime-us", c: "us", t: ["overtime"], q: "Were you paid overtime?", why: "A new deduction of up to $12,500 ($25,000 joint) of qualified overtime applies for 2025 to 2028, and your W-2 may not show it separately.", docs: ["Pay stubs or a payroll summary showing overtime pay", "Records from each employer"] },
    { id: "car-loan-us", c: "us", t: ["car-loan"], q: "Did you take out a loan to buy a new car, SUV, van, pickup or motorcycle for personal use?", why: "Up to $10,000 a year of the interest may be deductible for 2025 to 2028 if the vehicle was new and had final assembly in the US. Leases don't qualify.", docs: ["Lender statement showing interest paid", "VIN and purchase agreement"] },
    { id: "senior-us", c: "us", t: ["senior"], q: "Were you (or your spouse) 65 or older by the end of the year?", why: "An extra $6,000 deduction per person applies for 2025 to 2028, phasing out at higher incomes.", docs: ["Date of birth for each person 65 or over"] },

    // UK sole trader
    { id: "st-sales", c: "uk", t: ["uk-sole-trader"], q: "Do the sales in your bookkeeping include everything: cash, card, bank transfers and online?", why: "HMRC compares returns with card-machine and platform data.", docs: ["Any sales records not already in the bookkeeping"] },
    { id: "st-capital", c: "uk", t: ["uk-sole-trader", "uk-landlord"], q: "Did you buy anything over £[500] for the business: tools, equipment, a computer or a vehicle?", why: "Larger purchases are claimed differently from everyday costs.", docs: ["Invoice for each item", "Finance or hire purchase agreement, if any"] },
    { id: "st-vehicle", c: "uk", t: ["uk-sole-trader"], q: "Did you use a car or van for work?", why: "We claim either mileage or actual costs, and need the business share either way.", docs: ["Business miles and total miles for the year (a log, or how you worked it out)", "Which method we used last year"] },
    { id: "st-home", c: "uk", t: ["uk-sole-trader"], q: "Did you work from home?", why: "You can claim a flat rate based on hours worked at home, or a share of the real costs.", docs: ["Roughly how many hours a month you worked at home"] },
    { id: "st-stock", c: "uk", t: ["uk-sole-trader"], q: "At the end of the year, did you have unsold stock, unfinished jobs, or customers who still owed you?", why: "These can change the profit, depending on the accounting basis we use.", docs: ["Stock value at the year end", "List of unpaid invoices and unpaid bills at the year end"] },
    { id: "st-cis", c: "uk", t: ["uk-sole-trader"], q: "Did a contractor take CIS deductions from your payments?", why: "CIS tax already taken counts towards your bill, so every statement matters.", docs: ["Every monthly CIS statement for the year"] },
    { id: "st-loans", c: "uk", t: ["uk-sole-trader"], q: "Does the business have loans, an overdraft or finance agreements?", why: "Interest is a cost; the loan itself isn't income.", docs: ["Year-end statements showing interest paid and the balance"] },

    // UK landlord
    { id: "ll-rent", c: "uk", t: ["uk-landlord"], q: "List each property you let, with the rent received.", why: "Each property's income and costs go on the property pages.", docs: ["Letting agent statements for the year", "Rent records for anything you manage yourself"] },
    { id: "ll-finance", c: "uk", t: ["uk-landlord"], q: "Do you have a mortgage or loan on any let property?", why: "For residential lets, interest gives a basic rate tax reduction rather than being deducted as a cost.", docs: ["Mortgage interest statement for each property (interest only, not capital)"] },
    { id: "ll-repairs", c: "uk", t: ["uk-landlord"], q: "Any larger jobs on the properties: repairs, replacements or improvements?", why: "Repairs are allowable; improvements aren't, so we need to know what each job was.", docs: ["Invoices for each job with a line on what was done"] },
    { id: "ll-empty", c: "uk", t: ["uk-landlord"], q: "Was any property empty, or used by you or family, for part of the year?", why: "It can change what costs are allowable.", docs: ["Dates empty or in personal use"] },

    // UK director
    { id: "dir-dividends", c: "uk", t: ["uk-director"], q: "What dividends were paid to you in the tax year?", why: "Dividends go on your personal return and are taxed at dividend rates.", docs: ["Dividend vouchers or board minutes with dates and amounts"] },
    { id: "dir-dla", c: "uk", t: ["uk-director"], q: "Did you take money from the company that wasn't salary, dividends or expenses, or put money in?", why: "It goes through the director's loan account; an overdrawn balance can mean extra company tax.", docs: ["List of amounts taken out and paid back, with dates"] },
    { id: "dir-bik", c: "uk", t: ["uk-director"], q: "Did the company give you any benefits: a car, health insurance, a loan?", why: "Benefits may need reporting to HMRC.", docs: ["Details and cost of each benefit, or the P11D if one was done"] },
    { id: "dir-ch", c: "uk", t: ["uk-director"], q: "Have any company details changed (address, directors, shareholders)?", why: "Companies House records and the confirmation statement must be up to date.", docs: ["What changed and when"] },

    // US Schedule C
    { id: "c-sales", c: "us", t: ["us-schedule-c"], q: "Do the sales in your bookkeeping include everything: cash, card, apps and online?", why: "The IRS matches 1099-NEC and 1099-K forms against your Schedule C.", docs: ["Every 1099-NEC and 1099-K", "Any sales records not in the bookkeeping"] },
    { id: "c-assets", c: "us", t: ["us-schedule-c", "us-rental"], q: "Did you buy equipment, a computer, furniture or a vehicle for the business?", why: "Larger purchases may be depreciated or expensed, and we need dates and costs.", docs: ["Invoice for each item, with the date it was put in use", "Loan or lease paperwork"] },
    { id: "c-vehicle", c: "us", t: ["us-schedule-c"], q: "Did you drive for business?", why: "We use the standard mileage rate or actual expenses, and need a mileage record either way.", docs: ["Business miles, commuting miles and total miles (a log or app export)"] },
    { id: "c-home", c: "us", t: ["us-schedule-c"], q: "Do you use part of your home only and regularly for the business?", why: "The home office deduction needs the area and, for the regular method, home costs.", docs: ["Square footage of the office and of the home", "Rent or mortgage interest, utilities and insurance (regular method only)"] },
    { id: "c-1099", c: "us", t: ["us-schedule-c", "us-rental"], q: "Did you pay any contractor (not an employee or a corporation) $600 or more during 2025, or $2,000 or more during 2026 or later?", why: "You may need to send them a 1099-NEC by January 31 and keep their W-9.", docs: ["Each contractor's W-9 and total paid"] },
    { id: "c-health", c: "us", t: ["us-schedule-c"], q: "Did you pay for your own health insurance as a self-employed person?", why: "Self-employed health insurance can be deductible.", docs: ["Premium statements"] },

    // US rental
    { id: "r-rent", c: "us", t: ["us-rental"], q: "List each rental property, with rent received and days rented.", why: "Each property goes on Schedule E, and personal-use days change the rules.", docs: ["Rent ledger or property manager statements", "Days rented and days used personally"] },
    { id: "r-costs", c: "us", t: ["us-rental"], q: "What did each property cost to run: mortgage interest, property tax, insurance, repairs, management?", why: "These are the Schedule E expenses.", docs: ["Form 1098 for each property", "Property tax bills, insurance, repair invoices"] },

    // US K-1
    { id: "k1", c: "us", t: ["us-k1"], q: "Are you a partner, an S-corp shareholder or a trust beneficiary?", why: "We need the Schedule K-1, which often arrives in March, so tell us who sends it.", docs: ["Every Schedule K-1 (or the name of who sends it and when)", "S-corp: your W-2 from the company"] },

    // Life events
    { id: "ev-baby", c: "both", t: ["ev-baby"], q: "Did you have or adopt a child this year?", why: "UK: Child Benefit and the High Income Child Benefit Charge. US: dependants and credits.", docs: ["Child's date of birth (US: and SSN, by a secure route)"] },
    { id: "ev-started", c: "both", t: ["ev-started"], q: "Did you start a new business or side income this year?", why: "We may need to register it and claim the costs of starting up.", docs: ["Start date and what the business does", "Costs from before you started trading"] },
    { id: "ev-stopped", c: "both", t: ["ev-stopped"], q: "Did you stop a business this year?", why: "There are closing figures: final stock, equipment kept or sold, and the last date of trading.", docs: ["Date you stopped", "What happened to stock and equipment"] },
    { id: "ev-home", c: "both", t: ["ev-home"], q: "Did you buy or sell a home this year?", why: "UK: a sale of a home you didn't always live in may need a 60-day CGT report. US: the closing statement shows deductible items.", docs: ["Completion or closing statement"] },
    { id: "ev-abroad", c: "both", t: ["ev-abroad"], q: "Did you live or work abroad, or have income or accounts in another country?", why: "Residence and foreign income have their own rules and forms.", docs: ["Dates abroad", "Foreign income and tax paid"] }
  ];

  var TYPE_LABELS = {
    "uk-individual": "UK individual Self Assessment", "uk-sole-trader": "UK sole trader", "uk-landlord": "UK landlord", "uk-director": "UK company director",
    "us-individual": "US individual (Form 1040)", "us-schedule-c": "US self-employed (Schedule C)", "us-rental": "US rental (Schedule E)", "us-k1": "US partner or S-corp owner (K-1)"
  };

  function parse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCMonth() === +m[2] - 1 ? d : null;
  }
  function fmt(d) { return WEEKDAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function fmtUS(d) { return WEEKDAYS[d.getUTCDay()] + ", " + MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear(); }
  function iso(d) { return d.toISOString().slice(0, 10); }

  // Records-due date: deadline minus prep weeks, moved back to a weekday.
  function recordsDue(deadline, prepWeeks) {
    var d = new Date(deadline.getTime() - prepWeeks * 7 * DAY);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() - DAY);
    return d;
  }

  // opts: {country: "uk"|"us", types: [...], events: [...], deadline, prepWeeks,
  //        today, client, practice, threshold}
  function buildPack(opts) {
    var country = opts.country === "us" ? "us" : "uk";
    var types = (opts.types || []).filter(function (t) { return t.indexOf(country + "-") === 0; });
    if (!types.length) types = [country + "-individual"];
    var events = opts.events || [];
    var tags = ["all"].concat(types, events);
    var deadline = parse(opts.deadline);
    if (!deadline) return { error: "Enter the filing deadline as a date." };
    var prep = Math.round(Number(opts.prepWeeks));
    if (!isFinite(prep) || prep < 0 || prep > 26) return { error: "Enter the weeks you need to prepare as a number from 0 to 26." };
    var due = recordsDue(deadline, prep);
    var today = parse(opts.today);
    var warning = "";
    if (today && due <= today) warning = "That records-due date has already passed. Ask for the records as soon as possible, or shorten your prep time.";

    var questions = BANK.filter(function (b) {
      if (b.c !== "both" && b.c !== country) return false;
      return b.t.some(function (t) { return tags.indexOf(t) >= 0; });
    });
    var threshold = String(opts.threshold || "").replace(/[^0-9]/g, "");
    var cur = country === "uk" ? "£" : "$";
    questions = questions.map(function (b, i) {
      var q = b.q.replace("£[500]", cur + (threshold || "500"));
      return { n: i + 1, id: b.id, q: q, why: b.why, docs: b.docs.slice() };
    });

    var checklist = [], seen = {};
    questions.forEach(function (x) {
      x.docs.forEach(function (d) { if (!seen[d]) { seen[d] = 1; checklist.push({ q: x.n, item: d }); } });
    });

    var dueText = country === "us" ? fmtUS(due) : fmt(due);
    var deadlineText = country === "us" ? fmtUS(deadline) : fmt(deadline);
    var who = String(opts.client || "").trim();
    var practice = String(opts.practice || "").trim() || "[your practice]";
    var minutes = Math.max(15, Math.min(60, 5 * Math.ceil(questions.length * 1.5 / 5)));
    var email = [
      "Subject: Your tax return: " + questions.length + " questions and a records date (" + dueText + ")",
      "",
      "Hi " + (who || "[name]") + ",",
      "",
      "It's time to get your return ready. The filing deadline is " + deadlineText + ", and so we have time to prepare it, check it with you and file it calmly, please send everything by " + dueText + ".",
      "",
      "The questionnaire below only has questions that apply to you. Most are yes or no, and each says why we ask. If the answer is yes, the list at the end says what to send. It should take about " + minutes + " minutes.",
      "",
      "Photos and app downloads are fine. Please don't email passwords, full account numbers or ID documents: send those through our secure portal or tell us by phone.",
      "",
      "If something's changed or you're not sure what applies, reply and we'll book a quick call.",
      "",
      "Thanks,",
      practice
    ].join("\n");

    var lines = [];
    lines.push("YEAR-END QUESTIONNAIRE" + (who ? ": " + who : ""));
    lines.push("Please send by " + dueText + " (filing deadline " + deadlineText + ")");
    lines.push("Client type: " + types.map(function (t) { return TYPE_LABELS[t]; }).join(", "));
    lines.push("");
    questions.forEach(function (x) {
      lines.push(x.n + ". " + x.q + "   Yes / No");
      lines.push("   Why we ask: " + x.why);
    });
    lines.push("");
    lines.push("IF YOU ANSWERED YES, PLEASE SEND");
    checklist.forEach(function (c, i) { lines.push("[ ] " + (i + 1) + ". (Q" + c.q + ") " + c.item); });
    lines.push("");
    lines.push("Anything else we should know about this year?");
    lines.push("");
    lines.push("Check before you send: delete anything that doesn't apply, and check thresholds and dates against " + (country === "us" ? "irs.gov" : "gov.uk") + ".");

    return {
      country: country, types: types, recordsDue: iso(due), recordsDueText: dueText,
      deadlineText: deadlineText, warning: warning, questions: questions,
      checklist: checklist, email: email, text: lines.join("\n")
    };
  }

  var api = { buildPack: buildPack, BANK: BANK, recordsDue: recordsDue };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  // ---- DOM wiring ----
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function checked(name) {
    return Array.prototype.slice.call(document.querySelectorAll("input[name=" + name + "]:checked")).map(function (e) { return e.value; });
  }
  function syncCountry() {
    var c = $("qb-country").value;
    Array.prototype.forEach.call(document.querySelectorAll("[data-qb-country]"), function (el) {
      el.hidden = el.getAttribute("data-qb-country") !== c;
    });
    var dl = $("qb-deadline");
    if (!dl.dataset.touched) dl.value = c === "us" ? "2027-04-15" : "2027-01-31";
  }
  var last = null;
  function run() {
    var t = new Date();
    var res = buildPack({
      country: $("qb-country").value, types: checked("qb-type"), events: checked("qb-ev"),
      deadline: $("qb-deadline").value, prepWeeks: $("qb-prep").value,
      today: t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2),
      client: $("qb-client").value, practice: $("qb-practice").value, threshold: $("qb-threshold").value
    });
    var out = $("qb-out");
    if (res.error) { out.innerHTML = "<p class=\"qb-warn\">" + esc(res.error) + "</p>"; return; }
    last = res;
    var h = "<p class=\"qb-due\"><strong>Records due: " + esc(res.recordsDueText) + "</strong> (filing deadline " + esc(res.deadlineText) + "). " + res.questions.length + " questions, " + res.checklist.length + " items on the checklist.</p>";
    if (res.warning) h += "<p class=\"qb-warn\">" + esc(res.warning) + "</p>";
    h += "<ol class=\"qb-q\">" + res.questions.map(function (x) { return "<li><strong>" + esc(x.q) + "</strong><br><span>Why we ask: " + esc(x.why) + "</span></li>"; }).join("") + "</ol>";
    h += "<p><button type=\"button\" id=\"qb-copy\">Copy questionnaire + checklist</button> <button type=\"button\" id=\"qb-copy-email\" class=\"ghost\">Copy cover email</button> <button type=\"button\" id=\"qb-dl\" class=\"ghost\">Download .txt</button> <span id=\"qb-msg\" aria-live=\"polite\"></span></p>";
    h += "<details><summary>Preview the cover email</summary><pre class=\"email\">" + esc(res.email) + "</pre></details>";
    out.innerHTML = h;
    $("qb-copy").onclick = function () { copy(res.text); };
    $("qb-copy-email").onclick = function () { copy(res.email); };
    $("qb-dl").onclick = function () {
      var blob = new Blob([res.email + "\n\n----\n\n" + res.text], { type: "text/plain" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "year-end-questionnaire" + (res.country === "us" ? "-us" : "-uk") + ".txt";
      document.body.appendChild(a); a.click(); a.remove();
    };
  }
  function copy(text) {
    var msg = $("qb-msg");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { msg.textContent = "Copied."; }, function () { msg.textContent = "Select and copy from the download instead."; });
    } else msg.textContent = "Use Download .txt instead.";
  }
  document.addEventListener("DOMContentLoaded", function () {
    if (!$("qb-go")) return;
    $("qb-country").addEventListener("change", syncCountry);
    $("qb-deadline").addEventListener("input", function () { this.dataset.touched = "1"; });
    $("qb-go").addEventListener("click", run);
    syncCountry();
  });
})();
