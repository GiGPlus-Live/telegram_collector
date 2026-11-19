export function getTelegramCredentials(apiId = process.env.API_ID, apiHash = process.env.API_HASH) {
    return validateTelegramCredentials(apiId, apiHash);
}

export function validateTelegramCredentials(apiId, apiHash) {
    const value = typeof apiId === "string" || typeof apiId === "number" ? String(apiId).trim() : "";
    const hash = typeof apiHash === "string" ? apiHash.trim() : "";
    const id = Number(value);
    if (!value) {
        throw new Error("API ID برنامهٔ تلگرام را وارد کنید.");
    }
    if (!/^[0-9]+$/.test(value) || id <= 0 || id > 2147483647) {
        throw new Error("API ID باید یک عدد صحیح مثبت و معتبر باشد.");
    }
    if (!hash) {
        throw new Error("API Hash برنامهٔ تلگرام را وارد کنید.");
    }
    if (!/^[a-f0-9]{32}$/i.test(hash)) {
        throw new Error("API Hash باید ۳۲ نویسه از اعداد ۰ تا ۹ و حروف A تا F باشد.");
    }
    return { apiId: id, apiHash: hash };
}
