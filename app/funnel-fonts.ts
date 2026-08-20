import { Inter, Inter_Tight } from "next/font/google";

// Inter Tight for display, Inter for body: the two faces the built main page
// sets in. They live here rather than in the root layout because next/font
// emits a high-priority preload for every font the route's module graph
// reaches, and the root layout reaches every route. Declared here, the two
// faces (93KB of woff2) are fetched by the funnel pages and by nothing else.
//
// No `weight` array: both are variable fonts, so one file covers the range and
// listing weights only multiplies the @font-face blocks that point at it.
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// app/funnel.css reads the variables, never the family names: next/font never
// registers the literal name, only a hashed one.
export const funnelFonts = `${interTight.variable} ${inter.variable}`;
