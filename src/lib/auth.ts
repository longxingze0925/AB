import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

const COOKIE = "admin_session";

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev_secret_change_me");
}

// 校验登录账号密码(明文比对 .env;密码也支持 bcrypt 哈希)
export async function verifyLogin(user: string, password: string): Promise<boolean> {
  const envUser = process.env.ADMIN_USER || "admin";
  const envPass = process.env.ADMIN_PASSWORD || "";
  if (user !== envUser) return false;
  if (envPass.startsWith("$2")) {
    // bcrypt 哈希
    return bcrypt.compareSync(password, envPass);
  }
  return password === envPass;
}

// 签发会话 cookie
export async function createSession(user: string) {
  const token = await new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function destroySession() {
  cookies().delete(COOKIE);
}

// 读取当前登录用户;未登录返回 null
export async function getSession(): Promise<string | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return (payload.user as string) || null;
  } catch {
    return null;
  }
}
