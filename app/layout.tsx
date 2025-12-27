import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Royco Tranching Simulator",
  description: "Calculate senior and junior tranche yields using the RDM model",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
