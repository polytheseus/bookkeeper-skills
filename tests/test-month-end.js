// node tests/test-month-end.js
var me = require("../docs/guides/month-end.js");
var pass = 0, fail = 0;
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log("FAIL " + name + "\n  got  " + JSON.stringify(got) + "\n  want " + JSON.stringify(want)); }
}
function ok(name, cond) { eq(name, !!cond, true); }
function has(r, s) { return r.tasks.some(function (t) { return t.task.indexOf(s) >= 0; }); }
function dl(r, s) { return r.deadlines.filter(function (x) { return x.what.indexOf(s) >= 0; })[0]; }

// Working days. Oct 2026 ends Sat 31; Mon 2 Nov is WD1.
var ew = me.HOLIDAYS.ew, sc = me.HOLIDAYS.sc, us = me.HOLIDAYS.us;
eq("wd0 oct", me.iso(me.workingDay(2026, 9, 0, ew)), "2026-10-30");
eq("wd1 oct", me.iso(me.workingDay(2026, 9, 1, ew)), "2026-11-02");
eq("wd5 oct", me.iso(me.workingDay(2026, 9, 5, ew)), "2026-11-06");
// Dec 2026: Thu 31 Dec; 1 Jan bank holiday; WD1 = Mon 4 Jan (E&W), Tue 5 Jan in Scotland (2 Jan Sat, 4 Jan substitute).
eq("wd1 dec ew", me.iso(me.workingDay(2026, 11, 1, ew)), "2027-01-04");
eq("wd1 dec sc", me.iso(me.workingDay(2026, 11, 1, sc)), "2027-01-05");
eq("wd0 dec", me.iso(me.workingDay(2026, 11, 0, ew)), "2026-12-31");
// Nov 2026 Scotland: 30 Nov (Mon) St Andrew's Day, so last working day is Fri 27 Nov.
eq("wd0 nov sc", me.iso(me.workingDay(2026, 10, 0, sc)), "2026-11-27");
eq("wd0 nov ew", me.iso(me.workingDay(2026, 10, 0, ew)), "2026-11-30");
// March 2027 E&W: 31 Mar Wed; 1 Apr Thu WD1; Good Friday 26 Mar, Easter Mon 29 Mar are in March.
eq("wd1 mar27", me.iso(me.workingDay(2027, 2, 1, ew)), "2027-04-01");
eq("wd2 mar27", me.iso(me.workingDay(2027, 2, 2, ew)), "2027-04-02");
// Aug 2026 E&W: 31 Aug bank holiday (Mon), last WD = Fri 28 Aug.
eq("wd0 aug ew", me.iso(me.workingDay(2026, 7, 0, ew)), "2026-08-28");
// US: Thanksgiving 26 Nov doesn't affect Nov close; Dec: 1 Jan holiday, WD1 = Mon 4 Jan.
eq("wd1 dec us", me.iso(me.workingDay(2026, 11, 1, us)), "2027-01-04");
// US Jun 2027: 18 Jun Juneteenth observed (Fri); May 2027 close: 31 May Memorial Day, last WD = Fri 28 May.
eq("wd0 may27 us", me.iso(me.workingDay(2027, 4, 0, us)), "2027-05-28");

// Stage mapping.
eq("stages T5", [0, 1, 2, 3, 4, 5].map(function (s) { return me.stageDay(s, 5); }), [0, 1, 2, 3, 4, 5]);
eq("stages T2", [1, 2, 3, 4, 5].map(function (s) { return me.stageDay(s, 2); }), [1, 1, 1, 2, 2]);
eq("stages T10", [1, 2, 3, 4, 5].map(function (s) { return me.stageDay(s, 10); }), [2, 4, 6, 8, 10]);

// VAT staggers.
eq("vat mar", [0, 1, 2, 3, 5, 8, 11].map(function (m) { return me.isVatEnd("mar", m); }), [false, false, true, false, true, true, true]);
eq("vat jan", [0, 3, 6, 9, 10].map(function (m) { return me.isVatEnd("jan", m); }), [true, true, true, true, false]);
eq("vat feb", [1, 4, 7, 10, 9].map(function (m) { return me.isVatEnd("feb", m); }), [true, true, true, true, false]);
ok("vat monthly", me.isVatEnd("monthly", 6));
ok("vat none", !me.isVatEnd("none", 2));

