import { PHP, loadPHPRuntime } from '@php-wasm/universal';
import * as loader from './runtime/php_8_4.js';

let php;
self.onmessage=async event=>{
  try {
    if(event.data.type==='start') {
      const started=performance.now();
      const [runtime,files]=await Promise.all([loadPHPRuntime(loader),fetch('./files.json').then(r=>r.json())]);
      php=new PHP(runtime);
      for(const [name,content] of Object.entries(files)){php.mkdir(name.slice(0,name.lastIndexOf('/')));php.writeFile(name,content);}
      const response=await php.run({code:'<?php echo json_encode(["version"=>PHP_VERSION,"extensions"=>get_loaded_extensions()]);'});
      self.postMessage({type:'ready',runtime:JSON.parse(response.text),startupMs:performance.now()-started});
    } else {
      const started=performance.now();
      php.writeFile('/input.json',JSON.stringify({readme:event.data.readme}));
      const response=await php.run({code:"<?php define('STDIN',fopen('/input.json','r')); define('STDERR',fopen('php://stderr','w')); require '/app/php/parse.php';"});
      if(response.exitCode!==0)throw new Error(response.errors||response.text||'PHP failed.');
      self.postMessage({type:'result',id:event.data.id,result:JSON.parse(response.text),elapsedMs:performance.now()-started});
    }
  }catch(error){self.postMessage({type:'error',id:event.data.id,error:String(error?.stack||error)});}
};
