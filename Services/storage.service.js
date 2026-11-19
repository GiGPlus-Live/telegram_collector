import fs from "fs/promises";
import path from "path";

function pad(n) {
    return String(n).padStart(2, "0");
}

// ⏰ تبدیل Date به ساعت تهران
function toTehranDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Tehran",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(date);

    const map = {};
    for (const p of parts) {
        if (p.type !== "literal") map[p.type] = p.value;
    }

    return {
        yyyy: map.year,
        mm: map.month,
        dd: map.day,
        hh: map.hour,
        mi: map.minute,
        ss: map.second,
    };
}

export function getParts(date = new Date()) {
    const { yyyy, mm, dd, hh, mi, ss } = toTehranDate(date);

    return {
        day: `${yyyy}-${mm}-${dd}`,
        hour: hh,                 // فولدر ساعت (00 تا 23) به وقت تهران
        time: `${hh}-${mi}-${ss}` // اسم فایل
    };
}

export async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}

export async function saveText(filePath, content) {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, "utf8");
}
