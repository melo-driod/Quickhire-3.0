const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const origin = process.env.CORS_ORIGIN || true;

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." }
});
app.use("/api", apiLimiter);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/services", require("./routes/services"));
app.use("/api/hires", require("./routes/hires"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/payouts", require("./routes/payouts"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/admin", require("./routes/admin"));

app.get("/api/health", (req, res) => res.json({ ok: true, message: "QuickHire API is running", realtime: true }));
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: err.message || "Internal server error" });
});

const io = new Server(server, {
  cors: { origin, methods: ["GET", "POST"] }
});
const socketAuth = require("./middleware/socketAuth");
const Message = require("./models/Message");
const notify = require("./utils/notify");

io.use(socketAuth);

io.on("connection", (socket) => {
  const userRoom = `user:${socket.user._id}`;
  socket.join(userRoom);

  socket.on("joinConversation", ({ userId }) => {
    if (userId) {
      const a = String(socket.user._id);
      const b = String(userId);
      const room = `conversation:${[a, b].sort().join(":")}`;
      socket.join(room);
      socket.data.currentConversation = room;
    }
  });

  socket.on("sendMessage", async ({ receiverId, text, serviceId }) => {
    try {
      if (!receiverId || !text?.trim()) return;
      if (String(receiverId) === String(socket.user._id)) return;

      const message = await Message.create({
        sender: socket.user._id,
        receiver: receiverId,
        service: serviceId || undefined,
        text: text.trim()
      });
      const populated = await message.populate("sender", "name avatar");

      const room = `conversation:${[String(socket.user._id), String(receiverId)].sort().join(":")}`;
      io.to(room).emit("newMessage", populated);

      await notify(receiverId, "message", "New message", `${socket.user.name} sent you a message`, {
        senderId: socket.user._id
      });
      io.to(`user:${receiverId}`).emit("notification", {
        type: "message",
        title: "New message",
        message: `${socket.user.name} sent you a message`
      });
    } catch (error) {
      socket.emit("chatError", { message: error.message || "Could not send message" });
    }
  });
});

async function start() {
  try {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing");
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is missing");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
    server.listen(PORT, () => console.log(`QuickHire running at http://localhost:${PORT}`));
  } catch (error) {
    console.error("Startup error:", error.message);
    process.exit(1);
  }
}
start();
