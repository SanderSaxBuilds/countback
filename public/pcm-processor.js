class CapturePCM extends AudioWorkletProcessor {
  constructor(){super();this.samples=[];this.position=0;this.ratio=sampleRate/24000;this.chunk=[];}
  process(inputs){
    const input=inputs[0]?.[0];if(!input)return true;
    this.samples.push(...input);
    while(this.position+1<this.samples.length){
      const i=Math.floor(this.position),f=this.position-i;
      const v=this.samples[i]*(1-f)+this.samples[i+1]*f;
      this.chunk.push(Math.max(-32768,Math.min(32767,Math.round(v*32767))));
      this.position+=this.ratio;
      if(this.chunk.length===1200){const pcm=new Int16Array(this.chunk);this.port.postMessage(pcm.buffer,[pcm.buffer]);this.chunk=[];}
    }
    const consumed=Math.floor(this.position);this.samples.splice(0,consumed);this.position-=consumed;
    return true;
  }
}
registerProcessor('capture-pcm',CapturePCM);
