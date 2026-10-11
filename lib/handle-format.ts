export function normalizeHandle(value: string) {
    const tag = value.trim().toLowerCase();
    if (!/^@[a-z0-9][a-z0-9_.]{2,23}#[0-9]{4}$/.test(tag))
        throw new Error("Use 3-24 letters, numbers, dots or underscores, followed by # and four digits.");
    return tag;
}
