import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vinyl·Engine, print a playable record",
  description: "Turns an audio file into G-code for a playable record you print on an FDM printer. Everything runs in your browser.",
  openGraph: {
    title: "Vinyl·Engine",
    description: "Print a playable vinyl record on an ordinary 3D printer.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
