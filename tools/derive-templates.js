// Makes a "derived" template from every practice (non-placement) bank task, and writes them into templates.json
// (replacing earlier derived templates of the chosen types; every other template is kept).
//
// Usage:  node tools/derive-templates.js --types predict,write    derive these task types only
//         node tools/derive-templates.js                           all four types
//         node tools/derive-templates.js --report                  only report what would be made
//         node tools/derive-templates.js --units merge-sort        only these units (the rest are kept)
//
// How a task becomes a template (see templates.js for how a derived template is used):
//   - Numbers: every number in the code (outside the fixed ones in FIXED) and every number typed in a test is a
//     parameter. All of them are scaled by the same random factor and nudged a little, keeping their order, sign
//     and size, so boundaries and branches still mean the same thing. A number one more or one less than a
//     parameter (a boundary test, "1 to 5" for range(1, 6)) moves with it.
//   - A number that can't change without breaking the task (for example how many values a loop reads, or a menu
//     choice) is found by running the solution with that number changed, and kept fixed.
//   - Context: first names, days, school subjects and colours are swapped for others from the same list.
//   - The same numbers and words change everywhere: description, starter, solution, answers, distractors, hints and
//     buggy variants, so blanks, distractors and misconceptions stay in the same place and mean the same.
//   - "For example" outputs in the description become [[out:k]] and are filled in from the variant's own output.
//   - where: no value of 0 or 1 where there wasn't one, the original order kept, at least one value changed.
// Overrides (OVERRIDES below) hold hand-written changes for tasks the automatic rules can't vary well.
"use strict";
const fs = require("fs");
const path = require("path");
const { runPython, ROOT } = require("./run-python.js");
const Checker = require(path.join(ROOT, "checker.js"));
const Templates = require(path.join(ROOT, "templates.js"));

// Numbers that keep their meaning (units of time, percentages, 0/1/2): never changed.
const FIXED = new Set([0, 1, 2, 100, 1000, 60, 24, 365, 52]);
const FACTORS = [0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.2, 1.3];
// Words swapped for others from the same list (the context). A word may end in "s" (Thursdays).
const WORD_LISTS = [
  ["Ava", "Ben", "Sam", "Zara", "Ollie", "Priya", "Ali", "Mia", "Leo", "Noah", "Isla", "Ruby", "Omar", "Ella", "Tom", "Amir", "Grace", "Finn", "Leah", "Dev", "Nina", "Theo", "Lily", "Josh", "Chloe", "Ravi", "Erin", "Jack", "Aisha", "Kofi", "Jamal", "Zoe", "Maya", "Kai", "Sara", "Ethan", "Hana"],
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  ["maths", "science", "history", "geography", "art", "music", "French", "drama", "computing"],
  ["red", "blue", "green", "yellow", "purple", "orange"],
  ["Good morning", "Good afternoon", "Hello", "Welcome", "Hi there", "Good evening"],
  ["Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12"],
  ["football", "netball", "hockey", "tennis", "rugby", "cricket", "basketball", "badminton"],
  ["pizza", "pasta", "curry", "salad", "soup", "toast", "noodles"],
  ["library", "canteen", "sports hall", "music room", "science lab", "playground"],
  ["Registration", "Assembly", "Maths lesson", "Break", "Science lesson", "Lunch", "Form time"],
  ["cat", "dog", "rabbit", "hamster", "parrot", "tortoise", "goldfish"],
  ["Game over", "You lose", "Out of lives", "No lives left", "Try again later", "Better luck next time"],
];
// Form groups such as 7B or 10T: a year from 7 to 11 and a letter.
const FORMS = ["7A", "7B", "7C", "8A", "8R", "8T", "9B", "9K", "9S", "10T", "10M", "10W", "11C", "11J", "11P"];
const DERIVE_SEEDS = 16;     // seeds tried when checking a new template (validate.js uses the same number)
const MIN_VARIANTS = 5;

