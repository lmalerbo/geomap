import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { mapasRouter } from "./routes/mapas.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use(authRouter);
app.use(mapasRouter);
