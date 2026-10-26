// Records chase planner: works back from a filing deadline to a
// records-due date, a last-chance date and the dated chasing sequence from
// the records-chaser skill (request, nudge, progress update, firm reminder,
// last chance). Runs in the browser and in node (module.exports) for tests.
// Nothing typed is sent anywhere. Dates are handled as UTC calendar days.
(function () {
  var DAY = 86400000;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function parse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCMonth() === +m[2] - 1 ? d : null;
  }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function add(d, n) { return new Date(d.getTime() + n * DAY); }
  function diff(a, b) { return Math.round((b.getTime() - a.getTime()) / DAY); }
  function fmt(d) { return WEEKDAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }

  // Weekends plus 25 and 26 December and 1 January (holidays in the UK and,
  // for 25 Dec and 1 Jan, the US) are not good days to send a chaser.
  function off(d) {
    var wd = d.getUTCDay(), md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    return wd === 0 || wd === 6 || md === 1225 || md === 1226 || md === 101;
  }
  // Move a send date off a weekend or holiday: to the working day before,
  // unless that is on or before `after`, then to the working day after
  // (left as it is if that would pass `limit`).
  function workday(d, after, limit) {
    if (!off(d)) return d;
    var back = d, fwd = d;
    while (off(back)) back = add(back, -1);
    if (!after || back > after) return back;
    while (off(fwd)) fwd = add(fwd, 1);
    return limit && fwd > limit ? d : fwd;
  }

  // opts: {start, deadline, prepDays}. start/deadline are "YYYY-MM-DD".
  // prepDays: how long you need between receiving records and the deadline.
  function planChase(opts) {
    var start = parse(opts.start), deadline = parse(opts.deadline);
    var prep = Number(opts.prepDays);
    if (!start || !deadline) return { error: "Enter both dates." };
    prep = Math.round(prep);
    if (!isFinite(prep) || prep < 1 || prep > 365) return { error: "Enter the time you need to prepare as a number of days (1 to 365)." };
    var left = diff(start, deadline);
    if (left <= 0) return { error: "That deadline is today or has passed. Call the client now, and check the penalty and reasonable-excuse rules with the accountant." };

    var due = add(deadline, -prep);
    // Last chance sits halfway between records due and the deadline, and at
    // least 3 days before the deadline.
    var last = add(deadline, -Math.max(3, Math.ceil(prep / 2)));
    if (last < due) last = due;
    var steps = [], late = false, compressed = false;

    if (diff(start, due) <= 0) {
      // Records-due date already passed: skip straight to firm + last chance.
      late = true;
      steps.push({ key: "firm", name: "Firm reminder", date: start });
      if (diff(start, last) > 0) steps.push({ key: "last", name: "Last chance", date: last });
    } else {
      var gap = diff(start, due);
      steps.push({ key: "request", name: "Request", date: start });
      if (gap >= 21) {
        steps.push({ key: "nudge", name: "Nudge", date: add(start, 7) });
        steps.push({ key: "progress", name: "Progress update", date: add(start, 14) });
      } else {
        compressed = true;
        var a = Math.round(gap / 3), b = Math.round(2 * gap / 3);
        if (a > 0 && a < gap) steps.push({ key: "nudge", name: "Nudge", date: add(start, a) });
        if (b > a && b < gap) steps.push({ key: "progress", name: "Progress update", date: add(start, b) });
      }
      steps.push({ key: "firm", name: "Firm reminder (records due)", date: due });
      if (diff(due, last) > 0) steps.push({ key: "last", name: "Last chance", date: last });
    }

    // Keep sends off weekends without reordering or passing the deadline.
    for (var i = 1; i < steps.length; i++) {
      var prev = steps[i - 1].date, lim = i + 1 < steps.length ? add(steps[i + 1].date, -1) : add(deadline, -1);
      steps[i].date = workday(steps[i].date, prev, lim);
    }
    for (var j = 0; j < steps.length; j++) {
      steps[j].iso = iso(steps[j].date);
      if (steps[j].key === "firm" && !late) due = steps[j].date;
      if (steps[j].key === "last") last = steps[j].date;
    }

    return {
      start: iso(start), deadline: iso(deadline), recordsDue: iso(due), lastChance: iso(last),
      daysLeft: left, late: late, compressed: compressed, steps: steps
    };
  }

  // A calendar file (.ics) with one all-day event per chase step.
  function toICS(plan, client) {
    var who = String(client || "client").replace(/[\r\n,;\\]/g, " ").trim() || "client";
    var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//polytheseus//records chase planner//EN", "CALSCALE:GREGORIAN"];
    var all = plan.steps.map(function (s) { return { iso: s.iso, title: s.name }; });
    all.push({ iso: plan.deadline, title: "Filing deadline" });
    all.forEach(function (e, k) {
      var d = e.iso.replace(/-/g, ""), next = iso(add(parse(e.iso), 1)).replace(/-/g, "");
      lines.push("BEGIN:VEVENT", "UID:" + d + "-" + k + "-chase@polytheseus.com", "DTSTAMP:" + stamp,
        "DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + next,
        "SUMMARY:" + e.title + ": " + who, "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }

  var api = { planChase: planChase, toICS: toICS, fmt: fmt, parse: parse };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  var NOTES = {
    request: "Send the full numbered list, how to send it, and the records-due date with the reason.",
    nudge: "Short: did this reach you? Re-attach the list and tick off anything received.",
    "progress": "Thank them for what arrived, list what's still missing, offer a 15-minute call.",
    firm: "State the facts: what happens if records arrive late (penalties, a late-work fee only if your engagement letter allows one). Switch channel if two emails went unanswered.",
    last: "Give options in writing: send by this date, file with provisional figures if the accountant agrees, or miss the deadline and what that means."
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("cp-go"), out = document.getElementById("cp-out");
    if (!btn || !out) return;
    var startEl = document.getElementById("cp-start"), dlEl = document.getElementById("cp-deadline");
    var preset = document.getElementById("cp-preset");
    startEl.value = iso(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));
    if (preset) preset.addEventListener("change", function () { if (preset.value) dlEl.value = preset.value; });
    var lastPlan = null;
    function run() {
      var r = planChase({ start: startEl.value, deadline: dlEl.value, prepDays: document.getElementById("cp-prep").value });
      if (r.error) { out.innerHTML = "<p><strong>" + esc(r.error) + "</strong></p>"; lastPlan = null; return; }
      lastPlan = r;
      var d = function (s) { return fmt(parse(s)); };
      var html = "<p><strong>Records due: " + d(r.recordsDue) + ".</strong> Last chance: " + d(r.lastChance) + ". Deadline: " + d(r.deadline) + " (" + r.daysLeft + " days away).</p>";
      if (r.late) html += "<p><strong>The records-due date has already passed,</strong> so this skips to the firm reminder today. Tell the accountant now if an extension, provisional figures or a reasonable-excuse appeal may be needed.</p>";
      else if (r.compressed) html += "<p>Less than 3 weeks until records are due, so the sequence is squeezed. Consider a call instead of the nudge.</p>";
      html += "<table class=\"t\"><tr><th>Send on</th><th>Message</th><th>What it says</th></tr>";
      r.steps.forEach(function (s) { html += "<tr><td>" + d(s.iso) + "</td><td>" + esc(s.name) + "</td><td>" + esc(NOTES[s.key]) + "</td></tr>"; });
      html += "</table><p><button type=\"button\" id=\"cp-ics\">Download calendar reminders (.ics)</button></p>";
      out.innerHTML = html;
      document.getElementById("cp-ics").addEventListener("click", function () {
        var blob = new Blob([toICS(lastPlan, document.getElementById("cp-client").value)], { type: "text/calendar" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "records-chase.ics";
        document.body.appendChild(a); a.click(); a.remove();
      });
    }
    btn.addEventListener("click", run);
  });
})();
