import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noor · Your dental voice concierge",
  description: "A calmer way to arrange your dental care. Voice appointment demo for a Dubai dental clinic.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