// UK limited company, October 2026, accruals, VAT Jan/Apr/Jul/Oct stagger, payroll, CIS.
var r = me.build({ country: "uk", month: "2026-10", target: "5", basis: "accruals", entity: "company", region: "ew", vat: "jan", payroll: true, cis: true, processors: true, client: "Hale Plumbing" });
eq("uk no error", r.error, undefined);
eq("uk close", r.closeDate, "2026-11-06");
eq("uk close label", r.closeLabel, "Fri 6 Nov 2026");
eq("uk warnings", r.warnings, []);
ok("uk director loan", has(r, "director's loan"));
ok("uk no drawings", !has(r, "drawings"));
ok("uk accruals", has(r, "Post accruals"));
ok("uk no cash-basis task", !has(r, "dated by when the money moved"));
ok("uk processors", has(r, "Stripe"));
ok("uk payroll uk wording", has(r, "employer NI") && !has(r, "federal"));
ok("uk vat control (quarter end)", has(r, "VAT control account"));
ok("uk cis task", has(r, "CIS deducted"));
ok("uk no sales tax", !has(r, "sales tax collected"));
ok("uk no stock", !has(r, "stock or work"));
eq("uk vat deadline", dl(r, "VAT return").date, "2026-12-07");
ok("uk vat period text", dl(r, "VAT return").what.indexOf("period ending 31 October 2026") >= 0);
eq("uk paye", dl(r, "PAYE").date, "2026-11-22");
ok("uk paye weekend note", dl(r, "PAYE").label.indexOf("pay early") >= 0); // 22 Nov 2026 is a Sunday
ok("uk paye tax month", dl(r, "PAYE").what.indexOf("ending 5 November") >= 0);
eq("uk cis deadline", dl(r, "CIS monthly").date, "2026-11-19");
ok("uk cis not weekend", dl(r, "CIS monthly").label === "Thu 19 Nov 2026");
var first = r.tasks[0], last = r.tasks[r.tasks.length - 1];
eq("uk first day", [first.day, first.date], ["Last working day", "2026-10-30"]);
eq("uk last day", [last.day, last.date], ["Working day 5", "2026-11-06"]);
ok("uk ordered", r.tasks.every(function (t, i) { return i === 0 || t.wd >= r.tasks[i - 1].wd; }));
ok("uk csv header", r.csv.indexOf("Client,Month,Group,Task,When,Date,Done,Notes\r\n") === 0);
eq("uk csv rows", r.csv.trim().split("\r\n").length, 1 + r.tasks.length + r.deadlines.length);
ok("uk csv quotes commas", r.csv.indexOf("\"Reconcile every bank and credit card account to its month-end statement balance. Note both balances: they must match.\"") < 0 && r.csv.indexOf("Hale Plumbing,October 2026,Cash,") >= 0);
ok("uk csv quoted task with comma", r.csv.indexOf("\"Remind the client what you need and by when (statements, receipts, sales list, payroll changes).\"") >= 0);
ok("uk text title", r.text.indexOf("Month-end close: Hale Plumbing, October 2026") === 0);
ok("uk text boxes", (r.text.match(/\[ \]/g) || []).length === r.tasks.length);
ok("uk text deadlines", r.text.indexOf("Deadlines after this month") >= 0);

// Not a VAT quarter end: November with the Jan stagger -> next period ends 31 Jan 2027.
var r2 = me.build({ country: "uk", month: "2026-11", target: "5", basis: "accruals", entity: "company", region: "ew", vat: "jan" });
ok("uk nov no vat control", !has(r2, "VAT control account"));
ok("uk nov vat codes still", has(r2, "VAT codes"));
ok("uk nov next period", dl(r2, "Not a VAT quarter end").what.indexOf("31 January 2027") >= 0);
ok("uk nov no paye", !dl(r2, "PAYE"));

// UK sole trader, cash basis, not VAT-registered, December 2026, Scotland.
var r3 = me.build({ country: "uk", month: "2026-12", target: "5", basis: "cash", entity: "sole", region: "sc", vat: "none", stock: true, fx: true, loans: true });
eq("uk3 close", r3.closeDate, "2027-01-11"); // WD1 Tue 5 Jan ... WD5 Mon 11 Jan
ok("uk3 drawings", has(r3, "drawings"));
ok("uk3 no DLA", !has(r3, "Update the director's loan"));
ok("uk3 cash task", has(r3, "dated by when the money moved"));
ok("uk3 no accruals", !has(r3, "Post accruals") && !has(r3, "aged debtors"));
ok("uk3 threshold", has(r3, "£90,000"));
ok("uk3 no vat codes", !has(r3, "VAT codes"));
ok("uk3 stock fx loans", has(r3, "stock or work") && has(r3, "foreign currency") && has(r3, "capital and interest"));
eq("uk3 no deadlines", r3.deadlines, []);
eq("uk3 no payroll tasks", r3.tasks.filter(function (t) { return t.group === "Payroll"; }).length, 0);

