import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import { Shell } from "@/components/Shell";
import { DemoProvider } from "@/demo/store";
import "./globals.css";

// One family; its width axis does the typographic work (expanded headline, condensed plates).
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
// Inter: the Quotes workspace and app shell (design DNA). Archivo stays for the other pages' display type.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Quote follow-up demo",
  description: "Synthetic demo of a managed repair-quote follow-up service for independent UK garages.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${archivo.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <DemoProvider>
          <Shell>{children}</Shell>
        </DemoProvider>
      </body>
    </html>
  );
}
