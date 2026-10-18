import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';

// The approved raster mark stays unchanged. Only small exports get a pixel-aligned
// white separator: its original 28px gap is less than one pixel at 16–32px.
await import('./prepare-rounded-icon.mjs');
const output='apps/desktop/src-tauri/icons';
const temporary='.var/icon-export';
await mkdir(temporary,{recursive:true});
const exportIcon=(input,args=[])=>execFileSync(process.execPath,
  ['node_modules/@tauri-apps/cli/tauri.js','icon',input,...args],{stdio:'inherit'});
exportIcon('assets/branding/pillxa-app-icon.svg',['-o',output]);
const original=await readFile('assets/branding/pillxa-mark.png');
const dimension=original.readUInt32BE(16);
const source=original.toString('base64');
const sizes=[16,20,24,32,40,48,64,96,128,256];
const images=[];
for (const size of sizes) {
  let svg=await readFile('assets/branding/pillxa-app-icon.svg','utf8');
  if (size<=48) {
    const scale=size/dimension;
    const x=Math.round(((772+801)/2)*scale-0.5);
    svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><clipPath id="tile"><rect x="${size*.025}" y="${size*.025}" width="${size*.95}" height="${size*.95}" rx="${size*.95*.20}"/></clipPath></defs><image width="${size}" height="${size}" href="data:image/png;base64,${source}" clip-path="url(#tile)"/><rect x="${x}" y="${150*scale}" width="1" height="${525*scale}" fill="white"/></svg>`;
  }
  const file=join(temporary,`${size}.svg`);
  await writeFile(file,svg);
  exportIcon(file,['--png',String(size),'-o',temporary]);
  const png=await readFile(join(temporary,`${size}x${size}.png`));
  images.push({size,png});
  if ([32,64,128].includes(size)) await copyFile(join(temporary,`${size}x${size}.png`),join(output,`${size}x${size}.png`));
}
// Store native-sized PNG entries for common taskbar / display scaling sizes.
const header=Buffer.alloc(6+16*images.length);
header.writeUInt16LE(1,2);
header.writeUInt16LE(images.length,4);
let offset=header.length;
for(const [i,{size,png}] of images.entries()) {
  const entry=6+16*i;
  header[entry]=size===256?0:size;
  header[entry+1]=size===256?0:size;
  header.writeUInt16LE(1,entry+4);
  header.writeUInt16LE(32,entry+6);
  header.writeUInt32LE(png.length,entry+8);
  header.writeUInt32LE(offset,entry+12);
  offset+=png.length;
}
await writeFile(join(output,'icon.ico'),Buffer.concat([header,...images.map(i=>i.png)]));
exportIcon('assets/branding/pillxa-app-icon.svg',['--png','1254','-o',temporary]);
for (const destination of ['assets/branding/pillxa-mark-rounded.png','apps/web/public/branding/pillxa-mark-rounded.png']) await copyFile(join(temporary,'1254x1254.png'),destination);
console.log('Exported one approved mark; small Windows entries retain a clear L separator.');
