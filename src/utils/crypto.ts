import CryptoJS from "crypto-js";
import md5 from "js-md5";

const md5Hex = md5 as unknown as (s: string) => string;
const key = CryptoJS.enc.Utf8.parse(md5Hex(import.meta.env.VITE_MD5_KEY));
const iv = CryptoJS.enc.Utf8.parse(md5Hex(import.meta.env.VITE_MD5_IV_KEY));

/** 与 Web 端 login-form 一致：AES-CBC 后转大写 hex，后端存的是该密文的 bcrypt */
export function encryptPassword(pwd: string): string {
  const srcs = CryptoJS.enc.Utf8.parse(pwd);
  const encrypted = CryptoJS.AES.encrypt(srcs, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return encrypted.ciphertext.toString().toUpperCase();
}

// ponytail: self-check — 与 Web crypto.ts 同算法，输出须为大写 hex
if (import.meta.env.DEV) {
  const sample = encryptPassword("test");
  if (!/^[0-9A-F]+$/.test(sample)) {
    console.warn("[crypto] encryptPassword output unexpected");
  }
}
