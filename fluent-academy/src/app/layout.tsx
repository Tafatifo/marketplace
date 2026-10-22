import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Fluent Academy — Speak With Confidence",
    template: "%s · Fluent Academy",
  },
  description:
    "A structured, AI-assisted language academy for English, French, Spanish and German — personalised lessons, conversation practice, speaking feedback and graded reading from A1 to B2.",
  applicationName: "Fluent Academy",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "Fluent Academy — Speak With Confidence",
    description: "Structured lessons, realistic conversation practice and feedback that adapts to your mistakes.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1f3a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-navy-900 focus:shadow-lg"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
