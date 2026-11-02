// node tests/test-agent-auth.js
var aa = require("../docs/guides/agent-auth.js");
var pass = 0, fail = 0;
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log("FAIL " + name + "\n  got  " + JSON.stringify(got) + "\n  want " + JSON.stringify(want)); }
}
var P = function (o) { var b = { deadline: "2027-01-31" }; for (var k in o) b[k] = o[k]; return aa.plan(b); };

// Mon 2 Nov 2026, defaults. Worked by hand: +7 wd Wed 11 Nov, +2 Fri 13, +3 Wed 18.
var r = P({ start: "2026-11-02" });
eq("issued", r.code.issued, "2026-11-11");
eq("arrives", r.code.arrives, "2026-11-13");
eq("access", r.code.access, "2026-11-18");
eq("expires", r.code.expires, "2026-12-11");
eq("status ok", r.code.status, "ok");
// 31 Jan 2027 is a Sunday: last working day Fri 29 Jan, minus 5 wd = Fri 22 Jan.
eq("readyBy", r.readyBy, "2027-01-22");
// 12 working days back from Fri 22 Jan = Wed 6 Jan.
eq("code latest", r.code.latest, "2027-01-06");
// Paper: +2 wd Wed 4 Nov, +6 weeks = Wed 16 Dec.
eq("paper access", r.paper.access, "2026-12-16");
// Paper latest: access <= 22 Jan. Post Tue 8 Dec: arrives Thu 10, +42 = Thu 21 Jan. Wed 9 Dec: arrives Fri 11, +42 = Fri 22 Jan.
// Thu 10 Dec: arrives Mon 14, +42 = Mon 25 Jan, too late.
eq("paper latest", r.paper.latest, "2026-12-09");
eq("defaults", r.assumptions, { postDays: 2, replyDays: 3, paperWeeks: 6, prepDays: 5 });

// The latest day really is the latest: it lands in time, and the next working day doesn't.
var at = P({ start: "2027-01-06" });
eq("latest in time", [at.code.access, at.code.status], ["2027-01-22", "ok"]);
var nx = P({ start: "2027-01-07" });
eq("next day is tight", [nx.code.access, nx.code.status], ["2027-01-25", "tight"]);

// Christmas: start Mon 21 Dec. 25 + 28 Dec and 1 Jan are holidays.
// wd: 22,23,24,29,30,31,4 Jan => issued Mon 4 Jan. +2 = Wed 6. +3 = Mon 11.
r = P({ start: "2026-12-21" });
eq("christmas issued", r.code.issued, "2027-01-04");
eq("christmas access", r.code.access, "2027-01-11");
eq("christmas expires", r.code.expires, "2027-02-03");

// Start on a weekend or holiday rolls forward.
r = P({ start: "2026-12-25" });
eq("start on holiday", r.start, "2026-12-29");
r = P({ start: "2026-11-07" });
eq("start on saturday", r.start, "2026-11-09");

// Status bands near the deadline.
r = P({ start: "2027-01-08" });
eq("tight", [r.code.access, r.code.status], ["2027-01-26", "tight"]);
r = P({ start: "2027-01-20" });
eq("late", [r.code.access, r.code.status], ["2027-02-05", "late"]);
eq("late paper", r.paper.status, "late");
// The last safe day stays a real past date, so the page can say it has gone.
eq("late keeps latest", r.code.latest, "2027-01-06");

// Paper access landing on a weekend rolls to the next working day.
r = P({ start: "2026-12-02", postDays: 3, paperWeeks: 1 });
// +3 wd Mon 7 Dec, +7 = Mon 14 Dec.
eq("paper plain", r.paper.access, "2026-12-14");
r = P({ start: "2026-12-14", postDays: 2, paperWeeks: 1 });
// Wed 16 Dec + 7 = Wed 23 Dec.
eq("paper plain 2", r.paper.access, "2026-12-23");
r = P({ start: "2026-12-16", postDays: 2, paperWeeks: 1 });
// Fri 18 Dec + 7 = Fri 25 Dec holiday, rolls past Sat, Sun, 28 Dec to Tue 29 Dec.
eq("paper holiday roll", r.paper.access, "2026-12-29");

// Zero assumptions and bad input.
r = P({ start: "2026-11-02", postDays: 0, replyDays: 0, paperWeeks: 0, prepDays: 0 });
eq("zero access", r.code.access, "2026-11-11");
eq("zero ready", r.readyBy, "2027-01-29");
eq("zero paper", r.paper.access, "2026-11-02");
r = P({ start: "2026-11-02", postDays: "abc", replyDays: -4, paperWeeks: "", prepDays: "" });
eq("bad numbers use defaults", r.assumptions, { postDays: 2, replyDays: 3, paperWeeks: 6, prepDays: 5 });
eq("caps", P({ start: "2026-11-02", paperWeeks: 9999 }).assumptions.paperWeeks, 52);
eq("no dates", aa.plan({}).error, "Enter both dates.");
eq("bad date", aa.plan({ start: "2026-02-30", deadline: "2027-01-31" }).error, "Enter both dates.");
eq("past", P({ start: "2027-02-01" }).error, "That deadline has already passed.");

// Slow client: code lapses.
r = P({ start: "2026-11-02", replyDays: 25 });
eq("lapses", r.code.codeLapses, true);
eq("no lapse by default", P({ start: "2026-11-02" }).code.codeLapses, false);

// Other deadline, 2028 holidays.
r = aa.plan({ start: "2027-11-02", deadline: "2028-01-31" });
eq("2028 ready", r.readyBy, "2028-01-24");
eq("wd", [aa.isWork(aa.parse("2028-01-03")), aa.isWork(aa.parse("2027-12-27")), aa.isWork(aa.parse("2027-12-29"))], [false, false, true]);

// Every start in the season: order holds, and latest is consistent with status.
for (var d = aa.parse("2026-11-01"); d <= aa.parse("2027-01-31"); d = new Date(d.getTime() + 86400000)) {
  var s = d.toISOString().slice(0, 10), x = P({ start: s });
  if (!(x.code.issued < x.code.arrives && x.code.arrives < x.code.access)) eq("order " + s, false, true);
  if (x.start <= x.code.latest && x.code.status !== "ok") eq("latest vs status " + s, x.code.status, "ok");
  if (x.start > x.code.latest && x.code.status === "ok") eq("after latest " + s, x.code.status, "not ok");
  if (x.start <= x.paper.latest && x.paper.status !== "ok") eq("paper vs status " + s, x.paper.status, "ok");
  if (x.start > x.paper.latest && x.paper.status === "ok") eq("paper after latest " + s, x.paper.status, "not ok");
  pass++;
}

// Client message.
r = P({ start: "2026-11-02" });
var m = aa.clientMessage(r, "Priya", "Sam");
eq("msg name", m.indexOf("Hi Priya,") === 0, true);
eq("msg date", m.indexOf("Fri 13 Nov 2026") > 0, true);
eq("msg sign", /Thanks,\nSam$/.test(m), true);
eq("msg credentials", m.indexOf("sign-in details") > 0, true);
eq("msg blank", /^Hi,\n/.test(aa.clientMessage(r, " ", "")) && /Thanks$/.test(aa.clientMessage(r, "", "")), true);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
