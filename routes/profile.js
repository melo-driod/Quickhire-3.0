const router = require("express").Router();
const User = require("../models/User");
const Service = require("../models/Service");
const { auth } = require("../middleware/auth");

router.get("/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -email");
    if (!user) return res.status(404).json({ message: "Provider not found" });

    const services = await Service.find({
      provider: user._id, active: true, approved: true
    }).sort({ createdAt: -1 });

    res.json({ provider: user, services });
  } catch {
    res.status(400).json({ message: "Invalid provider ID" });
  }
});

router.put("/me", auth, async (req, res) => {
  try {
    const allowed = ["name", "phone", "location", "bio", "avatar"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) req.user[key] = req.body[key];
    }
    await req.user.save();
    const user = req.user.toObject();
    delete user.password;
    res.json({ user });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not update profile" });
  }
});

module.exports = router;
