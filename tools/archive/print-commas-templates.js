// One-off rewrite for the printing rule (2026-11), for the hand-written templates in templates.json (the derived
// ones are remade from tasks.json by derive-templates.js). Commas in print(); + only where text is stored first.
// It also names casting where a template converts input() with int() or float().
// Each changed template is expanded with 12 seeds and its solution's output checked against its expected output.
"use strict";
const fs = require("fs");
const path = require("path");
const { runPython, ROOT } = require("../run-python.js");
const Checker = require(path.join(ROOT, "checker.js"));
const Templates = require(path.join(ROOT, "templates.js"));

const file = path.join(ROOT, "templates.json");
const templates = JSON.parse(fs.readFileSync(file, "utf8"));
const byId = Object.fromEntries(templates.map((t) => [t.id, t]));

// pairs are applied to every string in the template (description, starter, solution, answers, distractors, tests…).
const SPECS = {
  "var-t4": {
    pairs: [['print(\\"You scored \\" + ____(score) + \\" out of \\" + ____(total))', 'result = \\"You scored \\" + ____(score) + \\" out of \\" + ____(total)\\nprint(result)'],
      ["Fill in the blanks so the program prints:", "Fill in the blanks so the program builds the sentence, stores it in result, then prints:"]],
    hints: ["score and total are numbers. The sentence is built and stored in result before it is printed, which is why + joins it instead of commas.",
      "Cast each number to text with str() before joining it with +."],
  },
  "var-t6": {
    pairs: [['print(\\"You have £\\" + str(total))', 'message = \\"You have £\\" + str(total)\\nprint(message)'], ['print(\\"You have £\\" + total)', 'message = \\"You have £\\" + total'],
      ["then prints, for example:", "then builds a message and prints it, for example:"]],
    hints: ["Both inputs need casting with int() so they are added, not joined.",
      "The message is built and stored before it is printed, so it is joined with + (there is no space after £). Cast total back to text with str() first."],
  },
  "var-t9": {
    pairs: [['print(\\"Total: £\\" + str(pupils * {{price}}))', 'print(\\"Total (£):\\", pupils * {{price}})'], ["Total: £{{", "Total (£): {{"]],
    hints: ["Cast the input to a whole number with int() so you can multiply it. This is called casting.", "Print the text and the number with a comma between them."],
    skills: ["input", "int()"],
  },
  "var-t10": {
    pairs: [['print(name + \\" ordered \\" + str(qty) + \\" x {{item}}\\")', 'print(name, \\"ordered\\", qty, \\"x {{item}}\\")'],
      ['print(\\"Total: \\" + str(qty * {{price}}) + \\"p\\")', 'print(\\"Total (p):\\", qty * {{price}})'],
      ["Total: {{price * 3}}p", "Total (p): {{price * 3}}"], ["Total: {{q * price}}p", "Total (p): {{q * price}}"]],
    hints: ["The name stays as text, but the quantity needs casting with int().", "Use commas in print() to show text and numbers together: each comma adds a space."],
    skills: ["input", "int()"],
  },
  "maths-t10": {
    pairs: [['print(\\"Coach cost: £\\" + str(cost))', 'print(\\"Coach cost (£):\\", cost)'],
      ['print(\\"Cost per pupil: £\\" + str(round(cost / pupils, 2)))', 'print(\\"Cost per pupil (£):\\", round(cost / pupils, 2))'],
      ["Coach cost: £{{", "Coach cost (£): {{"], ["Cost per pupil: £{{", "Cost per pupil (£): {{"]],
  },
  "comb-percent-grade": {
    pairs: [['print(str(percent) + \\"%\\")', 'print(\\"Percentage:\\", percent)'], ["and print it with a % sign", "and print it after the label Percentage:"],
      ["For example:\\n75%\\nMerit", "For example:\\nPercentage: 75\\nMerit"], ['"expected":"{{pc}}%\\n', '"expected":"Percentage: {{pc}}\\n']],
    hints: ["percent = round(score / {{total}} * 100)", "Print the label and the percentage with a comma between them.", "Check Merit before Pass."],
  },
  "comb-username": {
    pairs: [['print(first, last + \\"@{{domain}}.sch.uk\\", sep=\\".\\")', 'email = last + \\"@{{domain}}.sch.uk\\"\\nprint(first, email, sep=\\".\\")'],
      ['print(\\"Welcome, \\" + first + \\"!\\")', 'print(\\"Welcome,\\", first)'], ["Welcome, Ava!", "Welcome, Ava"], ["Welcome, {{f}}!", "Welcome, {{f}}"]],
    hints: ["The surname and the @ part have no gap, so build them with + and store them: email = last + \"@…\".",
      "sep=\".\" puts a dot between the items in one print().", "A comma in print() puts one space between values."],
  },
  "scratch-var-card": {
    pairs: [['print(\\"Name: \\" + name, \\"Form: \\" + form, \\"House: \\" + house, sep=\\"{{sep}}\\")',
      'print(\\"Name:\\", name, end=\\"{{sep}}\\")\\nprint(\\"Form:\\", form, end=\\"{{sep}}\\")\\nprint(\\"House:\\", house)']],
    hints: ["Ask three times and store each answer.", "Print each label and its value with a comma between them.",
      "Use end= so the next print() carries on along the same line, after the separator."],
    skills: ["input", "sep/end"],
  },
  "scratch-var-swap": {
    pairs: [['print(\\"Before: \\" + a + \\" then \\" + b)', 'print(\\"Before:\\", a, \\"then\\", b)'], ['print(\\"After: \\" + a + \\" then \\" + b)', 'print(\\"After:\\", a, \\"then\\", b)']],
    hints: ["Print the first line before you swap.", "Use a third variable to swap.", "Use commas in print() to show the words and the values."],
    skills: ["reassignment", "input", "assignment"],
  },
  "scratch-var-receipt": {
    pairs: [['print(str(a) + \\" x {{items[0]}} = \\" + str(a * {{p1}}) + \\"p\\")', 'print(a, \\"x {{items[0]}} =\\", a * {{p1}}, \\"pence\\")'],
      ['print(str(b) + \\" x {{items[1]}} = \\" + str(b * {{p2}}) + \\"p\\")', 'print(b, \\"x {{items[1]}} =\\", b * {{p2}}, \\"pence\\")'],
      ['print(\\"Total: \\" + str(a * {{p1}} + b * {{p2}}) + \\"p\\")', 'print(\\"Total:\\", a * {{p1}} + b * {{p2}}, \\"pence\\")'],
      ["= {{2 * p1}}p", "= {{2 * p1}} pence"], ["= {{p2}}p", "= {{p2}} pence"], ["Total: {{2 * p1 + p2}}p", "Total: {{2 * p1 + p2}} pence"],
      ["= {{a * p1}}p", "= {{a * p1}} pence"], ["= {{b * p2}}p", "= {{b * p2}} pence"], ["Total: {{a * p1 + b * p2}}p", "Total: {{a * p1 + b * p2}} pence"]],
    hints: ["Cast both inputs to whole numbers with int() (this is called casting).", "Use commas in print() to show numbers and text together.", "Each comma puts one space between the values."],
    skills: ["int()", "input"],
  },
  "scratch-maths-bill": {
    pairs: [['print(\\"Each pupil pays \\" + str(cost // pupils) + \\"p\\")', 'print(\\"Each pupil pays\\", cost // pupils, \\"pence\\")'],
      ['print(\\"The teacher pays \\" + str(cost % pupils) + \\"p\\")', 'print(\\"The teacher pays\\", cost % pupils, \\"pence\\")'],
      ["Each pupil pays 245p", "Each pupil pays 245 pence"], ["The teacher pays 10p", "The teacher pays 10 pence"],
      ["Each pupil pays {{idiv(c, p)}}p", "Each pupil pays {{idiv(c, p)}} pence"], ["The teacher pays {{c % p}}p", "The teacher pays {{c % p}} pence"]],
    hints: ["Each pupil's share: integer division.", "The teacher pays the remainder.", "Use commas in print() to show the text and the numbers."],
    skills: ["integer-division", "modulo"],
  },
  "scratch-maths-savings": {
    pairs: [['print(\\"After\\", years, \\"years: £\\" + str(round(amount, 2)))', 'print(\\"After\\", years, \\"years (£):\\", round(amount, 2))'],
      ["years: £{{", "years (£): {{"]],
  },
  "scratch-sel-cinema": {
    pairs: [['print(\\"Ticket: £\\" + str(price))', 'print(\\"Ticket (£):\\", price)'], ["Ticket: £{{", "Ticket (£): {{"]],
    hints: ["Work out the normal price first with if/else.", "Then a separate if takes off the discount.", "Print the text and the price with a comma between them."],
    skills: ["if/else", "comparison"],
  },
  "scratch-sel-grades": {
    pairs: [['print(str(percent) + \\"%\\")', 'print(\\"Percentage:\\", percent)'], ["Otherwise print the percentage rounded with round()", "Otherwise print the percentage rounded with round(), after the label Percentage:"],
      ["For example:\\n80%\\nPass", "For example:\\nPercentage: 80\\nPass"], ["pc + '%\\\\n'", "'Percentage: ' + pc + '\\\\n'"]],
  },
  "scratch-sel-bulk": {
    pairs: [['print(\\"Total: \\" + str(total) + \\"p\\")', 'print(\\"Total (p):\\", total)'], ["Total: 900p", "Total (p): 900"],
      ["'Total: ' + idiv(q * price * (100 - disc), 100) + 'p\\\\nDiscount applied'", "'Total (p): ' + idiv(q * price * (100 - disc), 100) + '\\\\nDiscount applied'"],
      ["'Total: ' + q * price + 'p'", "'Total (p): ' + q * price"]],
    skills: ["if/else", "integer-division"],
  },
  "while-t3": { pairs: [['print(\\"Saved: £\\" + str(saved))', 'print(\\"Saved (£):\\", saved)'], ["Saved: £{{", "Saved (£): {{"]] },
  "for-t10": {
    pairs: [['print(\\"Total: \\" + str(total) + \\"p\\")', 'print(\\"Total (p):\\", total)'], ["like: Total: 450p", "like: Total (p): 450"], ["Total: {{tot}}p", "Total (p): {{tot}}"]],
  },
  "scratch-while-fundraiser": {
    pairs: [['print(\\"Raised: £\\" + str(total))', 'print(\\"Raised (£):\\", total)'], ["like: Raised: £35", "like: Raised (£): 35"], ["Raised: £{{tot}}", "Raised (£): {{tot}}"]],
    hints: ["Loop until the donation is 0.", "Only add donations that aren't negative.", "Print the text and the total with a comma between them."],
    skills: ["input-validation", "accumulator"],
  },
  "scratch-while-tuckshop": {
    pairs: [['print(\\"Total: \\" + str(total) + \\"p\\")', 'print(\\"Total (p):\\", total)'], ["like: Total: 150p", "like: Total (p): 150"], ["Total: {{tot}}p", "Total (p): {{tot}}"]],
  },
  "comb-badges": {
    pairs: [['print(str(i) + \\"{{join}}\\" + name)', 'badge = str(i) + \\"{{join}}\\" + name\\n    print(badge)']],
    hints: ["range(1, copies + 1) numbers the badges from 1.",
      "Each badge is built and stored in a variable before it is printed, so its pieces are joined with + (with no extra spaces). str(i) casts the number to text so it can be joined."],
  },
  "comb-split-bill": {
    pairs: [['print(\\"Each pays: £\\" + str(cost // friends))', 'print(\\"Each pays (£):\\", cost // friends)'], ['print(\\"Left over: £\\" + str(cost % friends))', 'print(\\"Left over (£):\\", cost % friends)'],
      ["Each pays: £7", "Each pays (£): 7"], ["Left over: £2", "Left over (£): 2"], ["Each pays: £{{", "Each pays (£): {{"], ["Left over: £{{", "Left over (£): {{"]],
    hints: ["Cast both inputs to whole numbers with int() (this is called casting).", "// gives the whole pounds each friend pays; % gives what is left over.",
      "Print each label and number with a comma between them."],
  },
};

