type Icon = {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: "light" | "dark";
};

type ServerIconProps = {
  icons?: Icon[];
  title: string;
  size?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
} as const;

const imgSizeClasses = {
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
} as const;

export function ServerIcon({ icons, title, size = "md" }: ServerIconProps) {
  const lightIcon = icons?.find((i) => i.theme === "light");
  const darkIcon = icons?.find((i) => i.theme === "dark");
  const unthemedIcon = icons?.find((i) => !i.theme);

  const hasThemedIcons = lightIcon || darkIcon;
  const displayIcon = hasThemedIcons ? null : unthemedIcon;

  if (!hasThemedIcons && !displayIcon) {
    const letter = (title[0] ?? "?").toUpperCase();
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-muted font-semibold text-muted-foreground ${sizeClasses[size]}`}
      >
        {letter}
      </span>
    );
  }

  if (displayIcon) {
    return (
      <img
        src={displayIcon.src}
        alt={`${title} logo`}
        className={`shrink-0 rounded-lg object-contain ${imgSizeClasses[size]}`}
      />
    );
  }

  return (
    <>
      {lightIcon && (
        <img
          src={lightIcon.src}
          alt={`${title} logo`}
          className={`shrink-0 rounded-lg object-contain dark:hidden ${imgSizeClasses[size]}`}
        />
      )}
      {darkIcon && (
        <img
          src={darkIcon.src}
          alt={`${title} logo`}
          className={`hidden shrink-0 rounded-lg object-contain dark:block ${imgSizeClasses[size]}`}
        />
      )}
      {!lightIcon && (
        <span
          className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-muted font-semibold text-muted-foreground dark:hidden ${sizeClasses[size]}`}
        >
          {(title[0] ?? "?").toUpperCase()}
        </span>
      )}
      {!darkIcon && (
        <span
          className={`hidden shrink-0 items-center justify-center rounded-lg bg-muted font-semibold text-muted-foreground dark:inline-flex ${sizeClasses[size]}`}
        >
          {(title[0] ?? "?").toUpperCase()}
        </span>
      )}
    </>
  );
}