// Hand-written changes for tasks the automatic rules can't vary well (mostly tasks about text, with no numbers):
//   fixed:     numbers never to change          noNumbers: change no numbers at all
//   words:     false to switch off word swaps
//   swaps:     [[tuple, tuple, …], …] linked strings; the first tuple is the task's own, changed together everywhere
//   testSets:  alternative lists of test inputs (the first is the task's own), for inputs that carry meaning
const OVERRIDES = {
  // Data types and casting.
  "types-L1b": { swaps: [[["42"], ["17"], ["8"], ["63"], ["25"], ["31"]]] },
  "types-L9f": { swaps: [[["trip slip", "Slip signed?"], ["consent form", "Form signed?"], ["museum letter", "Letter signed?"],
    ["swimming slip", "Swim slip signed?"], ["theatre form", "Theatre form signed?"], ["camp letter", "Camp letter signed?"]]] },
  "types-L8d": { fixed: [0.5] }, // half a litre: the 0.5 is a fact of the task
  // Real-number sums and products: whole sets of halves and quarters, which add and multiply exactly (scaling them
  // would give outputs such as 38.400000000000006).
  "types-L5a": { noNumbers: true, testSets: [
    [["1.5", "2.25"], ["0.5", "0.75"]], [["1.25", "0.5"], ["2.75", "1.5"]], [["0.75", "3.5"], ["1.5", "1.25"]],
    [["2.5", "0.25"], ["0.5", "4.75"]], [["3.25", "1.5"], ["0.25", "0.75"]], [["1.75", "2.5"], ["2.25", "0.5"]]] },
  "types-L6a": { noNumbers: true, testSets: [
    [["3", "1.5"], ["2", "2.25"], ["4", "2"]], [["5", "1.25"], ["3", "2.5"], ["2", "3"]], [["4", "1.75"], ["6", "0.5"], ["3", "2"]],
    [["2", "3.25"], ["5", "1.5"], ["7", "1"]], [["6", "1.25"], ["4", "2.75"], ["5", "2"]], [["3", "3.5"], ["8", "0.75"], ["2", "4"]]] },
  "types-L7b": { noNumbers: true, hints: ["The temperature can have a decimal part.", "Casting with int() fails on text with a decimal point: use float()."], testSets: [
    [["12.5"], ["-2"], ["20"]], [["8.5"], ["-4"], ["15"]], [["16.5"], ["-1.5"], ["9"]],
    [["21.5"], ["0"], ["-3.5"]], [["5.5"], ["-6"], ["18"]], [["13.5"], ["-0.5"], ["24"]]] },
  "types-L10e": { noNumbers: true, testSets: [
    [["12.5", "13.25", "12.75"], ["10", "11", "12"], ["14.25", "13.75", "15"]],
    [["11.5", "12.25", "13.75"], ["9.5", "10.5", "11"], ["15.25", "14.5", "13"]],
    [["13", "12.5", "14.75"], ["10.25", "10.25", "10.5"], ["16", "15.5", "14.25"]],
    [["12.75", "12.75", "13.5"], ["11", "9.5", "10.25"], ["14", "14", "14.5"]],
    [["10.5", "13.5", "12"], ["12.25", "11.75", "9"], ["15.75", "15.25", "16.5"]],
    [["11.25", "12", "13"], ["9.75", "10", "11.5"], ["13.5", "14.5", "15.5"]]] },
  "types-L10f": { noNumbers: true, testSets: [
    [["3", "5", "yes"], ["2", "4.5", "no"], ["4", "2.25", "no"]],
    [["2", "7.5", "yes"], ["5", "1.25", "no"], ["3", "3.5", "yes"]],
    [["4", "6", "no"], ["1", "8.75", "yes"], ["6", "2.5", "no"]],
    [["5", "4", "yes"], ["3", "2.75", "no"], ["2", "9.5", "yes"]],
    [["6", "1.5", "no"], ["4", "3.25", "yes"], ["1", "12", "no"]],
    [["2", "5.25", "yes"], ["7", "2", "no"], ["3", "4.5", "no"]]] },

  // Strings: mostly text, so the words change together (a word and the part found in it, a word and its slice).
  "str-L1d": { swaps: [[["banana", "nan"], ["computer", "put"], ["elephant", "ant"], ["sandwich", "and"], ["carpet", "car"], ["teacher", "each"]]] },
  "str-L2b": { swaps: [[["leeds"], ["york"], ["bath"], ["derby"], ["hull"], ["truro"]]] },
  "str-L2c": { swaps: [[["see you at lunch", "you"], ["back in ten minutes", "ten"], ["on the bus now", "bus"], ["call me after school", "after"], ["running late today", "late"], ["at the front gate", "front"]]] },
  "str-L3b": { swaps: [[["tigers", "TIGERS", "Lions", "eagles fc"], ["rovers", "ROVERS", "Owls", "city fc"], ["sharks", "SHARKS", "Hawks", "united"],
    ["wolves", "WOLVES", "Bears", "town fc"], ["comets", "COMETS", "Foxes", "rangers"], ["giants", "GIANTS", "Bulls", "athletic"]]] },
  "str-L3c": { noNumbers: true, swaps: [[
    ["school trip photos", "school-trip-photos", "year 7 news", "sports day"], ["class blog posts", "class-blog-posts", "art club", "prom night"],
    ["science fair winners", "science-fair-winners", "music room", "open evening"], ["lunch menu ideas", "lunch-menu-ideas", "book week", "cake sale"],
    ["football match report", "football-match-report", "chess club", "quiz night"], ["school play tickets", "school-play-tickets", "drama club", "bake off"]]] },
  "str-L4a": { noNumbers: true, swaps: [[["Leeds", "Bristol", "york", "LEE"], ["Derby", "Norwich", "bath", "DER"], ["Exeter", "Lincoln", "hull", "EXE"],
    ["Oxford", "Swindon", "ely", "OXF"], ["Durham", "Cardiff", "wells", "DUR"], ["Preston", "Chester", "ripon", "PRE"]]] },
  "str-L7b": { swaps: [[["hello", "see you soon", "Go Team"], ["good luck", "well done", "Happy Friday"], ["thank you", "on my way", "Big News"],
    ["lunch time", "be right back", "Game On"], ["see you later", "nice one", "Top Marks"], ["welcome back", "no way", "Hat Trick"]]] },
  "str-L7c": { noNumbers: true, swaps: [[["A12-7", "B-44", "CC9-01"], ["X3-55", "QQ-1", "M4N-2"], ["B7-9", "K-310", "LL2-08"],
    ["Z-6", "R44-1", "T1Y-77"], ["P12-3", "G-2", "HH6-4"], ["D3-30", "W-91", "C8-500"]]] },
  "str-L8b": { swaps: [[["fish & chips", "salt & pepper & vinegar", "no symbol here"], ["bread & butter", "cheese & ham & pickle", "just one thing"],
    ["rock & roll", "black & white & grey", "nothing to change"], ["cats & dogs", "bat & ball & stumps", "plain text"],
    ["Tom & Jerry", "red & blue & green", "no ampersand"], ["sun & sea", "pens & pencils & rulers", "all words"]]] },
  "str-L9a": { swaps: [[["british", "broadcasting", "corporation", "BBC"], ["parent", "teacher", "association", "PTA"], ["very", "important", "person", "VIP"],
    ["frequently", "asked", "questions", "FAQ"], ["unidentified", "flying", "object", "UFO"], ["random", "access", "memory", "RAM"]]] },
  "str-L9b": { swaps: [[["python", "ytho", "bread", "sandwich"], ["planet", "lane", "cheese", "tomato"], ["window", "indo", "carrot", "pencil"],
    ["garden", "arde", "biscuit", "rocket"], ["marble", "arbl", "orange", "guitar"], ["silver", "ilve", "bottle", "basket"]]] },

  // Random: a letter string and what is printed about it change together; a guessing range that must stay 1 to 3.
  "rand-L1d": { swaps: [[["AEIOU", "A vowel", "Not a vowel"], ["HT", "Heads or tails", "Something else"], ["RGB", "Red, green or blue", "Another colour"],
    ["NESW", "A compass point", "Not a compass point"], ["ABCD", "A, B, C or D", "Another letter"], ["XYZ", "X, Y or Z", "Another letter"]]] },
  "rand-L2b": { swaps: [[["ZZZ"], ["QQQ"], ["XXX"], ["MMM"], ["KKK"], ["BBB"]]] },
  // Every word in a list has the same length, so the answer doesn't depend on which one is picked.
  // Not 3 letters: len() of the whole 3-item list would then be the right answer too.
  "rand-L1b": { swaps: [[["cat", "dog", "owl"], ["lion", "bear", "wolf"], ["apple", "mango", "lemon"], ["rose", "lily", "iris"],
    ["robin", "eagle", "raven"], ["duck", "frog", "goat"], ["chair", "table", "shelf"], ["planet", "rocket", "galaxy"]]] },
  "rand-L5c": { fixed: [3] },

  // Functions, no return value: a function's name and what it prints change together.
  "fb-L1a": { swaps: [[["hello", "Hello!"], ["welcome", "Welcome!"], ["greet", "Good morning!"], ["hiya", "Hiya!"], ["howdy", "Howdy!"], ["cheers", "Cheers!"]]] },
  "fb-L1b": { swaps: [[["cheer", "Go team!"], ["clap", "Well done!"], ["chant", "We are the best!"], ["shout", "Come on!"], ["sing", "La la la!"], ["wave", "Hello there!"]]] },
  "fb-L1c": { swaps: [[["secret", "Hidden", "Start"], ["bonus", "Extra", "Begin"], ["unused", "Never seen", "Ready"], ["spare", "Not shown", "Go"], ["later", "Waiting", "First"], ["quiet", "Silent", "Hello"]]] },
  "fb-L2a": { swaps: [[["line", "-----", "Top", "Bottom"], ["stars", "*****", "Start", "End"], ["gap", "~~~~~", "Name", "Score"], ["divider", "=====", "Morning", "Afternoon"],
    ["rule", "_____", "Title", "Footer"], ["edge", "#####", "Head", "Tail"]]] },
  "fb-L3a": { swaps: [[["banner", "School fair today!"], ["notice", "Library closes at 4"], ["alert", "Bring your PE kit"], ["reminder", "Trip forms due Friday"],
    ["news", "Choir at lunch"], ["message", "Quiz night tonight"]]] },
  "fb-L3b": { swaps: [[["ring", "Ring ring!"], ["buzz", "Buzz buzz!"], ["beep", "Beep beep!"], ["knock", "Knock knock!"], ["chime", "Ding dong!"], ["toot", "Toot toot!"]]] },
  "fb-L3c": { swaps: [[["shout", "word", "hello", "go"], ["yell", "text", "hi there", "stop"], ["loud", "phrase", "well done", "yes"], ["boom", "msg", "goal", "run"],
    ["holler", "line", "lunch time", "no"], ["cheer", "chant", "go team", "win"]]] },
  "fb-L5a": { swaps: [[["menu", "1. Play", "2. Quit"], ["options", "1. Start", "2. Stop"], ["choices", "1. New game", "2. Load game"], ["settings", "1. Sound", "2. Music"],
    ["help", "1. Rules", "2. Controls"], ["shop", "1. Buy", "2. Sell"]]] },
  "fb-L6c": { swaps: [[["Sports Day", "Menu"], ["School Play", "News"], ["Book Week", "Quiz"], ["Science Fair", "Art"], ["Bake Sale", "Clubs"], ["Open Evening", "Maths"]]] },
  "fb-L7a": { swaps: [[["notice", "Fire drill at 2pm"], ["warning", "Wet paint"], ["update", "Lunch is late today"], ["poster", "Disco on Friday"], ["sign", "Quiet please"], ["memo", "Staff meeting at 4"]]] },
  "fb-L9a": { swaps: [[["Quiz", "Sports day"], ["Menu", "Science fair"], ["Clubs", "School trip"], ["News", "Book week"], ["Games", "Parents evening"], ["Music", "Art exhibition"]]] },

  // Functions, return values.
  // Hints that quote a worked-out number: the variants' hints say it without the number.
  "fr-L1d": { hints: ["Each call returns a number.", "Work out what each call to triple() returns, then add them."] },
  "fr-L2b": { hints: ["print() inside the function shows the square, but doesn't return it.", "With no return line, the call gives back None, which is stored in result."] },
  "file-L2d": { hints: ["write() needs text, so str() casting turns the number into a string.", "read() gives back text too, so + joins the two strings."] },
  "fr-L6b": { swaps: [[["hello", "go team"], ["well done", "nice"], ["lunch", "see you"], ["hey", "goal"], ["thanks", "on my way"], ["yes", "no way"]]] },
  "fr-L9b": { noNumbers: true, testSets: [
    [["9", "4", "2"], ["3", "8", "5"], ["1", "2", "7"], ["6", "6", "6"]], [["12", "5", "7"], ["2", "10", "4"], ["3", "1", "9"], ["8", "8", "8"]],
    [["7", "3", "1"], ["4", "11", "6"], ["2", "5", "13"], ["5", "5", "5"]], [["15", "9", "8"], ["6", "14", "3"], ["1", "4", "10"], ["9", "9", "9"]],
    [["20", "1", "6"], ["7", "18", "2"], ["3", "8", "16"], ["4", "4", "4"]], [["11", "2", "3"], ["5", "12", "9"], ["6", "1", "14"], ["7", "7", "7"]]] },

  // File handling: the file name and what is written change together.
  "file-L1d": { swaps: [[["log.txt", "one", "two"], ["notes.txt", "red", "blue"], ["data.txt", "up", "down"], ["list.txt", "cat", "dog"], ["words.txt", "sun", "moon"], ["tags.txt", "tea", "cake"]]] },
  "file-L2a": { noNumbers: true, swaps: [[["score.txt", "10", "20"], ["level.txt", "3", "7"], ["best.txt", "42", "55"], ["lives.txt", "5", "2"], ["coins.txt", "100", "250"], ["rank.txt", "8", "1"]]] },
  "file-L2b": { swaps: [[["names.txt", "Mia", "Leo"], ["pets.txt", "cat", "dog"], ["food.txt", "jam", "toast"], ["teams.txt", "Red", "Blue"], ["days.txt", "Mon", "Tue"], ["fruit.txt", "fig", "plum"]]] },
  "file-L2c": { swaps: [[["days.txt", "Mon", "Tue"], ["pets.txt", "cat", "dog"], ["sports.txt", "golf", "polo"], ["meals.txt", "soup", "stew"], ["birds.txt", "owl", "jay"], ["notes.txt", "do", "re"]]] },
  "file-L3a": { swaps: [[["fruit.txt", "apple", "pear", "Fruit: "], ["pets.txt", "rabbit", "hamster", "Pet: "], ["sports.txt", "tennis", "rugby", "Sport: "],
    ["cities.txt", "Leeds", "York", "City: "], ["colours.txt", "purple", "orange", "Colour: "], ["games.txt", "chess", "draughts", "Game: "]]] },
  "file-L3b": { noNumbers: true, swaps: [[["msg.txt", "See you at 4", "Bring a coat"], ["note.txt", "Back at 2", "PE today"], ["memo.txt", "Lunch at 12", "Wear boots"],
    ["todo.txt", "Call home", "Feed the cat"], ["plan.txt", "Meet at the gate", "Pack a snack"], ["list.txt", "Buy milk", "Return the book"]]] },
  "file-L4a": { noNumbers: true, swaps: [[["club.txt", "chess", "choir", "Club: "], ["team.txt", "netball", "hockey", "Team: "], ["band.txt", "drums", "violin", "Instrument: "],
    ["house.txt", "Red", "Blue", "House: "], ["form.txt", "7B", "8R", "Form: "], ["room.txt", "Lab 3", "Hall", "Room: "]]] },
  "file-L4b": { swaps: [[["list.txt", "milk", "eggs", "pens", "glue"], ["shop.txt", "bread", "jam", "rulers", "tape"], ["bag.txt", "apples", "pears", "paint", "card"],
    ["kit.txt", "boots", "socks", "pencils", "ink"], ["picnic.txt", "juice", "rolls", "chalk", "pins"], ["trip.txt", "coat", "hat", "maps", "string"]]] },
  "file-L6b": { swaps: [[["pair.txt", "salt", "pepper", "up", "down"], ["pairs.txt", "fish", "chips", "left", "right"], ["two.txt", "cats", "dogs", "in", "out"],
    ["duo.txt", "bread", "butter", "on", "off"], ["words.txt", "tea", "toast", "hot", "cold"], ["swap.txt", "rock", "roll", "yes", "no"]]] },
  "file-L7b": { swaps: [[["words.txt", "sun", "sea", "sand"], ["pets.txt", "cat", "dog", "fish"], ["days.txt", "Mon", "Tue", "Wed"], ["fruit.txt", "fig", "kiwi", "lime"],
    ["names.txt", "Ava", "Ben", "Cal"], ["notes.txt", "do", "re", "mi"]]] },
  "file-L7c": { noNumbers: true, swaps: [[["diary.txt", "Day 1", "Rained", "Sports day"], ["log.txt", "Week 1", "Sunny", "Trip out"], ["journal.txt", "Monday", "Windy", "Exam day"],
    ["notes.txt", "Lesson 1", "Fractions", "Graphs"], ["blog.txt", "Post 1", "Hello", "Holiday"], ["story.txt", "Part 1", "Once upon", "The end"]]] },
  "file-L8b": { swaps: [[["shop.txt", "pens", "milk", "eggs"], ["list.txt", "glue", "bread", "jam"], ["bag.txt", "ruler", "apples", "tea"], ["kit.txt", "boots", "socks", "shorts"],
    ["box.txt", "card", "paint", "tape"], ["cart.txt", "pasta", "rice", "beans"]]] },
  "file-L10a": { swaps: [[["shopping.txt", "milk", "eggs", "tea", "jam", "bread"], ["list.txt", "rice", "beans", "pens", "glue", "card"], ["pack.txt", "coat", "hat", "map", "torch", "rope"],
    ["picnic.txt", "rolls", "juice", "cake", "plums", "crisps"], ["books.txt", "Holes", "Wonder", "Dune", "Emma", "Coraline"], ["kit.txt", "boots", "socks", "bat", "ball", "pads"]]] },
  "file-L10c": { swaps: [[["log.txt", "Revision", "Mock exam"], ["notes.txt", "Homework", "Spelling test"], ["diary.txt", "Football", "Swimming"], ["plan.txt", "Reading", "Science quiz"],
    ["record.txt", "Piano", "Drama club"], ["tracker.txt", "Running", "Chess"]]] },

  // 2D arrays: whole grids (never square where a row/column mix-up must show), letter sets, or sets of positions.
  "grid-L1c": { swaps: [[["[[0, 0, 0], [0, 0, 0]]"], ["[[0, 0], [0, 0], [0, 0]]"], ["[[0, 0, 0, 0], [0, 0, 0, 0]]"], ["[[0], [0], [0]]"], ["[[0, 0, 0, 0, 0]]"],
    ["[[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]"]]] },
  "grid-L2a": { swaps: [[["A", "B", "C", "D", "E", "F", "G", "H", "I"], ["J", "K", "L", "M", "N", "O", "P", "Q", "R"], ["R", "S", "T", "U", "V", "W", "X", "Y", "Z"],
    ["a", "b", "c", "d", "e", "f", "g", "h", "i"], ["j", "k", "l", "m", "n", "o", "p", "q", "r"], ["q", "r", "s", "t", "u", "v", "w", "x", "y"]]] },
  "grid-L3b": { swaps: [[['[["A", "B"], ["C", "D"], ["E", "F"]]'], ['[["A", "B", "C"], ["D", "E", "F"]]'], ['[["A"], ["B"], ["C"], ["D"]]'], ['[["A", "B"], ["C", "D"]]'],
    ['[["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"]]'], ['[["A", "B"], ["C", "D"], ["E", "F"], ["G", "H"], ["I", "J"]]']]] },
  "grid-L4a": { noNumbers: true, testSets: [
    [["0", "2"], ["1", "0"], ["1", "1"]], [["0", "0"], ["1", "2"], ["0", "1"]], [["1", "2"], ["0", "1"], ["1", "0"]],
    [["0", "1"], ["1", "1"], ["0", "2"]], [["1", "1"], ["0", "0"], ["1", "2"]], [["1", "0"], ["0", "2"], ["0", "0"]]] },
  "grid-L4c": { swaps: [[["#", "-"], ["X", "O"], ["*", "~"], ["@", "+"], ["1", "0"], ["A", "B"]]] },
  "grid-L6b": { swaps: [[['[["a", "b", "c"], ["d", "e", "f"]]'], ['[["p", "q", "r"], ["s", "t", "u"]]'], ['[["g", "h"], ["i", "j"], ["k", "l"]]'],
    ['[["a", "b", "c", "d"], ["e", "f", "g", "h"]]'], ['[["m", "n", "o", "p"], ["q", "r", "s", "t"], ["u", "v", "w", "x"]]'], ['[["x", "y", "z"]]']]] },
  "grid-L7b": { swaps: [[["x", "o"], ["A", "B"], ["1", "2"], ["red", "blue"], ["cat", "dog"], ["yes", "no"]]] },
  "grid-L9a": { noNumbers: true, testSets: [
    [["1", "2"], ["0", "0"], ["2", "1"]], [["0", "1"], ["2", "2"], ["1", "0"]], [["2", "0"], ["1", "1"], ["0", "2"]],
    [["1", "0"], ["0", "2"], ["2", "2"]], [["0", "0"], ["2", "1"], ["1", "2"]], [["2", "2"], ["1", "0"], ["0", "1"]]] },
  "grid-L10a": { swaps: [[["X", "O"], ["A", "B"], ["Y", "N"], ["P", "Q"], ["S", "T"], ["H", "K"]]] },

  // Lists: the items change together.
  "list-L2a": { swaps: [[["Mon", "Tue", "Wed", "Thu"], ["Jan", "Feb", "Mar", "Apr"], ["Spring", "Summer", "Autumn", "Winter"],
    ["North", "East", "South", "West"], ["Ant", "Bee", "Cat", "Dog"], ["One", "Two", "Three", "Four"]]] },
  "list-L3a": { noNumbers: true, swaps: [[["crisps", "apple", "biscuit"], ["cake", "grapes", "flapjack"], ["popcorn", "banana", "cracker"],
    ["yoghurt", "orange", "muffin"], ["pretzel", "pear", "toast"], ["cereal bar", "carrot", "rice cake"]]] },
  "list-L5a": { swaps: [[["milk", "eggs", "bread", "pens", "glue", "card"], ["rice", "beans", "flour", "paint", "tape", "string"],
    ["tea", "jam", "butter", "paper", "pins", "chalk"], ["cheese", "apples", "pasta", "ruler", "rubber", "stapler"],
    ["soup", "oats", "honey", "folders", "crayons", "scissors"], ["juice", "lemons", "sugar", "notebook", "markers", "clips"]]] },
  "list-L7b": { swaps: [[["apple", "pear", "plum", "kiwi"], ["mango", "lime", "peach", "fig"], ["cherry", "melon", "grape", "date"],
    ["banana", "lemon", "orange", "papaya"], ["apricot", "guava", "lychee", "nectarine"], ["satsuma", "quince", "damson", "pomelo"]]] },

  // Calendar facts (days in each month, the leap-year rule) never change; only the test years do.
  "functions-L10b": { fixed: [4, 6, 9, 11, 28, 29, 30, 31, 400, 1900, 2000] },
  "out-L2b": { swaps: [[["7", "B", "Smith"], ["8", "R", "Jones"], ["9", "K", "Patel"], ["10", "T", "Brown"], ["11", "C", "Khan"], ["8", "M", "Evans"]]] },
  "out-L3b": { swaps: [[["Merit", "Detention"], ["Well done", "Lines"], ["Gold star", "Warning"], ["House point", "Late mark"], ["Praise card", "Phone call home"], ["Sticker", "Report card"]]] },
  "out-L3d": { swaps: [[["Room12", "Room", "12"], ["Lab3", "Lab", "3"], ["Gate5", "Gate", "5"], ["Hall2", "Hall", "2"], ["Studio4", "Studio", "4"], ["BlockC", "Block", "C"]]] },
  "out-L4b": { swaps: [[["2025-09-03", "2025", "09", "03"], ["2026-01-15", "2026", "01", "15"], ["2024-11-28", "2024", "11", "28"], ["2026-04-07", "2026", "04", "07"], ["2025-12-19", "2025", "12", "19"], ["2026-06-30", "2026", "06", "30"]]] },
  "out-L4d": { swaps: [[
    ["Ready, steady, go!", "Ready,", "steady,", "steady", "go!", "Race over"],
    ["On your marks, get set, go!", "On your marks,", "get set,", "get set", "go!", "Race over"],
    ["Three, two, one!", "Three,", "two,", "two", "one!", "Lift off"],
    ["Lights, camera, action!", "Lights,", "camera,", "camera", "action!", "Cut"],
    ["Eyes down, pens ready, begin!", "Eyes down,", "pens ready,", "pens ready", "begin!", "Test over"],
    ["Line up, stand tall, march!", "Line up,", "stand tall,", "stand tall", "march!", "Parade over"]]] },
  "out-L5d": { swaps: [[["Loading...done", "Loading", "done"], ["Saving...saved", "Saving", "saved"], ["Printing...printed", "Printing", "printed"], ["Sending...sent", "Sending", "sent"], ["Checking...checked", "Checking", "checked"], ["Uploading...uploaded", "Uploading", "uploaded"]]] },
  "out-L6b": { swaps: [[["42", "3:20pm", "17", "3:35pm"], ["9", "3:15pm", "23", "3:40pm"], ["61", "3:25pm", "8", "3:50pm"], ["14", "3:10pm", "30", "3:30pm"], ["5", "3:45pm", "77", "4:05pm"], ["50", "3:05pm", "11", "3:55pm"]]] },
  "out-L7c": { swaps: [[["Oakfield School", "High Street", "Leeds"], ["Hillside Academy", "Park Road", "York"], ["Riverside School", "Mill Lane", "Bristol"], ["Greenway High", "Church Street", "Leicester"], ["Northgate College", "Queens Road", "Derby"], ["Meadow School", "Station Road", "Bath"]]] },
  "out-L7d": { swaps: [[["Open the file", "Type your code", "Press Run"], ["Log in", "Open your work", "Save it"], ["Read the task", "Write a plan", "Start coding"], ["Find your seat", "Take out a pen", "Write the date"], ["Open the browser", "Search the topic", "Note two facts"], ["Pick a partner", "Share ideas", "Write a list"]]] },
  "out-L8c": { swaps: [[["Mix the flour and sugar", "Add the eggs", "Bake for 20 minutes"], ["Wash the brushes", "Mix the paint", "Paint the sky"], ["Fill the kettle", "Add a tea bag", "Pour the water"], ["Plant the seeds", "Water the soil", "Wait a week"], ["Warm up", "Run two laps", "Stretch"], ["Read the question", "Plan your answer", "Check your work"]]] },
  "out-L9b": { swaps: [[
    ["Mon", "Tue", "Wed", "Thu", "Fri", "School week", "the school days", "the five days"],
    ["Jan", "Feb", "Mar", "Apr", "May", "Start of the year", "the first five months", "the five months"],
    ["Red", "Orange", "Yellow", "Green", "Blue", "Rainbow", "five rainbow colours", "the five colours"],
    ["Mon", "Wed", "Fri", "Sat", "Sun", "Club days", "the club days", "the five days"],
    ["Sep", "Oct", "Nov", "Dec", "Jan", "Autumn term", "the autumn term months", "the five months"],
    ["Ash", "Beech", "Cedar", "Elm", "Oak", "Form rooms", "the form rooms", "the five rooms"]]] },
  "out-L9c": { swaps: [[["7KM"], ["8RT"], ["9SB"], ["7AB"], ["8JH"], ["9LP"]]] },
  "out-L9d": { swaps: [[["She", "Well done!"], ["He", "Great work!"], ["Miss Patel", "Nice try!"], ["Mr Khan", "Good job!"], ["The coach", "Keep going!"], ["My tutor", "Spot on!"]]] },
  "out-L10b": { swaps: [[
    ["Oakfield Canteen", "Pasta  £2.10", "Juice  £0.80", "Total  £2.90"], ["Hillside Canteen", "Curry  £2.40", "Water  £0.50", "Total  £2.90"],
    ["Riverside Canteen", "Soup  £1.75", "Smoothie  £1.20", "Total  £2.95"], ["Greenway Canteen", "Wrap  £2.25", "Milk  £0.60", "Total  £2.85"],
    ["Northgate Canteen", "Pizza  £2.50", "Squash  £0.40", "Total  £2.90"], ["Meadow Canteen", "Salad  £1.95", "Juice  £0.85", "Total  £2.80"]]] },
  "out-L10c": { swaps: [[["Uploading homework"], ["Saving your work"], ["Downloading files"], ["Sending a message"], ["Loading the game"], ["Printing a poster"]]] },
  "out-L10g": { swaps: [[
    ["Phoenix", "Griffin", "Dragon", "Pegasus", "#########", "#######", "#####", "####", "7, 4, 9 and 5"],
    ["Oak", "Ash", "Elm", "Yew", "########", "#####", "######", "###", "5, 3, 8 and 6"],
    ["Mercury", "Venus", "Mars", "Jupiter", "##########", "####", "######", "#####", "4, 5, 10 and 6"],
    ["Lions", "Tigers", "Bears", "Wolves", "#######", "######", "####", "###", "6, 3, 7 and 4"],
    ["Kestrel", "Falcon", "Eagle", "Hawk", "########", "###", "#####", "#######", "3, 7, 8 and 5"],
    ["Comets", "Rockets", "Stars", "Planets", "######", "####", "#", "##", "4, 2, 6 and 1"]]] },
  "var-L1d": { swaps: [[["Year", "7"], ["Room", "12"], ["Form", "9B"], ["Gate", "3"], ["Block", "C"], ["Lab", "4"]]] },
  "var-L10m": { swaps: [[
    ["cake sale", "flour", "eggs", "sugar", "cups", "plates", "napkins"], ["picnic", "bread", "cheese", "apples", "rugs", "cups", "plates"],
    ["art lesson", "paint", "brushes", "paper", "glue", "scissors", "card"], ["science lab", "goggles", "beakers", "salt", "tongs", "trays", "spoons"],
    ["sports day", "cones", "bibs", "balls", "water", "cups", "towels"], ["book fair", "books", "bags", "posters", "tables", "chairs", "signs"]]] },
  "if-L5a": { swaps: [[["sparx123", "Sparx123"], ["tiger7", "Tiger7"], ["maple22", "Maple22"], ["comet9", "Comet9"], ["river55", "River55"], ["pixel8", "Pixel8"]]] },
  "ifelse-L3b": { swaps: [[["France", "Paris", "paris", "London"], ["Spain", "Madrid", "madrid", "Lisbon"], ["Italy", "Rome", "rome", "Milan"], ["Germany", "Berlin", "berlin", "Munich"], ["Japan", "Tokyo", "tokyo", "Osaka"], ["Egypt", "Cairo", "cairo", "Giza"]]] },
  "ifelse-L4b": { swaps: [[
    ["Rainy day", "Is it raining?", "Take a coat", "take a coat", "No coat needed"], ["Sunny day", "Is it sunny?", "Wear a hat", "wear a hat", "No hat needed"],
    ["Cold day", "Is it cold?", "Take gloves", "take gloves", "No gloves needed"], ["Windy day", "Is it windy?", "Take a jacket", "take a jacket", "No jacket needed"],
    ["Snowy day", "Is it snowing?", "Wear boots", "wear boots", "No boots needed"], ["Hot day", "Is it hot?", "Bring water", "bring water", "No extra water needed"]]] },
  "ifelse-L7b": { swaps: [[["SAVE10", "save10", "10% off"], ["HALF50", "half50", "50% off"], ["TREAT20", "treat20", "20% off"], ["BOOK15", "book15", "15% off"], ["SCHOOL5", "school5", "5% off"], ["MEGA25", "mega25", "25% off"]]] },
  "compare-L1b": { swaps: [[["100", "Free delivery", "Delivery costs £3.99"], ["50", "Free entry", "Entry costs £2.50"], ["80", "Free gift wrap", "Gift wrap costs £1.99"], ["30", "Free badge", "A badge costs £0.99"], ["60", "Free bookmark", "A bookmark costs £1.50"], ["40", "Free sticker", "A sticker costs £0.75"]]] },
  "logic-L4b": { swaps: [[
    ["Homework check", "Homework done?", "the homework is NOT done", "Detention", "Well done"], ["Kit check", "Kit packed?", "the kit is NOT packed", "Borrow kit", "Ready for PE"],
    ["Library check", "Book returned?", "the book is NOT returned", "Late fine", "Thank you"], ["Planner check", "Planner signed?", "the planner is NOT signed", "See your tutor", "All good"],
    ["Reading check", "Reading log filled in?", "the reading log is NOT filled in", "Lunch catch-up", "Great reading"], ["Uniform check", "Uniform correct?", "the uniform is NOT correct", "Uniform note", "Looking smart"]]] },
  "logic-L7b": { swaps: [[["Continue?", "Continuing", "Stopping"], ["Play again?", "Starting a new game", "Thanks for playing"], ["Save changes?", "Saving", "Not saved"], ["Print it?", "Printing", "Not printed"], ["Send message?", "Sending", "Message deleted"], ["Next question?", "Here it comes", "Quiz finished"]]] },
  // Any three names work: the rules are stated in the description, which changes with them.
  "logic-L10b": { swaps: [[["Rock", "rock", "paper", "scissors"], ["Fire", "fire", "water", "grass"], ["Bear", "bear", "hunter", "ninja"], ["Tiger", "tiger", "wizard", "dragon"], ["Stone", "stone", "cloth", "blade"], ["Comet", "comet", "star", "moon"]]] },
  "validation-L2b": { swaps: [[["1", "Option one"], ["2", "Option two"], ["3", "Option three"], ["4", "Option four"], ["5", "Option five"], ["6", "Option six"]]] },
  "validation-L6b": { swaps: [[["bob", "example.com"], ["ana", "school.org"], ["sam", "mail.co.uk"], ["raj", "club.net"], ["eve", "post.com"], ["kim", "class.org"]]] },
  "validation-L9a": { swaps: [[["Save your game?", "Saving...", "Not saved"], ["Delete this file?", "Deleting...", "Not deleted"], ["Join the club?", "Joining...", "Not joined"], ["Print the page?", "Printing...", "Not printed"], ["Send the email?", "Sending...", "Not sent"], ["Start the quiz?", "Starting...", "Not started"]]] },
  "validation-L10a": { noNumbers: true, testSets: [
    [["31", "1"], ["29", "2"], ["28", "2"], ["30", "4"], ["31", "4"], ["1", "13"], ["0", "5"]],
    [["31", "3"], ["30", "2"], ["27", "2"], ["30", "6"], ["31", "6"], ["5", "14"], ["0", "7"]],
    [["31", "12"], ["29", "2"], ["1", "2"], ["30", "9"], ["31", "9"], ["10", "0"], ["0", "1"]],
    [["31", "8"], ["31", "2"], ["28", "2"], ["30", "11"], ["31", "11"], ["3", "15"], ["0", "10"]],
    [["31", "5"], ["29", "2"], ["15", "2"], ["1", "4"], ["32", "4"], ["12", "13"], ["0", "12"]],
    [["31", "7"], ["30", "2"], ["28", "2"], ["30", "6"], ["31", "9"], ["20", "20"], ["0", "3"]]] },
  "functions-L2b": { swaps: [[["sign", "positive", "negative"], ["describe", "above zero", "below zero"], ["check", "more", "less"], ["kind", "gain", "loss"], ["label", "plus", "minus"], ["sort_number", "up", "down"]]] },
  "while-L4c": { swaps: [[["bluebell", "Bluebell", "rose", "daisy"], ["sunflower", "Sunflower", "tulip", "lily"], ["oak", "Oak", "ash", "elm"], ["comet", "Comet", "moon", "star"], ["tiger", "Tiger", "lion", "puma"], ["violet", "Violet", "iris", "poppy"]]] },
  "while-L5d": { swaps: [[["Register menu", "Add a pupil", "Show the register"], ["Library menu", "Add a book", "Show the library list"], ["Score menu", "Add a score", "Show the scores"], ["Club menu", "Add a club member", "Show the club list"], ["Team menu", "Add a team", "Show the fixtures"], ["Trip menu", "Add a trip", "Show the trips"]]] },
  "while-L8d": { swaps: [[["Playing...", "High score: 120"], ["Starting...", "High score: 95"], ["Game on...", "High score: 340"], ["Loading level...", "High score: 77"], ["Ready...", "High score: 205"], ["Here we go...", "High score: 64"]]] },
  "for-L5c": { swaps: [[["Count the e's", "e", "Greenwich", "map", "excellent"], ["Count the a's", "a", "Banana", "pen", "alphabet"], ["Count the o's", "o", "Toronto", "fig", "football"], ["Count the i's", "i", "Mississippi", "cat", "bikini"], ["Count the s's", "s", "Stresses", "dog", "sunglasses"], ["Count the t's", "t", "Tattoo", "bus", "tomato"]]] },
  "for-L7c": { swaps: [[["Count the a's", "a", "Hannah", "Bob", "Aaliyah"], ["Count the e's", "e", "Eleanor", "Tom", "Genevieve"], ["Count the o's", "o", "Oliver", "Jim", "Theodore"], ["Count the i's", "i", "Isabelle", "Max", "Imani"], ["Count the n's", "n", "Nathan", "Lily", "Anna"], ["Count the r's", "r", "Rory", "Sam", "Arthur"]]] },
  // Hints that work through the sums, rewritten to use the variant's own values.
  "maths-L1d": { hints: ["% gives the REMAINDER after dividing.", "{{v(5)}} goes into {{v(17)}} {{idiv(v(17), v(5))}} times ({{idiv(v(17), v(5)) * v(5)}}). What is left?"] },
  "maths-L2c": { hints: ["Brackets are worked out first.", "(2 + {{v(3)}}) is {{2 + v(3)}}. Then {{2 + v(3)}} × {{v(4)}}."] },
  "maths-L3a": { hints: ["You want a whole number of groups, not a decimal like {{fl(v(30) / v(4))}}.", "Which operator gives the whole-number part of a division?"] },
  "maths-L3c": { hints: ["Squared means \"to the power of 2\".", "side * 2 would give {{v(6) * 2}}, which is not the area."] },
  "maths-L3d": { hints: ["{{v(47)}} / {{v(6)}} is about {{pyround(v(47) / v(6), 4)}}.", "Which function rounds a number to a number of decimal places?"] },
  "maths-L5b": { hints: ["You can't have {{fl(v(23) / v(5))}} teams.", "// gives whole teams, % gives the players left over."] },
  "maths-L10c": { fixed: [3, 50, 150] },
  // The last even number and the stop one after it change together.
  "for-L3c": { noNumbers: true, swaps: [[["20", "21"], ["12", "13"], ["16", "17"], ["30", "31"], ["24", "25"], ["18", "19"]]] },
  // n and the power 3 ("cubed") have the same value: only n changes.
  "maths-L4d": { noNumbers: true, swaps: [[["n = 3", "3 squared", "3 cubed"], ["n = 4", "4 squared", "4 cubed"], ["n = 5", "5 squared", "5 cubed"], ["n = 6", "6 squared", "6 cubed"], ["n = 7", "7 squared", "7 cubed"], ["n = 10", "10 squared", "10 cubed"]]] },
  // Events that come round every few years: the cycle, the remainder and the test years change together.
  "arith-L7b": { noNumbers: true, swaps: [[
    ["men's football World Cup", "2018, 2022, 2026", "World Cup year", "No World Cup", "4", "2", "2022", "2026", "2024", "2023"],
    ["summer Olympics", "2016, 2020, 2024", "Olympics year", "No Olympics", "4", "0", "2024", "2028", "2026", "2027"],
    ["Rugby World Cup", "2015, 2019, 2023", "Rugby year", "No Rugby World Cup", "4", "3", "2019", "2023", "2021", "2020"],
    ["school's big musical", "2020, 2023, 2026", "Musical year", "No musical", "3", "1", "2023", "2026", "2024", "2025"],
    ["village festival", "2016, 2021, 2026", "Festival year", "No festival", "5", "1", "2021", "2026", "2024", "2023"],
    ["school ski trip", "2021, 2023, 2025", "Ski trip year", "No ski trip", "2", "1", "2023", "2025", "2024", "2022"]]] },
  "elif-L3a": { hints: ["If you use a second if, a mark of {{v(70) + 5}} prints two grades.", "You need the keyword that means 'else if'.", "Use elif"] },
  "logic-L2a": { hints: ["Work out score + bonus first.", "{{v(45)}} >= {{v(50)}} is {{v(45) >= v(50) ? 'True' : 'False'}}, and {{v(45) + v(10)}} >= {{v(50)}} is {{v(45) + v(10) >= v(50) ? 'True' : 'False'}}. What does or need?"] },
  "input-L1a": { hints: ["int(\"7\") gives the number 7, not text.", "7 + {{v(3)}} = ?"] },
  "input-L2a": { noNumbers: true, swaps: [[["3", "4", "34"], ["5", "2", "52"], ["1", "8", "18"], ["6", "3", "63"], ["2", "9", "29"], ["7", "5", "75"]]] },
  "arith-L1a": { hints: ["{{v(6)}} divided by 2 is {{idiv(v(6), 2)}} remainder {{mod(v(6), 2)}}.", "So n % 2 is {{mod(v(6), 2)}}."] },
  "arith-L1b": { hints: ["{{v(135)}} // 60 gives the whole number of hours.", "60 goes into {{v(135)}} {{idiv(v(135), 60)}} times."] },
  "arith-L2a": { hints: ["// is integer division: how many whole times does {{v(5)}} go into {{v(17)}}?", "% gives the remainder: {{v(17)}} - {{idiv(v(17), v(5)) * v(5)}} = ?"] },
  "arith-L2b": { fixed: [3], hints: ["3 goes into {{v(10)}} {{idiv(v(10), 3)}} times ({{idiv(v(10), 3) * 3}}).", "{{v(10)}} - {{idiv(v(10), 3) * 3}} = ?"] },
  "while-L1a": { hints: ["The loop runs for n = {{Array.from({ length: v(5) }, (_, i) => i + 1).join(\", \")}}.", "Which of those have a remainder of 0 when divided by 2?"] },
  "while-L2a": { fixed: [4], hints: ["Write down x each time round: {{v(10)}}, {{v(10) - v(3)}}, ...", "The loop stops when x is no longer greater than 0."] },
  "for-L1d": { hints: ["n is {{Array.from({ length: v(4) - 1 }, (_, i) => i + 1).join(\", then \")}}.", "Each time, n * {{v(5)}} is printed."] },
  "for-L6b": { hints: ["Every row has the same number of columns.", "range(1, {{v(4)}}) gives {{Array.from({ length: v(4) - 1 }, (_, i) => i + 1).join(\", \")}}."] },
  "sel-L10e": { fixed: [10] },
  "for-L2c": { noNumbers: true, swaps: [[["10", "-2", "twos"], ["12", "-3", "threes"], ["16", "-4", "fours"], ["15", "-5", "fives"], ["20", "-4", "fours"], ["18", "-3", "threes"], ["14", "-2", "twos"]]] },
  "for-L8b": { noNumbers: true, testSets: [
    [["4", "y", "n", "y", "y"], ["2", "n", "n"], ["1", "y"]],
    [["3", "n", "y", "y"], ["5", "y", "y", "y", "n", "y"], ["2", "y", "n"]],
    [["4", "n", "n", "n", "y"], ["1", "n"], ["3", "y", "y", "y"]],
    [["5", "y", "n", "n", "y", "n"], ["2", "y", "y"], ["1", "n"]],
    [["3", "y", "n", "n"], ["4", "y", "y", "n", "y"], ["2", "n", "y"]],
    [["6", "y", "y", "y", "y", "n", "y"], ["1", "y"], ["2", "n", "n"]]] },

  // Validation: answers that are text, so linked swaps (or whole sets of test inputs) give the variants.
  "val-L1f": { swaps: [[["sam.school.uk"], ["ben.home.net"], ["zoe.mail.com"], ["ali.club.org"], ["mia.web.uk"], ["kai.class.net"]]] },
  "val-L1t": { noNumbers: true, swaps: [[["7a"], ["9b"], ["5x"], ["8c"], ["6k"], ["4z"]]] },
  "val-L2i": { swaps: [[["Name"], ["Town"], ["Team"], ["Club"], ["Pet"], ["Form"]]] },
  "val-L2f": { swaps: [[['["S", "M", "L"]', "Size M accepted", "M", "S, M or L"], ['["XS", "S", "M"]', "Size S accepted", "S", "XS, S or M"],
    ['["M", "L", "XL"]', "Size L accepted", "L", "M, L or XL"], ['["S", "M", "L"]', "Size L accepted", "L", "S, M or L"],
    ['["S", "M", "L"]', "Size S accepted", "S", "S, M or L"], ['["L", "XL", "XXL"]', "Size XL accepted", "XL", "L, XL or XXL"]]] },
  "val-L3f": { swaps: [[["yes", "no", "maybe", "Continue?"], ["start", "stop", "wait", "Ready?"], ["up", "down", "left", "Which way?"],
    ["red", "blue", "pink", "Team colour?"], ["tea", "coffee", "juice", "Drink?"], ["left", "right", "back", "Turn?"]]] },
  "val-L4f": { swaps: [[["mia@school.uk", "mia.school.uk"], ["leo@club.org", "leo.club.org"], ["ava@home.net", "ava.home.net"],
    ["sam@mail.com", "sam.mail.com"], ["dev@web.uk", "dev.web.uk"], ["kai@class.net", "kai.class.net"]]] },
  "val-L5i": { swaps: [[["Leeds"], ["York"], ["Bath"], ["Derby"], ["Hull"], ["Truro"]]] },
  "val-L7f": { noNumbers: true, testSets: [[["Wed"], ["Sat"]], [["Mon"], ["Sun"]], [["Fri"], ["Sat"]], [["Tue"], ["Sun"]], [["Thu"], ["mon"]], [["Mon"], ["Friday"]]] },
  "val-L8i": { swaps: [[["Lions"], ["Tigers"], ["Owls"], ["Hawks"], ["Foxes"], ["Bears"]]] },
  "val-L8f": { swaps: [[["ali@mail.com", "ali @mail.com"], ["zoe@club.org", "zoe @club.org"], ["sam@home.net", "sam@home .net"],
    ["mia@school.uk", "mia @school.uk"], ["leo@post.com", "leo@post. com"], ["kai@web.uk", "kai @web.uk"]]] },
  "val-L8t": { noNumbers: true, testSets: [[["-2"], ["G"]], [["-1"], ["B"]], [["-3"], ["L"]], [["-5"], ["two"]], [["-4"], ["2.5"]], [["-7"], ["-"]]] },
  "val-L9l": { noNumbers: true, swaps: [[["sunshine", "cat"], ["moonbeam", "dog"], ["raincoat", "owl"], ["notebook", "pen"], ["seashell", "sea"], ["lemonade", "fig"]]] },
  "val-L10f": { noNumbers: true, testSets: [[["05/11"], ["5/11", "05/11"]], [["12/03"], ["12-03", "12/03"]], [["31/12"], ["3112", "31/12"]],
    [["01/09"], ["1/9", "01/09"]], [["20/06"], ["20/6", "20/06"]], [["14/02"], ["ab/cd", "14/02"]]] },

  // Authentication: the stored usernames and passwords (and the wrong ones typed) are swapped together.
  "auth-L1a": { swaps: [[["ava7"], ["rio_2"], ["sam.j"], ["zack9"], ["nia_b"], ["theo3"]]] },
  "auth-L1c": { swaps: [[["zara.b", "zara"], ["omar.k", "omar"], ["lily.p", "lily"], ["finn.r", "finn"], ["isla.m", "isla"], ["josh.t", "josh"]]] },
  "auth-L2a": { swaps: [[["Tiger42", "tiger42"], ["Panda7", "panda7"], ["Comet3", "comet3"], ["Maple22", "maple22"], ["River55", "river55"], ["Pixel8", "pixel8"]]] },
  "auth-L2b": { swaps: [[["Moon5"], ["Star8"], ["Sun1"], ["Kite4"], ["Rain22"], ["Owl77"]]] },
  "auth-L3a": { swaps: [[["ava7", "ben_k", "zara.b", "sam"], ["rio", "nia_b", "josh.t", "max"], ["leo_m", "kai_t", "mia", "zed"],
    ["dev01", "dev02", "dev03", "dev04"], ["amir", "grace_l", "tom.h", "ella"], ["finn9", "isla_r", "omar.k", "ruby"]]] },
  "auth-L3c": { swaps: [[["dev01", "dev02", "dev03", "dev04"], ["lab1", "lab2", "lab3", "lab4"], ["pc_a", "pc_b", "pc_c", "pc_d"],
    ["art1", "art2", "art3", "art4"], ["mus01", "mus02", "mus03", "mus04"], ["sci_1", "sci_2", "sci_3", "sci_4"]]] },
  "auth-L4a": { swaps: [[["ava7", "Tiger42", "tiger"], ["rio", "Rain22", "rain"], ["nia_b", "Kite4", "kite"], ["zack9", "Snow5", "snow"],
    ["omar.k", "Owl77", "owl"], ["lily.p", "Fox_12", "fox"]]] },
  "auth-L4b": { swaps: [[["leo", "Moon5", "kai"], ["sam", "Sun1", "tom"], ["ella", "Star8", "ruby"], ["finn", "Comet3", "josh"], ["nia", "Kite4", "zed"], ["amir", "Rain22", "omar"]]] },
  "auth-L4c": { swaps: [[["mia", "Star8", "Star9"], ["theo", "Moon5", "Moon6"], ["grace", "Owl77", "Owl78"], ["dev", "Kite4", "Kite5"], ["isla", "Sun1", "Sun2"], ["max", "Rain22", "Rain23"]]] },
  "auth-L5c": { swaps: [[["mr_khan", "Owl77", "guest"], ["ms_lee", "Fox_12", "visitor"], ["mr_ali", "Bat_9", "student"], ["mrs_ray", "Kite4", "parent"],
    ["dr_hart", "Moon5", "helper"], ["ms_cole", "Star8", "pupil"]]] },
  "auth-L6a": { swaps: [[["Owl77", "owl", "Owl7"], ["Fox_12", "fox", "Fox12"], ["Kite4", "kite", "Kit4"], ["Moon5", "moon", "Mon5"], ["Rain22", "rain", "Rain2"], ["Star8", "star", "Sta8"]]] },
  "auth-L6b": { noNumbers: true, swaps: [[["4096", "1234"], ["7351", "0000"], ["2580", "1111"], ["8642", "4321"], ["1357", "9999"], ["6060", "6006"]]] },
  "auth-L6c": { swaps: [[["Fox_12", "fox_12", "Fox12"], ["Bat_9", "bat_9", "Bat9"], ["Elk_33", "elk_33", "Elk33"], ["Yak_5", "yak_5", "Yak5"], ["Emu_21", "emu_21", "Emu21"], ["Cat_8", "cat_8", "Cat8"]]] },
  "auth-L7a": { swaps: [[["ava7", "Tiger42", "Tiger24"], ["rio", "Rain22", "Rain33"], ["nia_b", "Kite4", "Kite5"], ["zack9", "Snow5", "Snow6"], ["omar.k", "Owl77", "Owl78"], ["lily.p", "Fox_12", "Fox_21"]]] },
  "auth-L7b": { swaps: [[["ben_k", "Ben_K", "Moon5", "moon5"], ["sam_j", "Sam_J", "Star8", "star8"], ["ella_r", "Ella_R", "Sun1", "sun1"],
    ["finn_t", "Finn_T", "Comet3", "comet3"], ["nia_b", "Nia_B", "Kite4", "kite4"], ["amir_h", "Amir_H", "Rain22", "rain22"]]] },
  "auth-L7c": { swaps: [[["zara.b", "zara", "Star8"], ["omar.k", "omar", "Owl77"], ["lily.p", "lily", "Moon5"], ["finn.r", "finn", "Kite4"], ["isla.m", "isla", "Sun1"], ["josh.t", "josh", "Rain22"]]] },
  "auth-L8a": { swaps: [[["Lion55", "lion55"], ["Bear12", "bear12"], ["Wolf9", "wolf9"], ["Hawk31", "hawk31"], ["Lynx7", "lynx7"], ["Puma24", "puma24"]]] },
  "auth-L9a": { swaps: [[["kai_t", "Rocket9"], ["rio", "Rain22"], ["nia_b", "Kite4"], ["zack9", "Snow5"], ["omar.k", "Owl77"], ["lily.p", "Fox_12"]]] },
  "auth-L9b": { swaps: [[["leo", "Comet3"], ["sam", "Sun1"], ["ella", "Star8"], ["finn", "Moon5"], ["nia", "Kite4"], ["amir", "Rain22"]]] },
  "auth-L9c": { swaps: [[["mia", "Star8"], ["theo", "Moon5"], ["grace", "Owl77"], ["dev", "Kite4"], ["isla", "Sun1"], ["max", "Rain22"]]] },

  // Trace tables: text values, or numbers whose change would change the size of the table.
  "trace-L2c": { noNumbers: true, swaps: [[["3", "4"], ["5", "2"], ["7", "1"], ["2", "9"], ["8", "6"], ["1", "5"]]] },
  "trace-L4b": { noNumbers: true, swaps: [[["x = 2"], ["x = 3"], ["x = 4"], ["x = 5"], ["x = 6"], ["x = 7"]]] },
  "trace-L4c": { swaps: [[["Ada", "Lovelace"], ["Alan", "Turing"], ["Grace", "Hopper"], ["Mary", "Seacole"], ["Isaac", "Newton"], ["Rosa", "Parks"]]] },
  // Four times round the loop in every variant, so the table keeps its 10 rows.
  "trace-L9a": { noNumbers: true, swaps: [[["range(1, 5)", "range(1, 6)", "1, 2, 3 and 4", "before 5"], ["range(2, 6)", "range(2, 7)", "2, 3, 4 and 5", "before 6"],
    ["range(3, 7)", "range(3, 8)", "3, 4, 5 and 6", "before 7"], ["range(5, 9)", "range(5, 10)", "5, 6, 7 and 8", "before 9"],
    ["range(10, 14)", "range(10, 15)", "10, 11, 12 and 13", "before 14"], ["range(4, 8)", "range(4, 9)", "4, 5, 6 and 7", "before 8"]]] },
  "trace-L10b": { noNumbers: true, swaps: [[["level"], ["kayak"], ["radar"], ["refer"], ["civic"], ["rotor"]]] },
  // Hints that work out a value: the variants' hints use the variant's own numbers, or say it without one.
  "trace-L2b": { hints: ["// divides and keeps only the whole number part.", "{{v(7)}} // 2 is {{idiv(v(7), 2)}}, not {{fl(v(7) / 2)}}."] },
  "trace-L6b": { hints: ["// gives how many whole times 60 goes into the minutes.", "% gives what is left over after taking the whole hours away."] },
  "trace-L7c": { hints: ["x % 2 is 0 only when x is even.", "Multiplication comes before adding: x * {{v(3)}} is worked out first."] },
  "trace-L10a": { hints: ["Each time round the loop: s changes, total changes, and high changes only if s is bigger.", "len(scores) is the number of scores, and / gives a real number."] },
  "bin-L2b": { fixed: [4, 7] },
  "bub-L2e": { hints: ["Each pass compares one pair fewer than the pass before.", "Add up the pairs compared in every pass."] },
  "ins-L3e": { hints: ["Each item is shifted once for every bigger item before it.", "Count the shifts for each item you insert, then add them up."] },
  "mer-L1a": { hints: ["half is len(items) // 2.", "items[:half] is the first half; items[half:] is the rest."] },
  "mer-L1e": { hints: ["Each time round, size is halved with //.", "Count how many times it is halved before it reaches 1."] },
  "mer-L3f": { hints: ["Each step moves i or j along by 1.", "The loop stops when i reaches len(left)."] },
  "mer-L6e": { hints: ["k goes up in 2s: it is the start of each pair.", "Each pair adds two items to the end of result."] },

  // Searching and sorting: names and words (sorted where a binary search needs it), and whole lists.
  "lin-L2c": { swaps: [[["Mo", "Jo", "Al", "Bo", "Cy"], ["Kit", "Pip", "Rex", "Dot", "Gus"], ["Ana", "Eli", "Ivo", "Oz", "Uma"], ["Ned", "Ola", "Raj", "Sue", "Tam"],
    ["Bea", "Cal", "Dax", "Fen", "Hal"], ["Wyn", "Xia", "Yan", "Zed", "Abe"]]] },
  "lin-L3c": { swaps: [[["A12", "B07", "C33", "D41", "E09", "Z99"], ["K10", "L22", "M35", "N47", "P50", "Q01"], ["R13", "S28", "T31", "U44", "V56", "W99"],
    ["F05", "G16", "H27", "J38", "K49", "X00"], ["P11", "Q21", "R31", "S41", "T51", "Y77"], ["B01", "C02", "D03", "E04", "F05", "G99"]]] },
  "lin-L4f": { swaps: [[["sun", "moon", "star", "sky"], ["cat", "dog", "owl", "bee"], ["red", "blue", "pink", "grey"], ["oak", "elm", "ash", "yew"],
    ["pen", "ink", "pad", "tag"], ["tea", "milk", "jam", "pie"]]] },
  "lin-L6d": { swaps: [[["a", "b", "c"], ["x", "y", "z"], ["e", "f", "g"], ["m", "n", "p"], ["s", "t", "u"], ["o", "r", "k"]]] },
  "bin-L1b": { noNumbers: true, swaps: [[["[4, 7, 10, 13, 16, 19, 22]", "16", "13"], ["[2, 5, 8, 11, 14, 17, 20]", "17", "11"], ["[3, 9, 12, 18, 25, 31, 40]", "31", "18"],
    ["[5, 6, 9, 15, 21, 24, 28]", "21", "15"], ["[1, 8, 14, 19, 23, 30, 36]", "30", "19"], ["[6, 11, 13, 20, 27, 29, 33]", "29", "20"]]] },
  "bin-L6a": { noNumbers: true, swaps: [[["[120, 128, 133, 141, 150, 156, 162]", "150", "135"], ["[101, 109, 117, 125, 133, 141, 149]", "133", "120"],
    ["[95, 104, 111, 119, 126, 138, 147]", "126", "100"], ["[130, 134, 139, 145, 152, 158, 165]", "152", "141"],
    ["[112, 118, 125, 131, 140, 146, 153]", "140", "127"], ["[124, 129, 137, 142, 148, 155, 161]", "148", "150"]]] },
  "bin-L6b": { swaps: [[["Ann", "Bob", "Dee", "Gus", "Kim", "Liv", "Pat", "Zac", "Ray"], ["Abe", "Cat", "Eve", "Hal", "Ida", "Max", "Nat", "Sam", "Bea"],
    ["Ali", "Ben", "Cy", "Dan", "Fay", "Jon", "Mia", "Ted", "Kai"], ["Amy", "Dot", "Fin", "Ian", "Joe", "Lea", "Rob", "Uma", "Gil"],
    ["Bo", "Cal", "Ed", "Flo", "Hen", "Ivy", "Lou", "Viv", "Kit"], ["Ada", "Bev", "Col", "Dev", "Ewa", "Gil", "Ola", "Pip", "Nia"]]] },
  "bin-L6e": { swaps: [[["Ann", "Bea", "Cal", "Dot", "Eli", "Fay", "Gus"], ["Abe", "Ben", "Cy", "Dan", "Eve", "Flo", "Hal"], ["Ali", "Bo", "Col", "Dee", "Ema", "Fin", "Gia"],
    ["Amy", "Bob", "Cat", "Del", "Eva", "Fox", "Guy"], ["Ada", "Bev", "Cyd", "Don", "Ely", "Fem", "Gem"], ["Ari", "Bel", "Cia", "Dov", "Esa", "Fia", "Gil"]]] },
  // Secrets found in exactly three guesses (too big, then too small), so the table keeps its 14 rows.
  "bin-L8b": { noNumbers: true, swaps: [[["high = 100", "secret = 37", "from 1 to 100"], ["high = 100", "secret = 12", "from 1 to 100"], ["high = 100", "secret = 62", "from 1 to 100"],
    ["high = 100", "secret = 88", "from 1 to 100"], ["high = 60", "secret = 22", "from 1 to 60"], ["high = 80", "secret = 30", "from 1 to 80"],
    ["high = 40", "secret = 15", "from 1 to 40"], ["high = 120", "secret = 45", "from 1 to 120"], ["high = 90", "secret = 33", "from 1 to 90"]]],
    hints: ["The first guess is halfway between low and high: (low + high) // 2.", "If a guess is too big, high moves to just below it; if it is too small, low moves to just above it."] },
  "ins-L1d": { noNumbers: true, swaps: [[["[4, 3, 5, 1, 2]"], ["[6, 2, 8, 3, 1]"], ["[9, 5, 7, 2, 4]"], ["[3, 1, 6, 4, 2]"], ["[8, 4, 9, 6, 5]"], ["[5, 7, 2, 1, 9]"]]] },
  "ins-L4f": { swaps: [[["pear", "fig", "kiwi", "apple", "lime"], ["plum", "date", "lemon", "banana", "mango"], ["rose", "daisy", "tulip", "iris", "lily"],
    ["wolf", "bear", "lynx", "fox", "otter"], ["oak", "elm", "pine", "ash", "yew"], ["tuba", "harp", "flute", "drum", "oboe"]]] },
  "mer-L2a": { noNumbers: true, swaps: [[["[4, 9, 1, 7, 3]"], ["[8, 2, 6, 5, 1]"], ["[3, 7, 9, 2, 4]"], ["[6, 1, 5, 8, 2]"], ["[9, 4, 2, 6, 7]"], ["[5, 3, 8, 1, 6]"]]] },

  // A-level units: tasks with no numbers to change get other words, names or test inputs.
  "rec-L4b": { testSets: [[["banana"], ["sky"]], [["avocado"], ["plum"]], [["pasta"], ["fig"]], [["papaya"], ["lemon"]], [["alpaca"], ["dog"]], [["sardine"], ["kiwi"]], [["salad"], ["toffee"]]] },
  "rec-L5b": { testSets: [[["moon"], [""]], [["star"], [""]], [["planet"], [""]], [["sun"], [""]], [["comet"], [""]], [["galaxy"], [""]], [["orbit"], [""]]] },
  "rec-L6c": { testSets: [[["level"], ["lever"]], [["radar"], ["rider"]], [["kayak"], ["kites"]], [["refer"], ["ruler"]], [["civic"], ["cubic"]], [["noon"], ["moon"]], [["madam"], ["medal"]]] },
  "scope-L1b": { swaps: [[["count"], ["total"], ["score"], ["visits"], ["points"], ["clicks"], ["goals"]]] },
  "scope-L2b": { swaps: [[["sam"], ["ava"], ["leo"], ["mia"], ["kai"], ["zoe"], ["tom"]]] },
  "scope-L3c": { swaps: [[["pen", "ruler", "rubber", "glue"], ["map", "torch", "rope", "tent"], ["cup", "plate", "fork", "bowl"], ["sock", "shoe", "hat", "scarf"],
    ["book", "pencil", "eraser", "tape"], ["key", "phone", "wallet", "comb"]]] },
  "scope-L10a": { testSets: [[["apple", "pear", "apple", "apple"], ["kiwi", "plum", "fig", "milk"]], [["egg", "jam", "egg", "egg"], ["tea", "rice", "oats", "salt"]],
    [["corn", "corn", "bean", "corn"], ["lime", "pea", "nut", "date"]], [["fish", "fish", "fish", "fish"], ["soup", "cake", "pie", "ham"]],
    [["lemon", "lime", "lemon", "lemon"], ["beef", "lamb", "pork", "tuna"]], [["onion", "leek", "leek", "leek"], ["flour", "sugar", "yeast", "salt"]]] },
  "cls-L3b": { testSets: [[["Up", "F7"], ["Cars", "A12"]], [["Jaws", "B3"], ["Coco", "H10"]], [["Soul", "C5"], ["Elf", "D8"]], [["Frozen", "E2"], ["Moana", "G6"]],
    [["Shrek", "J1"], ["Bolt", "K4"]], [["Brave", "L9"], ["Luca", "M2"]]] },
  "cls-L4c": { swaps: [[["lamp1", "lamp2", "Lamp"], ["fan1", "fan2", "Fan"], ["light1", "light2", "Light"], ["heater1", "heater2", "Heater"], ["radio1", "radio2", "Radio"], ["torch1", "torch2", "Torch"]]] },
  "cls-L5b": { testSets: [[["R2"], ["K9"]], [["C3"], ["B8"]], [["X5"], ["Z1"]], [["D7"], ["M4"]], [["Q6"], ["T3"]], [["V2"], ["W9"]]] },
  "cls-L10a": { fixed: [2012, 2014, 2015, 2017, 2019, 2021] },
  "meth-L1a": { swaps: [[["Clicker", "click", "count"], ["Stepper", "step", "steps"], ["Tally", "tick", "total"], ["Turnstile", "turn", "visits"], ["Doorbell", "ring", "rings"], ["Pedometer", "walk", "paces"]]] },
  "meth-L2a": { swaps: [[["Door", "unlock", "locked"], ["Gate", "open_gate", "shut"], ["Safe", "crack", "sealed"], ["Hatch", "release", "closed"], ["Vault", "open_vault", "secured"], ["Cage", "free", "caged"]]] },
  "meth-L4a": { testSets: [[["map", "torch"], ["hat", "hat"]], [["rope", "tent"], ["cup", "cup"]], [["key", "coin"], ["pen", "pen"]], [["sock", "shoe"], ["mug", "mug"]],
    [["book", "lamp"], ["fork", "fork"]], [["ball", "bat"], ["kite", "kite"]]] },
  "meth-L4b": { testSets: [[["HAH"], ["AAA"]], [["HHA"], ["HHH"]], [["AHHA"], ["A"]], [["HAAH"], ["HH"]], [["AAH"], ["HAHAH"]], [["H"], ["AHA"]]] },
  "meth-L5c": { testSets: [[["1"], ["0"]], [["2"], ["1"]], [["0"], ["2"]], [["2"], ["0"]], [["1"], ["2"]], [["0"], ["1"]]] },
  "enc-L8a": { fixed: [8], testSets: [[["sunshine", "abcdef12"], ["abc12", "password12"]], [["rainbows", "qwerty99"], ["xy7", "football1"]], [["elephant", "zebra123"], ["cat9", "dolphins2"]],
    [["mountain", "river777"], ["sky", "forest55"]], [["notebook", "pencil44"], ["ink1", "marker88"]], [["sandwich", "toast321"], ["egg2", "pancake9"]]] },
  "inh-L1a": { swaps: [[["Bird", "Kiwi", "fly", "flies"], ["Fish", "Nemo", "swim", "swims"], ["Frog", "Kermit", "hop", "hops"], ["Horse", "Comet", "gallop", "gallops"],
    ["Snake", "Kaa", "slither", "slithers"], ["Bat", "Echo", "glide", "glides"]]] },
  "inh-L1b": { swaps: [[["Square", "square"], ["Circle", "circle"], ["Triangle", "triangle"], ["Oval", "oval"], ["Hexagon", "hexagon"], ["Star", "star"]]] },
  "inh-L3a": { testSets: [[["Nemo"], ["Dory"]], [["Bubbles"], ["Finn"]], [["Goldie"], ["Splash"]], [["Wanda"], ["Flipper"]], [["Marlin"], ["Gill"]], [["Bruce"], ["Squirt"]]] },
  "inh-L6b": { testSets: [[["hello"], ["go"]], [["stop"], ["run"]], [["help"], ["wow"]], [["look out"], ["yes"]], [["fire"], ["no"]], [["jump"], ["hey"]]] },
  "dbg-L1c": { swaps: [[["ava"], ["leo"], ["mia"], ["kai"], ["zoe"], ["sam"], ["tom"]]] },
  "dbg-L2a": { swaps: [[['"3"'], ['"4"'], ['"5"'], ['"2"'], ['"6"'], ['"7"']]], hints: ["qty holds text in quotes, not a number.", "* 2 on text repeats it."] },
  "dbg-L8a": { testSets: [[["banana"], ["sky"]], [["potato"], ["rhythm"]], [["orange"], ["myth"]], [["igloo"], ["lynx"]], [["tomato"], ["gym"]], [["elephant"], ["crypt"]]] },
};

