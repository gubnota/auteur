"""Generate original schematic previews and deterministic bundled dependency metadata."""
import base64, gzip, hashlib, io, json, math, struct, tarfile, zlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'examples/catalogue'; OUT.mkdir(parents=True,exist_ok=True)
# Reuse the core-node editor fixture builder without changing existing presets.
# Importing this generator only rewrites its deterministic fixtures.
import runpy
presets=runpy.run_path(str(ROOT/'scripts/generate-workflow-presets.py'))
graph=json.loads(json.dumps(presets['api']));graph['1']['inputs']['ckpt_name']='v1-5-pruned-emaonly.safetensors';graph['2']['inputs']['text']='a small lighthouse on a grassy island, sunrise, watercolor illustration';graph['5']['inputs'].update(steps=12,cfg=7.0);graph['7']['inputs']['filename_prefix']='MyMovie/SD15'
presets['write']('sd15-t4',graph)
plugin=(ROOT/'deploy/comfy_nodes/mymovie_rembg/__init__.py').read_bytes();archive=OUT/'mymovie-rembg.tar.gz'
with archive.open('wb') as f,gzip.GzipFile(fileobj=f,mode='wb',filename='',mtime=0) as gz,tarfile.open(fileobj=gz,mode='w') as tar:
    e=tarfile.TarInfo('__init__.py');e.size=len(plugin);e.mode=0o644;tar.addfile(e,io.BytesIO(plugin))
artifact=dict(kind='plugin',category='custom_nodes',target='mymovie_rembg',sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),size=archive.stat().st_size,license='MIT OR Apache-2.0',architecture='any',revision=hashlib.sha256(plugin).hexdigest(),sourceRef='builtin-mymovie-rembg-v1',source='',stripPrefix='')
(OUT/'rembg-plugin.json').write_text(json.dumps(artifact,indent=2)+'\n')
(OUT/'sd15-model.json').write_text(json.dumps(dict(kind='model',category='checkpoints',target='v1-5-pruned-emaonly.safetensors',sha256='6ce0161689b3853acaa03779ec93eafe75a02f4ced659bee03f50797806fa2fa',size=4265146304,license='CreativeML OpenRAIL-M',architecture='any',source='https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/resolve/451f4fe16113bff5a5d2269ed5ad43b0592e9a14/v1-5-pruned-emaonly.safetensors'),indent=2)+'\n')
def preview(name,mode):
    w,h=640,360;rows=[]
    for y in range(h):
        row=bytearray()
        for x in range(w):
            c=(244,243,232)
            if mode==0:
                c=(34,54,55) if 100<x<540 and 80<y<280 else c
                if 150<x<490 and 125<y<235:c=(194,245,95)
                if 185<x<455 and 160<y<200:c=(61,96,81)
            elif mode==1:
                c=(198-int(y/8),221-int(y/12),216-int(y/6))
                if (x-490)**2+(y-90)**2<36**2:c=(245,219,132)
                if y>250-45*math.sin(x/120):c=(63,107,83)
                if 287<x<325 and 130<y<245:c=(249,244,224)
                if 281<x<332 and 121<y<140:c=(66,67,64)
                if 302<x<310 and 161<y<180:c=(57,78,76)
            else:
                if x>320:c=(230,233,222) if ((x//24+y//24)%2) else (250,250,243)
                if (x-175)**2/65**2+(y-190)**2/110**2<1 or (x-465)**2/65**2+(y-190)**2/110**2<1:c=(89,123,79)
                if (x-175)**2+(y-130)**2<35**2 or (x-465)**2+(y-130)**2<35**2:c=(213,157,93)
            row.extend(c)
        rows.append(b'\0'+row)
    def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')
    (OUT/(name+'.png')).write_bytes(data)
    (OUT/(name+'.data.txt')).write_text('data:image/png;base64,'+base64.b64encode(data).decode())
for i,name in enumerate(['connection-test','sd15-t4','background-removal']):preview(name,i)
