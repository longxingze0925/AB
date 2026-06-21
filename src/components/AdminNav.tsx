"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/admin", label: "数据总览" },
  { href: "/admin/routes", label: "线路管理" },
  { href: "/admin/promos", label: "推广码" },
  { href: "/admin/visits", label: "访问记录" },
  { href: "/admin/cloak", label: "分流管理" },
  { href: "/admin/settings", label: "旧设置" },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav">
      {navItems.map((item) => {
        const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "admin-nav-link admin-nav-link-active" : "admin-nav-link"}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
