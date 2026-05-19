"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ quiet: true });
exports.ENV = {
    PORT: process.env.PORT || 3010,
    NODE_ENV: process.env.NODE_ENV || "development",
    MONGO_URI: process.env.DATABASE,
};
