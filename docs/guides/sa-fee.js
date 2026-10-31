// Self Assessment tax return fee calculator: prices one client's return from
// the pages it needs (SA102 employments, SA103 self-employments, SA104
// partnerships, SA105 property, SA106 foreign, SA108 gains, SA109 residence,
// SA101 reliefs), the state of their records and when the records arrive;
// adds MTD for Income Tax quarterly updates as a separate yearly service; and
// writes a fixed-fee quote email, a late-records clause and a price list CSV.
// The minutes are editable starting guesses, not market data. Runs in the
// browser and in node (module.exports) for tests. Nothing typed is sent
// anywhere.
(function () {
  // Minutes per item. Starting guesses only: the page tells users to time a
  // few of their own returns and replace them.
  var TIMES = {
    base: 45,        // SA100 core: personal details, review with client, submit
    savings: 10,     // interest and dividends on the main return
    employment: 15,  // one SA102 from a P60 / P11D
    seShort: 90,     // one SA103S business from categorised records
    seFull: 150,     // one SA103F business from categorised records
    partnership: 20, // one SA104 share from the partnership statement
    property: 60,    // SA105, first property
    propertyExtra: 30, // each further property
    foreign: 60,     // SA106
    cgt: 45,         // SA108, per disposal (or share pool)
    residence: 90,   // SA109
    pension: 10,     // SA101 / main return: pension contributions, Gift Aid
    hicbc: 15,       // High Income Child Benefit Charge
    studentLoan: 5,  // student or postgraduate loan
    poaReduce: 15,   // claim to reduce payments on account
    firstYear: 60,   // new client: authorisation, ID checks, last year's return
    queries: 30,     // queries, chasing, explaining the bill
    mtdUpdate: 30    // one MTD quarterly update for one income source
  };
  var TIME_LABEL = {
    base: "Main return and filing", savings: "Interest and dividends", employment: "Each employment",
    seShort: "Self-employment, short", seFull: "Self-employment, full", partnership: "Partnership share",
    property: "First property", propertyExtra: "Each further property", foreign: "Foreign income",
    cgt: "Each disposal", residence: "Residence pages", pension: "Pension and Gift Aid", hicbc: "Child Benefit Charge",
    studentLoan: "Student loan", poaReduce: "Reduce payments on account", firstYear: "New client set-up",
    queries: "Queries and chasing", mtdUpdate: "One MTD quarterly update"
  };
  // Multiplies the bookwork behind self-employment and property pages only.
  var RECORDS = { summary: 1.0, statements: 1.6, bag: 2.2 };
  var RECORDS_LABEL = {
    summary: "categorised totals or a spreadsheet",
    statements: "bank statements and receipts to categorise",
    bag: "a bag or box of loose paperwork"
  };
  // When the complete records arrive -> default surcharge %.
  var LATE = { nov: 0, dec: 15, jan1: 30, jan2: 50 };
  var LATE_LABEL = {
    nov: "by 30 November",
    dec: "in December",
    jan1: "1 to 15 January",
    jan2: "after 15 January"
  };
  var VAT_RATE = 0.20;
  var YEARS = ["2025/26", "2026/27"];

  function num(v, dflt) {
    if (v === undefined || v === null || v === "") return dflt;
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(/[£,\s]/g, ""));
    return isFinite(n) ? n : dflt;
  }
  function pos(v, dflt) { var n = num(v, dflt); return n < 0 ? 0 : n; }
  function cnt(v) { return Math.min(Math.floor(pos(v, 0)), 50); }
  function roundUp(x, step) { step = step || 5; return x <= 0 ? 0 : Math.ceil(x / step - 1e-9) * step; }
  function money(x) {
    var s = (Math.round(x * 100) / 100).toFixed(2).replace(/\.00$/, "");
    var parts = s.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return "£" + parts.join(".");
  }
  function hrs(mins) { return (Math.round(mins / 6) / 10).toString(); }
  function times(over) {
    var t = {}, k;
    for (k in TIMES) t[k] = TIMES[k];
    if (over) for (k in over) if (t.hasOwnProperty(k)) t[k] = pos(over[k], t[k]);
    return t;
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  // "2025/26" -> { year, endYear: 2026, filing: "31 January 2027", paper: "31 October 2026", taxCode: "30 December 2026" }
  function taxYear(y) {
    if (YEARS.indexOf(y) < 0) y = YEARS[0];
    var end = parseInt(y.slice(0, 4), 10) + 1;
    return {
      year: y,
      endYear: end,
      filing: "31 January " + (end + 1),
      paper: "31 October " + end,
      taxCode: "30 December " + end
    };
  }

  // Work out the minutes and the fee for one client's return.
  function quote(o) {
    o = o || {};
    var t = times(o.times);
    var rate = pos(o.rate, 0);
    var records = RECORDS.hasOwnProperty(o.records) ? o.records : "summary";
    var when = LATE.hasOwnProperty(o.when) ? o.when : "nov";
    var latePct = o.latePct && o.latePct.hasOwnProperty(when) ? pos(o.latePct[when], LATE[when]) : LATE[when];
    var contingency = Math.min(pos(o.contingency, 10), 100);
    var lines = [], warnings = [];
    function add(label, mins, page) { if (mins > 0) lines.push({ label: label, mins: Math.round(mins), page: page || "" }); }

    var emp = cnt(o.employments), seS = cnt(o.seShort), seF = cnt(o.seFull), part = cnt(o.partnerships);
    var props = cnt(o.properties), gains = cnt(o.disposals);
    var mult = RECORDS[records];

    add("Main return, review with you and filing", t.base, "SA100");
    if (o.savings) add("Interest and dividends", t.savings, "SA100");
    if (emp) add(plural(emp, "employment", "employments") + " (P60 / P11D)", emp * t.employment, "SA102");
    if (seS) add(plural(seS, "self-employment", "self-employments") + ", short pages", seS * t.seShort * mult, "SA103S");
    if (seF) add(plural(seF, "self-employment", "self-employments") + ", full pages", seF * t.seFull * mult, "SA103F");
    if (part) add(plural(part, "partnership share", "partnership shares"), part * t.partnership, "SA104");
    if (props) add(plural(props, "rental property", "rental properties"), (t.property + (props - 1) * t.propertyExtra) * mult, "SA105");
    if (o.foreign) add("Foreign income", t.foreign, "SA106");
    if (gains) add(plural(gains, "disposal", "disposals") + " for capital gains", gains * t.cgt, "SA108");
    if (o.residence) add("Residence pages", t.residence, "SA109");
    if (o.pension) add("Pension contributions and Gift Aid", t.pension, "SA100 / SA101");
    if (o.hicbc) add("High Income Child Benefit Charge", t.hicbc, "SA100");
    if (o.studentLoan) add("Student or postgraduate loan", t.studentLoan, "SA100");
    if (o.poaReduce) add("Claim to reduce payments on account", t.poaReduce, "SA303");
    if (o.firstYear) add("New client set-up: authorisation, ID checks, last year's return", t.firstYear, "");
    add("Queries, chasing and explaining the bill", t.queries, "");

    var base = 0, i;
    for (i = 0; i < lines.length; i++) base += lines[i].mins;
    var withCont = base * (1 + contingency / 100);
    var withLate = withCont * (1 + latePct / 100);
    var hours = withLate / 60;
    var fee = roundUp(hours * rate, 5);
    var normalFee = roundUp(withCont / 60 * rate, 5);

    // MTD for Income Tax: quarterly updates per income source (each
    // self-employment and the property business), a separate yearly service.
    var sources = seS + seF + (props ? 1 : 0), mtd = null;
    if (o.mtd) {
      if (!sources) warnings.push("MTD for Income Tax only covers self-employment and property income. With neither, there are no quarterly updates to price.");
      else {
        var mMins = 4 * sources * t.mtdUpdate * mult * (1 + contingency / 100);
        var mFee = roundUp(mMins / 60 * rate, 5);
        mtd = { sources: sources, updates: 4 * sources, mins: Math.round(mMins), fee: mFee, monthly: roundUp(mFee / 12, 1) };
      }
    }

    if (!rate) warnings.push("Enter your hourly rate. If you don't know it, work it out first with the bookkeeping fee calculator.");
    if (seS && seF === 0 && o.turnoverOver) warnings.push("The short self-employment pages (SA103S) are only for turnover below the VAT threshold (£90,000). Use the full pages (SA103F).");
    if (gains && o.residentialSale) warnings.push("A UK residential property sale with a gain also needs a separate Capital Gains Tax return within 60 days of completion. Price that as its own job.");
    if (when === "jan2") warnings.push("Records after 15 January leave little time before the " + taxYear(o.taxYear).filing + " deadline. Say in the quote that you can't promise to file on time, and tell the client the £100 penalty applies even if no tax is due.");
    if (records === "bag" && (seS + seF + props) === 0) warnings.push("Loose paperwork only changes the time for self-employment and property pages. Nothing else here is affected.");

    return {
      rate: rate, records: records, when: when, latePct: latePct, contingency: contingency,
      lines: lines, baseMins: Math.round(base), mins: Math.round(withLate), hours: hrs(withLate),
      fee: fee, normalFee: normalFee, surcharge: fee - normalFee,
      vat: o.vatReg ? roundUp(fee * (1 + VAT_RATE), 0.01) : null,
      mtd: mtd, warnings: warnings, year: taxYear(o.taxYear)
    };
  }

  // Price list: a fixed price per page or add-on at the given rate and
  // contingency (no late surcharge), as rows plus a CSV.
  function priceList(o) {
    o = o || {};
    var t = times(o.times), rate = pos(o.rate, 0), c = 1 + Math.min(pos(o.contingency, 10), 100) / 100;
    function p(mins) { return roundUp(mins * c / 60 * rate, 5); }
    var rows = [
      ["Main return (SA100) with interest and dividends, review and filing", p(t.base + t.savings + t.queries)],
      ["Each employment (SA102)", p(t.employment)],
      ["Each self-employment, short pages (SA103S), from categorised records", p(t.seShort)],
      ["Each self-employment, full pages (SA103F), from categorised records", p(t.seFull)],
      ["Each partnership share (SA104)", p(t.partnership)],
      ["Rental property (SA105), first property", p(t.property)],
      ["Each further property", p(t.propertyExtra)],
      ["Foreign income (SA106)", p(t.foreign)],
      ["Each capital gains disposal (SA108)", p(t.cgt)],
      ["Residence pages (SA109)", p(t.residence)],
      ["High Income Child Benefit Charge", p(t.hicbc)],
      ["Claim to reduce payments on account", p(t.poaReduce)],
      ["New client set-up (first year only)", p(t.firstYear)],
      ["MTD quarterly updates, per income source per year", p(4 * t.mtdUpdate)]
    ];
    var csv = "Item,Price (GBP" + (o.vatReg ? ", plus VAT" : "") + ")\n";
    for (var i = 0; i < rows.length; i++) csv += '"' + rows[i][0] + '",' + rows[i][1] + "\n";
    var late = o.latePct || LATE;
    csv += '"Records ' + LATE_LABEL.dec + '",+' + pos(late.dec, LATE.dec) + "%\n";
    csv += '"Records ' + LATE_LABEL.jan1 + '",+' + pos(late.jan1, LATE.jan1) + "%\n";
    csv += '"Records ' + LATE_LABEL.jan2 + ' (filing on time not guaranteed)",+' + pos(late.jan2, LATE.jan2) + "%\n";
    csv += '"Bookwork from bank statements and receipts",x' + RECORDS.statements + "\n";
    csv += '"Bookwork from loose paperwork",x' + RECORDS.bag + "\n";
    return { rows: rows, csv: csv };
  }

  // The late-records clause for the engagement letter.
  function lateClause(o) {
    o = o || {};
    var y = taxYear(o.taxYear), late = o.latePct || LATE;
    var d = pos(late.dec, LATE.dec), j1 = pos(late.jan1, LATE.jan1), j2 = pos(late.jan2, LATE.jan2);
    return "Records and deadlines. Our fixed fee assumes we receive your complete records by 30 November " + y.endYear + ". " +
      "If they arrive in December the fee rises by " + d + "%, and between 1 and 15 January " + (y.endYear + 1) + " by " + j1 + "%, " +
      "because the work has to be done in our busiest weeks. If they arrive after 15 January we will do our best, add " + j2 + "%, " +
      "and cannot promise to file by " + y.filing + ". HMRC charges a £100 penalty for a late return even if no tax is due, " +
      "and that penalty is yours to pay.";
  }

  // Fixed-fee quote email for the client.
  function email(o, q) {
    o = o || {};
    q = q || quote(o);
    var y = q.year, name = (o.client || "").trim() || "there", me = (o.me || "").trim() || "[your name]";
    var inc = [], i;
    for (i = 0; i < q.lines.length; i++) if (q.lines[i].label.indexOf("Queries") !== 0) inc.push("- " + q.lines[i].label + (q.lines[i].page ? " (" + q.lines[i].page + ")" : ""));
    var feeLine = money(q.fee) + (q.vat !== null ? " plus VAT (" + money(q.vat) + " in total)" : "");
    var s = "Hi " + name + ",\n\n" +
      "Thanks for asking us to do your " + y.year + " Self Assessment tax return. Our fixed fee is " + feeLine + ".\n\n" +
      "That covers:\n" + inc.join("\n") + "\n- Answering your questions and explaining your tax bill and any payments on account\n\n";
    if (q.surcharge > 0) s += "It includes a " + q.latePct + "% late-records charge because the records are due " + LATE_LABEL[q.when] + ". If you can get everything to us by 30 November, the fee is " + money(q.normalFee) + ".\n\n";
    s += "It assumes:\n" +
      "- Your records are complete and arrive " + (q.when === "nov" ? "by 30 November " + y.endYear : LATE_LABEL[q.when]) + "\n" +
      "- The bookwork comes as " + RECORDS_LABEL[q.records] + "\n" +
      "- One round of questions, answered within a week\n\n" +
      "Not included (we'll quote first if you need them): HMRC enquiries or letters, amending a return after filing, earlier years, " +
      "Capital Gains Tax returns for UK property sales (due within 60 days), and paying the tax itself.\n\n";
    if (q.mtd) s += "Making Tax Digital for Income Tax: quarterly updates for your " + plural(q.mtd.sources, "income source", "income sources") + " are a separate service at " + money(q.mtd.fee) + " a year (" + money(q.mtd.monthly) + " a month).\n\n";
    s += "The online deadline is " + y.filing + ", and any tax owed is due the same day. " +
      "If you'd like any tax owed collected through your tax code instead, we need to file by " + y.taxCode + " (this only works if you're employed or get a pension and owe less than £3,000).\n\n" +
      "If you're happy to go ahead, just reply to this email and we'll send the engagement letter.\n\n" +
      "Thanks,\n" + me;
    return s;
  }

  var api = { TIMES: TIMES, RECORDS: RECORDS, LATE: LATE, LATE_LABEL: LATE_LABEL, YEARS: YEARS,
    taxYear: taxYear, quote: quote, priceList: priceList, lateClause: lateClause, email: email,
    money: money, roundUp: roundUp };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  // ---------- browser wiring ----------
  function $(id) { return document.getElementById(id); }
  function val(id) { var e = $(id); return e ? e.value : ""; }
  function chk(id) { var e = $(id); return !!(e && e.checked); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function readTimes() {
    var o = {}, k;
    for (k in TIMES) { var e = $("sa-t-" + k); if (e && e.value !== "") o[k] = e.value; }
    return o;
  }
  function read() {
    return {
      taxYear: val("sa-year"), rate: val("sa-rate"), contingency: val("sa-cont"), vatReg: chk("sa-vatreg"),
      employments: val("sa-emp"), seShort: val("sa-ses"), seFull: val("sa-sef"), partnerships: val("sa-part"),
      properties: val("sa-prop"), disposals: val("sa-cgt"), savings: chk("sa-sav"), foreign: chk("sa-for"),
      residence: chk("sa-res"), pension: chk("sa-pen"), hicbc: chk("sa-hicbc"), studentLoan: chk("sa-sl"),
      poaReduce: chk("sa-poa"), firstYear: chk("sa-new"), mtd: chk("sa-mtd"), turnoverOver: chk("sa-over"),
      residentialSale: chk("sa-resi"), records: val("sa-records"), when: val("sa-when"),
      latePct: { dec: val("sa-l-dec"), jan1: val("sa-l-jan1"), jan2: val("sa-l-jan2") },
      client: val("sa-client"), me: val("sa-me"), times: readTimes()
    };
  }
  function render() {
    var o = read(), q = quote(o), h = "", i;
    h += '<table class="t"><tr><th>Item</th><th>Page</th><th>Minutes</th></tr>';
    for (i = 0; i < q.lines.length; i++) h += "<tr><td>" + esc(q.lines[i].label) + "</td><td>" + esc(q.lines[i].page) + "</td><td>" + q.lines[i].mins + "</td></tr>";
    h += "<tr><td colspan=2>Plus " + q.contingency + "% contingency" + (q.latePct ? " and " + q.latePct + "% late-records charge" : "") + "</td><td><strong>" + q.mins + "</strong> (" + q.hours + " h)</td></tr></table>";
    h += '<p class="qb-due"><strong>Fixed fee: ' + money(q.fee) + (q.vat !== null ? " plus VAT = " + money(q.vat) : "") + "</strong>";
    if (q.surcharge > 0) h += " · " + money(q.normalFee) + " if the records arrive by 30 November";
    h += "</p>";
    if (q.mtd) h += '<p class="qb-due">MTD quarterly updates: ' + q.mtd.updates + " a year for " + plural(q.mtd.sources, "income source", "income sources") + " = <strong>" + money(q.mtd.fee) + " a year</strong> (" + money(q.mtd.monthly) + " a month), on top of the return.</p>";
    for (i = 0; i < q.warnings.length; i++) h += '<p class="qb-warn">' + esc(q.warnings[i]) + "</p>";
    $("sa-out").innerHTML = h;
    $("sa-email").value = email(o, q);
    $("sa-clause").value = lateClause(o);
    var pl = priceList(o), t = '<table class="t"><tr><th>Item</th><th>Price' + (o.vatReg ? " (plus VAT)" : "") + "</th></tr>";
    for (i = 0; i < pl.rows.length; i++) t += "<tr><td>" + esc(pl.rows[i][0]) + "</td><td>" + money(pl.rows[i][1]) + "</td></tr>";
    $("sa-pl").innerHTML = t + "</table>";
    $("sa-pl").setAttribute("data-csv", pl.csv);
    if (window.parent !== window) try { window.parent.postMessage({ ptHeight: document.documentElement.scrollHeight }, "*"); } catch (e) {}
  }
  function copy(id, btn) {
    var e = $(id); e.select();
    if (navigator.clipboard) navigator.clipboard.writeText(e.value);
    btn.textContent = "Copied";
    setTimeout(function () { btn.textContent = "Copy"; }, 1500);
  }
  function init() {
    if (!$("sa-tool")) return;
    var k, box = $("sa-times");
    if (box) {
      var h = "";
      for (k in TIMES) h += '<label>' + TIME_LABEL[k] + ' <input id="sa-t-' + k + '" inputmode="numeric" value="' + TIMES[k] + '"></label>';
      box.innerHTML = h;
    }
    $("sa-tool").addEventListener("input", render);
    $("sa-tool").addEventListener("change", render);
    $("sa-copy-email").addEventListener("click", function () { copy("sa-email", this); });
    $("sa-copy-clause").addEventListener("click", function () { copy("sa-clause", this); });
    $("sa-csv").addEventListener("click", function () {
      var a = document.createElement("a");
      a.href = "data:text/csv;charset=utf-8," + encodeURIComponent($("sa-pl").getAttribute("data-csv"));
      a.download = "self-assessment-price-list.csv";
      document.body.appendChild(a); a.click(); a.remove();
    });
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
