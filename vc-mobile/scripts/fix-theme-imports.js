const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(ent.name)) fixFile(p);
  }
}

function fixFile(file) {
  let t = fs.readFileSync(file, 'utf8');
  const o = t;
  t = t.replace(
    /import \{ Radii, Spacing \} from ['"]\.\.\/\.\.\/context\/ThemeContext['"];/g,
    "import { Radii, Spacing } from '../../theme';",
  );
  t = t.replace(
    /import \{ Radii, Spacing \} from ['"]\.\.\/context\/ThemeContext['"];/g,
    "import { Radii, Spacing } from '../theme';",
  );
  t = t.replace(
    /import \{ Spacing \} from ['"]\.\.\/context\/ThemeContext['"];/g,
    "import { Spacing } from '../theme';",
  );
  t = t.replace(
    /import \{ Radii, Spacing, useTheme \} from ['"]\.\.\/context\/ThemeContext['"];/g,
    "import { useTheme } from '../context/ThemeContext';\nimport { Radii, Spacing } from '../theme';",
  );
  if (t !== o) {
    fs.writeFileSync(file, t);
    console.log('fixed', path.relative(SRC, file));
  }
}

walk(SRC);
