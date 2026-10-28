// New client onboarding plan builder: turns a few facts about a new
// bookkeeping client (UK or US; entity type; services; previous accountant;
// met in person; risk factors) into a dated onboarding checklist, a
// suggested starting risk rating with enhanced due diligence triggers, the
// HMRC or IRS authorisation route per service, the documents to ask for, a
// welcome email and (UK) a professional clearance letter. Runs in the
// browser and in node (module.exports) for tests. Nothing typed is sent
// anywhere.
(function () {
  var DAY = 86400000;
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  var ENTITIES = {
    uk: { sole: "sole trader", landlord: "landlord", partnership: "partnership", ltd: "limited company", llp: "LLP" },
    us: { sole: "sole proprietor", llc: "LLC", scorp: "S corporation", partnership: "partnership", individual: "individual" }
  };
  var SERVICES = {
    uk: { books: "Bookkeeping", vat: "VAT returns", mtd: "MTD for Income Tax updates", sa: "Self Assessment return", payroll: "Payroll (PAYE)", cis: "CIS returns", accounts: "Year-end accounts", ct: "Corporation Tax return" },
    us: { books: "Bookkeeping", payroll: "Payroll", sales: "Sales tax returns", "1099": "1099 filing", return: "Tax return preparation" }
  };
  // How to get authorised, per service (gov.uk "How to get authorised to act
  // as a tax agent on behalf of your clients", updated 7 October 2026).
  var UK_AUTH = {
    vat: "VAT: the digital handshake from your agent services account (ASA).",
    mtd: "MTD for Income Tax: the digital handshake, or copy the client's existing Self Assessment authorisation from HMRC online services into your ASA.",
    sa: "Self Assessment: Online Agent Authorisation (HMRC posts the client a code), or form 64-8.",
    payroll: "PAYE: Online Agent Authorisation or the client's business tax account, or form 64-8.",
    cis: "CIS: Online Agent Authorisation or the client's business tax account.",
    ct: "Corporation Tax: Online Agent Authorisation, or form 64-8."
  };
  var US_AUTH = {
    payroll: "Payroll: Form 8821 (to see notices) or Form 2848 (to represent), plus the state payroll agency's own authorisation.",
    sales: "Sales tax: the state's own third-party or power of attorney form for each state the client files in.",
    "1099": "1099s: no IRS authorisation needed to file them as a transmitter, but Form 8821 lets you see any IRS notices.",
    return: "Tax returns: Form 2848 to represent the client, or Form 8821 to receive their information. Submit online (Tax Pro Account gives real-time processing for individuals)."
  };

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCMonth() === +m[2] - 1 ? d : null;
  }
  function addDays(d, n) {
    var r = new Date(d.getTime() + n * DAY);
    var wd = r.getUTCDay(); // land on a weekday
    if (wd === 6) r = new Date(r.getTime() + 2 * DAY);
    if (wd === 0) r = new Date(r.getTime() + DAY);
    return r;
  }
  function fmt(d) { return WEEKDAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function has(list, x) { return list.indexOf(x) !== -1; }

  // A suggested starting point only: the practice's own risk assessment and
  // nominated officer decide.
  function rateRisk(o) {
    var reasons = [], edd = [], level = 0, stop = null;
    var r = o.risks || [];
    if (has(r, "reluctant")) { level = 2; reasons.push("The client is reluctant to give identity or ownership information"); stop = "Don't start work until identity is verified. gov.uk: if you have doubts about a customer's identity, you must stop dealing with them until you're sure. Talk to your nominated officer."; }
    if (has(r, "pep")) { level = 2; reasons.push("A politically exposed person (or family member or close associate) is involved"); edd.push("PEP: senior management approves the relationship, you establish the source of wealth and source of funds, and you monitor more closely."); }
    if (o.country === "uk" && !o.faceToFace) { reasons.push("Identity checked without meeting in person"); edd.push("Not met in person: get further information to confirm identity (for example a certified copy, an electronic ID check your policy accepts, or a first payment from an account in the client's name)."); level = Math.max(level, 1); }
    if (has(r, "overseas")) { level = 2; reasons.push("A link to a FATF 'call for action' country"); edd.push("FATF call-for-action country: enhanced due diligence is required (the 2026 amendments to the regulations use the FATF list instead of the old high-risk third country list)."); }
    var mid = [];
    if (has(r, "cash")) mid.push("Cash-heavy business");
    if (has(r, "complex")) mid.push("Complex or overseas ownership structure");
    if (has(r, "crypto")) mid.push("Crypto or high-value goods");
    if (has(r, "unusual")) mid.push("Unusually large or complex transactions for the business");
    if (mid.length) { reasons = reasons.concat(mid); level = Math.max(level, mid.length >= 2 ? 2 : 1); }
    if (has(r, "unusual")) edd.push("Unusually complex or large transactions: find out where the money comes from and why, and record it.");
    if (!reasons.length) reasons.push("No higher-risk factors ticked");
    var names = ["Low", "Medium", "High"];
    return { level: names[level], reasons: reasons, edd: edd, stop: stop, reviewMonths: level === 2 ? 6 : 12 };
  }

  function buildPlan(o) {
    o = o || {};
    var country = o.country === "us" ? "us" : "uk";
    var ents = ENTITIES[country];
    if (!ents[o.entity]) return { error: "Choose the client's business type." };
    var start = parseDate(o.today);
    if (!start) return { error: "Today's date is missing." };
    var services = (o.services || []).filter(function (s) { return SERVICES[country][s]; });
    if (!services.length) return { error: "Tick at least one service you've agreed to provide." };
    var deadline = o.firstDeadline ? parseDate(o.firstDeadline) : null;
    if (o.firstDeadline && !deadline) return { error: "The first deadline isn't a valid date." };
    var client = String(o.client || "").trim() || "[client name]";
    var contact = String(o.contact || "").trim();
    var practice = String(o.practice || "").trim() || "[your name and practice]";
    var prev = String(o.previous || "").trim();
    var company = country === "uk" ? (o.entity === "ltd" || o.entity === "llp") : (o.entity === "llc" || o.entity === "scorp");
    var risk = country === "uk" ? rateRisk({ country: country, faceToFace: !!o.faceToFace, risks: o.risks }) : null;
    var warnings = [];

    var steps = [];
    function step(day, stage, task, detail) { steps.push({ date: addDays(start, day), stage: stage, task: task, detail: detail || [] }); }

    // 1. Screening
    step(0, "Screening", "Check for conflicts and that the work is within your competence and supervision",
      country === "uk" ? ["Is the client acceptable under your practice's risk assessment?", "Is every service covered by your AML supervision and your PI insurance?"] : ["Is the work within your skills and your insurance?", "Any conflict with an existing client?"]);

    // 2. Due diligence
    if (country === "uk") {
      var cdd = ["Verify identity: full name, date of birth and home address, against photo ID and proof of address or an electronic check your policy accepts"];
      if (company) {
        cdd.push("Companies House: company number, registered office, directors; save an excerpt of the register of people with significant control (regulation 30A) and report any discrepancy you find as your supervisor requires");
        cdd.push("Identify the beneficial owners (anyone owning or controlling more than 25% of shares or voting rights, or otherwise in control) and verify the individuals");
        cdd.push("Check each director's and PSC's Companies House identity verification status (a legal requirement since 18 November 2025, with a 12-month transition)");
      }
      if (o.entity === "partnership") cdd.push("Identify each partner, and anyone entitled to more than 25% of capital, profits or votes");
      cdd.push("Record the purpose and intended nature of the relationship: what you'll do, why the client needs it, the expected activity");
      cdd.push("Screen for PEPs and sanctions (UK sanctions list) and adverse media if your policy requires it");
      cdd.push("Risk-rate the client with reasons (suggested starting point below) and set the next review date");
      cdd.push("Save the records: keep them for 5 years from the date the relationship ends");
      step(1, "Due diligence", "Customer due diligence under the Money Laundering Regulations", cdd);
      if (risk.edd.length) step(2, "Due diligence", "Enhanced due diligence", risk.edd);
    } else {
      step(1, "Due diligence", "Know your client", ["Verify identity for each owner you deal with (photo ID), and confirm who is authorised to instruct you", "Understand the business: what it does, where, roughly how big", "Note the data you'll hold and how it's protected (IRS Publication 4557 explains the written information security plan tax professionals need)"]);
    }

    // 3. Engagement letter
    step(1, "Engagement letter", "Send the engagement letter: scope, what's not included, fees and the client's responsibilities",
      ["Get it signed before any substantive work starts", "Services: " + services.map(function (s) { return SERVICES[country][s]; }).join(", ")]);

    // 4. Previous accountant
    if (o.hasPrevious) {
      if (country === "uk") {
        step(1, "Previous accountant", "Send the professional clearance letter" + (prev ? " to " + prev : ""), ["Attach or quote the client's written permission to contact them", "Ask for any professional reason you shouldn't act, and for the handover information (letter below)"]);
        step(15, "Previous accountant", "Chase clearance if there's no reply after 14 days", ["Ask the client to nudge them, and to settle any undisputed fees if that's what's holding things up"]);
      } else {
        step(1, "Previous preparer", "Ask the client for last year's return and workpapers, or request them" + (prev ? " from " + prev : ""), ["Prior-year return, depreciation schedules, carryforwards, payroll and sales tax filings, open IRS or state notices"]);
      }
    }

    // 5. Authorisation
    var auths = [];
    services.forEach(function (s) {
      var a = (country === "uk" ? UK_AUTH : US_AUTH)[s];
      if (a && !has(auths, a)) auths.push(a);
    });
    if (auths.length) {
      if (country === "uk") {
        auths.push("Don't use the client's own HMRC sign-in: gov.uk says agents should not.");
        step(2, "Authorisation", "Request HMRC authorisation for each tax", auths);
        if (has(services, "vat") || has(services, "mtd")) step(16, "Authorisation", "Check the digital handshake was accepted (the link expires after 21 days)", ["Agent services account: 'Manage your authorisation requests from the last 30 days'", "If it's still pending, call the client and walk them through it before it expires"]);
      } else {
        step(2, "Authorisation", "Get IRS and state authorisation", auths);
      }
    }

    // 6. Systems, records, handover
    step(5, "Systems", "Set up the books", ["Software access (client invites you as accountant or adviser)", "Connect bank and card feeds for every account the business uses", "Receipt capture app or shared folder", "Agree the chart of accounts and opening balances"]);
    var docs = buildDocs(country, o.entity, services, o.hasPrevious);
    step(5, "First records request", "Send the first records request with a due date of " + fmt(addDays(start, 12)), docs.slice(0, 6).concat(docs.length > 6 ? ["…and the rest of the list below"] : []));
    step(10, "Handover call", "Walk the client through how it will work", ["Who to contact, how to send records, when you need them each month", "The deadlines calendar for their year, each with a records-due date"]);
    step(30, "30-day review", "Check the onboarding worked", ["Bank feeds working, records arriving on time", "Volume within the engagement letter's assumptions (if not, revisit the fee now, not at year end)", "Authorisation confirmed" + (o.hasPrevious ? "; previous figures received and opening balances agreed" : "")]);
    if (risk) {
      var rv = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + risk.reviewMonths, Math.min(start.getUTCDate(), 28)));
      step(Math.round((rv - start) / DAY), "Ongoing monitoring", "Review the due diligence and risk rating (" + risk.level + " risk: every " + risk.reviewMonths + " months, or sooner if anything changes)", ["Re-check ID if it has changed, ownership, sanctions and PEP status"]);
    }
    steps.sort(function (a, b) { return a.date - b.date; });

    if (deadline) {
      var lead = Math.round((deadline - start) / DAY);
      if (lead < 0) warnings.push("The first deadline is already past: agree in writing who deals with the late filing and any penalty before you start.");
      else if (lead < 21) warnings.push("The first deadline is only " + lead + " days away. Authorisation can take longer than that, so agree in writing now who files this one and what you need from the client by when.");
      else if (lead < 45) warnings.push("The first deadline is " + lead + " days away: send the authorisation request and the records request on day one.");
    }
    if (risk && risk.stop) warnings.unshift(risk.stop);

    var res = { country: country, entity: ents[o.entity], company: company, services: services, steps: steps, risk: risk, docs: docs, warnings: warnings };
    res.welcome = welcomeEmail(res, contact, practice, start, deadline);
    res.clearance = country === "uk" && o.hasPrevious ? clearanceLetter(res, client, practice, prev, start) : "";
    res.text = toText(res, client);
    res.csv = toCsv(res);
    return res;
  }

  function buildDocs(country, entity, services, hasPrev) {
    var d = [];
    if (country === "uk") {
      d.push("Photo ID and proof of address (through our secure portal or in person, not by email)");
      if (entity === "ltd" || entity === "llp") d.push("Company number, and the names of everyone who owns more than 25% or controls the company");
      d.push("Bank and card statements for every business account from the start date we take over");
      if (has(services, "vat")) d.push("VAT registration number and the last VAT return filed");
      if (has(services, "mtd")) d.push("Last year's self-employment and property income before expenses (for the MTD threshold check)");
      if (has(services, "sa") || has(services, "mtd")) d.push("Unique Taxpayer Reference (UTR) and National Insurance number (by phone or portal)");
      if (has(services, "payroll")) d.push("PAYE reference, Accounts Office reference, each employee's starter details and the pension scheme login");
      if (has(services, "cis")) d.push("CIS registration and the list of subcontractors with their UTRs");
      if (has(services, "ct") || has(services, "accounts")) d.push("Last filed accounts and Corporation Tax return, and the Companies House authentication code");
      if (hasPrev) d.push("Anything the previous accountant sent you: last accounts, returns, closing balances");
      d.push("Logins or invitations for your bookkeeping software");
      d.push("Any letters from HMRC in the last 12 months");
    } else {
      d.push("Photo ID for each owner you'll deal with (through a secure portal, not by email)");
      d.push("EIN letter (CP 575 or 147C) and the formation documents" + (entity === "scorp" ? ", plus the S election acceptance (CP261)" : ""));
      d.push("Bank and card statements for every business account");
      if (has(services, "payroll")) d.push("State payroll account numbers and the last quarter's Form 941");
      if (has(services, "sales")) d.push("Sales tax permit numbers and the last return for each state");
      if (has(services, "1099")) d.push("A W-9 for every contractor paid during the year");
      if (has(services, "return") || hasPrev) d.push("Last year's federal and state returns, with depreciation schedules");
      d.push("Logins or invitations for your bookkeeping software");
      d.push("Any IRS or state notices from the last 12 months");
    }
    return d;
  }

  function welcomeEmail(r, contact, practice, start, deadline) {
    var first = contact ? contact.split(" ")[0] : "[first name]";
    var due = fmt(addDays(start, 12));
    var lines = [
      "Subject: Welcome, and what happens next",
      "",
      "Hi " + first + ",",
      "",
      "Thanks for choosing us. Here's how the next few weeks will go, so nothing comes as a surprise.",
      "",
      "1. Your engagement letter is attached. Please read it and sign it: we can't start the work until it's back.",
      r.country === "uk" ? "2. We need to confirm your identity (the anti-money laundering rules require it for every new client). Please send the documents below through our secure link rather than by email." : "2. We'll confirm the identity of the people we deal with. Please send the documents below through our secure link rather than by email.",
    ];
    var n = 3;
    if (r.country === "uk" && r.services.some(function (s) { return UK_AUTH[s]; })) lines.push(n++ + ". So we can deal with HMRC for you, you'll get a link from us and/or a letter from HMRC with a code. Both expire, so please act on them the day they arrive, and tell us if anything looks odd.");
    if (r.country === "us" && r.services.some(function (s) { return US_AUTH[s]; })) lines.push(n++ + ". We'll send you an IRS authorisation form (8821 or 2848) to sign electronically, so we can see and deal with notices for you.");
    lines.push(n++ + ". Please send the records below by " + due + ":");
    lines.push("");
    r.docs.forEach(function (d) { lines.push("   - " + d); });
    lines.push("");
    if (deadline) lines.push("Your first deadline is " + fmt(deadline) + ". We'll work back from that date, so the sooner the records arrive the better.", "");
    lines.push("We'll book a short call once everything's in, to walk you through how it all works and the dates for your year.", "");
    lines.push("Any questions at all, just reply to this email.", "", "Best wishes,", practice);
    return lines.join("\n");
  }

  function clearanceLetter(r, client, practice, prev, start) {
    return [
      "Subject: Professional clearance: " + client,
      "",
      "Dear " + (prev || "[previous accountant]") + ",",
      "",
      "We have been asked by " + client + " (" + r.entity + ") to act as their accountants from " + fmt(start) + ". Their written permission for us to contact you is attached.",
      "",
      "Please let us know whether there is any professional reason why we should not accept this engagement.",
      "",
      "To help the handover, we'd be grateful for the following, to the extent the client is entitled to it:",
      "   - the last accounts and tax returns you prepared, with the trial balance or closing balances",
      "   - tax computations, capital allowance pools and any losses carried forward",
      r.services.indexOf("vat") !== -1 ? "   - VAT registration details, the VAT return periods and the last return filed" : "   - the VAT position (registered or not)",
      r.services.indexOf("payroll") !== -1 ? "   - payroll details: PAYE references, employee records and the pension scheme" : "   - whether there is a payroll or pension scheme",
      "   - the Making Tax Digital status for VAT and Income Tax",
      "   - any open correspondence or enquiries with HMRC",
      "",
      "We'd appreciate a reply within 14 days. Thank you for your help.",
      "",
      "Yours sincerely,",
      practice
    ].join("\n");
  }

  function toText(r, client) {
    var out = ["ONBOARDING PLAN: " + client + " (" + r.entity + ", " + (r.country === "uk" ? "UK" : "US") + ")", ""];
    r.warnings.forEach(function (w) { out.push("! " + w); });
    if (r.warnings.length) out.push("");
    if (r.risk) {
      out.push("Suggested starting risk rating: " + r.risk.level + " (your practice's risk assessment and nominated officer decide)");
      r.risk.reasons.forEach(function (x) { out.push("  - " + x); });
      out.push("");
    }
    r.steps.forEach(function (s, i) {
      out.push((i + 1) + ". [ ] " + fmt(s.date) + " | " + s.stage + ": " + s.task);
      s.detail.forEach(function (d) { out.push("       [ ] " + d); });
    });
    out.push("", "DOCUMENTS TO ASK FOR");
    r.docs.forEach(function (d) { out.push("  [ ] " + d); });
    return out.join("\n");
  }

  function csvCell(v) {
    var s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(r) {
    var rows = [["Date", "Stage", "Task", "Detail", "Done"]];
    r.steps.forEach(function (s) { rows.push([iso(s.date), s.stage, s.task, s.detail.join("; "), ""]); });
    return rows.map(function (row) { return row.map(csvCell).join(","); }).join("\n");
  }

  var api = { buildPlan: buildPlan, rateRisk: rateRisk, ENTITIES: ENTITIES, SERVICES: SERVICES, addDays: addDays };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  // ---- DOM wiring ----
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function checked(name) {
    return Array.prototype.slice.call(document.querySelectorAll("input[name=" + name + "]:checked")).filter(function (e) { return !e.closest("[hidden]"); }).map(function (e) { return e.value; });
  }
  function syncCountry() {
    var c = $("ob-country").value;
    Array.prototype.forEach.call(document.querySelectorAll("[data-ob-country]"), function (el) {
      el.hidden = el.getAttribute("data-ob-country") !== c;
    });
  }
  function download(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function copy(text) {
    var msg = $("ob-msg");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { msg.textContent = "Copied."; }, function () { msg.textContent = "Select and copy from the download instead."; });
    } else msg.textContent = "Use a download instead.";
  }
  function run() {
    var t = new Date();
    var c = $("ob-country").value;
    var ent = document.querySelector("[data-ob-country=" + c + "] select");
    var res = buildPlan({
      country: c, entity: ent ? ent.value : "", services: checked("ob-svc"), risks: checked("ob-risk"),
      faceToFace: $("ob-met").checked, hasPrevious: $("ob-prev").checked, previous: $("ob-prev-name").value,
      today: t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2),
      firstDeadline: $("ob-deadline").value, client: $("ob-client").value, contact: $("ob-contact").value, practice: $("ob-practice").value
    });
    var out = $("ob-out");
    if (res.error) { out.innerHTML = "<p class=\"ob-warn\">" + esc(res.error) + "</p>"; return; }
    var h = "";
    res.warnings.forEach(function (w) { h += "<p class=\"ob-warn\">" + esc(w) + "</p>"; });
    if (res.risk) {
      h += "<p class=\"ob-risk ob-" + res.risk.level.toLowerCase() + "\"><strong>Suggested starting risk rating: " + res.risk.level + "</strong> (your practice's risk assessment and nominated officer decide). " + esc(res.risk.reasons.join("; ")) + ".</p>";
    }
    h += "<ol class=\"ob-steps\">" + res.steps.map(function (s) {
      return "<li><span class=\"ob-date\">" + esc(fmt(s.date)) + " · " + esc(s.stage) + "</span><br><strong>" + esc(s.task) + "</strong>" +
        (s.detail.length ? "<ul>" + s.detail.map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") + "</ul>" : "") + "</li>";
    }).join("") + "</ol>";
    h += "<p><button type=\"button\" id=\"ob-copy\">Copy the checklist</button> <button type=\"button\" id=\"ob-copy-w\" class=\"ghost\">Copy welcome email</button>" +
      (res.clearance ? " <button type=\"button\" id=\"ob-copy-c\" class=\"ghost\">Copy clearance letter</button>" : "") +
      " <button type=\"button\" id=\"ob-csv\" class=\"ghost\">Download .csv</button> <button type=\"button\" id=\"ob-txt\" class=\"ghost\">Download .txt</button> <span id=\"ob-msg\" aria-live=\"polite\"></span></p>";
    h += "<details><summary>Preview the welcome email</summary><pre class=\"email\">" + esc(res.welcome) + "</pre></details>";
    if (res.clearance) h += "<details><summary>Preview the clearance letter</summary><pre class=\"email\">" + esc(res.clearance) + "</pre></details>";
    out.innerHTML = h;
    $("ob-copy").onclick = function () { copy(res.text); };
    $("ob-copy-w").onclick = function () { copy(res.welcome); };
    if (res.clearance) $("ob-copy-c").onclick = function () { copy(res.clearance); };
    $("ob-csv").onclick = function () { download("onboarding-plan.csv", res.csv, "text/csv"); };
    $("ob-txt").onclick = function () { download("onboarding-plan.txt", res.text + "\n\n----\n\n" + res.welcome + (res.clearance ? "\n\n----\n\n" + res.clearance : ""), "text/plain"); };
  }
  document.addEventListener("DOMContentLoaded", function () {
    if (!$("ob-go")) return;
    $("ob-country").addEventListener("change", syncCountry);
    $("ob-go").addEventListener("click", run);
    syncCountry();
  });
})();
