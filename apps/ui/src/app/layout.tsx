import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { cn } from "@/lib/utils";
import { cookies } from "next/headers";
import { themeStyles, type ThemeStyle } from "@asmblyr-collaborative/contracts";
import { AppearanceProvider } from "@/components/settings/appearance-provider";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Asmblyr",
  description: "Asmblyr administration",
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
  const locale = jar.get("asmblyr-locale")?.value === "en" ? "en" : "ru";
  return (
    <html
      lang={locale}
      data-style={style}
      className={cn("font-sans", geist.variable)}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <AppearanceProvider
            initialStyle={style}
            initialLocale={locale}
          >
            {children}
          </AppearanceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
