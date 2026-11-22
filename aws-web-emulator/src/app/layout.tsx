import type { Metadata } from "next"
import "@cloudscape-design/global-styles/index.css"
import "@fontsource-variable/open-sans"
import { ConsoleShell } from "@/components/console-shell"
import "./globals.css"
import "./one-theme.css"
import "./shell.css"

export const metadata: Metadata = {
  title: "Console Home | Console Home | MyAWS",
  description: "Browse and manage resources in your local AWS Emulator.",
}

// Apply the saved visual mode before paint to avoid a light flash.
const modeScript = `try{var m=localStorage.getItem("myaws.visual-mode.v1")||"dark";if(m==="browser")m=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(m==="dark"){document.body.classList.add("awsui-dark-mode");document.documentElement.classList.add("dark")}}catch(e){document.body.classList.add("awsui-dark-mode")}`

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="awsui-visual-refresh" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: modeScript }} />
        <ConsoleShell>{children}</ConsoleShell>
      </body>
    </html>
  )
}
