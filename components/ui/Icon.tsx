import { iconMap } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface IconProps {
  /** Material Icons Outlined name (e.g., "settings", "check_circle") */
  name: string;
  className?: string;
  size?: number;
  "aria-hidden"?: boolean | "true" | "false";
}

/**
 * Bridge component: Material Icons → Lucide React
 *
 * Usage:
 *   <Icon name="settings" className="w-5 h-5" />
 *
 * Falls back to <span className="material-icons-outlined"> if no mapping exists.
 */
export function Icon({ name, className, size, "aria-hidden": ariaHidden = true, ...props }: IconProps) {
  const LucideIcon = iconMap[name];

  if (LucideIcon) {
    return (
      <LucideIcon
        className={cn(className)}
        size={size}
        aria-hidden={ariaHidden === true || ariaHidden === "true" ? true : false}
      />
    );
  }

  // Fallback: render as Material Icons Outlined (CDN)
  return (
    <span
      className={cn("material-icons-outlined", className)}
      aria-hidden={ariaHidden === true || ariaHidden === "true" ? true : undefined}
    >
      {name}
    </span>
  );
}

export default Icon;
