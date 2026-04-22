import { Server } from "socket.io";
import FileManager from "./filemanager";

const telegram_bot_token = process.env.TELEGRAM_BOT_TOKEN || "";
const telegram_chat_id = process.env.TELEGRAM_CHAT_ID || "";

const fileManager = new FileManager(telegram_bot_token, telegram_chat_id);

const io = new Server(3001);

io.on("connection", (socket) => {
  socket.on("changes", (data) => {
    socket.broadcast.emit("changes", data);
  });

  socket.on(
    "upload_file",
    async (data: { buffer: Buffer; filename: string }, callback) => {
      try {
        const fileId = await fileManager.upload_file(
          data.buffer,
          data.filename,
        );
        callback({ success: true, fileId });
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        callback({ success: false, error: errorMessage });
      }
    },
  );

  socket.on("download_file", async (fileId: string, callback) => {
    try {
      const buffer = await fileManager.download_file(fileId);
      callback({ success: true, buffer });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      callback({ success: false, error: errorMessage });
    }
  });
});
