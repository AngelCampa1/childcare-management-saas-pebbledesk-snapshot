import { HTTPException } from "hono/http-exception";

export function unauthorized(msg = "Unauthorized"): never {
	throw new HTTPException(401, { message: msg });
}

export function forbidden(msg = "Forbidden"): never {
	throw new HTTPException(403, { message: msg });
}

export function notFound(msg = "Not found"): never {
	throw new HTTPException(404, { message: msg });
}

export function badRequest(msg = "Bad request"): never {
	throw new HTTPException(400, { message: msg });
}

export function conflict(msg = "Conflict"): never {
	throw new HTTPException(409, { message: msg });
}