const isPlacement = (t) => (t.tags || []).includes("placement");
// A number in text or code. It may be followed by a unit ("50g", "20p", "3pm", "5s" in "under 5s"), but not be part
// of a word or name ("7B", "x1").
const NUM = /(?<![\w.])(-?\d+(?:\.\d+)?)(?=(?:kg|km|cm|mm|ml|mph|pm|am|g|p|m|s|h)\b|(?![\w]|\.\d))/g;
const decimals = (s) => (s.includes(".") ? s.split(".")[1].length : 0);

// Numbers outside strings and comments in a program.
function codeNumbers(code) {
  const masked = [];
  const re = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|#[^\n]*)/g;
  let m;
  while ((m = re.exec(code))) masked.push([m.index, m.index + m[0].length]);
  const out = [];
  const nre = /(?<![\w.])(\d+(?:\.\d+)?)(?![\w]|\.\d)/g;
  while ((m = nre.exec(code))) if (!masked.some(([a, b]) => m.index >= a && m.index < b)) out.push(m[1]);
  return out;
}
// Numbers that are a whole string literal in the code, e.g. "3" in  if choice == "3":  (menu choices): kept fixed.
const quotedNumbers = (code) => (code.match(/"(\d+)"|'(\d+)'/g) || []).map((s) => Number(s.slice(1, -1)));

