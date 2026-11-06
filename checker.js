// Output checking and plain-English error messages.
// Works in the browser (window.Checker) and in Node (require("./checker.js")).

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Checker = factory();
})(typeof self !== "undefined" ? self : this, function () {

  // Trim trailing whitespace on every line and drop trailing blank lines.
  function normalise(text) {
    return String(text == null ? "" : text)
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/\s+$/, ""))
      .join("\n")
      .replace(/\s+$/, "");
  }

  function outputsMatch(actual, expected) {
    return normalise(actual) === normalise(expected);
  }

  function lineRef(err) {
    return err && err.line ? " on line " + err.line : "";
  }

  // Turn a Python error (from harness.py) into a short, friendly explanation.
  // Never returns the raw Python message.
  function explainError(err) {
    if (!err) return null;
    const msg = err.message || "";
    const text = err.text || "";
    const at = lineRef(err);

    switch (err.type) {
      case "Timeout":
        return {
          title: "Your program took too long",
          detail: "It ran for more than 5 seconds, so it was stopped. Check for a loop that never ends – does the loop condition ever become False?",
        };
      case "NoMoreInput":
        return {
          title: "Your program asked for too much input",
          detail: "It called input() more times than this test gives it" + at + ". Check you only ask for what the task needs, and that a loop is not asking forever.",
        };
      case "TooMuchOutput":
        return {
          title: "Your program printed far too much",
          detail: "It kept printing, so it was stopped. This usually means a loop that never ends.",
        };
      case "IndentationError":
      case "TabError":
        if (/expected an indented block/.test(msg))
          return { title: "Missing indentation" + at, detail: "The line after an if, elif, else, while or def (the one ending in a colon) must be indented by 4 spaces." };
        if (/unexpected indent/.test(msg))
          return { title: "Unexpected indentation" + at, detail: "This line is indented but it shouldn't be. Only lines inside an if, elif, else, while or def are indented." };
        if (/unindent does not match/.test(msg))
          return { title: "Indentation doesn't line up" + at, detail: "This line's indentation doesn't match the lines above it. Use exactly 4 spaces for each level." };
        return { title: "Indentation problem" + at, detail: "Check the spaces at the start of each line. Use 4 spaces for each level of indentation." };
      case "SyntaxError": {
        const isCondition = /^\s*(if|elif|while)\b/.test(text);
        if (/Maybe you meant '=='/.test(msg) || (isCondition && /[^=!<>]=[^=]/.test(text)))
          return { title: "= instead of ==" + at, detail: "A single = stores a value. To compare two values in a condition, use == (two equals signs)." };
        if (/=>|=</.test(text) && isCondition)
          return { title: "Comparison written the wrong way round" + at, detail: "Python writes 'greater than or equal' as >= and 'less than or equal' as <=. The = always goes second." };
        if (/^\s*else\s+if\b/.test(text))
          return { title: "Use elif, not else if" + at, detail: "In Python 'else if' is written as one word: elif." };
        if (/^\s*else\s+[^:\s]/.test(text))
          return { title: "else doesn't take a condition" + at, detail: "else just means 'otherwise', so it is written as else: on its own. If you need a condition, use elif." };
        if (/expected ':'/.test(msg) || (isCondition && !/:\s*(#.*)?$/.test(text)) || (/^\s*(else|def)\b/.test(text) && !/:\s*(#.*)?$/.test(text)))
          return { title: "Missing colon" + at, detail: "Lines starting with if, elif, else, while or def must end with a colon (:)." };
        if (/____/.test(text))
          return { title: "A blank hasn't been filled in" + at, detail: "Replace every ____ with your answer." };
        if (/unterminated string|EOL while scanning/.test(msg))
          return { title: "Missing quote mark" + at, detail: "A piece of text is missing its closing quote. Text must start and end with the same kind of quote: \"like this\"." };
        if (/was never closed|unexpected EOF/.test(msg))
          return { title: "Missing closing bracket" + at, detail: "A bracket ( was opened but never closed. Count your ( and ) – they should match." };
        if (/unmatched/.test(msg))
          return { title: "Extra closing bracket" + at, detail: "There is a ) or ] without a matching opening bracket." };
        if (/invalid character/.test(msg))
          return { title: "Unusual character" + at, detail: "There is a character Python doesn't understand – often a curly quote (“ ”) copied from a document. Retype the quotes." };
        return { title: "Python can't understand a line" + at, detail: "Check this line for typos: a missing colon, bracket or quote mark, or = used where you meant ==." };
      }
      case "NameError": {
        const m = /name '([^']+)' is not defined/.exec(msg);
        const name = m ? m[1] : "a name";
        let detail = "Python doesn't know what '" + name + "' is. Check the spelling and capital letters, and that you created it before using it.";
        if (/^(yes|no|[A-Z][a-z]+)$/.test(name)) detail += " If it's meant to be text, put it in quotes: \"" + name + "\".";
        return { title: "Unknown name '" + name + "'" + at, detail };
      }
      case "ValueError":
        if (/invalid literal for int|could not convert string to float/.test(msg))
          return { title: "Couldn't turn the input into a number" + at, detail: "int() only works on whole numbers like \"42\". If the input could have a decimal point, use float(). If it could be words, check it with .isdigit() first." };
        return { title: "A value isn't right" + at, detail: "A function was given a value it can't work with." };
      case "TypeError":
        if (/not supported between instances of 'str' and 'int'|not supported between instances of 'int' and 'str'/.test(msg))
          return { title: "Comparing text with a number" + at, detail: "input() always gives you text. Cast it to a number with int() before comparing, e.g. age = int(input(\"Age: \")). This is called casting." };
        if (/can only concatenate str/.test(msg))
          return { title: "Joining text and a number" + at, detail: "You can't use + to join text and a number. Use a comma in print() instead, or convert the number with str()." };
        if (/unsupported operand/.test(msg))
          return { title: "Maths on the wrong type" + at, detail: "You're doing maths with something that isn't a number. Did you forget to cast the input with int(input())?" };
        if (/argument|positional/.test(msg))
          return { title: "Wrong number of values passed to a function" + at, detail: "Check that you give the function the same number of values as it expects in its brackets." };
        if (/not callable/.test(msg))
          return { title: "Something isn't a function" + at, detail: "You've put ( ) after something that isn't a function. Check you haven't used a function's name as a variable." };
        return { title: "Mixing types" + at, detail: "Python can't combine these two kinds of value. Check whether each value is text or a number." };
      case "ZeroDivisionError":
        return { title: "Dividing by zero" + at, detail: "You can't divide by 0 (and that includes // and %). Check the value before you divide." };
      case "RecursionError":
        return { title: "A function keeps calling itself" + at, detail: "A function is calling itself over and over. Check that it returns a value instead." };
      case "AttributeError":
        return { title: "That doesn't work on this value" + at, detail: "You used a .method() on a value that doesn't have it. For example, .isdigit() works on text, not on numbers." };
      case "IndexError":
        return { title: "Position out of range" + at, detail: "You asked for a position that doesn't exist." };
      case "UnboundLocalError":
        return { title: "Variable used before it has a value" + at, detail: "A variable is used before anything has been stored in it. Give it a starting value first." };
      default:
        return { title: "Something went wrong" + at, detail: "Python hit a problem it calls " + (err.type || "an error") + ". Read the line carefully and check each value." };
    }
  }

  // Friendly feedback for one failed test where the program did not crash.
  function mismatchHint(actual, expected) {
    const a = normalise(actual);
    const e = normalise(expected);
    if (a === "" && e !== "") return "Your program didn't print anything for this input. Does the right branch run?";
    if (e === "" && a !== "") return "For this input nothing should be printed. Check your condition – should this branch run here?";
    if (a.toLowerCase() === e.toLowerCase()) return "Nearly! Check your capital letters.";
    const squash = (s) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (squash(a) === squash(e)) return "Nearly! Check your spaces and punctuation.";
    const aLines = a.split("\n");
    const eLines = e.split("\n");
    if (aLines.length > eLines.length && eLines.every((l) => aLines.includes(l)))
      return "Your program printed extra lines. If only one branch should run, use elif instead of separate if statements.";
    return "The output doesn't match. Try the input yourself and follow your code line by line. Watch out for boundaries (> or >=?).";
  }

  // ---------- Failure classification ----------
  // Every failed attempt gets exactly one category, worked out from the run results (students never pick one).
  // Checked in this order; OTHER_ERROR covers runtime errors that aren't NAME, TYPE or TIMEOUT (e.g. ValueError).
  const CATEGORIES = ["SYNTAX", "NAME", "TYPE", "TIMEOUT", "NO_ANSWER", "ORDER", "OTHER_ERROR", "WRONG_OUTPUT", "WRONG_CHOICE"];
  const SYNTAX_TYPES = ["SyntaxError", "IndentationError", "TabError"];
  const NAME_TYPES = ["NameError", "UnboundLocalError"];
  const TIMEOUT_TYPES = ["Timeout", "TooMuchOutput"];
  const TYPE_WORDS = { str: "text", int: "a whole number", float: "a decimal number", bool: "True/False", NoneType: "None" };

  // True if the code is only blank lines, comments and pass.
  function isNoAnswer(code) {
    return String(code == null ? "" : code).split(/\r?\n/).every((l) => /^\s*(#.*|pass\s*(#.*)?)?$/.test(l));
  }

  // The Python types named in a TypeError message, e.g. ["str", "int"].
  function typesInMessage(msg) {
    let m = /can only concatenate (\w+) \(not "(\w+)"\)/.exec(msg);
    if (m) return [m[1], m[2]];
    m = /'(\w+)' and '(\w+)'/.exec(msg);
    if (m) return [m[1], m[2]];
    m = /of type '(\w+)'/.exec(msg);
    return m ? [m[1]] : [];
  }

  // A short, version-independent label for how a run ended, used to compare a student's run with a buggy variant's.
  // recheck.py has a copy of this function: keep the two the same.
  function errorKind(err) {
    if (!err) return "";
    if (TIMEOUT_TYPES.includes(err.type)) return "Timeout";
    const msg = err.message || "";
    const text = err.text || "";
    if (SYNTAX_TYPES.includes(err.type) &&
      (/Maybe you meant '=='/.test(msg) || (/^\s*(if|elif|while)\b/.test(text) && /[^=!<>]=[^=]/.test(text))))
      return "SyntaxError:assign-in-condition";
    if (err.type === "TypeError") {
      if (/can only concatenate/.test(msg)) return "TypeError:concat";
      if (/not supported between instances/.test(msg)) return "TypeError:compare";
      if (/unsupported operand/.test(msg)) return "TypeError:operand";
    }
    return err.type || "Error";
  }

  // a = { type, code, empty, results, tests, passes?, parsons?: { usedDistractor, missing }, choice?, options?, answer? }
  //   results: one { output, error, notRun } per test, from harness.py (via the worker)
  //   empty:   nothing was given at all (blank editor, no blanks filled, no Parsons lines), so the code wasn't run
  // Returns { category, details, failedTest, output, errorType, errorKind }.
  //   failedTest is the index of the test used as evidence (the first failing one), or null.
  function classifyAttempt(a) {
    if (a.type === "predict") {
      return { category: "WRONG_CHOICE", details: { chosen: a.options[a.choice], correct: a.options[a.answer] },
        failedTest: 0, output: a.options[a.choice], errorType: "", errorKind: "" };
    }
    const noRun = { failedTest: null, output: "", errorType: "", errorKind: "" };
    if (a.empty) return Object.assign({ category: "NO_ANSWER", details: {} }, noRun);

    const results = a.results || [];
    const tests = a.tests || [];
    const passes = a.passes || results.map((r, i) => !!r && !r.error && !r.notRun && outputsMatch(r.output, tests[i].expected));
    const evidence = (i) => ({ failedTest: i, output: results[i].output || "", errorType: results[i].error ? results[i].error.type : "", errorKind: errorKind(results[i].error) });
    const firstError = (types) => results.findIndex((r) => r && r.error && (!types || types.includes(r.error.type)));
    const at = (category, i, details) => Object.assign({ category, details }, evidence(i));

    let i = firstError(SYNTAX_TYPES);
    if (i >= 0) return at("SYNTAX", i, { line: results[i].error.line || null });
    i = firstError(NAME_TYPES);
    if (i >= 0) {
      const m = /name '([^']+)'/.exec(results[i].error.message || "") || /variable '([^']+)'/.exec(results[i].error.message || "");
      return at("NAME", i, { name: m ? m[1] : null, line: results[i].error.line || null });
    }
    i = firstError(["TypeError"]);
    if (i >= 0) return at("TYPE", i, { types: typesInMessage(results[i].error.message || ""), line: results[i].error.line || null });
    i = firstError(TIMEOUT_TYPES);
    if (i >= 0) return at("TIMEOUT", i, {});
    if (isNoAnswer(a.code)) return Object.assign({ category: "NO_ANSWER", details: {} }, noRun);
    const failIndex = passes.findIndex((p) => !p);
    if (a.parsons && !a.parsons.usedDistractor && !a.parsons.missing) {
      return failIndex >= 0 ? at("ORDER", failIndex, {}) : Object.assign({ category: "ORDER", details: {} }, noRun);
    }
    i = firstError();
    if (i >= 0) return at("OTHER_ERROR", i, { errorType: results[i].error.type, line: results[i].error.line || null });
    if (failIndex < 0) {
      // Every test passed but the Parsons answer used a line that isn't needed, or left one out.
      return Object.assign({ category: "WRONG_OUTPUT", details: { parsons: a.parsons && a.parsons.usedDistractor ? "used a line that isn't needed" : "left out a line that is needed" } }, noRun);
    }
    const test = tests[failIndex];
    return at("WRONG_OUTPUT", failIndex, { test: failIndex + 1, inputs: test.inputs, expected: test.expected, actual: results[failIndex].output || "" });
  }

  // A friendly, specific message for a failed attempt. Never includes Python's own error text.
  // Returns { message, tryNext }: what went wrong, and one thing to try next.
  function failureParts(f, opts) {
    const d = f.details || {};
    const onLine = d.line ? " on line " + d.line : "";
    switch (f.category) {
      case "SYNTAX":
        return { message: "Python couldn't understand your code" + onLine + ". Check that line for a missing colon, bracket or quote mark.",
          tryNext: "Read that line one character at a time, and compare it with a line that works, such as one in the task." };
      case "NAME":
        return { message: "Python couldn't find a name it expected" + (d.name ? " ('" + d.name + "')" : "") + onLine + ". Check your spelling, and that you created it before using it.",
          tryNext: "Find where that name is first given a value. Is it spelt exactly the same, with the same capital letters, and does it come before this line?" };
      case "TYPE": {
        const words = (d.types || []).map((t) => TYPE_WORDS[t] || t);
        return { message: "Your code mixes values that don't go together" + (words.length === 2 ? " – " + words[0] + " and " + words[1] : "") + onLine + ". Check whether each value is text or a number.",
          tryNext: "For each value on that line, say whether it is text or a number. Remember that input() always gives text." };
      }
      case "TIMEOUT":
        return { message: "Your program kept going for too long, so it was stopped. Check that your loop's condition can become False.",
          tryNext: "Pick the variable in your loop's condition and follow its value round the loop two or three times. Does it ever make the condition False?" };
      case "NO_ANSWER":
        return { message: "There's nothing to check yet. Have a go – any attempt helps you learn.",
          tryNext: "Start with the first line the task needs, then press Run to see what it does. You can open a hint if you're stuck." };
      case "ORDER":
        return { message: "You've picked all the right lines. Now check their order and indentation.",
          tryNext: "Read your program from the top, as Python does. Does each variable get a value before it is used, and are the lines inside an if or loop indented under it?" };
      case "OTHER_ERROR":
        return { message: "Your program stopped with an error" + onLine + ". Read the explanation below to see why.",
          tryNext: "Use the input from the test that failed and follow your program to the line in the explanation. What value does each variable have there?" };
      case "WRONG_OUTPUT":
        if (d.parsons) return { message: "Your program works, but it " + d.parsons + ". Check which lines you've used.",
          tryNext: "Compare each line in your program with the task description. Every line should be needed, and nothing the task asks for should be missing." };
        // A hidden test (opts.exampleTests = how many tests the student can see): nothing about it is shown.
        if (opts && opts.exampleTests != null && d.test > opts.exampleTests)
          return { message: "Your program ran, but it didn't print the right thing for one of the hidden tests.",
            tryNext: "Your program may only work for the example. Think of other inputs: the boundaries, 0, and every branch of your program, and check what it prints for each." };
        return { message: "Your program ran, but test " + d.test + " printed something different from what was expected. Compare the two below.",
          tryNext: "Find the first line where your output and the expected output differ, then follow your code with that test's input to see why." };
      case "WRONG_CHOICE":
        return { message: "That's not what this program prints. Trace through it one line at a time.",
          tryNext: "Write down each variable's value after every line, and what each print() shows, before you choose." };
      default:
        return { message: "That's not quite right yet. Have another look.", tryNext: "Read the task again and test your program with the inputs it gives." };
    }
  }

  // The message and its "What to try" line, as one text (the line starts on a new line).
  function failureMessage(f) {
    const p = failureParts(f);
    return p.message + "\nWhat to try: " + p.tryNext;
  }

  // ---------- Misconception matching ----------
  // A task's buggy_variants each show one misconception. Their outputs for every test are worked out in advance
  // (tools/build-variants.js) and stored in tasks.json, so the app and recheck.py compare against the same outputs.
  // A misconception is only recorded when the student's result on the failing test equals a variant's result.
  const NO_MATCH_CATEGORIES = ["NO_ANSWER"];

  function sameResult(variantOut, f) {
    const kv = variantOut.errorKind || "";
    if (kv !== (f.errorKind || "")) return false;
    if (kv === "Timeout") return true; // an endless loop's output depends on when it was stopped
    return normalise(variantOut.output) === normalise(f.output);
  }

  // f = the result of classifyAttempt. Returns a list of misconception ids (empty if none match).
  function matchMisconceptions(task, f) {
    const variants = (task && task.buggy_variants) || [];
    if (!variants.length || NO_MATCH_CATEGORIES.includes(f.category) || f.failedTest == null) return [];
    const ids = [];
    for (const v of variants) {
      const out = (v.outputs || [])[f.failedTest];
      if (out && sameResult(out, f) && !ids.includes(v.misconception)) ids.push(v.misconception);
    }
    return ids;
  }

  return {
    normalise, outputsMatch, explainError, mismatchHint,
    CATEGORIES, isNoAnswer, errorKind, classifyAttempt, failureParts, failureMessage, matchMisconceptions,
  };
});
