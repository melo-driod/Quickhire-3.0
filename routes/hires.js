const router = require("express").Router();
const Hire = require("../models/Hire");
const Service = require("../models/Service");
const { auth } = require("../middleware/auth");
const notify = require("../utils/notify");

router.post("/", auth, async (req, res) => {
  try {
    const { serviceId, message } = req.body;
    const service = await Service.findById(serviceId);
    if (!service || !service.active || !service.approved) return res.status(404).json({ message: "Service not found" });
    if (String(service.provider) === String(req.user._id)) return res.status(400).json({ message: "You cannot hire your own service" });

    const hire = await Hire.create({
      service: service._id, customer: req.user._id, provider: service.provider, message: message || ""
    });
    await notify(service.provider, "hire", "New hire request", `${req.user.name} wants to hire you for ${service.title}`, { hireId: hire._id });
    const populated = await hire.populate([
      { path: "service", select: "title price location" },
      { path: "customer", select: "name email phone" },
      { path: "provider", select: "name email phone" }
    ]);
    res.status(201).json({ hire: populated });
  } catch {
    res.status(500).json({ message: "Could not create hire request" });
  }
});

router.get("/mine", auth, async (req, res) => {
  try {
    const asCustomer = await Hire.find({ customer: req.user._id }).populate("service", "title price location").populate("provider", "name email phone").sort({ createdAt: -1 });
    const asProvider = await Hire.find({ provider: req.user._id }).populate("service", "title price location").populate("customer", "name email phone").sort({ createdAt: -1 });
    res.json({ asCustomer, asProvider });
  } catch {
    res.status(500).json({ message: "Could not load hire requests" });
  }
});

router.patch("/:id/status", auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["accepted", "completed", "cancelled"].includes(status)) return res.status(400).json({ message: "Invalid status" });
    const hire = await Hire.findOne({ _id: req.params.id, $or: [{ provider: req.user._id }, { customer: req.user._id }] });
    if (!hire) return res.status(404).json({ message: "Hire request not found" });

    if (status === "accepted" && String(hire.provider) !== String(req.user._id)) return res.status(403).json({ message: "Only the provider can accept" });
    if (status === "completed" && String(hire.customer) !== String(req.user._id)) return res.status(403).json({ message: "Only the customer can mark a job completed" });

    hire.status = status;
    await hire.save();

    const target = String(hire.provider) === String(req.user._id) ? hire.customer : hire.provider;
    await notify(target, "hire_status", "Hire request updated", `Your hire request is now ${status}`, { hireId: hire._id });

    res.json({ hire });
  } catch {
    res.status(400).json({ message: "Could not update request" });
  }
});

module.exports = router;
