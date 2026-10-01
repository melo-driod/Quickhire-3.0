const router = require("express").Router();
const Notification = require("../models/Notification");
const { auth } = require("../middleware/auth");

router.get("/", auth, async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ notifications });
});

router.patch("/:id/read", auth, async (req, res) => {
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { read: true },
    { new: true }
  );
  if (!n) return res.status(404).json({ message: "Notification not found" });
  res.json({ notification: n });
});

module.exports = router;
