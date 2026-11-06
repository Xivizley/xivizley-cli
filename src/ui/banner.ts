import pc from 'picocolors';
import { CLI_VERSION } from '../version.js';

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
  console.log(pc.bold(pc.magenta(`  >> XIVIZLEY Industrial Engine v${CLI_VERSION}`)));
  console.log(pc.dim('  >> Kurucu & Mimar: ') + pc.bold(pc.cyan('Alperen')));
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
