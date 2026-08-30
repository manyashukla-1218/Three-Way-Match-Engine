const mongoose = require("mongoose");
const SkuMaster = require("../models/SkuMaster");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/** POST /masters/sku */
async function create(req, res) {
  const { skuErpCode, name, eanCode, hsnCode, uom, agreedRate, mrp, priceTolerance } = req.body;

  if (!skuErpCode || typeof skuErpCode !== "string" || !skuErpCode.trim()) {
    return res.status(400).json({ error: "skuErpCode is required" });
  }

  try {
    const sku = await SkuMaster.create({
      skuErpCode: skuErpCode.trim(),
      name,
      eanCode,
      hsnCode,
      uom,
      agreedRate,
      mrp,
      priceTolerance,
    });
    return res.status(201).json(sku);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: `A SKU with skuErpCode "${skuErpCode}" already exists` });
    }
    return res.status(400).json({ error: "Failed to create SKU master", details: err.message });
  }
}

/** GET /masters/sku */
async function list(req, res) {
  try {
    const skus = await SkuMaster.find({}).sort({ createdAt: -1 });
    return res.status(200).json(skus);
  } catch (err) {
    return res.status(500).json({ error: "Failed to list SKU masters" });
  }
}

/** GET /masters/sku/:id */
async function getOne(req, res) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid SKU id" });
  }
  const sku = await SkuMaster.findById(req.params.id);
  if (!sku) return res.status(404).json({ error: "SKU master not found" });
  return res.status(200).json(sku);
}

/** PATCH /masters/sku/:id */
async function update(req, res) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid SKU id" });
  }

  const allowedFields = ["skuErpCode", "name", "eanCode", "hsnCode", "uom", "agreedRate", "mrp", "priceTolerance"];
  const updates = {};
  for (const field of allowedFields) {
    if (field in req.body) updates[field] = req.body[field];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No valid fields provided to update" });
  }

  try {
    const sku = await SkuMaster.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!sku) return res.status(404).json({ error: "SKU master not found" });
    return res.status(200).json(sku);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Another SKU with that skuErpCode already exists" });
    }
    return res.status(400).json({ error: "Failed to update SKU master", details: err.message });
  }
}

/** DELETE /masters/sku/:id */
async function remove(req, res) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid SKU id" });
  }
  const sku = await SkuMaster.findByIdAndDelete(req.params.id);
  if (!sku) return res.status(404).json({ error: "SKU master not found" });
  return res.status(200).json({ message: "SKU master deleted", id: req.params.id });
}

module.exports = { create, list, getOne, update, remove };
