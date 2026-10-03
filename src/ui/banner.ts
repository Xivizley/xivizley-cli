import pc from 'picocolors';

export const XIVIZLEY_ASCII = `
  ██╗  ██╗██╗██╗   ██╗██╗███████╗██╗     ███████╗██╗   ██╗
  ╚██╗██╔╝██║██║   ██║██║╚══███╔╝██║     ██╔════╝╚██╗ ██╔╝
   ╚███╔╝ ██║██║   ██║██║  ███╔╝ ██║     █████╗   ╚████╔╝ 
   ██╔██╗ ██║╚██╗ ██╔╝██║ ███╔╝  ██║     ██╔══╝    ╚██╔╝  
  ██╔╝ ██╗██║ ╚████╔╝ ██║███████╗███████╗███████╗   ██║   
  ╚═╝  ╚═╝╚═╝  ╚═══╝  ╚═╝╚══════╝╚══════╝╚══════╝   ╚═╝   
`;

export function printBanner(): void {
  console.log(pc.magenta(XIVIZLEY_ASCII));
  console.log(pc.bold(pc.magenta('  >> XIVIZLEY Industrial Engine v1.0.0')));
  console.log(pc.dim('  >> Kurucu & Mimar: ') + pc.bold(pc.cyan('Alperen Celal (14, Bursa)')));
  console.log(pc.dim('  ─────────────────────────────────────────────────────────────\n'));
}

export function formatBadge(text: string, color: 'violet' | 'cyan' | 'green' | 'yellow' | 'red' = 'violet'): string {
  switch (color) {
    case 'violet':
      return pc.bgMagenta(pc.black(` ${text} `));
    case 'cyan':
      return pc.bgCyan(pc.black(` ${text} `));
    case 'green':
      return pc.bgGreen(pc.black(` ${text} `));
    case 'yellow':
      return pc.bgYellow(pc.black(` ${text} `));
    case 'red':
      return pc.bgRed(pc.white(` ${text} `));
  }
}
