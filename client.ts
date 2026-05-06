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

const socket = io("https://rea-multiplayer.onrender.com", {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
});

socket.on("connect", () => console.log("[CLIENT] CONNECTED"));
socket.on("connect_error", (err: any) => console.error("[CLIENT] Connect error:", err.message));
socket.on("disconnect", () => console.log("[CLIENT] DISCONNECTED"));

let previousData: any[] = fj(STATE_PATH)?.data ?? [];
let isProcessingChanges = false;
let fileWatchTimeout: NodeJS.Timeout | null = null;
const uploadedMediaSet = new Set<string>(); // Track uploaded files to avoid duplicates

// Deep clone helper
const deepClone = (obj: any) => JSON.parse(JSON.stringify(obj));

socket.on("changes", async (changes: Diff<any, any>[]) => {
  if (isProcessingChanges) {
    console.log("[CLIENT] Skipping changes - already processing");
    return;
  }

  try {
    isProcessingChanges = true;
    console.log("[CLIENT] Received remote changes");

    // Create a new copy to work with
    const newData = deepClone(previousData);

    // Apply changes to the copy
    changes.forEach((change) => {
      try {
        applyChange(newData, newData, change);
      } catch (e) {
        console.error("[CLIENT] Error applying change:", e, change);
      }
    });

    previousData = newData;

    // Download new files
    const downloadPromises = [];
    const state = fj(STATE_PATH);

    if (state && state.project_path) {
      for (const track of previousData) {
        if (!track.medias) continue;
        for (const media of track.medias) {
          if (media.telegram_id && media.SOURCE) {
            const fullPath = path.join(state.project_path, media.SOURCE);
            if (!fs.existsSync(fullPath)) {
              const promise = new Promise<void>((resolve) => {
                socket.emit("download_file", media.telegram_id, (response: any) => {
                  try {
                    if (response.success) {
                      fs.ensureDirSync(path.dirname(fullPath));
                      fs.writeFileSync(fullPath, response.buffer);
                      console.log("[CLIENT] Downloaded:", media.SOURCE);
                    } else {
                      console.error("[CLIENT] Download failed:", response.error);
                    }
                  } catch (e) {
                    console.error("[CLIENT] Error writing file:", e);
                  }
                  resolve();
                });
              });
              downloadPromises.push(promise);
            }
          }
        }
      }
    }

    await Promise.all(downloadPromises);

    // Write changes to Lua
    fs.ensureDirSync(CHANGES_DIR);
    fs.writeFileSync(path.join(CHANGES_DIR, `changes_${Date.now()}.json`), JSON.stringify(changes));
    fs.writeFileSync(COMMS_PATH, JSON.stringify({ applying: true }));
  } catch (e) {
    console.error("[CLIENT] Error processing remote changes:", e);
  } finally {
    isProcessingChanges = false;
  }
});

// Debounced file watcher
fs.watch(STATE_PATH, async (event: string) => {
  if (event !== "change") return;

  // Debounce: ignore rapid successive calls
  if (fileWatchTimeout) {
    clearTimeout(fileWatchTimeout);
  }

  fileWatchTimeout = setTimeout(async () => {
    if (isProcessingChanges) {
      console.log("[CLIENT] Skipping file change - currently processing");
      return;
    }

    try {
      const comms = fj(COMMS_PATH);
      if (!comms || comms.applying) {
        console.log("[CLIENT] Skipping - Lua is applying changes");
        return;
      }

      const state = fj(STATE_PATH);
      if (!state || !state.data) return;

      const currentData = state.data;

      // Upload new files
      const uploadPromises = [];
      for (let trackIdx = 0; trackIdx < currentData.length; trackIdx++) {
        const track = currentData[trackIdx];
        if (!track.medias) continue;

        for (let mediaIdx = 0; mediaIdx < track.medias.length; mediaIdx++) {
          const media = track.medias[mediaIdx];
          if (media.SOURCE && !media.telegram_id) {
            const mediaKey = `${trackIdx}_${mediaIdx}_${media.SOURCE}`;

            if (uploadedMediaSet.has(mediaKey)) {
              console.log("[CLIENT] Skipping already uploaded:", media.SOURCE);
              continue;
            }

            const fullPath = path.join(state.project_path, media.SOURCE);
            if (fs.existsSync(fullPath)) {
              uploadedMediaSet.add(mediaKey);

              const buffer = fs.readFileSync(fullPath);
              const filename = path.basename(fullPath);

              const promise = new Promise<void>((resolve) => {
                socket.emit("upload_file", { buffer, filename }, (response: any) => {
                  try {
                    if (response.success) {
                      media.telegram_id = response.fileId;
                      console.log("[CLIENT] Uploaded:", filename);
                    } else {
                      console.error("[CLIENT] Upload failed:", response.error);
                      uploadedMediaSet.delete(mediaKey); // Retry on next change
                    }
                  } catch (e) {
                    console.error("[CLIENT] Error handling upload response:", e);
                    uploadedMediaSet.delete(mediaKey);
                  }
                  resolve();
                });
              });
              uploadPromises.push(promise);
            }
          }
        }
      }

      await Promise.all(uploadPromises);

      // Detect and send changes
      const changes = diff(previousData, currentData);
      if (changes) {
        previousData = deepClone(currentData);
        console.log("[CLIENT] Sending", Array.isArray(changes) ? changes.length : 1, "changes");
        socket.emit("changes", changes, (ack: any) => {
          console.log("[CLIENT] Changes acknowledged by server");
        });
      }
    } catch (e) {
      console.error("[CLIENT] Error processing local changes:", e);
    }
  }, 500); // 500ms debounce
});
