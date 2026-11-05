import assert from "node:assert/strict";
import { contactNumberToE164, contactPhoneCountries, isSupportedContactDialCode } from "../lib/contact-phone-countries";

assert.equal(contactNumberToE164("91", "98765 43210"), "+919876543210");
assert.equal(contactNumberToE164("44", "020 7946 0958"), "+442079460958", "National trunk zero is removed.");
assert.equal(contactNumberToE164("91", "+91 (98765) 43210"), "+919876543210", "Pasted international numbers are not double-prefixed.");
assert.equal(contactNumberToE164("44", "0044 20 7946 0958"), "+442079460958", "00-prefixed international numbers are normalized.");
assert.throws(() => contactNumberToE164("91", "+44 20 7946 0958"), /valid phone number/, "Mismatched explicit country prefixes are rejected.");
assert.equal(isSupportedContactDialCode("91"), true);
assert.equal(isSupportedContactDialCode("999"), false);
assert.throws(() => contactNumberToE164("91", "123"), /valid phone number/);
assert.throws(() => contactNumberToE164("91", "+91 98765 ext 2"), /valid phone number/);
assert.throws(() => contactNumberToE164("91", `9${"8".repeat(20)}`), /valid phone number/);
assert.ok(contactPhoneCountries.every(country => country.flag && country.name && /^\d{1,3}$/.test(country.dialCode)));
assert.equal(new Set(contactPhoneCountries.map(country => country.code)).size, contactPhoneCountries.length);

console.log("Contact number validation covers country codes, flags, E.164 normalization, trunk prefixes, and invalid input.");
