const fs = require('fs');
const path = 'd:\\CPNS Setjen DPD RI 2025\\Project\\anjab\\uianjab\\src\\app\\(admin)\\(others-pages)\\dashboard\\page.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /const aoaData = \[/g;

const replacement = `const aoaData: any[][] = [`;

content = content.replace(regex, replacement);

fs.writeFileSync(path, content, 'utf8');
console.log('aoaData Type Replacement done.');
