export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): never {
  throw new ApiError(400, message, details);
}

export function notFound(message = "Not found"): never {
  throw new ApiError(404, message);
}

export function upstream(message: string): never {
  throw new ApiError(502, message);
}
