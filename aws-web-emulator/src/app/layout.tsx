import type { Metadata } from "next"
import "@fontsource-variable/geist"
import { ConsoleShell } from "@/components/console-shell"
import "./globals.css"

export const metadata: Metadata = {
  title: "MyAWS · Emulator Console",
  description: "Browse and manage resources in your local AWS Emulator.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full">
        <ConsoleShell>{children}</ConsoleShell>
      </body>
    </html>
  )
}
