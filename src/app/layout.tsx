import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'TypeCon', description: 'Lomba ngetik, karakternya berantem.' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