// Facts that must not change: "7 days in a week", "12 months in a year", "31 days in", "60 minutes per hour"…
function factNumbers(t) {
  const text = [t.description, ...t.hints].join("\n");
  const re = /(\d+)\s+(?:days|months|hours|minutes|seconds|weeks|pence|centimetres|millimetres|grams|metres)\s+(?:in|per|a|make)\b/g;
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push(Number(m[1]));
  // Numbers that are facts of the topic: the leap-year rule, days in a week, months in a year, hours in a day…
  const all = (text + "\n" + t.title).toLowerCase();
  const TOPIC_FACTS = [[/leap/, [4, 100, 400]], [/circle|π|\bpi\b/, [3.14, 3.142, 3.14159]], [/interest/, [1.05, 5]], [/\bweeks?\b/, [7, 8]], [/fahrenheit|kelvin|°f/, [9, 5, 32, 273]], [/\bmonths?\b|\bdozen\b/, [12]], [/\bhours?\b/, [24, 60]], [/\bminutes?\b|\bseconds?\b/, [60]],
    [/\bdays?\b.*\bweeks?\b|\bweeks?\b.*\bdays?\b/, [7]], [/\bmetres?\b|\bcentimetres?\b|\bcm\b/, [100]], [/\bkg\b|\bgrams?\b/, [1000]], [/\bpence\b|£/, [100]]];
  for (const [re2, nums] of TOPIC_FACTS) if (re2.test(all)) out.push(...nums);
  return out;
}

