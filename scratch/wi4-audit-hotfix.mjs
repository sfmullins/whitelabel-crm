import fs from 'node:fs';

function replaceAllRequired(filePath, search, replacement) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (!source.includes(search)) {
    if (source.includes(replacement)) return;
    throw new Error(`WI4 audit hotfix target missing in ${filePath}`);
  }
  fs.writeFileSync(filePath, source.split(search).join(replacement));
}

const contactTitle = "trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))";
const safeContactTitle = "coalesce(nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), nullif(trim(coalesce(c.email, '')), ''), 'Unnamed contact')";
replaceAllRequired('backend/src/infrastructure/database/WorkspaceRepository.ts', contactTitle, safeContactTitle);

const triggerContactTitle = "trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''))";
const safeTriggerContactTitle = "coalesce(nullif(trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')), ''), nullif(trim(coalesce(new.email, '')), ''), 'Unnamed contact')";
replaceAllRequired('backend/drizzle/0003_needy_carmella_unuscione.sql', triggerContactTitle, safeTriggerContactTitle);

console.log('Applied WI4 audit contact-title fallback hotfix.');
