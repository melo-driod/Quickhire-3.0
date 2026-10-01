const router = require("express").Router();
const Service = require("../models/Service");
const { auth, adminOnly } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${Math.round(Math.random()*1e9)}-${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { files: 5, fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image files are allowed"));
    cb(null, true);
  }
});

router.get("/", async (req, res) => {
  try {
    const { q, category, location, provider, includePending } = req.query;
    const filter = { active: true };
    if (req.user?.role !== "admin") filter.approved = true;
    if (category && category !== "all") filter.category = category;
    if (provider) filter.provider = provider;
    if (location) filter.location = { $regex: location, $options: "i" };

    let query = {};
    if (q) {
      query.$or = [
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
        { location: { $regex: q, $options: "i" } }
      ];
    }

    const services = await Service.find({ ...filter, ...query })
      .populate("provider", "name email phone location bio avatar")
      .sort({ createdAt: -1 }).limit(100);

    res.json({ services });
  } catch (error) {
    res.status(500).json({ message: "Could not load services" });
  }
});

router.get("/admin/pending", auth, adminOnly, async (req, res) => {
  const services = await Service.find({ approved: false }).populate("provider", "name email");
  res.json({ services });
});

router.get("/:id", async (req, res) => {
  try {
    const service = await Service.findById(req.params.id).populate("provider", "name email phone location bio avatar");
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json({ service });
  } catch {
    res.status(400).json({ message: "Invalid service ID" });
  }
});

router.post("/", auth, upload.array("images", 5), async (req, res) => {
  try {
    const { title, category, description, price, location, phone, type, icon } = req.body;
    if (!title || !category || !description || price === undefined || !location) {
      return res.status(400).json({ message: "Title, category, description, price and location are required" });
    }

    const images = (req.files || []).map(file => `/uploads/${file.filename}`);
    const service = await Service.create({
      provider: req.user._id, title, category, description, price, location,
      phone: phone || req.user.phone || "", type: type || "service", icon: icon || "🛠️",
      images,
      approved: req.user.role === "admin"
    });

    const populated = await service.populate("provider", "name email phone location");
    res.status(201).json({ service: populated, message: service.approved ? "Service published" : "Service submitted for approval" });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not create service" });
  }
});

router.put("/:id", auth, upload.array("images", 5), async (req, res) => {
  try {
    const service = await Service.findOne({ _id: req.params.id, provider: req.user._id });
    if (!service) return res.status(404).json({ message: "Service not found or not yours" });

    ["title","category","description","price","location","phone","type","icon"].forEach(k => {
      if (req.body[k] !== undefined) service[k] = req.body[k];
    });
    if (req.files?.length) service.images.push(...req.files.map(f => `/uploads/${f.filename}`));
    service.approved = req.user.role === "admin";
    await service.save();
    res.json({ service });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not update service" });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? { _id: req.params.id } : { _id: req.params.id, provider: req.user._id };
    const service = await Service.findOneAndDelete(filter);
    if (!service) return res.status(404).json({ message: "Service not found or not yours" });
    res.json({ message: "Service deleted" });
  } catch {
    res.status(400).json({ message: "Could not delete service" });
  }
});

router.patch("/:id/approve", auth, adminOnly, async (req, res) => {
  const service = await Service.findByIdAndUpdate(req.params.id, { approved: !!req.body.approved }, { new: true })
    .populate("provider", "name email");
  if (!service) return res.status(404).json({ message: "Service not found" });
  res.json({ service });
});

module.exports = router;
