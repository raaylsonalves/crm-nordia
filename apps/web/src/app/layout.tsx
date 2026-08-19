import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM NORDIA",
  description: "Atendimento WhatsApp da NORDIA Tech",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          // Aplica o tema antes da primeira pintura, para não piscar branco
          // em quem usa modo escuro.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tema');var escuro=t?t==='escuro':window.matchMedia('(prefers-color-scheme: dark)').matches;if(escuro)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