const changed = [];
for (const [id, spec] of Object.entries(SPECS)) {
  const t = byId[id];
  if (!t) throw new Error("No template " + id);
  let json = JSON.stringify(t);
  for (const [a, b] of spec.pairs || []) {
    if (!json.includes(a)) throw new Error(id + ": text not found: " + a);
    json = json.split(a).join(b);
  }
  const nt = JSON.parse(json);
  if (spec.hints) nt.hints = spec.hints;
  if (spec.skills) nt.skills = spec.skills;
  Object.assign(t, nt);
  changed.push(id);
}

// Casting named in every hand-written template that converts input().
const CONV = /\b(int|float)\(\s*input\(/;
for (const t of templates.filter((x) => !x.derived)) {
  const code = (t.solution || "") + (t.starter || "");
  if (!CONV.test(code)) continue;
  const all = t.description + " " + (t.hints || []).join(" ");
  if (/\bcast/i.test(all)) continue;
  const i = (t.hints || []).findIndex((h) => /\b(int|float)\(\)/.test(h));
  if (i >= 0) t.hints[i] = t.hints[i].replace(/\s*$/, "") + " Converting input like this is called casting.";
  else if ((t.hints || []).length < 3) t.hints = (t.hints || []).concat("Cast the input to a number with int() before doing maths with it: this is called casting.");
  else {
    const s = "Cast the input to a number with int() (this is called casting).";
    const m = t.description.split("\n")[0].match(/^.*?[.!?](?=\s)/);
    t.description = m ? m[0] + " " + s + t.description.slice(m[0].length) : s + " " + t.description;
  }
  if (!/\bcast/i.test(t.description + " " + t.hints.join(" "))) throw new Error(t.id + ": could not name casting");
  if (!changed.includes(t.id)) changed.push(t.id + " (casting)");
}

// Check: every changed template still gives tasks whose solution prints the expected output.
const jobs = [];
const where = [];
for (const name of changed) {
  const id = name.split(" ")[0];
  for (let seed = 1; seed <= 12; seed++) {
    const task = Templates.expand(byId[id], seed);
    if (!task) continue;
    task.tests.forEach((test, k) => { jobs.push({ code: task.solution, inputs: test.inputs }); where.push([id, seed, k, test.expected]); });
  }
}
const results = runPython(jobs);
let bad = 0;
results.forEach((r, j) => {
  const [id, seed, k, expected] = where[j];
  if (r.error || Checker.normalise(r.output) !== Checker.normalise(expected)) {
    if (bad++ < 20) console.log("MISMATCH " + id + " seed " + seed + " test " + k + ": expected " + JSON.stringify(expected) + " got " + JSON.stringify(r.output) + " " + (r.error || ""));
  }
});
if (bad) { console.log(bad + " problems: templates.json not written."); process.exit(1); }
fs.writeFileSync(file, JSON.stringify(templates, null, 2) + "\n");
console.log("Changed " + changed.length + " hand-written templates (" + jobs.length + " runs checked): " + changed.join(", "));
