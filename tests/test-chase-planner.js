// node tests/test-chase-planner.js
var cp = require("../docs/guides/chase-planner.js");
var pass = 0, fail = 0;
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log("FAIL " + name + "\n  got  " + JSON.stringify(got) + "\n  want " + JSON.stringify(want)); }
}
function dates(r) { return r.steps.map(function (s) { return s.key + " " + s.iso; }); }

// SA return, 31 Jan 2027, 4 weeks to prepare, first request Mon 2 Nov 2026.
var r = cp.planChase({ start: "2026-11-02", deadline: "2027-01-31", prepDays: 28 });
// 3 Jan 2027 is a Sunday; Fri 1 Jan is a bank holiday -> Thu 31 Dec.
// 17 Jan is a Sunday -> Fri 15 Jan. The headline dates are the sent dates.
eq("sa due", r.recordsDue, "2026-12-31");
eq("sa last", r.lastChance, "2027-01-15");
eq("sa steps", dates(r), ["request 2026-11-02", "nudge 2026-11-09", "progress 2026-11-16", "firm 2026-12-31", "last 2027-01-15"]);
eq("sa flags", [r.late, r.compressed, r.daysLeft], [false, false, 90]);

// Short run-up: 7 Feb MTD update, prep 7 days, start Mon 19 Jan 2027.
r = cp.planChase({ start: "2027-01-19", deadline: "2027-02-07", prepDays: 7 });
eq("mtd due", r.recordsDue, "2027-01-29");
eq("mtd compressed", r.compressed, true);
// gap 12: nudge +4 (Sat 23 -> Fri 22), progress +8 (Wed 27), firm Sun 31 -> Fri 29, last 7-4=3 Feb (Wed).
eq("mtd steps", dates(r), ["request 2027-01-19", "nudge 2027-01-22", "progress 2027-01-27", "firm 2027-01-29", "last 2027-02-03"]);

// Records date already passed.
r = cp.planChase({ start: "2027-01-20", deadline: "2027-01-31", prepDays: 14 });
eq("late flag", r.late, true);
eq("late steps", dates(r), ["firm 2027-01-20", "last 2027-01-22"]);

// Too late even for last chance: only the firm reminder today.
r = cp.planChase({ start: "2027-01-29", deadline: "2027-01-31", prepDays: 14 });
eq("very late", dates(r), ["firm 2027-01-29"]);

// Errors.
eq("past deadline", !!cp.planChase({ start: "2027-02-01", deadline: "2027-01-31", prepDays: 7 }).error, true);
eq("same day", !!cp.planChase({ start: "2027-01-31", deadline: "2027-01-31", prepDays: 7 }).error, true);
eq("bad date", !!cp.planChase({ start: "2027-02-30", deadline: "2027-03-31", prepDays: 7 }).error, true);
eq("bad prep", !!cp.planChase({ start: "2026-11-02", deadline: "2027-01-31", prepDays: "abc" }).error, true);
eq("empty", !!cp.planChase({ start: "", deadline: "" }).error, true);

// Zero prep is rejected; 2 days: last chance can't fall before records due.
eq("zero prep", !!cp.planChase({ start: "2026-11-02", deadline: "2027-01-31", prepDays: 0 }).error, true);
r = cp.planChase({ start: "2026-11-02", deadline: "2027-01-29", prepDays: 2 });
eq("short prep last=due", r.lastChance, r.recordsDue);
eq("short prep no last step", r.steps.map(function (s) { return s.key; }), ["request", "nudge", "progress", "firm"]);

// Steps strictly increase and stay before the deadline, for many inputs.
var ok = true;
for (var s = 0; s < 120; s++) for (var p = 1; p <= 61; p += 3) {
  var st = new Date(Date.UTC(2026, 10, 1) + s * 86400000).toISOString().slice(0, 10);
  var q = cp.planChase({ start: st, deadline: "2027-04-15", prepDays: p });
  if (q.error) continue;
  for (var k = 0; k < q.steps.length; k++) {
    if (q.steps[k].iso >= q.deadline) ok = false;
    if (k && q.steps[k].iso <= q.steps[k - 1].iso) { ok = false; console.log(st, p, dates(q)); }
  }
}
eq("monotonic", ok, true);

// Christmas: records due would be Sat 26 Dec 2026 -> Thu 24 Dec.
r = cp.planChase({ start: "2026-11-02", deadline: "2027-01-23", prepDays: 28 });
eq("xmas", r.recordsDue, "2026-12-24");

// No weekend sends except the request (user's choice) where unavoidable.
var wk = 0;
for (s = 0; s < 120; s++) {
  st = new Date(Date.UTC(2026, 10, 2) + s * 86400000);
  if (st.getUTCDay() === 0 || st.getUTCDay() === 6) continue;
  q = cp.planChase({ start: st.toISOString().slice(0, 10), deadline: "2027-04-15", prepDays: 28 });
  if (q.error) continue;
  q.steps.slice(1).forEach(function (x) { var d = x.date.getUTCDay(), md = x.iso.slice(5); if (d === 0 || d === 6 || md === '12-25' || md === '12-26' || md === '01-01') wk++; });
}
eq("no weekend sends", wk, 0);

// ICS.
r = cp.planChase({ start: "2026-11-02", deadline: "2027-01-31", prepDays: 28 });
var ics = cp.toICS(r, "J Smith, plumber");
eq("ics events", (ics.match(/BEGIN:VEVENT/g) || []).length, 6);
eq("ics first", /DTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261103/.test(ics), true);
eq("ics summary escaped", /SUMMARY:Request: J Smith  plumber/.test(ics), true);
eq("ics deadline", /SUMMARY:Filing deadline: J Smith/.test(ics), true);
eq("ics crlf", ics.indexOf("\n") === ics.indexOf("\r\n") + 1, true);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
