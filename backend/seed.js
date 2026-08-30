require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const SkuMaster = require("./models/SkuMaster");

// skuErpCode = GRN "SKU Code" column, eanCode = Invoice "Item Code" column
// for the SAME product (verified against the actual PO/GRN/Invoice PDFs for
// CI4PO05788), so masterResolution.js can resolve items from both sources.
const sampleSkus = [
  { skuErpCode: "11423", name: "PSM Cheesy Spicy Veg Momos 24Pcs", eanCode: "FG-P-F-0503", hsnCode: "19022010", uom: "PKT", agreedRate: 220.76, mrp: 305, priceTolerance: 0.05 },
  { skuErpCode: "11797", name: "Meatigo Hot Wings 250g", eanCode: "FG-M-F-1703", hsnCode: "16023200", uom: "PKT", agreedRate: 126.67, mrp: 175, priceTolerance: 0.05 },
  { skuErpCode: "18003", name: "Meatigo Chicken Curry Cut Skinless Frozen 450g", eanCode: "FG-M-F-0620", hsnCode: "02071400", uom: "PKT", agreedRate: 141.14, mrp: 195, priceTolerance: 0.05 },
  { skuErpCode: "18004", name: "Meatigo Chicken Boneless Breast Frozen 450g", eanCode: "FG-M-F-0619", hsnCode: "02071400", uom: "PKT", agreedRate: 199.05, mrp: 275, priceTolerance: 0.05 },
  { skuErpCode: "205950", name: "PSM Frozen Pork Pepperoni Salami 100g", eanCode: "FG-P-F-0237", hsnCode: "16010000", uom: "PKT", agreedRate: 133.91, mrp: 185, priceTolerance: 0.05 },
  { skuErpCode: "253430", name: "PSM Pork Plain Salami 200g", eanCode: "FG-P-F-0249", hsnCode: "16010000", uom: "PKT", agreedRate: 188.19, mrp: 260, priceTolerance: 0.05 },
  { skuErpCode: "33387", name: "PSM Frozen Chicken Chilli Salami 200g", eanCode: "FG-P-F-0234", hsnCode: "16010000", uom: "PKT", agreedRate: 126.67, mrp: 175, priceTolerance: 0.05 },
  { skuErpCode: "33390", name: "PSM Chicken Seekh Kebab 500g", eanCode: "FG-P-F-0413", hsnCode: "16010000", uom: "PKT", agreedRate: 228.00, mrp: 315, priceTolerance: 0.05 },
  { skuErpCode: "398656", name: "Meatigo Chicken Drumsticks 450g", eanCode: "FG-M-F-0602", hsnCode: "02071400", uom: "PKT", agreedRate: 188.19, mrp: 260, priceTolerance: 0.05 },
  { skuErpCode: "414867", name: "PSM Chinese Veg Spring Rolls 240g", eanCode: "FG-P-F-1707", hsnCode: "20049000", uom: "PKT", agreedRate: 119.43, mrp: 165, priceTolerance: 0.05 },
  { skuErpCode: "432518", name: "Meatigo Chicken Kheema (Mince) 450g", eanCode: "FG-M-F-0622", hsnCode: "02071400", uom: "PKT", agreedRate: 199.05, mrp: 275, priceTolerance: 0.05 },
  { skuErpCode: "4459", name: "PSM Chicken Momos 24Pcs", eanCode: "FG-P-F-0505", hsnCode: "19022010", uom: "PKT", agreedRate: 220.76, mrp: 305, priceTolerance: 0.05 },
  { skuErpCode: "4460", name: "PSM Spicy Chicken Momos 24Pcs", eanCode: "FG-P-F-0512", hsnCode: "19022010", uom: "PKT", agreedRate: 220.76, mrp: 305, priceTolerance: 0.05 },
  { skuErpCode: "4461", name: "PSM Vegetable & Paneer Momos 24Pcs", eanCode: "FG-P-F-0514", hsnCode: "19022010", uom: "PKT", agreedRate: 202.67, mrp: 280, priceTolerance: 0.05 },
  { skuErpCode: "453259", name: "PSM Chicken Cheese & Onion Sausage 250g", eanCode: "FG-P-F-0335", hsnCode: "16010000", uom: "PKT", agreedRate: 144.76, mrp: 200, priceTolerance: 0.05 },
  { skuErpCode: "4694", name: "PSM Chicken Momos 10Pcs", eanCode: "FG-P-F-0504", hsnCode: "19022010", uom: "PKT", agreedRate: 133.90, mrp: 185, priceTolerance: 0.05 },
  { skuErpCode: "4697", name: "PSM Vegetable & Paneer Momos 10Pcs", eanCode: "FG-P-F-0513", hsnCode: "19022010", uom: "PKT", agreedRate: 112.19, mrp: 155, priceTolerance: 0.05 },
  { skuErpCode: "469735", name: "Meatigo RTC Everyday Chicken Breast 150g", eanCode: "FG-M-F-1728", hsnCode: "16021000", uom: "PKT", agreedRate: 119.43, mrp: 165, priceTolerance: 0.05 },
  { skuErpCode: "4699", name: "PSM Frozen Pork Sausage 250g", eanCode: "FG-P-F-0323", hsnCode: "16010000", uom: "PKT", agreedRate: 170.10, mrp: 235, priceTolerance: 0.05 },
  { skuErpCode: "4700", name: "PSM Frozen Pork Ham 200g", eanCode: "FG-P-F-0236", hsnCode: "16010000", uom: "PKT", agreedRate: 177.33, mrp: 245, priceTolerance: 0.05 },
  { skuErpCode: "470663", name: "PSM Whole Wheat Momos - Veg & Paneer 330g", eanCode: "FG-P-F-0580", hsnCode: "19022010", uom: "PKT", agreedRate: 162.86, mrp: 225, priceTolerance: 0.05 },
  { skuErpCode: "49168", name: "PSM Peri Peri Veg Momos 15Pcs", eanCode: "FG-P-F-0527", hsnCode: "19022010", uom: "PKT", agreedRate: 88.67, mrp: 245, priceTolerance: 0.05 },
  { skuErpCode: "498695", name: "PSM Frozen Chicken Salami 200g", eanCode: "FG-P-F-0247", hsnCode: "16010000", uom: "PKT", agreedRate: 137.52, mrp: 190, priceTolerance: 0.05 },
  { skuErpCode: "507809", name: "PSM Pizza Minis - Chicken Tikka 180g", eanCode: "FG-P-F-1911", hsnCode: "19059090", uom: "PKT", agreedRate: 115.09, mrp: 159, priceTolerance: 0.05 },
  { skuErpCode: "598770", name: "PSM Frozen Pork Breakfast Bacon 150g", eanCode: "FG-P-F-0102", hsnCode: "16010000", uom: "PKT", agreedRate: 152.00, mrp: 210, priceTolerance: 0.05 },
  { skuErpCode: "6664", name: "PSM Frozen Chicken Sausage 250g", eanCode: "FG-P-F-0321", hsnCode: "16010000", uom: "PKT", agreedRate: 130.29, mrp: 180, priceTolerance: 0.05 },
  { skuErpCode: "730016", name: "PSM Whole Wheat Momos - Chicken 330g", eanCode: "FG-P-F-0581", hsnCode: "19022010", uom: "PKT", agreedRate: 170.10, mrp: 235, priceTolerance: 0.05 },
  { skuErpCode: "750414", name: "PSM FS Chef Momo - Chicken 1kg", eanCode: "FG-P-F-0501", hsnCode: "19022010", uom: "KG", agreedRate: 247.62, mrp: 650, priceTolerance: 0.05 },
  { skuErpCode: "755774", name: "PSM Cheese & Chicken Momos 540g", eanCode: "FG-P-F-0564", hsnCode: "19022010", uom: "PKT", agreedRate: 238.86, mrp: 330, priceTolerance: 0.05 },
  { skuErpCode: "790919", name: "Meatigo Everyday Fish Fillet 200g", eanCode: "FG-M-F-1729", hsnCode: "16042000", uom: "PKT", agreedRate: 188.19, mrp: 260, priceTolerance: 0.05 },
  { skuErpCode: "81521", name: "Peri Peri Chicken Momos 250g", eanCode: "FG-P-F-0542", hsnCode: "19022010", uom: "PKT", agreedRate: 72.02, mrp: 199, priceTolerance: 0.05 },
];

async function seed() {
  await connectDB();
  for (const sku of sampleSkus) {
    await SkuMaster.findOneAndUpdate(
      { skuErpCode: sku.skuErpCode },
      sku,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log(`Seeded ${sampleSkus.length} SkuMaster records (upserted by skuErpCode).`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});