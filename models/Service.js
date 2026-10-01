const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    provider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    price: { type: Number, required: true, min: 0 },
    location: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 30 },
    type: { type: String, enum: ["service", "product"], default: "service" },
    images: [{ type: String }],
    icon: { type: String, default: "🛠️" },
    active: { type: Boolean, default: true },
    approved: { type: Boolean, default: true }
  },
  { timestamps: true }
);

serviceSchema.index({ title: "text", description: "text", category: "text", location: "text" });

module.exports = mongoose.model("Service", serviceSchema);
