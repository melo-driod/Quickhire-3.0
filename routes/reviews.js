const router = require("express").Router();
const Review = require("../models/Review");
const Service = require("../models/Service");
const Hire = require("../models/Hire");
const { auth } = require("../middleware/auth");

router.get("/:serviceId", async (req, res) => {
  const reviews = await Review.find({ service: req.params.serviceId })
    .populate("reviewer", "name avatar")
    .sort({ createdAt: -1 });
  const stats = await Review.aggregate([
    { $match: { service: require("mongoose").Types.ObjectId.createFromHexString(req.params.serviceId) } },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } }
  ]);
  res.json({ reviews, stats: stats[0] || { average: 0, count: 0 } });
});

router.post("/", auth, async (req, res) => {
  try {
    const { serviceId, rating, comment } = req.body;
    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ message: "Service not found" });
    if (String(service.provider) === String(req.user._id)) {
      return res.status(400).json({ message: "You cannot review your own service" });
    }

    const completed = await Hire.findOne({
      service: serviceId,
      customer: req.user._id,
      status: "completed"
    });
    if (!completed) {
      return res.status(403).json({ message: "Complete a hire before reviewing this service" });
    }

    const existing = await Review.findOne({ service: serviceId, reviewer: req.user._id });
    if (existing) return res.status(409).json({ message: "You already reviewed this service" });

    const review = await Review.create({
      service: serviceId,
      reviewer: req.user._id,
      provider: service.provider,
      rating,
      comment: comment || ""
    });

    res.status(201).json({ review });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not create review" });
  }
});

module.exports = router;
