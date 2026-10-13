"""Paired core-node examples. No weights or custom nodes are downloaded."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1] / 'examples/workflows'
checkpoint = 'cyberrealisticPony_v180Coreshift_pruned_fp16.safetensors'
api = {
 '1': {'class_type':'CheckpointLoaderSimple','inputs':{'ckpt_name':checkpoint}},
 '2': {'class_type':'CLIPTextEncode','inputs':{'text':'cinematic portrait, natural light','clip':['1',1]}},
 '3': {'class_type':'CLIPTextEncode','inputs':{'text':'artifacts, watermark','clip':['1',1]}},
 '4': {'class_type':'EmptyLatentImage','inputs':{'width':512,'height':512,'batch_size':1}},
 '5': {'class_type':'KSampler','inputs':{'seed':42,'steps':12,'cfg':5.0,'sampler_name':'euler','scheduler':'normal','denoise':1.0,'model':['1',0],'positive':['2',0],'negative':['3',0],'latent_image':['4',0]}},
 '6': {'class_type':'VAEDecode','inputs':{'samples':['5',0],'vae':['1',2]}},
 '7': {'class_type':'SaveImage','inputs':{'images':['6',0],'filename_prefix':'MyMovie/image'}},
}
# Explicit widget order for these core nodes only; arbitrary imports use paired exports.
widgets = {'CheckpointLoaderSimple':['ckpt_name'],'CLIPTextEncode':['text'],'EmptyLatentImage':['width','height','batch_size'],'KSampler':['seed','control_after_generate','steps','cfg','sampler_name','scheduler','denoise'],'VAEDecode':[],'SaveImage':['filename_prefix'],'VAEEncodeForInpaint':['grow_mask_by'],'LoadImage':['image'],'LoadImageMask':['image','channel'],'EmptyImage':['width','height','batch_size','color']}
outputs = {'CheckpointLoaderSimple':['MODEL','CLIP','VAE'],'CLIPTextEncode':['CONDITIONING'],'EmptyLatentImage':['LATENT'],'KSampler':['LATENT'],'VAEDecode':['IMAGE'],'SaveImage':[],'VAEEncodeForInpaint':['LATENT'],'LoadImage':['IMAGE','MASK'],'LoadImageMask':['MASK'],'EmptyImage':['IMAGE']}

def editor(graph):
 nodes=[]; links=[]
 for order,(key,node) in enumerate(graph.items()):
  ty=node['class_type']; values=node['inputs']; node_id=int(key)
  inputs=[]
  for name,value in values.items():
   if isinstance(value,list):
    source,slot=value; link_id=len(links)+1; type_=outputs[graph[source]['class_type']][slot]
    links.append([link_id,int(source),slot,node_id,len(inputs),type_]); inputs.append({'name':name,'type':type_,'link':link_id})
  nodes.append({'id':node_id,'type':ty,'pos':[(order%3)*400,(order//3)*330],'size':[310,260],'flags':{},'order':order,'mode':0,'inputs':inputs,'outputs':[{'name':t,'type':t,'links':[]} for t in outputs[ty]],'properties':{'Node name for S&R':ty},'widgets_values':['fixed' if w=='control_after_generate' else values[w] for w in widgets[ty]]})
 for link in links:
  next(n for n in nodes if n['id']==link[1])['outputs'][link[2]]['links'].append(link[0])
 return {'last_node_id':max(map(int,graph)),'last_link_id':len(links),'nodes':nodes,'links':links,'groups':[],'config':{},'extra':{'ds':{'scale':0.75,'offset':[50,50]}},'version':0.4}

def write(name,graph):
 for suffix,value in [('_api',graph),('_editor',editor(graph))]:
  (ROOT / (name+suffix+'.json')).write_text(json.dumps(value,indent=2)+'\n')
write('text-to-image',api)
edit=json.loads(json.dumps(api)); edit['4']={'class_type':'VAEEncodeForInpaint','inputs':{'pixels':['8',0],'vae':['1',2],'mask':['9',0],'grow_mask_by':6}}
edit['5']['inputs']['denoise']=0.75; edit['2']['inputs']['text']='a navy linen jacket, realistic fabric, coherent lighting'
edit['8']={'class_type':'LoadImage','inputs':{'image':'source.png'}}
edit['9']={'class_type':'LoadImageMask','inputs':{'image':'mask.png','channel':'red'}}
write('masked-edit',edit)
write('cpu-canary',{'1':{'class_type':'EmptyImage','inputs':{'width':64,'height':64,'batch_size':1,'color':3368703}},'2':{'class_type':'SaveImage','inputs':{'images':['1',0],'filename_prefix':'MyMovie/canary'}}})
