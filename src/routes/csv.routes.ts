// import express from "express";
import { Router } from "express";
import { upload } from "../middleware/multer";
import {
  createAdmin,
  updateUserAccess,
  createUser,
  uploadFileController,
  getAllUsers,
} from "../controller/fileUploader";
const router = Router();

router.post("/admin/create", createAdmin);
router.post("/user/create", createUser);
router.get("/users", getAllUsers);
router.patch("/users/:_id", updateUserAccess);
router.post("/upload", upload.single("file"), uploadFileController);

export default router;
