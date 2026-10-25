// Making Tax Digital for Income Tax: start-date checker and quarterly
// deadline finder. Runs in the browser and in node (module.exports) for
// tests. Nothing typed is sent anywhere.
// Rules from gov.uk (checked 25 Oct 2026):
// /guidance/find-out-if-and-when-you-need-to-use-making-tax-digital-for-income-tax
// /guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates
// /guidance/penalties-for-making-tax-digital-for-income-tax
(function () {
  // Qualifying income in a tax year decides the start date two years later.
  var PHASES = [
    { year: "2024 to 2025", key: "y2425", over: 50000, start: 2026 },
    { year: "2025 to 2026", key: "y2526", over: 30000, start: 2027 },
    { year: "2026 to 2027", key: "y2627", over: 20000, start: 2028 }
  ];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  function num(v) {
    if (v === undefined || v === null || v === "") return null;
    var n = Number(String(v).replace(/[£,\s]/g, ""));
    return isFinite(n) && n >= 0 ? n : NaN;
  }

  // inc: {y2425, y2526, y2627} gross self-employment + property income
  // (before expenses). Blank = unknown.
  function mtdStart(inc) {
    for (var i = 0; i < PHASES.length; i++) {
      var p = PHASES[i], v = num(inc[p.key]);
      if (isNaN(v)) return { error: "Enter amounts as numbers, e.g. 42000." };
      if (v !== null && v > p.over) {
        return { start: p.start, phase: p, amount: v };
      }
    }
    var known = PHASES.filter(function (p) { return num(inc[p.key]) !== null; });
    if (!known.length) return { error: "Enter at least one year's qualifying income." };
    return { start: null, unknown: known.length < PHASES.length };
  }

  function d(y, m, day) { return new Date(Date.UTC(y, m - 1, day)); }
  function fmt(dt) { return dt.getUTCDate() + " " + MONTHS[dt.getUTCMonth()] + " " + dt.getUTCFullYear(); }

  // The four quarterly updates for the tax year starting 6 April y.
  // Each update is cumulative: it covers the tax year so far.
  function quarters(y) {
    return [
      { q: 1, deadline: d(y, 8, 7), std: "6 April to 5 July " + y, cal: "1 April to 30 June " + y },
      { q: 2, deadline: d(y, 11, 7), std: "6 April to 5 October " + y, cal: "1 April to 30 September " + y },
      { q: 3, deadline: d(y + 1, 2, 7), std: "6 April " + y + " to 5 January " + (y + 1), cal: "1 April to 31 December " + y },
      { q: 4, deadline: d(y + 1, 5, 7), std: "6 April " + y + " to 5 April " + (y + 1), cal: "1 April " + y + " to 31 March " + (y + 1) }
    ].map(function (x) { x.taxYear = y; return x; });
  }

  // The next quarterly update due on or after `today` for someone who
  // started MTD on 6 April `startYear`.
  function nextUpdate(today, startYear) {
    var t = d(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate());
    var first = d(startYear, 4, 6);
    var list = [];
    for (var y = startYear; y <= Math.max(startYear, t.getUTCFullYear()); y++) list = list.concat(quarters(y));
    list = list.filter(function (x) { return x.deadline >= t; });
    var u = list[0];
    u.days = Math.round((u.deadline - t) / 86400000);
    u.taxYearLabel = u.taxYear + " to " + (u.taxYear + 1);
    // No penalty points for late quarterly updates in 2026 to 2027 only.
    u.points = u.taxYear >= 2027;
    u.notStarted = t < first;
    return u;
  }

  // Which return is due next, and is it filed through MTD software?
  function nextReturn(today, startYear) {
    var t = d(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate());
    // The tax year (starting 6 April y) whose return is due 31 January y+2.
    var y = t > d(t.getUTCFullYear(), 1, 31) ? t.getUTCFullYear() - 1 : t.getUTCFullYear() - 2;
    return { taxYear: y, label: y + " to " + (y + 1), due: d(y + 2, 1, 31), viaMtd: y >= startYear };
  }

  var api = { mtdStart: mtdStart, quarters: quarters, nextUpdate: nextUpdate, nextReturn: nextReturn, fmt: fmt };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function money(n) { return "£" + n.toLocaleString("en-GB"); }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("mtd-go");
    if (!btn) return;
    var out = document.getElementById("mtd-out");
    function val(id) { return document.getElementById(id).value; }
    function run() {
      var r = mtdStart({ y2425: val("mtd-y2425"), y2526: val("mtd-y2526"), y2627: val("mtd-y2627") });
      if (r.error) { out.innerHTML = "<p><strong>" + esc(r.error) + "</strong></p>"; return; }
      var today = new Date();
      if (r.start === null) {
        out.innerHTML = "<p><strong>On these figures, MTD for Income Tax doesn't apply yet.</strong> None of the years is over its threshold" +
          (r.unknown ? ", but one or more years are blank. Check again when you know them." : ". If qualifying income stays at £20,000 or less, it doesn't apply at all.") +
          " You still file a normal Self Assessment return.</p>";
        return;
      }
      var u = nextUpdate(today, r.start), ret = nextReturn(today, r.start);
      var html = "<p><strong>Start date: 6 April " + r.start + ".</strong> Qualifying income of " + money(r.amount) + " in " + r.phase.year +
        " is over the " + money(r.phase.over) + " threshold. " +
        (r.start === 2026 ? "That means now: HMRC should have written, but it's your responsibility to sign up even without a letter." : "HMRC will write after checking that year's return, but sign up yourself if no letter comes.") + "</p>";
      html += "<p><strong>" + (u.notStarted ? "First" : "Next") + " quarterly update: " + fmt(u.deadline) + "</strong> (" + u.days + " day" + (u.days === 1 ? "" : "s") + " away). " +
        "It's update " + u.q + " for " + u.taxYearLabel + " and covers the tax year so far: <em>" + esc(u.std) + "</em> (standard periods) or <em>" + esc(u.cal) + "</em> (calendar periods). " +
        (u.points ? "A late update earns a penalty point; 4 points means a £200 penalty." : "No penalty points for late quarterly updates in 2026 to 2027, but you can't file the year's return through the software until all four are sent.") + "</p>";
      html += "<p><strong>Next tax return: " + ret.label + ", due " + fmt(ret.due) + "</strong>, " +
        (ret.viaMtd ? "submitted through your MTD software." : "filed the usual way, not through MTD software" + (ret.taxYear <= 2025 ? ", under the current penalty rules." : ".")) + "</p>";
      out.innerHTML = html;
    }
    btn.addEventListener("click", run);
  });
})();
