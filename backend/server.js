require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const documentRoutes = require("./routes/documentRoutes");
const masterRoutes = require("./routes/masterRoutes");
const matchRoutes = require("./routes/matchRoutes");
const summaryRoutes = require("./routes/summaryRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

app.use("/auth", authRoutes);
app.use("/documents", documentRoutes);
app.use("/masters", masterRoutes);
app.use("/match", matchRoutes);
app.use("/summary", summaryRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Centralised error handler — never leak stack traces or secrets, even on 500s.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err && err.message && err.message.startsWith("Unsupported file type")) {
    return res.status(400).json({ error: err.message });
  }

  console.error(err); // full detail stays server-side only

  const status = err.status || 500;
  const message = status === 500 ? "Internal server error" : err.message || "Request failed";
  return res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Three-Way Match Engine listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
}

start();

module.exports = app;
