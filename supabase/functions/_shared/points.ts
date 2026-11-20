// Points and leaderboards (student-api leaderboard, teacher-api leaderboards). The rule is the site's own: secured.js
// (Secured.studentPoints, Secured.boards) with the units from curriculum.js, loaded here as they are in the browser,
// so the server and the pages can't disagree. The work is in points-server.js, a plain script that the Node tests
// (tests/backend-client.js) run too. Only nickname, class name (teacher views), the totals and percentages ever leave
// it: no unit detail, attempts, codes or PINs.

import "../../../curriculum.js";
import "../../../secured.js";
import "./points-server.js";
import { db } from "./http.ts";

// deno-lint-ignore no-explicit-any
const G = globalThis as any;
const deps = { Secured: G.Secured, Curriculum: G.Curriculum };
const PointsServer = G.PointsServer;

// Each student of a class with their points: [{ id, nickname, secured, level, programme, programmes, bonus, combined,
// total, gain, unitCount }] (points-server.js). The id never leaves the server.
export const classPoints = (classId: string, now = Date.now()) => PointsServer.classPoints(db(), deps, classId, now);
// The boards with only the fields each may show (points-server.js).
export const studentBoard = (all: unknown[], sid: string) => PointsServer.studentBoard(all, sid, deps);
export const classBoard = (all: unknown[]) => PointsServer.classBoard(all, deps);
export const allClassesBoard = (classes: { name: string; students: unknown[] }[]) => PointsServer.allClassesBoard(classes, deps);
