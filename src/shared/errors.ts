// Custom error class for domain-level failures. The central error
// middleware converts these into the standard `{status:0,...}` envelope.

export class AppError extends Error {
  httpStatus: number;
  constructor(message: string, httpStatus = 400) {
    super(message);
    this.name = 'AppError';
    this.httpStatus = httpStatus;
  }
}

export const errors = {
  unauthorized: () => new AppError('unauthorized', 401),
  forbidden: () => new AppError('forbidden', 403),
  notFound: (what: string) => new AppError(`${what}_not_found`, 404),
  badRequest: (msg: string) => new AppError(msg, 400),
  invalidModuledata: () => new AppError('invalid_moduledata', 401),
  invalidBodyhash: () => new AppError('invalid_bodyhash', 401),
  unitIdRequired: () => new AppError('unit_id_required', 400),
};
