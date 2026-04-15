import express from "express";
import cors from "cors";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "backend" });
});

app.get("/api/hello", (_req, res) => {
  res.status(200).json({
    ok: true,
    message: "Hello from backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/meta", (_req, res) => {
  res.status(200).json({
    project: process.env.APP_NAME || "local-deployment-starter",
    nodeEnv: process.env.NODE_ENV || "development",
    port,
  });
});

app.listen(port, "0.0.0.0", () => {
  // Keep startup logs simple and grep-friendly.
  console.log(`backend listening on ${port}`);
});
