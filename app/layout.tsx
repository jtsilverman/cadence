import type { Metadata } from "next";
import { Familjen_Grotesk } from "next/font/google";
import "./tokens.css";

const familjen = Familjen_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-familjen",
});

export const metadata: Metadata = {
  title: "Cadence",
  description: "Your meals, groceries, pantry, and food diary in one place.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={familjen.variable} style={{ margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
