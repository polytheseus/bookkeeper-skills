// Agent authorisation date checker: from a start date and a filing deadline,
// dates both Self Assessment routes (Online Agent Authorisation code by post,
// paper form 64-8) and the last safe day to start each. HMRC's published
// figures: the code letter goes out within 7 working days and lasts about 30
// days from issue. Everything else (post, client reply, 64-8 processing, your
// preparation time) is an editable assumption. Bank holidays from
// gov.uk/bank-holidays.json. Runs in the browser and in node (module.exports)
// for tests. Nothing typed is sent anywhere. Dates are UTC calendar days.
(function () {
  var DAY = 86400000;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var LETTER_WORKING_DAYS = 7, CODE_DAYS = 30;
  // England and Wales, 2026 to 2028. HMRC's own offices are not assumed to
  // follow Scottish or Northern Irish holidays.
  var HOLIDAYS = {
    "2026-12-25": 1, "2026-12-28": 1,
    "2027-01-01": 1, "2027-03-26": 1, "2027-03-29": 1, "2027-05-03": 1, "2027-05-31": 1, "2027-08-30": 1, "2027-12-27": 1, "2027-12-28": 1,
    "2028-01-03": 1, "2028-04-14": 1, "2028-04-17": 1, "2028-05-01": 1, "2028-05-29": 1, "2028-08-28": 1, "2028-12-25": 1, "2028-12-26": 1
  };

  function parse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCMonth() === +m[2] - 1 ? d : null;
  }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function add(d, n) { return new Date(d.getTime() + n * DAY); }
  function fmt(d) { return WEEKDAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function isWork(d) { var w = d.getUTCDay(); return w !== 0 && w !== 6 && !HOLIDAYS[iso(d)]; }
  // n working days after d (n = 0 rolls a non-working d forward to the next).
  function addWork(d, n) {
    var x = d;
    while (!isWork(x)) x = add(x, 1);
    for (var i = 0; i < n; i++) { x = add(x, 1); while (!isWork(x)) x = add(x, 1); }
    return x;
  }
  // n working days before d (n = 0 rolls a non-working d back to the previous).
  function subWork(d, n) {
    var x = d;
    while (!isWork(x)) x = add(x, -1);
    for (var i = 0; i < n; i++) { x = add(x, -1); while (!isWork(x)) x = add(x, -1); }
    return x;
  }
  function num(v, dflt, max) {
    var n = (v === "" || v === undefined || v === null) ? dflt : Math.floor(Number(v));
    if (!isFinite(n) || n < 0) n = dflt;
    return Math.min(n, max);
  }

  function codeRoute(start, a) {
    var issued = addWork(start, LETTER_WORKING_DAYS), arrives = addWork(issued, a.postDays);
    var entered = addWork(arrives, a.replyDays), expires = add(issued, CODE_DAYS);
    return { issued: issued, arrives: arrives, access: entered, expires: expires };
  }
  function paperRoute(start, a) {
    var arrives = addWork(start, a.postDays);
    var access = addWork(add(arrives, a.paperWeeks * 7), 0);
    return { arrives: arrives, access: access };
  }
  // Latest working day to start so access lands on or before readyBy.
  function latest(fn, readyBy, a, floor) {
    for (var x = subWork(readyBy, 0); x >= floor; x = add(x, -1)) {
      if (isWork(x) && fn(x, a).access <= readyBy) return x;
    }
    return null;
  }
  function status(access, readyBy, deadline) {
    if (access <= readyBy) return "ok";
    return access <= deadline ? "tight" : "late";
  }

  function plan(o) {
    var start = parse(o.start), deadline = parse(o.deadline);
    if (!start || !deadline) return { error: "Enter both dates." };
    if (deadline < start) return { error: "That deadline has already passed." };
    var a = {
      postDays: num(o.postDays, 2, 30), replyDays: num(o.replyDays, 3, 60),
      paperWeeks: num(o.paperWeeks, 6, 52), prepDays: num(o.prepDays, 5, 60)
    };
    var startWork = addWork(start, 0);
    var readyBy = subWork(subWork(deadline, 0), a.prepDays);
    var floor = add(deadline, -730);
    var code = codeRoute(startWork, a), paper = paperRoute(startWork, a);
    var lc = latest(codeRoute, readyBy, a, floor), lp = latest(paperRoute, readyBy, a, floor);
    var d = function (x) { return x ? iso(x) : null; };
    return {
      assumptions: a, start: iso(startWork), deadline: iso(deadline), readyBy: iso(readyBy),
      code: {
        issued: iso(code.issued), arrives: iso(code.arrives), access: iso(code.access), expires: iso(code.expires),
        status: status(code.access, readyBy, deadline), latest: d(lc),
        codeLapses: code.access > code.expires
      },
      paper: { arrives: iso(paper.arrives), access: iso(paper.access), status: status(paper.access, readyBy, deadline), latest: d(lp) }
    };
  }

  // The message for the client. Keeps names and references out by default.
  function clientMessage(r, name, agent) {
    var hi = String(name || "").trim(), me = String(agent || "").trim();
    var day = function (s) { return fmt(parse(s)); };
    return (hi ? "Hi " + hi + ",\n\n" : "Hi,\n\n") +
      "So I can deal with HMRC for you on Self Assessment, I've asked them to send you an authorisation code.\n\n" +
      "What to expect: a letter from HMRC addressed to you, sent by post. HMRC says it goes out within 7 working days, so it should arrive by about " + day(r.code.arrives) + ".\n\n" +
      "What to do: send me the code as soon as it arrives. A photo of the letter is fine. The code stops working after about 30 days (the letter gives the exact date), and if that happens we have to start again.\n\n" +
      "If you've moved recently, tell me today, and check that HMRC has your current address.\n\n" +
      "If nothing has come by " + day(r.code.arrives) + ", let me know and I'll chase it. Please don't send me your HMRC sign-in details: I don't need them and I'm not allowed to use them.\n\n" +
      "Thanks" + (me ? ",\n" + me : "");
  }

  var api = { plan: plan, clientMessage: clientMessage, fmt: fmt, parse: parse, addWork: addWork, subWork: subWork, isWork: isWork };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var LABEL = {
    ok: "In time, with your preparation days left",
    tight: "Access before the deadline, but less time than you need",
    late: "Access after the deadline"
  };

  document.addEventListener("DOMContentLoaded", function () {
    var out = document.getElementById("aa-out");
    if (!out) return;
    var $ = function (id) { return document.getElementById(id); };
    var now = new Date();
    $("aa-start").value = iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
    var lastMsg = "";
    function run() {
      var r = plan({
        start: $("aa-start").value, deadline: $("aa-deadline").value, postDays: $("aa-post").value,
        replyDays: $("aa-reply").value, paperWeeks: $("aa-paper").value, prepDays: $("aa-prep").value
      });
      if (r.error) { out.innerHTML = "<p><strong>" + esc(r.error) + "</strong></p>"; lastMsg = ""; return; }
      var day = function (s) { return s ? fmt(parse(s)) : "None in range"; };
      var cls = function (s) { return s === "ok" ? "qb-due" : "qb-warn"; };
      var html = "<p class=\"" + cls(r.code.status) + "\"><strong>Code by post: access by about " + day(r.code.access) + ".</strong> " + LABEL[r.code.status] + ". Last safe day to request: <strong>" + day(r.code.latest) + "</strong>.</p>";
      html += "<p class=\"" + cls(r.paper.status) + "\"><strong>Paper 64-8: access by about " + day(r.paper.access) + ".</strong> " + LABEL[r.paper.status] + ". Last safe day to post: <strong>" + day(r.paper.latest) + "</strong>.</p>";
      html += "<table class=\"t\"><tr><th>Step (code by post)</th><th>By about</th><th>Where the date comes from</th></tr>";
      html += "<tr><td>You request the code</td><td>" + day(r.start) + "</td><td>Your start date</td></tr>";
      html += "<tr><td>HMRC issues the letter</td><td>" + day(r.code.issued) + "</td><td>HMRC: within 7 working days</td></tr>";
      html += "<tr><td>Letter reaches the client</td><td>" + day(r.code.arrives) + "</td><td>Your post assumption</td></tr>";
      html += "<tr><td>You enter the code</td><td>" + day(r.code.access) + "</td><td>Your client reply assumption</td></tr>";
      html += "<tr><td>Code stops working</td><td>" + day(r.code.expires) + "</td><td>HMRC: usually 30 days from issue, exact date in the letter</td></tr>";
      html += "<tr><td>Everything ready to prepare the return</td><td>" + day(r.readyBy) + "</td><td>Your preparation days, back from the last working day before the deadline</td></tr>";
      html += "</table>";
      if (r.code.codeLapses) html += "<p class=\"qb-warn\"><strong>On these figures the code runs out before you'd enter it.</strong> Chase the client sooner than that.</p>";
      if ($("aa-noutr").checked) html += "<p class=\"qb-warn\"><strong>No UTR yet:</strong> gov.uk says the client must register for Self Assessment first, so these dates start after that. Sort the registration before anything else.</p>";
      if ($("aa-moved").checked) html += "<p class=\"qb-warn\"><strong>Recently moved:</strong> the code comes by post, so get the address HMRC holds checked before you request it, or the letter may go to the old one.</p>";
      if (r.code.status === "late" && r.paper.status === "late") html += "<p class=\"qb-warn\"><strong>Neither route looks likely to finish in time.</strong> Request the code today anyway, and see <a href=\"#too-late\">what to do when it's too late</a>.</p>";
      out.innerHTML = html;
      lastMsg = clientMessage(r, $("aa-client").value, $("aa-agent").value);
      $("aa-msg").textContent = lastMsg;
      $("aa-msg-wrap").hidden = false;
    }
    ["aa-start", "aa-deadline", "aa-post", "aa-reply", "aa-paper", "aa-prep", "aa-client", "aa-agent", "aa-noutr", "aa-moved"].forEach(function (id) {
      $(id).addEventListener("input", run);
      $(id).addEventListener("change", run);
    });
    $("aa-copy").addEventListener("click", function () {
      var b = this;
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(lastMsg).then(function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy the message"; }, 1500); });
    });
    run();
  });
})();
