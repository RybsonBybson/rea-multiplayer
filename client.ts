import pkg, { Diff } from "deep-diff";
const { diff, applyChange } = pkg;
import fs from "fs-extra";
import os from "os";
import path from "path";
import { io } from "socket.io-client";

const sessionId = process.argv[2];
const DIR_PATH = path.join(os.tmpdir(), `rea-multiplayer-${sessionId}`);
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

socket.on("changes", async (changes: Diff<any, any>[]) => {
  console.log("CHANGES: ", changes);
  console.log("FULL CHANGES: ", JSON.stringify(changes, null, 2));
  // console.log("before: ", JSON.stringify(previousData, null, 2));
  changes.forEach((change) => applyChange(previousData, previousData, change));
  // console.log("after: ", JSON.stringify(previousData, null, 2));

  // Download new files
  const downloadPromises = [];
  const data = fj(STATE_PATH);
  if (data) {
    for (const track of previousData) {
      for (const media of track.medias) {
        if (media.telegram_id && media.SOURCE) {
          const fullPath = path.join(data.project_path, media.SOURCE);
          if (!fs.existsSync(fullPath)) {
            const promise = new Promise<void>((resolve) => {
              socket.emit(
                "download_file",
                media.telegram_id,
                (response: any) => {
                  if (response.success) {
                    fs.writeFileSync(fullPath, response.buffer);
                  }
                  resolve();
                },
              );
            });
            downloadPromises.push(promise);
          }
        }
      }
    }
  }
  await Promise.all(downloadPromises);

  fs.ensureDirSync(CHANGES_DIR);
  fs.writeFileSync(
    path.join(CHANGES_DIR, `changes_${Date.now()}.json`),
    JSON.stringify(changes),
  );
  fs.writeFileSync(COMMS_PATH, JSON.stringify({ applying: true }));
});

fs.watch(STATE_PATH, async (event: string) => {
  if (event !== "change") return;

  const comms = fj(COMMS_PATH);
  if (!comms || comms.applying) return;

  const data = fj(STATE_PATH);
  if (!data) return;

  // Upload new files
  const uploadPromises = [];
  for (const track of data.data) {
    for (const media of track.medias) {
      if (media.SOURCE && !media.telegram_id) {
        const fullPath = path.join(data.project_path, media.SOURCE);
        if (fs.existsSync(fullPath)) {
          const buffer = fs.readFileSync(fullPath);
          const filename = path.basename(fullPath);
          const promise = new Promise<void>((resolve) => {
            socket.emit(
              "upload_file",
              { buffer, filename },
              (response: any) => {
                if (response.success) {
                  media.telegram_id = response.fileId;
                }
                resolve();
              },
            );
          });
          uploadPromises.push(promise);
        }
      }
    }
  }
  await Promise.all(uploadPromises);

  const changes = diff(previousData, data.data);

  if (changes) {
    previousData = JSON.parse(JSON.stringify(data.data));
    socket.emit("changes", changes);
  }
});
