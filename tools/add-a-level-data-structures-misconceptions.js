// One-off (2026-11): adds the A-level data structures units' misconceptions to misconceptions.json (ids already there
// are left as they are). Each has a name, a teacher description and a three-sentence explanation for the student: what
// went wrong, why, and exactly what to write instead (short code only, never a whole line of a task's solution).
"use strict";
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./run-python.js");

const NEW = [
  // ---------- Records and tuples ----------
  { id: "TUPLE_CHANGED_IN_PLACE", name: "Tries to change an item of a tuple",
    description: "Assigns to one field of a tuple (record[1] = value), as if it were a list. Tuples are immutable, so Python stops with a TypeError; the student should build a new tuple and store it in place of the old one.",
    explanation: "You tried to change one value inside a tuple. A tuple can't be changed after it is made. Make a new tuple instead, for example rec = (rec[0], new)." },
  { id: "RECORD_FIELD_WRONG_INDEX", name: "Reads the wrong field of a record",
    description: "Uses the wrong index for a field of a tuple record (often counting from 1, or picking the field next to the one wanted), so the wrong value is used or the program stops with an IndexError or TypeError.",
    explanation: "You read the wrong field of the record. The fields are numbered from 0 in the order they were written. Count along to the field you want and use that number, so the second field is rec[1]." },
  { id: "TUPLE_UNPACK_ORDER", name: "Unpacks a tuple in the wrong order",
    description: "Lists the variables in a different order from the tuple's fields when unpacking (age, name = person for a (name, age) record), or builds a tuple with its fields in the wrong order, so each variable gets another field's value.",
    explanation: "You unpacked the values in the wrong order. Unpacking gives the first variable the first value, the second variable the second value, and so on. Write the names in the same order as the fields, for example name, age = rec." },

  // ---------- Stacks and queues ----------
  { id: "STACK_POP_FROM_FRONT", name: "Uses the front of a list as the top of a stack",
    description: "Treats index 0 as the top of a list stack: pops with pop(0), peeks at stack[0], pushes with insert(0, ...), or reads the bottom of an array stack instead of stack[top], so the oldest item comes off first instead of the newest.",
    explanation: "You took the item from the bottom of the stack. A stack is last in, first out: the top is the end of the list, where append puts items. Use stack.pop() to take the top item, and stack[-1] to look at it." },
  { id: "QUEUE_REMOVE_FROM_BACK", name: "Takes items off the back of a queue",
    description: "Removes from a queue with pop() (or reads queue[rear - 1]) instead of pop(0) or queue[front], so the item that joined last is served first and the queue behaves like a stack.",
    explanation: "You took the item that joined the queue last. A queue is first in, first out: items join at the back and leave from the front. Use queue.pop(0) to take the front item." },
  { id: "POP_EMPTY_NOT_CHECKED", name: "Pops from a stack or queue without checking it is empty",
    description: "Calls pop() or pop(0) without first checking that the stack or queue has items in it, so popping an empty one stops the program with an IndexError.",
    explanation: "You took an item off when there might be nothing there. Popping an empty list stops the program with an IndexError. Check first with len(items) > 0, or an is_empty method, and only pop when it isn't empty." },

  // ---------- Linked lists ----------
  { id: "LINKED_LOST_REFERENCE", name: "Loses the rest of a linked list",
    description: "Changes a node's next (or moves head) before keeping a reference to the nodes after it: links a new node in without first setting new.next, sets next to None, or walks head itself along the list, so the later nodes can no longer be reached.",
    explanation: "You cut off part of the list. Once nothing refers to a node, that node and every node after it are lost. Set new.next to the rest of the list before you link the new node in, and walk along with cur, never head." },
  { id: "LINKED_STOPS_EARLY", name: "Stops one node too early when going along a linked list",
    description: "Uses while cur.next != None to visit every node, so the loop stops on the last node without using its data: the last node is left out of a print, count, total or search.",
    explanation: "Your loop stopped before the last node. The last node's next is None, so while cur.next != None leaves it out. To use every node, loop while cur != None, moving cur on to cur.next each time." },
  { id: "LINKED_HEAD_NOT_UPDATED", name: "Doesn't move head when the first node changes",
    description: "Adds a node at the front or removes the first node but leaves head pointing at the old first node, so the new node is never part of the list, or the removed one is still in it.",
    explanation: "You changed the start of the list but head still points at the old first node. The list always starts wherever head points. After adding a node at the front write head = node, and to remove the first node set head to head.next." },

  // ---------- Hash tables ----------
  { id: "HASH_NO_MOD", name: "Works out a hash table index without % size",
    description: "Uses the key itself (or key // size, or index + 1 when probing) as the index, without % size, so the index can be past the end of the table (IndexError) or lands on the wrong slot.",
    explanation: "Your index wasn't worked out with the remainder. Only key % size always gives an index from 0 to size - 1. Use the remainder to hash, and write (index + 1) % size to move on to the next slot." },
  { id: "HASH_COLLISION_OVERWRITES", name: "Stores a key on top of another key",
    description: "Stores a key at its hashed index without checking whether that slot is already taken, so when two keys collide the second replaces the first and the first key is lost.",
    explanation: "Your new key was stored on top of one that was already there. Two keys can hash to the same slot, which is called a collision. Check the slot first, and move on with linear probing while table[index] != None." },
  { id: "HASH_SEARCH_STOPS_AT_HOME", name: "Only checks a key's home slot when searching",
    description: "Searches a hash table by looking only at index key % size, so a key that was moved along by linear probing (after a collision) is reported as not found.",
    explanation: "Your search only looked in the key's first slot. A key that collided was stored further along. Keep moving on with (index + 1) % size, as the insert did, until you find the key or reach an empty slot." },

  // ---------- 3D arrays ----------
  { id: "CUBE_INDEX_ORDER", name: "Writes a 3D array's indexes in the wrong order",
    description: "Writes the three indexes in a different order from the nesting (cube[col][row][layer] for cube[layer][row][col]), so the wrong item is read or changed, or the program stops with an IndexError.",
    explanation: "You wrote the indexes in the wrong order. The first index picks the outer list (the layer), the second a row inside it, and the third an item in that row. Write them outside in, for example cube[l][r][c]." },
  { id: "CUBE_WRONG_LEN", name: "Takes the length of the wrong level of a 3D array",
    description: "Uses len(cube) for the number of rows or columns, or len(cube[0]) for the number of columns, so a loop runs the wrong number of times or a count is wrong.",
    explanation: "You took the length of the wrong level. len(cube) counts layers, len(cube[0]) counts rows, and len(cube[0][0]) counts the items in a row. Use the length of the level your loop goes through, such as range(len(cube[0][0])) for the items in a row." },
  { id: "CUBE_SHARED_ROWS", name: "Makes a 3D array whose rows are the same list",
    description: "Builds a 3D array with * (such as [[[0] * 3] * 2] * 2) or appends the same row list more than once, so the rows are one shared list and changing one item changes it in several places.",
    explanation: "Your rows are all the same list, so one change shows up in several places. Multiplying a list with *, or appending the same row again, copies only a reference to it. Make each row new inside the loops with [0] * n." },
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
