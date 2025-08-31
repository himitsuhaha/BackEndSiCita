import crypto from "crypto";
const apiKey =
  "f487f8ef99374f07ff99ae64bfc30367f5398d75f7ddfc551fbfd4173ef130a0";
const hash = crypto.createHash("sha256").update(apiKey).digest("hex");
console.log(`API Key: ${apiKey}`);
console.log(`SHA256 Hash: ${hash}`);
