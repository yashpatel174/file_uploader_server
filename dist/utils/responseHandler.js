"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.successHandler = exports.errorHandler = void 0;
const errorHandler = (res, statusCode, message) => {
    res.status(statusCode).send({
        success: false,
        message,
    });
};
exports.errorHandler = errorHandler;
const successHandler = (res, message, result) => {
    res.status(200).send({
        success: true,
        message,
        result,
    });
};
exports.successHandler = successHandler;
