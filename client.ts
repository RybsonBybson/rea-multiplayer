import pkg from "deep-diff";
const { diff, applyChange } = pkg;
import fs from "fs";
import os from "os";
import path from "path";
import dgram from "dgram";
import { io } from "socket.io-client";
const DIR_PATH = path.join(os.tmpdir(), "rea-multiplayer");
const LUAJS_PATH = path.join(DIR_PATH, "luajs.json");
const JSLUA_PATH = path.join(DIR_PATH, "jslua.json");

const fj = (p: string) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
};

const socket = io("http://localhost:3000");
socket.on("connection", () => console.log("CONNECTED"));

let previousData = fj(LUAJS_PATH)?.data ?? {};

socket.on("changes", (changes) => {
  fs.writeFileSync(JSLUA_PATH, JSON.stringify(changes));
});

fs.watch(LUAJS_PATH, (event: string) => {
  if (event !== "change") return;
  const data = fj(LUAJS_PATH);
  if (!data) return;

  const changes = diff(previousData, data.data);
  previousData = data.data;

  if (changes) socket.emit("changes", changes);
});
