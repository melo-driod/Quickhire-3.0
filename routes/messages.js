const router = require("express").Router();
const Message = require("../models/Message");
const User = require("../models/User");
const { auth } = require("../middleware/auth");
const notify = require("../utils/notify");

router.get("/:userId", auth, async (req, res) => {
  const other = await User.findById(req.params.userId);
  if (!other) return res.status(404).json({ message: "User not found" });

  const messages = await Message.find({
    $or: [
      { sender: req.user._id, receiver: other._id },
      { sender: other._id, receiver: req.user._id }
    ]
  }).sort({ createdAt: 1 }).populate("sender", "name");

  await Message.updateMany({ sender: other._id, receiver: req.user._id }, { read: true });
  res.json({ messages });
});

router.post("/", auth, async (req, res) => {
  const { receiverId, serviceId, text } = req.body;
  if (!receiverId || !text?.trim()) return res.status(400).json({ message: "Receiver and message are required" });
  if (String(receiverId) === String(req.user._id)) return res.status(400).json({ message: "You cannot message yourself" });

  const receiver = await User.findById(receiverId);
  if (!receiver) return res.status(404).json({ message: "Receiver not found" });

  const message = await Message.create({
    sender: req.user._id, receiver: receiverId, service: serviceId || undefined, text: text.trim()
  });

  await notify(receiverId, "message", "New message", `${req.user.name} sent you a message`, { senderId: req.user._id });
  res.status(201).json({ message });
});

module.exports = router;
