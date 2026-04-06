import { Server } from "socket.io";

const io = new Server(3000);

io.on("connection", (socket) => {
  socket.on("changes", (data) => {
    socket.broadcast.emit("changes", data);
  });
});
