import crypto from "crypto";
export function randomToken(bytes = 48) {
    return crypto.randomBytes(bytes).toString("hex");
}