function codeOf(t) {
  return [t.solution, t.starter || "", ...(t.distractors || []), ...(t.answers || []), ...(t.type === "partial-parsons" ? t.options : []),
    ...(t.buggy_variants || []).map((v) => v.code)].join("\n");
}

// Replaces numbers in a text by placeholders. map: numeric value → expression text (e.g. "a0", "a0 + 1"),
// fmt: value → decimals. Leaves {{…}} and [[…]] alone.
function substituteNumbers(text, map, fmt) {
  if (text == null) return text;
  return String(text).split(/(\{\{[\s\S]*?\}\}|\[\[[^\]]*\]\])/).map((part, i) => {
    if (i % 2) return part;
    return part.replace(NUM, (tok) => {
      const v = Number(tok);
      if (!(v in map)) return tok;
      const d = fmt[v] != null ? fmt[v] : decimals(tok);
      return "{{" + (d ? "(" + map[v] + ").toFixed(" + d + ")" : map[v]) + "}}";
    });
  }).join("");
}

// Linked swaps (OVERRIDES … swaps): each group is a list of tuples; the first tuple holds the task's own strings, which
// are replaced everywhere by the matching strings of the tuple chosen for the variant (param p0, p1, …).
function applySwaps(text, groups) {
  if (text == null || !groups.length) return text;
  const items = [];
  groups.forEach((g) => g.tuples[0].forEach((orig, i) => items.push({ orig, expr: JSON.stringify(g.tuples.map((tu) => tu[i])) + "[" + g.param + "]" })));
  items.sort((a, b) => b.orig.length - a.orig.length);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bound = (s) => (/^\w/.test(s) ? "\\b" : "") + esc(s) + (/\w$/.test(s) ? "\\b" : "");
  const re = new RegExp(items.map((x) => bound(x.orig)).join("|"), "g");
  return String(text).split(/(\{\{[\s\S]*?\}\}|\[\[[^\]]*\]\])/).map((part, i) => (i % 2 ? part :
    part.replace(re, (m) => "{{" + items.find((x) => x.orig === m).expr + "}}"))).join("");
}

