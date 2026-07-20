import { Router } from "express";
import { postGenerateTryOn } from "../controllers/tryOnController.js";

const router = Router();

router.post("/generate", postGenerateTryOn);

export default router;
