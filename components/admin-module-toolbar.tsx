"use client";
import type { ReactNode } from "react";
import { Search } from "lucide-react";
export function AdminModuleToolbar({ searchValue, onSearchChange, searchPlaceholder, quickActions, children }: { searchValue: string; onSearchChange: (value: string) => void; searchPlaceholder: string; quickActions?: ReactNode; children: ReactNode }) {
  return <div className="admin-module-body"><div className="admin-module-toolbar"><label><Search size={16} /><input aria-label="Search module records" placeholder={searchPlaceholder} value={searchValue} onChange={e => onSearchChange(e.target.value)} /></label><div>{quickActions}</div></div>{children}</div>;
}