// US LLC, December 2026, payroll + sales tax, federal holidays.
var r4 = me.build({ country: "us", month: "2026-12", target: "6", basis: "accruals", entity: "company", region: "us", vat: "mar", payroll: true, salestax: true, cis: true });
eq("us no error", r4.error, undefined);
ok("us vat ignored", !has(r4, "VAT"));
ok("us cis ignored", !has(r4, "CIS"));
ok("us payroll wording", has(r4, "federal and state withholding") && !has(r4, "employer NI"));
ok("us sales tax", has(r4, "sales tax collected"));
ok("us no director loan", !has(r4, "director's loan account") && has(r4, "shareholder or member loans"));
ok("uk no shareholder loans", !has(r, "shareholder or member"));
eq("us deposit", dl(r4, "monthly depositor").date, "2027-01-15");
eq("us 941", dl(r4, "Form 941").date, "2027-01-31");
ok("us 941 weekend", dl(r4, "Form 941").label.indexOf("next business day") >= 0); // 31 Jan 2027 is a Sunday
ok("us 941 text", dl(r4, "Form 941").what.indexOf("quarter ending 31 December 2026") >= 0);
ok("us W-2", !!dl(r4, "W-2"));
ok("us state", !!dl(r4, "vary by state"));
ok("us no HMRC", r4.text.indexOf("HMRC") < 0);
eq("us close", r4.closeDate, "2027-01-11"); // WD1 Mon 4 Jan ... WD6 Mon 11 Jan
// US October: no 941 (not a quarter-end month).
var r5 = me.build({ country: "us", month: "2026-10", target: "5", basis: "accruals", entity: "sole", region: "us", payroll: true });
ok("us oct no 941", !dl(r5, "Form 941"));
ok("us oct no W-2", !dl(r5, "W-2"));
ok("us sole drawings", has(r5, "drawings"));

// Warnings and errors.
var r6 = me.build({ country: "uk", month: "2026-10", target: "3", basis: "accruals", entity: "company", region: "ew", cis: true });
ok("tight warning", r6.warnings.some(function (w) { return w.indexOf("3-day close") >= 0; }));
ok("cis without payroll warning", r6.warnings.some(function (w) { return w.indexOf("tick payroll") >= 0; }));
var r7 = me.build({ country: "uk", month: "2027-12", target: "5", region: "ew" });
ok("holiday years warning", r7.warnings.some(function (w) { return w.indexOf("only loaded") >= 0; }));
var r8 = me.build({ country: "uk", month: "2027-12", target: "5", region: "none" });
ok("no holiday warning when none", !r8.warnings.some(function (w) { return w.indexOf("only loaded") >= 0; }));
eq("bad month", me.build({ month: "", target: "5" }).error, "Pick the month you're closing.");
eq("bad month 13", me.build({ month: "2026-13", target: "5" }).error, "Pick the month you're closing.");
eq("bad target", me.build({ month: "2026-10", target: "1" }).error, "Close target should be between 2 and 15 working days.");
eq("bad target text", me.build({ month: "2026-10", target: "x" }).error, "Close target should be between 2 and 15 working days.");
var r9 = me.build({ country: "uk", month: "2026-10", target: "15", region: "ew" });
eq("T15 close", r9.closeDate, "2026-11-20");
ok("client capped", me.build({ month: "2026-10", target: "5", client: new Array(100).join("x") }).csv.split("\r\n")[1].indexOf(new Array(62).join("x")) < 0);
ok("csv injection safe text", me.build({ month: "2026-10", target: "5", client: "A, \"B\"" }).csv.indexOf("\"A, \"\"B\"\"\"") >= 0);

ok("csv formula guard", me.build({ month: "2026-10", target: "5", client: "=HYPERLINK(1)" }).csv.indexOf(",'=HYPERLINK") < 0 && me.build({ month: "2026-10", target: "5", client: "=HYPERLINK(1)" }).csv.split("\r\n")[1].indexOf("'=HYPERLINK(1)") === 0);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