function substituteWords(text, words) {
  if (text == null) return text;
  return String(text).split(/(\{\{[\s\S]*?\}\}|\[\[[^\]]*\]\])/).map((part, i) => {
    if (i % 2) return part;
    for (const [w, p] of Object.entries(words)) {
      part = part.replace(new RegExp("\\b" + w + "(?=s?\\b)", "g"), "{{" + p + "}}");
      // A lower-case word also changes where it starts with a capital ("red" in the text, "Red warning" in the code).
      if (/^[a-z]/.test(w)) part = part.replace(new RegExp("\\b" + w[0].toUpperCase() + w.slice(1) + "(?=s?\\b)", "g"), "{{cap(" + p + ")}}");
    }
    return part;
  }).join("");
}

// "For example" output in the description → [[out:k]] / [[out:k:j]].
function markExampleOutputs(text, tests) {
  let out = text;
  tests.forEach((test, k) => {
    const e = Checker.normalise(test.expected);
    if (e.includes("\n") && e.length >= 3 && out.includes(e)) out = out.split(e).join("[[out:" + k + "]]");
  });
  const lines = out.split("\n");
  for (let li = 0; li < lines.length; li++) {
    if (!/\d/.test(lines[li]) || lines[li].length < 3 || lines[li].includes("[[")) continue;
    for (let k = 0; k < tests.length; k++) {
      const j = Checker.normalise(tests[k].expected).split("\n").indexOf(lines[li]);
      if (j >= 0) { lines[li] = "[[out:" + k + ":" + j + "]]"; break; }
    }
  }
  out = lines.join("\n");
  // An output line quoted inside a sentence ("Print the area, for example: Area: 20").
  const quoted = [];
  tests.forEach((test, k) => Checker.normalise(test.expected).split("\n").forEach((l, j) => {
    if (/\d/.test(l) && l.length >= 2) quoted.push([l, "[[out:" + k + ":" + j + "]]"]);
  }));
  quoted.sort((a, b) => b[0].length - a[0].length);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [l, ph] of quoted) {
    // A short output ("8.0") only where the text says it is printed: "It should print 8.0", "for example: 8.0".
    const re = l.length >= 5 ? new RegExp(esc(l), "g") : new RegExp("((?:print|prints|printed|e\\.g\\.|example:?|like:?|place:|number:)\\s+)" + esc(l) + "(?![\\w.])", "gi");
    out = out.split(/(\[\[[^\]]*\]\])/).map((part, i) => (i % 2 ? part : part.replace(re, (m, pre) => (l.length >= 5 ? ph : pre + ph)))).join("");
  }
  return out;
}

