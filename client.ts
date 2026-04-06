import pkg, { Diff } from "deep-diff";
const { diff, applyChange } = pkg;
import fs from "fs";
import os from "os";
import path from "path";
import { io } from "socket.io-client";

const DIR_PATH = path.join(os.tmpdir(), "rea-multiplayer");
const LUAJS_PATH = path.join(DIR_PATH, "luajs.json");
const JSLUA_PATH = path.join(DIR_PATH, "jslua.json");
let ignoreNext = false;

const fj = (p: string) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
};

const socket = io("https://rea-multiplayer.onrender.com");
socket.on("connect", () => console.log("CONNECTED"));
socket.on("connect_error", (err) => console.log("connect_error:", err.message));

let previousData = fj(LUAJS_PATH)?.data ?? {};

socket.on("changes", (changes: Diff<any, any>[]) => {
  changes.forEach((change) => applyChange(previousData, previousData, change));
  fs.writeFileSync(JSLUA_PATH, JSON.stringify(changes));
  ignoreNext = true;
  console.log("from", changes);
});

fs.watch(LUAJS_PATH, (event: string) => {
  if (event !== "change") return;
  if (ignoreNext) return (ignoreNext = false);
  
  const data = fj(LUAJS_PATH);
  if (!data) return;

  const changes = diff(previousData, data.data);

  if (changes) {
    console.log("to", changes);
    previousData = data.data;
    socket.emit("changes", changes);
  }
});
