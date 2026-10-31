import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";
import { cn } from "@/lib/utils";
import { cookies } from "next/headers";
import { themeStyles, type ThemeStyle } from "@asmblyr-collaborative/contracts";
import { AppearanceProvider } from "@/components/settings/appearance-provider";
import { Toaster } from "@/components/ui/toast";

const geist = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
  adjustFontFallback: false,
  fallback: [
    "Segoe UI Variable Text",
    "Segoe UI",
    "-apple-system",
    "BlinkMacSystemFont",
    "Roboto",
    "Helvetica Neue",
    "sans-serif",
  ],
});

export const metadata: Metadata = {
  title: "Asmblyr",
  description: "Asmblyr Collaborative",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const savedStyle = jar.get("asmblyr-style")?.value;
  const style: ThemeStyle = themeStyles.includes(savedStyle as ThemeStyle)
    ? (savedStyle as ThemeStyle)
    : "neutral";
  const savedTheme = jar.get("asmblyr-theme")?.value;
  const defaultTheme =
    savedTheme === "light" || savedTheme === "dark" || savedTheme === "system"
      ? savedTheme
      : "system";
  const locale = jar.get("asmblyr-locale")?.value === "en" ? "en" : "ru";
  return (
    <html
      lang={locale}
      data-style={style}
      className={cn("font-sans antialiased", geist.variable)}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme={defaultTheme}
          enableSystem
          disableTransitionOnChange
        >
          <AppearanceProvider
            initialStyle={style}
            initialLocale={locale}
          >
            {children}
            <Toaster />
          </AppearanceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
