const button=document.getElementById('run'),status=document.getElementById('status'),output=document.getElementById('results');
button.onclick=async()=>{
  button.disabled=true;output.textContent='';status.textContent='Loading PHP in your browser…';
  const worker=new Worker('./worker.js',{type:'module'});
  const request=message=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{worker.terminate();reject(new Error('Browser PHP timed out.'));},30000);
    worker.onmessage=e=>{clearTimeout(timer);e.data.type==='error'?reject(new Error(e.data.error)):resolve(e.data);};
    worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message));};
    worker.postMessage(message);
  });
  try {
    const fixtures=await(await fetch('./fixtures.json')).json();
    const runtime=await request({type:'start'});
    output.textContent=`PHP ${runtime.runtime.version}; startup ${Math.round(runtime.startupMs)} ms\nExtensions: ${runtime.runtime.extensions.join(', ')}\n\n`;
    let passed=0;
    for(const [id,fixture] of fixtures.entries()) {
      const result=await request({type:'parse',id,readme:fixture.readme});
      const equal=JSON.stringify(result.result)===JSON.stringify(fixture.expected);
      passed+=Number(equal);
      output.textContent+=`${equal?'PASS':'FAIL'}: ${fixture.name} (${Math.round(result.elapsedMs)} ms)\n`;
      if(!equal)output.textContent+=`Expected: ${JSON.stringify(fixture.expected)}\nActual: ${JSON.stringify(result.result)}\n`;
    }
    status.textContent=`${passed}/${fixtures.length} checks match native PHP.`;status.className=passed===fixtures.length?'pass':'fail';
  }catch(error){status.textContent='Compatibility check failed.';status.className='fail';output.textContent+=error.message;}
  finally{worker.terminate();button.disabled=false;}
};
