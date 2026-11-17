import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseReadme } from '../../tests/helpers/native-parser.mjs';

await mkdir('dist/runtime', { recursive:true });
const files={};
async function collect(folder, mount='/app/'+path.relative('../..',folder)) {
  for(const item of await readdir(folder,{withFileTypes:true})) {
    const file=path.join(folder,item.name);
    if(item.isDirectory())await collect(file,mount+'/'+item.name);
    else if(file.endsWith('.php'))files[mount+'/'+item.name]=await readFile(file,'utf8');
  }
}
await collect('../../vendor');await collect('../../php');

await writeFile('dist/files.json',JSON.stringify(files));
const template=short=>`=== Browser Test ===\nContributors: @alice\nTags: test, plugin, wordpress, one, two, three, four, five, six\nStable tag: 1.0\nLicense: GPLv2\n\n${short}\n\n== Description ==\n\nA **bold** test with [a link](https://wordpress.org/).\n\n== Frequently Asked Questions ==\n\n= Does it work? =\n\nYes, with \`code\`.\n\n== Screenshots ==\n\n1. Example screenshot.\n\n== Installation ==\n\n1. Activate.\n\n== Changelog ==\n\n= 1.0 =\n\n* First release.`;
const cases=[
  ['Exact 150-character boundary',template('a'.repeat(150))],
  ['151-character truncation',template('a'.repeat(151))],
  ['Unicode boundary',template('🔎'.repeat(151))],
  ['HTML entities and formatting',template('Tom & Jerry’s plugin.')],
  ['Unsafe HTML',template('Safe.')+'\n\n== Extra ==\n\n<script>alert(1)</script><a href="javascript:alert(2)" onclick="bad()">Link</a>'],
  ['Missing headers','=== Missing ===\n\n== Description ==\n\nTest.'],
  ['Filesystem-like input','/etc/passwd'],
  ['PDF sitemap readme',await readFile('fixtures/pdf-sitemap-readme.txt','utf8')],
];
const fixtures=[];
for(const [name,readme] of cases)fixtures.push({name,readme,expected:await parseReadme(readme)});
await writeFile('dist/fixtures.json',JSON.stringify(fixtures));
await cp('node_modules/@php-wasm/web-8-4/asyncify','dist/runtime',{recursive:true});
await build({entryPoints:['worker.js'],outfile:'dist/worker.js',bundle:true,format:'esm',platform:'browser',external:['./runtime/php_8_4.js','worker_threads'],minify:true});
await cp('index.html','dist/index.html');await cp('proof.js','dist/proof.js');
const wasm=await readFile('dist/runtime/8_4_27/php_8_4.wasm');
console.log(JSON.stringify({wasmBytes:wasm.length,wasmGzipBytes:gzipSync(wasm).length,parserBytes:(await stat('dist/files.json')).size}));
