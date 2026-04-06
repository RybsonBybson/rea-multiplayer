import pkg, { Diff } from "deep-diff";
const { diff, applyChange } = pkg;
import fs from "fs";
import os from "os";
import path from "path";
import { io } from "socket.io-client";

const DIR_PATH = path.join(os.tmpdir(), "rea-multiplayer");
const STATE_PATH = path.join(DIR_PATH, "state.json");
const CHANGES_DIR = path.join(DIR_PATH, "changes");
const COMMS_PATH = path.join(DIR_PATH, "comms.json");

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

let previousData = fj(STATE_PATH)?.data ?? {};

socket.on("changes", (changes: Diff<any, any>[]) => {
  changes.forEach((change) => applyChange(previousData, previousData, change));
  fs.writeFileSync(path.join(CHANGES_DIR, `changes_${Date.now()}.json`), JSON.stringify(changes));
  fs.writeFileSync(COMMS_PATH, JSON.stringify({ applying: true }));
});

fs.watch(STATE_PATH, (event: string) => {
  if (event !== "change") return;
  const comms = fj(COMMS_PATH);
  if (!comms || comms.applying) return console.log("i chuj");

  const data = fj(STATE_PATH);
  if (!data) return;

  const changes = diff(previousData, data.data);

  if (changes) {
    previousData = data.data;
    socket.emit("changes", changes);
  }
});