// Numbers in a variant's description or hints that appear nowhere in its code, tests or outputs: probably left
// over from the bank task (a warning for a person to check, not an error).
function staleNumbers(v) {
  const evidence = [v.solution, v.starter, ...(v.answers || []), ...(v.distractors || []), ...(v.options || []),
    ...v.tests.flatMap((x) => x.inputs.concat([x.expected]))].join("\n");
  const have = new Set((evidence.match(NUM) || []).map(Number));
  const text = [v.description, ...v.hints].join("\n");
  return [...new Set((text.match(NUM) || []).map(Number))].filter((n) => !have.has(n) && !FIXED.has(Math.abs(n)) && n > 2);
}

// Values the program can't change on its own: checked by running the solution with each value changed.
function structuralValues(tasks, candidates) {
  const jobs = [];
  const where = [];
  tasks.forEach((t, ti) => {
    for (const v of candidates[ti]) {
      const nv = Number.isInteger(v) ? v + Math.max(1, Math.round(Math.abs(v) * 0.3)) * Math.sign(v || 1) : Number((v * 1.3).toFixed(2));
      const sub = (s) => s.replace(NUM, (tok) => (Number(tok) === v ? String(nv) : tok));
      t.tests.forEach((test) => { jobs.push({ code: sub(t.solution), inputs: test.inputs.map(sub), maxLines: Templates.MAX_LINES }); where.push([ti, v]); });
    }
  });
  const res = jobs.length ? runPython(jobs) : [];
  const bad = tasks.map(() => new Set());
  res.forEach((r, i) => { if (r.error || r.inputsLeft > 0) bad[where[i][0]].add(where[i][1]); });
  return bad;
}

