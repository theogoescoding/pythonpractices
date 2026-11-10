// One-off (2026-11): adds the A-level programming techniques units' new misconceptions to misconceptions.json (ids
// already there are left as they are). Each has a name, a teacher description and a three-sentence explanation for
// the student. RECURSION_RETURN_MISSING was not added: a recursive call whose result isn't returned is the existing
// RETURN_MISSING_NONE (the function gives back None), so the Recursion unit reuses that id.
"use strict";
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./run-python.js");

const NEW = [
  { id: "RECURSION_NO_BASE_CASE", name: "A recursive function with no base case it can reach",
    description: "Writes a recursive function with no base case, or with one the calls never reach (the call passes the same value, or moves away from the base case), so it calls itself until Python stops it with a RecursionError.",
    explanation: "It looks like the function never stops calling itself. A recursive function needs a base case: an input where it returns an answer without calling itself again. Check that every call passes a value that is closer to that base case." },
  { id: "GLOBAL_KEYWORD_MISSING", name: "Changes a global variable inside a function without global",
    description: "Assigns to a global variable inside a function without writing global name first. Python treats the name as a new local variable, so the global never changes, and reading it before the assignment gives an UnboundLocalError.",
    explanation: "It looks like the function was meant to change a variable from outside it. Inside a function, assigning to a name makes a new local variable unless the function first says global and the name. Add the global line, or pass the value in and return the new one." },
  { id: "LOCAL_THOUGHT_CHANGES_OUTSIDE", name: "Thinks a local variable or parameter changes the one outside",
    description: "Expects that giving a parameter or local variable a new value inside a function changes the variable outside it (the argument, or a global with the same name), or that a variable made inside a function can be used after it returns.",
    explanation: "It looks like you expected a variable outside the function to change. A parameter, or a variable given a value inside a function, is local: it is a separate variable that disappears when the function ends. To get a value out, return it and store it, for example x = double(x)." },
  { id: "LIST_COPY_ASSUMED", name: "Thinks a list or object passed in or assigned is a copy",
    description: "Expects a list or object passed into a function, or assigned with b = a, to be a separate copy. Both names refer to the same list or object, so a change made through one (append, setting an item or an attribute) is seen through the other.",
    explanation: "It looks like you expected the list or object outside to stay the same. Passing a list or object to a function, or writing b = a, doesn't copy it: both names refer to the one thing. A change made through either name is seen through both, so make a new one if you need a separate copy." },
  { id: "SELF_MISSING", name: "Leaves out self in a method",
    description: "Defines a method without self as its first parameter, or uses an attribute's name without self. inside a method, so calling the method gives a TypeError or the name isn't found (NameError).",
    explanation: "It looks like self is missing. Every method needs self as its first parameter, because the object the method is called on is passed in there. Inside the method, an attribute is always written self.name, not just name." },
  { id: "ATTRIBUTE_NOT_STORED", name: "A value is never stored as an attribute",
    description: "Stores a value in a local variable (name = name, or total = self.total + n) instead of an attribute (self.name = name), so the object never gets the value: using it later gives an AttributeError or the old value.",
    explanation: "It looks like the value was never stored on the object. A value only becomes part of the object when it is written as self.name = value inside the class, or obj.name = value outside it. A plain name = value makes a local variable that is thrown away." },
  { id: "METHOD_NO_BRACKETS", name: "Uses a method without its brackets",
    description: "Writes obj.method instead of obj.method(), so the method never runs. The name on its own is the method itself: on its own line it does nothing, as a condition it counts as True, and in a sum it gives a TypeError.",
    explanation: "It looks like a method was named but not called. Without brackets, obj.method is only the method itself, so none of its code runs. Add the brackets, with any values it needs, to call it: obj.method()." },
  { id: "GETTER_BYPASSED", name: "Changes or reads a private attribute directly",
    description: "Writes obj._balance = value (or reads obj._balance) from outside the class instead of using the setter or getter, so the setter's checks are skipped and a value the class should refuse is stored, or other attributes get out of step.",
    explanation: "It looks like the attribute was changed directly, not through its method. An attribute whose name starts with _ is private: code outside the class should use the getter and setter. The setter checks the value first, so going round it lets a wrong value in." },
  { id: "SUPER_NOT_CALLED", name: "A subclass's __init__ doesn't call super().__init__()",
    description: "Writes an __init__ in a subclass but doesn't call super().__init__(...) (or calls the parent class in a way that makes a separate object), so the attributes the parent class sets up are never stored and using them gives an AttributeError.",
    explanation: "It looks like the parent class's __init__ never ran for this object. When a subclass has its own __init__, it replaces the parent's, so the parent's attributes are only stored if you call super().__init__(...). Call it first in the subclass's __init__, passing the values the parent needs." },
  { id: "OVERRIDE_WRONG_VERSION", name: "Expects the wrong version of an overridden method to run",
    description: "Predicts or writes code as if the parent class's version of a method runs when the object's own class overrides it (or the other way round), or names the overriding method differently so it doesn't override at all.",
    explanation: "It looks like the wrong version of the method was expected to run. When a subclass has a method with the same name as one in its parent, objects of the subclass use the subclass's version. Python only uses the parent's version when the object's own class doesn't have that method." },
  { id: "FIRST_ERROR_IGNORED", name: "Doesn't start from the first error",
    description: "Looks at a later line (or the line where the wrong output shows) instead of the first line that goes wrong: names the wrong line from an error message, or fixes a later bug while the first one, which still stops the program, is left in.",
    explanation: "It looks like the first error was missed. Python runs the lines in order and stops at the first one that goes wrong, and the error message names that line, so start there. Fix it, run the program again, then look for the next problem." },
  { id: "WRONG_LINE_FIXED", name: "Changes a line that wasn't the cause of the bug",
    description: "Changes the line where a wrong value shows up (often the print) instead of the line where it is first worked out wrongly, or expects such a change to fix the program, so the bug is still there.",
    explanation: "It looks like a line that wasn't causing the bug was changed. A wrong output is usually caused earlier, where the value is first worked out. Trace the values to find the first line that gives a wrong one, and change that line." },
];

if (require.main === module) {
  const file = path.join(ROOT, "misconceptions.json");
  const list = JSON.parse(fs.readFileSync(file, "utf8"));
  const have = new Set(list.map((m) => m.id));
  const fresh = NEW.filter((m) => !have.has(m.id));
  fs.writeFileSync(file, JSON.stringify(list.concat(fresh), null, 2) + "\n");
  console.log("Added " + fresh.length + " misconceptions (" + (list.length + fresh.length) + " in all).");
}
module.exports = { NEW };
