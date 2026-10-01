const router = require("express").Router();
const User = require("../models/User");
const Service = require("../models/Service");
const Hire = require("../models/Hire");
const { auth, adminOnly } = require("../middleware/auth");

router.get("/stats", auth, adminOnly, async (req, res) => {
  const [users, services, pending, hires] = await Promise.all([
    User.countDocuments(),
    Service.countDocuments(),
    Service.countDocuments({ approved: false }),
    Hire.countDocuments()
  ]);
  res.json({ users, services, pending, hires });
});

router.get("/users", auth, adminOnly, async (req, res) => {
  const users = await User.find().select("-password").sort({ createdAt: -1 }).limit(500);
  res.json({ users });
});

router.patch("/users/:id/role", auth, adminOnly, async (req, res) => {
  if (!["user", "admin"].includes(req.body.role)) return res.status(400).json({ message: "Invalid role" });
  const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true }).select("-password");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
});

module.exports = router;
