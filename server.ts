import { Server } from "socket.io";
import FileManager from "./filemanager.ts";

const telegram_bot_token = process.env.TELEGRAM_BOT_TOKEN || "";
const telegram_chat_id = process.env.TELEGRAM_CHAT_ID || "";

const fileManager = new FileManager(telegram_bot_token, telegram_chat_id);

const io = new Server(3001, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

console.log("[SERVER] Started on port 3001");

io.on("connection", (socket) => {
  console.log("[SERVER] Client connected:", socket.id);

  socket.on("changes", (data, callback) => {
    console.log("[SERVER] Received changes from", socket.id);
    try {
      socket.broadcast.emit("changes", data);
      if (callback) callback({ success: true });
      console.log("[SERVER] Changes broadcasted");
    } catch (e) {
      console.error("[SERVER] Error broadcasting changes:", e);
      if (callback) callback({ success: false, error: String(e) });
    }
  });

  socket.on("upload_file", async (data: { buffer: Buffer; filename: string }, callback) => {
    try {
      console.log("[SERVER] Uploading file:", data.filename);
      const fileId = await fileManager.upload_file(data.buffer, data.filename);
      callback({ success: true, fileId });
      console.log("[SERVER] File uploaded successfully:", data.filename, "->", fileId);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error("[SERVER] Upload error:", errorMessage);
      callback({ success: false, error: errorMessage });
    }
  });

  socket.on("download_file", async (fileId: string, callback) => {
    try {
      console.log("[SERVER] Downloading file:", fileId);
      const buffer = await fileManager.download_file(fileId);
      callback({ success: true, buffer });
      console.log("[SERVER] File downloaded successfully:", fileId);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error("[SERVER] Download error:", errorMessage);
      callback({ success: false, error: errorMessage });
    }
  });

  socket.on("disconnect", () => {
    console.log("[SERVER] Client disconnected:", socket.id);
  });

  socket.on("error", (err) => {
    console.error("[SERVER] Socket error:", err);
  });
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[SERVER] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[SERVER] Uncaught Exception:", err);
});
