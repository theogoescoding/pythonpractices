// One-off (2026-11): hand-written write-from-scratch templates for Authentication (3): which part of a login was
// wrong, three attempts with a while loop, and a login function over two stored lists. The stored details are
// variables or plain lists in the program. Checked by tools/hand-templates.js (20 seeds each).
"use strict";
const { addTemplates } = require("./hand-templates.js");

const USERS = ["ava7", "ben_k", "zara.b", "kai_t", "leo_m", "mia", "dev01", "rio"];
const PASSWORDS = ["Tiger42", "Moon5", "Star8", "Rocket9", "Comet3", "Owl77", "Fox_12", "Rain22"];

addTemplates([
  { id: "scratch-auth-which", units: ["authentication"], source: "auth-L7a", level: 10, type: "scratch", starter: "", title: "Which detail was wrong?",
    params: { u: { choice: USERS }, p: { choice: PASSWORDS } },
    description: "Write a program from scratch that stores the username {{u}} and the password {{p}}. Ask for a username and then a password. Print Logged in if both match, Wrong password if only the username matches, and Wrong username otherwise.",
    solution: 'stored_username = "{{u}}"\nstored_password = "{{p}}"\nusername = input("Username: ")\npassword = input("Password: ")\nif username == stored_username and password == stored_password:\n    print("Logged in")\nelif username == stored_username:\n    print("Wrong password")\nelse:\n    print("Wrong username")',
    tests: [{ inputs: ["{{u}}", "{{p}}"], expected: "Logged in" }, { inputs: ["{{u}}", "{{p.toLowerCase()}}"], expected: "Wrong password" },
      { inputs: ["{{u}}x", "{{p}}"], expected: "Wrong username" }],
    hints: ["Check both details first, joined with and.", "Then elif: if only the username matched, the password was wrong."],
    skills: ["which-wrong", "both-match"], tags: ["login"] },
  { id: "scratch-auth-tries", units: ["authentication"], source: "auth-L8a", level: 10, type: "scratch", starter: "", title: "Three tries",
    params: { p: { choice: PASSWORDS }, ok: { choice: ["Logged in", "Welcome back", "Unlocked", "Door open"] }, locked: { choice: ["Account locked", "Too many attempts", "Locked out", "Alarm on"] } },
    description: "Write a program from scratch that stores the password {{p}} and allows up to 3 attempts at it, with a while loop and a counter of attempts. Stop asking as soon as it is right. Then print {{ok}}, or {{locked}} after 3 wrong attempts.",
    solution: 'stored_password = "{{p}}"\nattempts = 0\nlogged_in = False\nwhile attempts < 3 and not logged_in:\n    password = input("Password: ")\n    attempts = attempts + 1\n    if password == stored_password:\n        logged_in = True\nif logged_in:\n    print("{{ok}}")\nelse:\n    print("{{locked}}")',
    tests: [{ inputs: ["{{p}}"], expected: "{{ok}}" }, { inputs: ["{{p.toLowerCase()}}", "{{p}}x", "{{p}}"], expected: "{{ok}}" },
      { inputs: ["a", "{{p.toUpperCase()}}", "{{p}} "], expected: "{{locked}}" }],
    hints: ["Loop while attempts < 3 and not logged_in.", "Count every attempt with attempts = attempts + 1, or the loop never ends."],
    skills: ["login-loop", "attempts"], tags: ["attempts", "while"] },
  { id: "scratch-auth-function", units: ["authentication"], source: "auth-L10a", level: 10, type: "scratch", starter: "", title: "Login function",
    params: { a: { int: [0, 7] }, b: { int: [0, 7] } },
    // Template expressions only see the template's own values, so the lists are written into them.
    values: { u1: JSON.stringify(USERS) + "[a]", u2: JSON.stringify(USERS) + "[(a + 1 + b % 6) % 8]",
      p1: JSON.stringify(PASSWORDS) + "[b]", p2: JSON.stringify(PASSWORDS) + "[(b + 3) % 8]" },
    description: "Write a program from scratch that stores usernames = [\"{{u1}}\", \"{{u2}}\"] and passwords = [\"{{p1}}\", \"{{p2}}\"]: each password is at the same index as its username. Write a function check_login(username, password) that returns True for a stored pair and False otherwise. Ask for a username and then a password, and print Logged in or Login failed.",
    solution: 'usernames = ["{{u1}}", "{{u2}}"]\npasswords = ["{{p1}}", "{{p2}}"]\n\ndef check_login(username, password):\n    for i in range(len(usernames)):\n        if usernames[i] == username and passwords[i] == password:\n            return True\n    return False\n\nusername = input("Username: ")\npassword = input("Password: ")\nif check_login(username, password):\n    print("Logged in")\nelse:\n    print("Login failed")',
    tests: [{ inputs: ["{{u2}}", "{{p2}}"], expected: "Logged in" }, { inputs: ["{{u1}}", "{{p2}}"], expected: "Login failed" }, { inputs: ["{{u1}}", "{{p1}}"], expected: "Logged in" }],
    hints: ["usernames[i] and passwords[i] are one stored pair.", "Return True as soon as a pair matches; return False after the loop."],
    skills: ["validation-function", "both-match"], tags: ["login", "def"] },

  // ---------- Validation + Authentication (combined with the unit before) ----------
  { id: "comb-val-auth-signup", units: ["validation", "authentication"], source: "val-L9l", level: 9, type: "write", title: "Sign up",
    params: { lst: { choice: [["ava7", "ben_k", "zara.b"], ["rio", "zack", "nia_b", "theo3"], ["leo_m", "kai_t"], ["dev01", "dev02", "dev03"], ["mia", "omar.k", "lily.p"]] },
      lo: { int: [3, 5] } },
    values: { shown: "pylist(lst)" },
    description: "The list of usernames is made for you. Ask for a new username. While it is shorter than {{lo}} characters or is already in usernames, print Choose another username and ask again. Then append it to usernames, and print Account made for and the username, then the number of accounts, for example:\nAccounts: {{lst.length + 1}}",
    starter: 'usernames = {{shown}}\n# Ask for a new username: a length check, and not already in usernames',
    solution: 'usernames = {{shown}}\nname = input("New username: ")\nwhile len(name) < {{lo}} or name in usernames:\n    print("Choose another username")\n    name = input("New username: ")\nusernames.append(name)\nprint("Account made for", name)\nprint("Accounts:", len(usernames))',
    testParams: { k: { int: [0, 9] }, good: { choice: ["skylark", "comet99", "pebble_7", "orbit", "maple22", "harbour"] } },
    testValues: { taken: "lst[k % lst.length]" },
    testCount: 3,
    test: { inputs: ["{{taken}}", "ab", "{{good}}"], expected: "Choose another username\nChoose another username\nAccount made for {{good}}\nAccounts: {{lst.length + 1}}" },
    hints: ["The while loop runs while either check fails: too short, or in usernames. Join them with or.", "Ask again inside the loop; after it, append() the new username."],
    skills: ["length", "re-ask", "known-users"], tags: ["length check", "usernames"] },
  { id: "comb-val-auth-pin", units: ["validation", "authentication"], source: "auth-L8b", level: 8, type: "write", title: "PIN with checks",
    params: { pin: { int: [1000, 9999] } },
    values: { wrong: "String(pin === 9999 ? 1000 : pin + 1)" },
    description: "Allow up to 3 attempts at the PIN, with a while loop and the attempts counter. On each attempt: if the answer isn't 4 digits, print A PIN is 4 digits; if it is 4 digits but wrong, print Wrong PIN. Stop asking as soon as it is right. Then print Card accepted, or Card blocked after 3 attempts.",
    starter: 'stored_pin = "{{pin}}"\nattempts = 0\nlogged_in = False\n# Up to 3 attempts, with a type and length check on each one',
    solution: 'stored_pin = "{{pin}}"\nattempts = 0\nlogged_in = False\nwhile attempts < 3 and not logged_in:\n    pin = input("Card PIN: ")\n    attempts = attempts + 1\n    if not pin.isdigit() or len(pin) != 4:\n        print("A PIN is 4 digits")\n    elif pin == stored_pin:\n        logged_in = True\n    else:\n        print("Wrong PIN")\nif logged_in:\n    print("Card accepted")\nelse:\n    print("Card blocked")',
    tests: [{ inputs: ["{{pin}}"], expected: "Card accepted" }, { inputs: ["12a4", "{{pin}}"], expected: "A PIN is 4 digits\nCard accepted" },
      { inputs: ["{{wrong}}", "123", "{{wrong}}"], expected: "Wrong PIN\nA PIN is 4 digits\nWrong PIN\nCard blocked" }],
    hints: ["The type check and length check come first: not pin.isdigit() or len(pin) != 4.", "Count every attempt with attempts = attempts + 1, and stop when logged_in is True."],
    skills: ["type-check", "login-loop", "attempts"], tags: ["type check", "attempts", "PINs"] },
  { id: "comb-val-auth-function", units: ["validation", "authentication"], source: "auth-L9a", level: 6, type: "parsons", title: "Check, then log in",
    params: { u: { choice: USERS }, p: { choice: PASSWORDS } },
    description: "Arrange the lines so check_login() returns False if either box is empty (a presence check), True if both details match the stored ones, and False otherwise.\nTwo lines are not needed.",
    solution: 'stored_username = "{{u}}"\nstored_password = "{{p}}"\ndef check_login(username, password):\n    if username.strip() == "" or password == "":\n        return False\n    if username == stored_username and password == stored_password:\n        return True\n    return False\nif check_login(input("Username: "), input("Password: ")):\n    print("Welcome")\nelse:\n    print("Try again")',
    distractors: ["if username == stored_username or password == stored_password:", 'if username.strip() == "" and password == "":'],
    tests: [{ inputs: ["{{u}}", "{{p}}"], expected: "Welcome" }, { inputs: ["  ", "{{p}}"], expected: "Try again" }, { inputs: ["{{u}}", "{{p}}!"], expected: "Try again" }],
    hints: ["The presence check comes first in the function: either box empty is enough, so use or.", "Both details must match for True, so join them with and."],
    skills: ["validation-function", "presence", "both-match"], tags: ["login", "def"] },
]);
