import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"Relay | Pre-arrival coordination",description:"A fictional EMT-to-ER preparation and handoff workspace.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {return <html lang="en"><body>{children}</body></html>;}

