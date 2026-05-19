"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserAccess = exports.getAllUsers = exports.uploadFileController = exports.createUser = exports.createAdmin = void 0;
const user_model_1 = require("../models/user.model");
const fileUpload_1 = require("../utils/fileUpload");
const responseHandler_1 = require("../utils/responseHandler");
const createAdmin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const admin = yield user_model_1.UserModel.findOne({ role: "admin" });
        if (admin) {
            return (0, responseHandler_1.errorHandler)(res, 400, "Admin already exist");
        }
        const newAdmin = new user_model_1.UserModel({
            userName: "admin_123",
            role: "admin",
            totalSizeBytes: 0,
        });
        yield newAdmin.save();
        if (!newAdmin) {
            return (0, responseHandler_1.errorHandler)(res, 400, "Admin not created, please try again...");
        }
        return (0, responseHandler_1.successHandler)(res, "Admin created successfully", newAdmin);
    }
    catch (error) {
        return (0, responseHandler_1.errorHandler)(res, 400, error.message);
    }
});
exports.createAdmin = createAdmin;
const createUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userName, totalSizeBytes } = req.body;
        if (!userName) {
            return (0, responseHandler_1.errorHandler)(res, 400, "username is required");
        }
        const admin = yield user_model_1.UserModel.findOne({ userName, role: "user" });
        if (admin) {
            return (0, responseHandler_1.errorHandler)(res, 400, "User already exist");
        }
        const newAdmin = new user_model_1.UserModel({ userName, role: "user", totalSizeBytes });
        yield newAdmin.save();
        if (!newAdmin) {
            return (0, responseHandler_1.errorHandler)(res, 400, "User not created, please try again...");
        }
        return (0, responseHandler_1.successHandler)(res, "User created successfully", newAdmin);
    }
    catch (error) {
        return (0, responseHandler_1.errorHandler)(res, 400, error.message);
    }
});
exports.createUser = createUser;
const uploadFileController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.body;
        const file = req.file;
        if (!userId) {
            return (0, responseHandler_1.errorHandler)(res, 400, "User ID is required");
        }
        const user = yield user_model_1.UserModel.findById(userId).lean();
        if (!user) {
            return (0, responseHandler_1.errorHandler)(res, 400, "User not found");
        }
        if (user.role !== "user") {
            return (0, responseHandler_1.errorHandler)(res, 400, "Only user have access to upload files.");
        }
        if (!file) {
            return (0, responseHandler_1.errorHandler)(res, 400, "File is required");
        }
        const result = yield (0, fileUpload_1.uploadFileService)({ userId, file });
        return (0, responseHandler_1.successHandler)(res, "File uploded successfully", result);
    }
    catch (error) {
        return (0, responseHandler_1.errorHandler)(res, 400, error.message);
    }
});
exports.uploadFileController = uploadFileController;
const getAllUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const users = yield user_model_1.UserModel.find({ role: "user" }, { userName: 1, totalSizeBytes: 1, consumeSizeBytes: 1 })
            .lean()
            .exec();
        if (!users || users.length === 0) {
            return (0, responseHandler_1.errorHandler)(res, 400, "Users not available.");
        }
        const transformedUsers = users.map((user) => {
            const totalBytes = user.totalSizeBytes;
            const consumedBytes = user.consumeSizeBytes;
            const availableBytes = Math.max(0, totalBytes - consumedBytes);
            return {
                _id: user._id.toString(),
                userName: user.userName,
                totalSize: (0, fileUpload_1.convertBytes)(totalBytes),
                consumedSize: (0, fileUpload_1.convertBytes)(consumedBytes),
                availableSize: (0, fileUpload_1.convertBytes)(availableBytes),
            };
        });
        return (0, responseHandler_1.successHandler)(res, "Users fetched successfully", transformedUsers);
    }
    catch (error) {
        console.log("Yash");
        return (0, responseHandler_1.errorHandler)(res, 400, error.message);
    }
});
exports.getAllUsers = getAllUsers;
const updateUserAccess = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { _id } = req.params;
    const { totalSizeBytes } = req.body;
    const user = yield user_model_1.UserModel.findById(_id);
    if (!user) {
        return (0, responseHandler_1.errorHandler)(res, 400, "User not found");
    }
    const updatedUser = yield user_model_1.UserModel.findByIdAndUpdate(_id, { $set: { totalSizeBytes } }, {
        returnDocument: "after",
        runValidators: true,
    });
    if (!updatedUser) {
        return (0, responseHandler_1.errorHandler)(res, 400, "Error while updating the data.");
    }
    return (0, responseHandler_1.successHandler)(res, "User data updated successfully", []);
});
exports.updateUserAccess = updateUserAccess;
