function resolveRandomByteValues(): Uint8Array {
  const randomValues = new Uint8Array(16);

  if (typeof globalThis.crypto != "undefined" && typeof globalThis.crypto.getRandomValues == "function") {
    return globalThis.crypto.getRandomValues(randomValues);
  }

  for (let randomValueIndex = 0; randomValueIndex < randomValues.length; randomValueIndex += 1) {
    randomValues[randomValueIndex] = Math.floor(Math.random() * 256);
  }

  return randomValues;
}

export function resolveRandomUuid(): string {
  if (typeof globalThis.crypto != "undefined" && typeof globalThis.crypto.randomUUID == "function") {
    return globalThis.crypto.randomUUID();
  }

  const randomValues = resolveRandomByteValues();
  randomValues[6] = (randomValues[6] & 0x0f) | 0x40;
  randomValues[8] = (randomValues[8] & 0x3f) | 0x80;

  const randomValueHex = Array.from(randomValues, (value) => value.toString(16).padStart(2, "0"));

  return [
    randomValueHex.slice(0, 4).join(""),
    randomValueHex.slice(4, 6).join(""),
    randomValueHex.slice(6, 8).join(""),
    randomValueHex.slice(8, 10).join(""),
    randomValueHex.slice(10, 16).join(""),
  ].join("-");
}