// Trace tables and the searching and sorting units: their text names lines, rows and indexes ("Line 4", "items[3]",
// "index 2"), which a variant keeps (positions don't change when the numbers are scaled in order). Those references
// are kept as they are, and a number in the text only changes if it is one of the task's own numbers (not one more or
// one less than one).
const A_LEVEL_UNITS = ["recursion", "scope-parameters", "oop-classes", "oop-methods", "oop-encapsulation", "oop-inheritance", "debugging"];
const KEEP_POSITIONS_UNITS = ["trace-tables", "linear-search", "binary-search", "bubble-sort", "insertion-sort", "merge-sort"].concat(A_LEVEL_UNITS);
// The A-level units also name lines in their code (an error message in a comment: "line 3"), and a debugging answer
// may be a line number: every number a line, row or index reference names stays fixed, in the code as well.
// A program shown in comments with its line numbers ("#   3  print(total)", the Debugging unit) keeps them too.
const lineRefNumbers = (t) => {
  const text = [t.description, ...t.hints, t.explainer || "", t.solution, t.starter || ""].join("\n");
  const refs = (text.match(/\b(?:[Ll]ines?|[Rr]ows?) -?\d+(?:(?:, | and | to |, then )-?\d+)*/g) || []).flatMap((m) => m.match(/-?\d+/g).map(Number));
  const labels = [...text.matchAll(/^#\s+(\d+)  /gm)].map((m) => Number(m[1]));
  return refs.concat(labels);
};
const POSITION_REF = /\b(?:[Ll]ines?|[Ii]ndex(?:es)?|[Rr]ows?) -?\d+(?:(?:, | and | to |, then )-?\d+)*|\b[a-z_]\w*\[-?\d+\]|\blen\(\w+\)(?: - 1)? is \d+/g;
const keepPositions = (text) => (text == null ? text : String(text).split(/(\{\{[\s\S]*?\}\}|\[\[[^\]]*\]\])/)
  .map((part, i) => (i % 2 ? part : part.replace(POSITION_REF, (m) => "{{" + JSON.stringify(m) + "}}"))).join(""));

function derive(t, fixedExtra, opts) {
  const smallRange = !!(opts && opts.smallRange);
  const ov = OVERRIDES[t.id] || {};
  const keepPos = KEEP_POSITIONS_UNITS.includes(t.unit);
  const code = codeOf(t);
  const fixed = new Set([...FIXED, ...quotedNumbers(code), ...factNumbers(t), ...(ov.fixed || []), ...(fixedExtra || []),
    ...(A_LEVEL_UNITS.includes(t.unit) ? lineRefNumbers(t) : [])]);
  // Anchors: numbers in the code, then numbers typed in the tests that aren't next to one of those.
  const fmt = {};
  const anchors = new Set();
  const consider = (tok) => {
    const v = Number(tok);
    if (Number.isNaN(v) || fixed.has(Math.abs(v))) return;
    anchors.add(v);
    fmt[v] = Math.max(fmt[v] || 0, decimals(tok));
  };
  const near = {}; // value → [anchor, difference]: a boundary test, or a mistake's "one more", moves with its anchor
  if (!ov.noNumbers) {
    // The solution's numbers first. A number only in a buggy variant, distractor or answer that is next to one of
    // them (range(1, 4) for range(3)) moves with it, so the mistake stays the same mistake.
    // In the solution itself, a number one away from an earlier one on the same line moves with it ((pupils + 44) // 45).
    for (const line of (t.solution + "\n" + (t.starter || "")).split("\n")) {
      const onLine = [];
      for (const tok of codeNumbers(line)) {
        const v = Number(tok);
        if (!(anchors.has(v) || v in near || fixed.has(Math.abs(v)))) {
          const a = decimals(tok) ? null : onLine.find((c) => anchors.has(c) && !fmt[c] && Math.abs(c - v) === 1);
          if (a != null) near[v] = [a, v - a];
          else consider(tok);
        }
        onLine.push(v);
      }
    }
    const solutionAnchors = [...anchors].filter((v) => !fmt[v]);
    for (const tok of codeNumbers(code)) {
      const v = Number(tok);
      if (anchors.has(v) || v in near || fixed.has(Math.abs(v))) continue;
      const a = decimals(tok) ? null : solutionAnchors.find((c) => Math.abs(c - v) <= 2);
      if (a != null) near[v] = [a, v - a];
      else consider(tok);
    }
  }
  const codeAnchors = [...anchors].filter((v) => !fmt[v]);
  for (const test of ov.noNumbers || ov.testSets ? [] : t.tests) {
    for (const inp of test.inputs) {
      const tok = inp.trim();
      if (!/^-?\d+(\.\d+)?$/.test(tok)) continue;
      const v = Number(tok);
      const a = decimals(tok) ? null : codeAnchors.find((c) => c !== v && Math.abs(c - v) <= 2);
      if (a != null && !anchors.has(v) && !fixed.has(Math.abs(v))) near[v] = [a, v - a];
      else if (a == null) consider(tok);
    }
  }
  const sorted = [...anchors].sort((a, b) => a - b);
  const params = {};
  const values = {};
  const map = {};
  if (sorted.length) params.f = { choice: FACTORS };
  sorted.forEach((v, i) => {
    const name = "a" + i;
    if (fmt[v]) {
      values[name] = "dp(" + v + " * f, " + fmt[v] + ")";
    } else if (smallRange && Math.abs(v) <= 10) {
      // Small numbers: any value from 3 to 12 (with the same sign), so there are enough different variants.
      params["j" + i] = { int: [3, 12] };
      values[name] = (v < 0 ? "-" : "") + "j" + i;
    } else {
      const J = Math.max(3, Math.round(Math.abs(v) * 0.2));
      params["j" + i] = { int: [-J, J] };
      values[name] = "Math.round(" + v + " * f) + j" + i;
    }
    map[v] = name;
  });
  for (const [v, [a, d]] of Object.entries(near)) map[v] = map[a] + (d > 0 ? " + " + d : " - " + -d);
  const textMap = Object.assign({}, map); // KEEP_POSITIONS_UNITS: the text changes only the task's own numbers
  // Numbers one more or one less than a code anchor move with it ("1 to 5" in the text for range(1, 6)).
  for (const v of codeAnchors) {
    for (const d of [1, -1]) if (!(v + d in map) && !fixed.has(Math.abs(v + d))) map[v + d] = map[v] + (d > 0 ? " + 1" : " - 1");
  }
  const where = [];
  sorted.forEach((v, i) => {
    const a = "a" + i;
    if (v > 0) where.push(a + " > 0");
    if (v < 0) where.push(a + " < 0");
    if (!fmt[v]) where.push("![0, 1, 2].includes(Math.abs(" + a + "))");
    if (i > 0) {
      const prev = sorted[i - 1];
      // Keep the order; keep a gap of more than 2 where there was one, so boundary values stay apart.
      const gap = fmt[v] || fmt[prev] ? 0 : Math.min(v - prev - 1, 2);
      where.push("a" + (i - 1) + (gap > 0 ? " + " + gap : "") + " < " + a);
    }
  });
  const changed = sorted.map((v, i) => "a" + i + " !== " + v); // at least one of these must hold (see below)

  // Words: names, days, subjects, colours.
  const words = {};
  if (ov.words !== false && !(ov.swaps && !ov.words)) { // hand-written swaps replace the automatic word swaps
    const all = [t.title, t.description, code, ...t.tests.flatMap((x) => x.inputs), ...t.hints].join("\n");
    let n = 0;
    const forms = [...new Set(all.match(/\b(?:[7-9]|1[01])[A-Z]\b/g) || [])];
    for (const list of WORD_LISTS.concat(forms.length ? [[...new Set(FORMS.concat(forms))]] : [])) {
      const present = list.filter((w) => new RegExp("\\b" + w + "(?=s?\\b)", /^[a-z]/.test(w) ? "i" : "").test(all));
      for (const w of present) {
        const p = "w" + n++;
        params[p] = { choice: list.filter((x) => !present.includes(x) || x === w) };
        words[w] = p;
      }
      if (present.length > 1) where.push("new Set([" + present.map((w) => words[w]).join(", ") + "]).size === " + present.length);
    }
  }

  const swaps = (ov.swaps || []).map((tuples, g) => {
    const param = "p" + g;
    params[param] = { int: [0, tuples.length - 1] };
    return { tuples: tuples.map((tu) => [].concat(tu)), param };
  });
  const s = (x) => substituteWords(substituteNumbers(applySwaps(x, swaps), map, fmt), words);
  // Text (title, description, hints): as the code, except that the new units keep their line and index references.
  const st = keepPos ? (x) => substituteWords(substituteNumbers(applySwaps(keepPositions(x), swaps), textMap, fmt), words) : s;
  const tpl = {
    id: "d-" + t.id,
    units: [t.unit],
    source: t.id,
    derived: true,
    level: t.level,
    type: t.type,
    title: st(t.title),
    description: st(markExampleOutputs(t.description, t.tests)),
    starter: s(t.starter || ""),
  };
  if (t.type === "fill") tpl.answers = t.answers.map(s);
  else tpl.solution = s(t.solution);
  if (t.type === "parsons") tpl.distractors = t.distractors.map(s);
  if (t.type === "predict") tpl.optionCount = t.options.length;
  // Pick the missing line: the same options in the same order (each changed like the code), the same right one.
  if (t.type === "partial-parsons") { tpl.options = t.options.map(s); tpl.answer = t.answer; delete tpl.solution; }
  // A trace table is made again from the variant's own program, with the same spec and number of rows.
  if (t.type === "trace") { tpl.trace_spec = t.trace.spec || {}; tpl.traceRows = t.trace.rows.length; }
  tpl.tests = t.tests.map((x) => ({ inputs: x.inputs.map(s) }));
  if (ov.testSets) {
    // Whole alternative sets of test inputs (the first is the task's own).
    params.ts = { int: [0, ov.testSets.length - 1] };
    values.TS = JSON.stringify(ov.testSets);
    tpl.tests = ov.testSets[0].map((_, k) => ({ inputs: [{ list: "TS[ts][" + k + "]" }] }));
  }
  // Hand-written hints (OVERRIDES … hints) for hints that work through the sums: {{v(17)}} is this variant's value
  // for the bank task's 17.
  const own = (h) => h.replace(/\{\{([\s\S]+?)\}\}/g, (m, expr) => "{{" + expr.replace(/\bv\((-?\d+(?:\.\d+)?)\)/g, (x, n) => "(" + (map[Number(n)] || n) + ")") + "}}");
  tpl.hints = ov.hints ? ov.hints.map(own) : t.hints.map((h) => st(markExampleOutputs(h, t.tests)));
  // The explainer changes like the description (the same numbers and words), so it stays right for each variant.
  if (t.explainer) tpl.explainer = ov.explainer ? own(ov.explainer) : st(markExampleOutputs(t.explainer, t.tests));
  tpl.tags = t.tags.slice();
  tpl.skills = t.skills.slice();
  if (t.buggy_variants) tpl.buggy_variants = t.buggy_variants.map((v) => ({ misconception: v.misconception, code: s(v.code) }));
  // A variant is never the bank task itself: at least one number, word, swap or test set must differ.
  for (const [w, p] of Object.entries(words)) changed.push(p + " !== " + JSON.stringify(w));
  for (const g of swaps) changed.push(g.param + " !== 0");
  if (ov.testSets) changed.push("ts !== 0");
  if (changed.length) where.push("(" + changed.join(" || ") + ")");
  if (where.length) tpl.where = where.join(" && ");
  tpl.params = params;
  if (Object.keys(values).length) tpl.values = values;
  tpl.fingerprintVars = Object.keys(values).filter((k) => k !== "TS").concat(Object.values(words), swaps.map((g) => g.param), ov.testSets ? ["ts"] : []);
  return tpl;
}

function main() {
  const args = process.argv.slice(2);
  const typesArg = args.includes("--types") ? args[args.indexOf("--types") + 1].split(",") : ["predict", "write", "fill", "parsons", "trace", "partial-parsons"];
  // --units a,b: only these units' tasks (the other units' derived templates are kept as they are).
  const unitsArg = args.includes("--units") ? args[args.indexOf("--units") + 1].split(",") : null;
  const tasks = JSON.parse(fs.readFileSync(path.join(ROOT, "tasks.json"), "utf8"));
  const file = path.join(ROOT, "templates.json");
  const templates = JSON.parse(fs.readFileSync(file, "utf8"));
  const chosen = tasks.filter((t) => !isPlacement(t) && typesArg.includes(t.type) && (!unitsArg || unitsArg.includes(t.unit)));

  // First draft, then keep fixed any value that breaks the solution when changed on its own.
  const firstFixed = chosen.map((t) => {
    const fixed = new Set([...FIXED, ...quotedNumbers(codeOf(t)), ...((OVERRIDES[t.id] || {}).fixed || []), ...(A_LEVEL_UNITS.includes(t.unit) ? lineRefNumbers(t) : [])]);
    const vals = new Set();
    for (const tok of codeNumbers(codeOf(t))) if (!fixed.has(Math.abs(Number(tok)))) vals.add(Number(tok));
    for (const test of t.tests) for (const inp of test.inputs) if (/^-?\d+(\.\d+)?$/.test(inp.trim()) && !fixed.has(Math.abs(Number(inp)))) vals.add(Number(inp));
    return [...vals];
  });
  const structural = structuralValues(chosen, firstFixed);

  // Check each template: it must make MIN_VARIANTS different valid variants from DERIVE_SEEDS seeds.
  // Small numbers are first scaled like the others; a template that can't make enough variants that way is
  // tried again with small numbers drawn from 3 to 12.
  const variantsMade = (tpls) => {
    const requests = [];
    tpls.forEach((tpl) => { for (let seed = 1; seed <= DERIVE_SEEDS; seed++) requests.push([tpl, seed]); });
    const made = Templates.realiseMany(requests, runPython);
    return tpls.map((tpl, i) => {
      const ok = made.slice(i * DERIVE_SEEDS, (i + 1) * DERIVE_SEEDS).filter((v) => v && !v.error);
      stale[tpl.id] = [...new Set(ok.flatMap(staleNumbers))];
      // Different fingerprints that look the same to the student (only a hint changed) don't count twice.
      return Math.min(new Set(ok.map((v) => v.fingerprint)).size, new Set(ok.map(Templates.signature)).size);
    });
  };
  const stale = {};
  let derived = chosen.map((t, i) => derive(t, [...structural[i]]));
  let counts = variantsMade(derived);
  const retry = derived.map((tpl, i) => i).filter((i) => counts[i] < MIN_VARIANTS);
  if (retry.length) {
    const again = retry.map((i) => derive(chosen[i], [...structural[i]], { smallRange: true }));
    const againCounts = variantsMade(again);
    retry.forEach((i, k) => { if (againCounts[k] > counts[i]) { derived[i] = again[k]; counts[i] = againCounts[k]; } });
  }
  const report = [];
  derived = derived.filter((tpl, i) => {
    if (counts[i] >= MIN_VARIANTS) return true;
    report.push(tpl.source + " (" + counts[i] + " of " + DERIVE_SEEDS + " valid" + (Object.keys(tpl.params).length ? "" : ", nothing to vary") + ")");
    return false;
  });
  console.log("Derived " + derived.length + " of " + chosen.length + " tasks (" + typesArg.join(", ") + ").");
  if (report.length) console.log("Not enough valid variants (" + report.length + "): " + report.join(", "));
  const warn = derived.filter((tpl) => stale[tpl.id] && stale[tpl.id].length).map((tpl) => tpl.id + " [" + stale[tpl.id].slice(0, 6).join(" ") + "]");
  if (warn.length) console.log("Check these: numbers in the text that the variant's code, tests and outputs don't use (" + warn.length + "): " + warn.join(", "));
  if (args.includes("--report")) return;
  const keepTypes = new Set(typesArg);
  const kept = templates.filter((tpl) => !(tpl.derived && keepTypes.has(tpl.type) && (!unitsArg || unitsArg.includes(tpl.units[0]))));
  fs.writeFileSync(file, JSON.stringify(kept.concat(derived), null, 2) + "\n");
  console.log("templates.json now has " + (kept.length + derived.length) + " templates.");
}

if (require.main === module) main();
module.exports = { derive, codeNumbers, substituteNumbers, markExampleOutputs };
