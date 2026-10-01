const router = require("express").Router();
const Payment = require("../models/Payment");
const Hire = require("../models/Hire");
const { auth } = require("../middleware/auth");

router.get("/mine", auth, async (req, res) => {
  const [payments, hires] = await Promise.all([
    Payment.find({ customer: req.user._id })
      .populate("service", "title price images")
      .populate("provider", "name phone")
      .sort({ createdAt: -1 }),
    Hire.find({ customer: req.user._id })
      .populate("service", "title price images")
      .populate("provider", "name phone")
      .sort({ createdAt: -1 })
  ]);
  res.json({ payments, hires });
});

router.get("/provider", auth, async (req, res) => {
  const [payments, hires] = await Promise.all([
    Payment.find({ provider: req.user._id })
      .populate("service", "title price images")
      .populate("customer", "name phone")
      .sort({ createdAt: -1 }),
    Hire.find({ provider: req.user._id })
      .populate("service", "title price images")
      .populate("customer", "name phone")
      .sort({ createdAt: -1 })
  ]);
  res.json({ payments, hires });
});

module.exports = router;
