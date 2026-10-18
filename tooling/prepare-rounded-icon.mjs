import {readFile,writeFile} from 'node:fs/promises';
// Export a geometric icon silhouette while preserving the approved bitmap artwork.
const source=await readFile('assets/branding/pillxa-mark.png');
const width=source.readUInt32BE(16);
const height=source.readUInt32BE(20);
if(width!==height)throw new Error('The approved mark must remain square.');
const inset=width*0.025;
const size=width-2*inset;
const radius=size*0.20;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><clipPath id="rounded-tile"><rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${radius}"/></clipPath></defs><image width="${width}" height="${height}" href="data:image/png;base64,${source.toString('base64')}" clip-path="url(#rounded-tile)"/></svg>\n`;
await writeFile('assets/branding/pillxa-app-icon.svg',svg);
console.log(JSON.stringify({width,height,radius,inset}));
