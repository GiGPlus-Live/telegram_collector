export class HandleERROR extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
    }
}

export function catchError(error, req, res, next) {
    if (res.headersSent) return next(error);
    const status = error.statusCode ?? error.status;
    if (Number.isInteger(status) && status >= 400 && status < 500) {
        return res.status(status).json({ success: false, message: error.message });
    }
    if (error.code === 11000) {
        return res.status(409).json({ success: false, message: "This record already exists" });
    }
    if (error.name === "ValidationError" || error.name === "CastError") {
        return res.status(400).json({ success: false, message: error.message });
    }
    console.error("Unhandled HTTP error:", error.name);
    return res.status(500).json({ success: false, message: "Internal server error" });
}
