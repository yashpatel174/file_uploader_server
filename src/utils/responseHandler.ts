import { Response } from "express";

export const errorHandler = (
  res: Response,
  statusCode: number,
  message: string,
) => {
  res.status(statusCode).send({
    success: false,
    message,
  });
};

export const successHandler = (res: Response, message: string, result: any) => {
  res.status(200).send({
    success: true,
    message,
    result,
  });
};
