import { describe, expect, it } from "vitest";

import { looksLikeSecret } from "./secret-hint";

describe("looksLikeSecret", () => {
  it("sees a password or a token written out next to its word", () => {
    for (const text of [
      "мой пароль: Zx9!kq27, зайди и проверь",
      "password = hunter2hunter2",
      "Токен — abc123def456ghi",
      "api key: 8f3a91c2d7e4",
      "ключ API: a1b2c3d4e5",
    ]) {
      expect(looksLikeSecret(text)).toBe(true);
    }
  });

  it("sees the keys of the common services by their shape", () => {
    for (const text of [
      "вот ключ sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz012345",
      "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      "AKIAIOSFODNN7EXAMPLE",
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      "-----BEGIN RSA PRIVATE KEY-----",
    ]) {
      expect(looksLikeSecret(text)).toBe(true);
    }
  });

  it("leaves ordinary talk about passwords and tokens alone", () => {
    for (const text of [
      "Как сменить пароль в 1С?",
      "пароль: неправильный, что делать",
      "Не помню пароль от почты",
      "token — это единица текста для модели",
      "Сверь суммы по счетам за сентябрь с выгрузкой из 1С.",
      "",
    ]) {
      expect(looksLikeSecret(text)).toBe(false);
    }
  });
});
